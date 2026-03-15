#!/usr/bin/env node
/**
 * scripts/import-magical-items.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Imports AD&D 2e magical items from the Fandom wiki via the MediaWiki API.
 *
 * Run from the server/ directory (so .env is found automatically):
 *   cd server && node ../scripts/import-magical-items.mjs [options]
 *
 * Or via npm script in server/:
 *   npm run import:items
 *
 * Options:
 *   --dry-run          Parse + print without writing to DB
 *   --limit N          Stop after N items per category group
 *   --tables-only      Only import random determination tables, skip item pages
 *   --items-only       Only import item pages, skip random tables
 *
 * Steps:
 *   1. Fetch & parse the Random Determination Tables page (tables A–T)
 *   2. Fetch magic item pages via MediaWiki category API
 *   3. Parse each item page (wikitext infobox + prose)
 *   4. Upsert into magical_items, then link table entries → item_id
 *
 * Prerequisites:
 *   Node 18+   (native fetch required)
 *   server/.env with DB_* vars
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createRequire } from 'module';
import { readFileSync }  from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  const candidates = [
    join(process.cwd(), '.env'),
    join(__dirname, '..', 'server', '.env'),
  ];
  for (const p of candidates) {
    try {
      const text = readFileSync(p, 'utf8');
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        if (k && !(k in process.env)) process.env[k] = v;
      }
      return p;
    } catch { /* try next */ }
  }
  return null;
}
loadEnv();

// ── pg Pool ───────────────────────────────────────────────────────────────────
const serverDir = join(__dirname, '..', 'server');
const serverReq = createRequire(join(serverDir, 'index.js'));

let _pool = null;
function getPool() {
  if (_pool) return _pool;
  let Pool;
  try {
    ({ Pool } = serverReq('pg'));
  } catch {
    try { ({ Pool } = serverReq('../node_modules/pg/lib/index.js')); }
    catch { throw new Error('Cannot find "pg" module. Run: cd server && npm install'); }
  }
  _pool = new Pool({
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432'),
    database: process.env.DB_NAME     ?? 'adnddb',
    user:     process.env.DB_USER     ?? 'postgres',
    password: process.env.DB_PASSWORD,
    max: 3,
    connectionTimeoutMillis: 8_000,
  });
  return _pool;
}

async function dbQuery(sql, params = []) {
  const pool = getPool();
  const { rows } = await pool.query(sql, params);
  return rows;
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const TABLES_ONLY = args.includes('--tables-only');
const ITEMS_ONLY  = args.includes('--items-only');
const LIMIT       = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i + 1], 10) : Infinity; })();

// ── Constants ─────────────────────────────────────────────────────────────────
const WIKI_API   = 'https://adnd2e.fandom.com/api.php';
const USER_AGENT = 'adnd-campaign-manager/1.0 (https://github.com/Tjoernely/adnd-manager)';
const DELAY_MS   = 250;
const MAX_RETRY  = 3;

// ── Table metadata ────────────────────────────────────────────────────────────
const TABLE_META = {
  A: { name: 'Magical Liquids',             dice: 'd20',  category: 'liquid',       wikiPage: 'Table A: Magical Liquids (EM)'                    },
  B: { name: 'Scrolls',                     dice: 'd20',  category: 'scroll',       wikiPage: 'Table B: Scrolls (EM)'                            },
  C: { name: 'Rings',                       dice: 'd20',  category: 'ring',         wikiPage: 'Table C: Rings (EM)'                              },
  D: { name: 'Rods',                        dice: 'd20',  category: 'rod',          wikiPage: 'Table D: Rods (EM)'                               },
  E: { name: 'Staves',                      dice: 'd20',  category: 'staff',        wikiPage: 'Table E: Staves (EM)'                             },
  F: { name: 'Wands',                       dice: 'd20',  category: 'wand',         wikiPage: 'Table F: Wands (EM)'                              },
  G: { name: 'Books & Tomes',               dice: 'd20',  category: 'book',         wikiPage: 'Table G: Books (EM)'                              },
  H: { name: 'Gems & Jewelry',              dice: 'd20',  category: 'gem',          wikiPage: 'Table H: Gems & Jewelry (EM)'                     },
  I: { name: 'Clothing',                    dice: 'd20',  category: 'clothing',     wikiPage: 'Table I: Clothing (EM)'                           },
  J: { name: 'Boots, Gloves & Accessories', dice: 'd20',  category: 'boots_gloves', wikiPage: 'Table J: Boots, Gloves, and Accessories (EM)'     },
  K: { name: 'Girdles & Helmets',           dice: 'd20',  category: 'girdle_helm',  wikiPage: 'Table K: Girdles and Helmets (EM)'                },
  L: { name: 'Bags, Bands & Bottles',       dice: 'd20',  category: 'bag_bottle',   wikiPage: 'Table L: Bags, Bands, Bottles, and Basins (EM)'   },
  M: { name: 'Dusts & Stones',              dice: 'd20',  category: 'dust_stone',   wikiPage: 'Table M: Dust and Stones (EM)'                    },
  N: { name: 'Household Items',             dice: 'd20',  category: 'household',    wikiPage: 'Table N: Household Items (EM)'                    },
  O: { name: 'Musical Instruments',         dice: 'd20',  category: 'instrument',   wikiPage: 'Table O: Musical Instruments (EM)'                },
  P: { name: 'Weird Stuff',                 dice: 'd20',  category: 'weird',        wikiPage: 'Table P: Weird Stuff (EM)'                        },
  Q: { name: 'Humorous Items',              dice: 'd20',  category: 'humorous',     wikiPage: 'Table Q: Humorous Items (EM)'                     },
  R: { name: 'Armor & Shields',             dice: 'd100', category: 'armor',        wikiPage: 'Table R: Armor and Shields (EM)'                  },
  S: { name: 'Weapons',                     dice: 'd100', category: 'weapon',       wikiPage: 'Table S: Weapons (EM)'                            },
  T: { name: 'Artifacts & Relics',          dice: 'd20',  category: 'artifact',     wikiPage: 'Table T: Artifacts (EM)'                          },
};

// Category-name → table letter
const CATEGORY_TO_TABLE = Object.fromEntries(
  Object.entries(TABLE_META).map(([letter, { category }]) => [category, letter])
);

// Wiki category names to try (in order) — log which ones return results
const ITEM_CATEGORIES = [
  'Potions',              // Known to work (241 items)
  'Magical Liquids',
  'Potions (magical)',
  'Magic rings',
  'Magic wands',
  'Magic staves',
  'Magic rods',
  'Scrolls',
  'Magic armor',
  'Magic weapons',
  'Magic items (AD&D)',
  'Encyclopedia Magica',
  'Magic items',
  'Magical items',
  'AD&D magic items',
  'Artifacts',
  'Scrolls (magic)',
  'Rings (magic)',
  'Rods',
  'Staves',
  'Wands',
];

// ── HTTP helpers ──────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wikiFetch(params, retry = 0) {
  const url = new URL(WIKI_API);
  url.search = new URLSearchParams({ ...params, format: 'json' }).toString();

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal:  AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (retry < MAX_RETRY) {
      const wait = 1_000 * 2 ** retry;
      process.stderr.write(`\n  ⚠ Network error (${err.message}) — retry in ${wait}ms…`);
      await sleep(wait);
      return wikiFetch(params, retry + 1);
    }
    throw err;
  }
  if (!res.ok) {
    if (retry < MAX_RETRY && res.status >= 500) {
      const wait = 1_000 * 2 ** retry;
      process.stderr.write(`\n  ⚠ HTTP ${res.status} — retry in ${wait}ms…`);
      await sleep(wait);
      return wikiFetch(params, retry + 1);
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/** Original parse-API method (used for individual item pages) */
async function fetchWikitext(pageTitle) {
  const data = await wikiFetch({ action: 'parse', page: pageTitle, prop: 'wikitext', disablelimitreport: '1' });
  return data?.parse?.wikitext?.['*'] ?? null;
}

/** Fetch raw stored wikitext via revisions API (better for table pages) */
async function fetchWikitextViaRevisions(pageTitle) {
  const data = await wikiFetch({
    action: 'query',
    titles:  pageTitle,
    prop:    'revisions',
    rvprop:  'content',
    rvslots: 'main',
  });
  const pages = data?.query?.pages ?? {};
  const pageId = Object.keys(pages)[0];
  if (!pageId || pageId === '-1') return null;
  const rev = pages[pageId]?.revisions?.[0];
  // Newer MediaWiki API uses slots.main.*, older uses ['*'] directly
  return rev?.slots?.main?.['*'] ?? rev?.['*'] ?? null;
}

/** Fetch the rendered HTML of a wiki page (used as fallback) */
async function fetchHtmlPage(url, retry = 0) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal:  AbortSignal.timeout(30_000),
    });
  } catch (err) {
    if (retry < MAX_RETRY) {
      await sleep(1_000 * 2 ** retry);
      return fetchHtmlPage(url, retry + 1);
    }
    throw err;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchCategoryPages(category) {
  const titles = [];
  let cmcontinue;
  do {
    const data = await wikiFetch({
      action: 'query', list: 'categorymembers',
      cmtitle: `Category:${category}`, cmlimit: 500, cmtype: 'page',
      ...(cmcontinue ? { cmcontinue } : {}),
    });
    const pages = data?.query?.categorymembers ?? [];
    titles.push(...pages.map(p => p.title));
    cmcontinue = data?.continue?.cmcontinue;
    if (cmcontinue) await sleep(DELAY_MS);
  } while (cmcontinue);
  return titles;
}

// ── Wikitext helpers ──────────────────────────────────────────────────────────
function stripWikiMarkup(text) {
  if (!text) return '';
  return text
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')  // [[link|label]] → label
    .replace(/\{\{[^}]*\}\}/g, '')                        // remove templates
    .replace(/''+/g, '')                                   // bold/italic
    .replace(/<[^>]+>/g, '')                               // HTML tags
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractField(wikitext, ...fieldNames) {
  for (const name of fieldNames) {
    const re = new RegExp(`\\|\\s*${name}\\s*=\\s*([^\n|]+)`, 'i');
    const m  = wikitext.match(re);
    if (m) return stripWikiMarkup(m[1].trim());
  }
  return null;
}

function extractSection(wikitext, headingName) {
  const re = new RegExp(`==+\\s*${headingName}\\s*==+([\\s\\S]*?)(?===|$)`, 'i');
  const m  = wikitext.match(re);
  if (!m) return null;
  return stripWikiMarkup(m[1]).trim() || null;
}

/**
 * Infer category from page title / wikitext content
 */
function inferCategory(title, wikitext) {
  const t = title.toLowerCase();
  const w = (wikitext ?? '').toLowerCase();

  if (t.includes('potion') || t.includes('philter') || t.includes('elixir')) return 'liquid';
  if (t.includes('scroll'))                    return 'scroll';
  if (t.includes(' ring') || t.startsWith('ring ')) return 'ring';
  if (t.includes('rod of') || t.startsWith('rod '))  return 'rod';
  if (t.includes('staff of') || t.startsWith('staff')) return 'staff';
  if (t.includes('wand of') || t.startsWith('wand ')) return 'wand';
  if (t.includes('tome') || t.includes('book of') || t.includes('manual') || t.includes('libram')) return 'book';
  if (t.includes('gem') || t.includes('jewel') || t.includes('necklace') || t.includes('amulet') || t.includes('brooch') || t.includes('pendant')) return 'gem';
  if (t.includes('cloak') || t.includes('robe') || t.includes('garment')) return 'clothing';
  if (t.includes('boots') || t.includes('gloves') || t.includes('gauntlets')) return 'boots_gloves';
  if (t.includes('girdle') || t.includes('helm') || t.includes('hat') || t.includes('headband')) return 'girdle_helm';
  if (t.includes('bag') || t.includes('bottle') || t.includes('flask') || t.includes('decanter') || t.includes('pouch')) return 'bag_bottle';
  if (t.includes('dust') || t.includes('stone') || t.includes('ioun')) return 'dust_stone';
  if (t.includes('instrument') || t.includes('horn') || t.includes('harp') || t.includes('drum') || t.includes('flute')) return 'instrument';
  if (t.includes('artifact') || t.includes('relic') || w.includes('artifact')) return 'artifact';
  if (t.includes('sword') || t.includes('axe') || t.includes('bow') || t.includes('arrow') || t.includes('weapon') || t.includes('dagger') || t.includes('spear') || t.includes('mace') || t.includes('hammer')) return 'weapon';
  if (t.includes('armor') || t.includes('shield') || t.includes('plate') || t.includes('chainmail') || t.includes('leather armor')) return 'armor';
  return 'weird'; // fallback
}

/**
 * Extract charges from wikitext/description
 */
function extractCharges(text) {
  if (!text) return null;
  const m = text.match(/(\d+d\d+(?:\+\d+)?)\s+charges?/i)
    || text.match(/(\d+)\s+charges?/i);
  return m ? m[0] : null;
}

/**
 * Detect if item is cursed
 */
function detectCursed(title, wikitext) {
  return /\bcursed?\b/i.test(title) || /\bcursed?\b/i.test(wikitext ?? '');
}

/**
 * Extract class restrictions
 */
function extractClasses(text) {
  if (!text) return null;
  const matches = text.match(/\b(fighter|mage|wizard|cleric|druid|thief|ranger|paladin|bard|monk|illusionist|shaman)s?\b/gi);
  if (!matches || matches.length === 0) return null;
  return [...new Set(matches.map(m => m.toLowerCase().replace(/s$/, '')))];
}

// ── Parse random determination tables page ────────────────────────────────────
/**
 * Parses the wikitext of the Random Determination Tables page line-by-line.
 * Handles:
 *   == Table A: Magical Liquids ==
 *   {| class="wikitable"
 *   |-
 *   | 01-05 || Potion of Healing
 *   |-
 *   | 06
 *   | Potion of Extra-Healing
 *   |}
 *
 * Returns array of { table_letter, table_name, dice, roll_min, roll_max, item_name }
 */
function parseTablePage(wikitext) {
  const rows = [];
  const lines = wikitext.split('\n');

  let currentLetter = null;
  let currentName   = null;
  let currentDice   = 'd20';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // ── Detect table heading: ==Table A: Magical Liquids== (any level, any spacing) ──
    const headingMatch = line.match(/^={1,4}\s*Table\s+([A-T])(?:\s*[:–\-]\s*(.+?))?\s*={1,4}\s*$/i);
    if (headingMatch) {
      currentLetter = headingMatch[1].toUpperCase();
      currentName   = headingMatch[2]?.trim() || TABLE_META[currentLetter]?.name || `Table ${currentLetter}`;
      currentDice   = TABLE_META[currentLetter]?.dice || 'd20';
      continue;
    }

    if (!currentLetter) continue;

    // Skip non-data lines
    if (!line.startsWith('|')) continue;
    if (line === '|-' || line.startsWith('|+') || line.startsWith('|}') || line.startsWith('|{')) continue;
    if (line.startsWith('!')) continue;

    // ── Case 1: | roll || item  (both cells on one line) ──
    if (line.includes('||')) {
      const content = line.startsWith('||') ? line : line.slice(1);
      const cells   = content.split('||').map(c => c.trim());
      // cells[0] may be empty if line started with ||
      const [c0, c1] = cells;
      const rollRange = parseRollRange(c0);
      if (rollRange) {
        const itemName = stripWikiMarkup(c1 ?? '');
        if (itemName.length > 1) {
          rows.push({ table_letter: currentLetter, table_name: currentName, dice: currentDice,
                      roll_min: rollRange.min, roll_max: rollRange.max, item_name: itemName });
        }
        continue;
      }
      // Maybe c0 is the item and there's no roll (table with roll already on prev |-); skip
      continue;
    }

    // ── Case 2: | roll  (next line is | item) ──
    const cellContent = line.slice(1).trim();
    const rollRange   = parseRollRange(cellContent);
    if (rollRange) {
      // Look ahead for the item cell (skip blank lines, stop at |- or next heading)
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (!nextLine || nextLine === '|-') { i = j; break; }
        if (nextLine.startsWith('=') || nextLine.startsWith('{|')) break;
        if (nextLine.startsWith('|') && !nextLine.startsWith('|-') && !nextLine.startsWith('|}')) {
          const itemName = stripWikiMarkup(nextLine.slice(1).trim());
          if (itemName.length > 1) {
            rows.push({ table_letter: currentLetter, table_name: currentName, dice: currentDice,
                        roll_min: rollRange.min, roll_max: rollRange.max, item_name: itemName });
            i = j;
          }
          break;
        }
      }
    }
  }

  return rows;
}

/**
 * Fallback: parse the rendered HTML page for <table> / <tr> / <td> elements.
 * Returns same row format as parseTablePage.
 */
function parseHtmlTablePage(html) {
  const rows = [];
  let currentLetter = null;
  let currentName   = null;
  let currentDice   = 'd20';

  // Strip scripts/styles so we don't false-match in them
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '');

  // Find headings (h2/h3) — e.g. <h2>Table A: Magical Liquids</h2>
  // Then find tables after them
  const headingRe  = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;
  const tableRe    = /<table[\s\S]*?<\/table>/gi;

  // Build positional list of headings
  const headings = [];
  let m;
  while ((m = headingRe.exec(clean)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    const hm   = text.match(/Table\s+([A-T])(?:\s*[:–\-]\s*(.+))?/i);
    if (hm) headings.push({ pos: m.index, letter: hm[1].toUpperCase(), name: hm[2]?.trim() });
  }

  // Process each <table>
  while ((m = tableRe.exec(clean)) !== null) {
    const tablePos = m.index;
    // Find the nearest preceding heading
    const heading  = [...headings].reverse().find(h => h.pos < tablePos);
    if (!heading) continue;

    currentLetter = heading.letter;
    currentName   = heading.name || TABLE_META[currentLetter]?.name || `Table ${currentLetter}`;
    currentDice   = TABLE_META[currentLetter]?.dice || 'd20';

    // Extract rows from this table
    const tableHtml = m[0];
    const trRe      = /<tr[\s\S]*?<\/tr>/gi;
    let tr;
    while ((tr = trRe.exec(tableHtml)) !== null) {
      const tdRe  = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells = [];
      let td;
      while ((td = tdRe.exec(tr[0])) !== null) {
        cells.push(td[1].replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim());
      }
      if (cells.length < 2) continue;
      const rollRange = parseRollRange(cells[0]);
      if (!rollRange) continue;
      const itemName = cells[1].trim();
      if (itemName.length > 1) {
        rows.push({ table_letter: currentLetter, table_name: currentName, dice: currentDice,
                    roll_min: rollRange.min, roll_max: rollRange.max, item_name: itemName });
      }
    }
  }

  return rows;
}

/**
 * Parse all wiki table rows from a single-table page (no heading detection).
 * Used for individual table pages like "Table A: Magical Liquids (EM)".
 * The letter/name/dice are passed in directly.
 * Returns rows in same format as parseTablePage.
 */
function parseWikitableRows(wikitext, letter, name, dice) {
  const rows  = [];
  const lines = wikitext.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip non-data lines
    if (!line.startsWith('|')) continue;
    if (line === '|-' || line.startsWith('|+') || line.startsWith('|}') || line.startsWith('|{')) continue;
    if (line.startsWith('!')) continue;

    // ── Case 1: | roll || item  (both cells on one line, possibly more cells) ──
    if (line.includes('||')) {
      const content = line.startsWith('||') ? line.slice(2) : line.slice(1);
      const cells   = content.split('||').map(c => c.trim());
      // First cell should be the roll range; second is item name
      const rollRange = parseRollRange(cells[0]);
      if (rollRange && cells[1]) {
        const itemName = stripWikiMarkup(cells[1]);
        if (itemName.length > 1) {
          rows.push({ table_letter: letter, table_name: name, dice,
                      roll_min: rollRange.min, roll_max: rollRange.max, item_name: itemName });
        }
      }
      continue;
    }

    // ── Case 2: | roll  (next non-blank line is | item) ──
    const cellContent = line.slice(1).trim();
    const rollRange   = parseRollRange(cellContent);
    if (rollRange) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const next = lines[j].trim();
        if (!next) continue;
        if (next === '|-' || next.startsWith('|}') || next.startsWith('{|') || next.startsWith('=')) break;
        if (next.startsWith('|') && !next.startsWith('|-')) {
          const itemName = stripWikiMarkup(next.slice(1).trim());
          if (itemName.length > 1) {
            rows.push({ table_letter: letter, table_name: name, dice,
                        roll_min: rollRange.min, roll_max: rollRange.max, item_name: itemName });
            i = j;
          }
          break;
        }
      }
    }
  }

  return rows;
}

function parseRollRange(text) {
  if (!text) return null;
  const t = text.replace(/\s/g, '');
  // Range like 01-05, 1-3, 10-15
  const rangeMatch = t.match(/^(\d+)-(\d+)$/);
  if (rangeMatch) return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
  // Single number
  const singleMatch = t.match(/^(\d+)$/);
  if (singleMatch) { const n = parseInt(singleMatch[1]); return { min: n, max: n }; }
  return null;
}

// ── Parse individual item page ────────────────────────────────────────────────
function parseItemPage(title, wikitext) {
  const warnings = [];
  const category = inferCategory(title, wikitext);
  const tableLetter = CATEGORY_TO_TABLE[category] ?? null;

  // Try to extract from infobox template (various formats)
  const description = extractSection(wikitext, 'Description')
    || extractSection(wikitext, 'Effect')
    || extractSection(wikitext, 'Properties')
    || (() => {
      // Fall back to first non-template paragraph
      const plain = wikitext
        .replace(/\{\{[^{}]*\}\}/g, '')
        .replace(/\[\[(?:File|Image):[^\]]+\]\]/gi, '')
        .replace(/^\s*[=|{].*/gm, '')
        .trim();
      const firstPara = plain.split('\n').find(l => l.trim().length > 40);
      return firstPara ? stripWikiMarkup(firstPara) : null;
    })();

  const powers = extractSection(wikitext, 'Powers')
    || extractSection(wikitext, 'Abilities')
    || extractSection(wikitext, 'Special Abilities');

  const charges    = extractCharges(wikitext);
  const cursed     = detectCursed(title, wikitext);
  const classes    = extractClasses(extractField(wikitext, 'classes', 'class', 'usable by') ?? wikitext);
  const alignment  = extractField(wikitext, 'alignment', 'align');
  const valueGpStr = extractField(wikitext, 'value', 'cost', 'gp value', 'price');
  const value_gp   = valueGpStr ? parseInt(valueGpStr.replace(/[^0-9]/g, '')) || null : null;

  const intelligence = (() => {
    const f = extractField(wikitext, 'intelligence', 'int');
    return f ? parseInt(f) || null : null;
  })();
  const ego = (() => {
    const f = extractField(wikitext, 'ego');
    return f ? parseInt(f) || null : null;
  })();

  const source_url = `https://adnd2e.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

  if (!description) warnings.push('no description extracted');

  return {
    name:              title.replace(/_/g, ' ').trim(),
    category,
    source_page_title: title,
    source_url,
    description:       description || null,
    powers:            powers || null,
    charges:           charges || null,
    cursed,
    alignment:         alignment || null,
    classes:           classes || null,
    value_gp,
    intelligence,
    ego,
    table_letter:      tableLetter,
    import_warnings:   warnings.length > 0 ? warnings : null,
    raw_text:          wikitext.slice(0, 10000), // store truncated raw for debugging
  };
}

// ── DB upsert helpers ─────────────────────────────────────────────────────────
async function upsertItem(item) {
  const sql = `
    INSERT INTO magical_items
      (name, category, source_page_title, source_url, description, powers,
       charges, cursed, alignment, classes, value_gp, intelligence, ego,
       table_letter, import_warnings, raw_text)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (name, category) DO UPDATE SET
      source_page_title = EXCLUDED.source_page_title,
      source_url        = EXCLUDED.source_url,
      description       = COALESCE(EXCLUDED.description, magical_items.description),
      powers            = COALESCE(EXCLUDED.powers,      magical_items.powers),
      charges           = COALESCE(EXCLUDED.charges,     magical_items.charges),
      cursed            = EXCLUDED.cursed,
      alignment         = COALESCE(EXCLUDED.alignment,   magical_items.alignment),
      classes           = COALESCE(EXCLUDED.classes,     magical_items.classes),
      value_gp          = COALESCE(EXCLUDED.value_gp,    magical_items.value_gp),
      intelligence      = COALESCE(EXCLUDED.intelligence,magical_items.intelligence),
      ego               = COALESCE(EXCLUDED.ego,         magical_items.ego),
      table_letter      = COALESCE(EXCLUDED.table_letter,magical_items.table_letter),
      import_warnings   = EXCLUDED.import_warnings,
      raw_text          = EXCLUDED.raw_text
    RETURNING id
  `;
  const rows = await dbQuery(sql, [
    item.name, item.category, item.source_page_title, item.source_url,
    item.description, item.powers, item.charges, item.cursed, item.alignment,
    item.classes, item.value_gp, item.intelligence, item.ego, item.table_letter,
    item.import_warnings, item.raw_text,
  ]);
  return rows[0]?.id;
}

async function upsertTableRow(row) {
  // Clear existing rows for this table first is handled outside; here we just insert
  const sql = `
    INSERT INTO random_item_tables (table_letter, table_name, dice, roll_min, roll_max, item_name)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;
  await dbQuery(sql, [row.table_letter, row.table_name, row.dice, row.roll_min, row.roll_max, row.item_name]);
}

async function linkTableItems() {
  process.stdout.write('\n⛓  Linking table entries to magical_items…\n');
  const sql = `
    UPDATE random_item_tables t
    SET    item_id = mi.id
    FROM   magical_items mi
    WHERE  LOWER(TRIM(t.item_name)) = LOWER(TRIM(mi.name))
      AND  t.item_id IS NULL
  `;
  const res = await dbQuery(sql);
  process.stdout.write(`   Linked ${res.length ?? 0} entries.\n`);
}

// ── Progress bar helper ───────────────────────────────────────────────────────
function progress(current, total, label = '') {
  const pct   = total > 0 ? Math.round(current / total * 40) : 0;
  const bar   = '█'.repeat(pct) + '░'.repeat(40 - pct);
  process.stdout.write(`\r  [${bar}] ${current}/${total} ${label}`.padEnd(80));
}

// ── Fetch wikitext with revisions → parse → HTML fallback ─────────────────────
/**
 * Try revisions API then parse API for a page title.
 * Returns { wikitext, source } or { wikitext: null }.
 */
async function fetchPageWikitext(title) {
  // Try revisions API (raw stored wikitext)
  try {
    const wt = await fetchWikitextViaRevisions(title);
    if (wt) return { wikitext: wt, source: 'revisions' };
  } catch { /* fall through */ }
  await sleep(DELAY_MS);
  // Fallback: parse API
  try {
    const wt = await fetchWikitext(title);
    if (wt) return { wikitext: wt, source: 'parse' };
  } catch { /* fall through */ }
  return { wikitext: null, source: null };
}

// ── STEP 1: Import Random Determination Tables ─────────────────────────────────
async function importTables() {
  process.stdout.write('\n📋 STEP 1 — Fetching Random Determination Tables…\n');

  const allRows = [];

  // ── 1a. Fetch the overview page (Table 1: d100 → category name) ──
  process.stdout.write('\n   [overview] Fetching main tables page…\n');
  const overviewCandidates = [
    'Magical Item Random Determination Tables (EM)',
    'Magical_Item_Random_Determination_Tables_(EM)',
    'Magical Item Random Determination Tables',
  ];

  let overviewWikitext = null;
  for (const title of overviewCandidates) {
    process.stdout.write(`     Trying: "${title}"… `);
    const { wikitext, source } = await fetchPageWikitext(title);
    if (wikitext) {
      overviewWikitext = wikitext;
      process.stdout.write(`✓ via ${source} (${wikitext.length} chars)\n`);
      // Debug: first 500 chars
      process.stdout.write('\n   ── Overview wikitext preview (first 500 chars) ──\n   ');
      process.stdout.write(wikitext.slice(0, 500).replace(/\n/g, '\n   '));
      process.stdout.write('\n   ─────────────────────────────────────────────────\n\n');
      break;
    }
    process.stdout.write('not found\n');
    await sleep(DELAY_MS);
  }

  if (overviewWikitext) {
    // Parse Table 1: rows like | 01-20 || Magical Liquids || EM Table A
    const overviewRows = parseWikitableRows(overviewWikitext, 'overview', 'Overview Table 1', 'd100');
    process.stdout.write(`   Overview: ${overviewRows.length} rows parsed.\n`);
    allRows.push(...overviewRows);
  } else {
    process.stdout.write('   ⚠ Overview page not found — continuing with individual tables.\n');
  }

  // ── 1b. Fetch each individual table page (A through T) ──
  process.stdout.write('\n   [individual tables] Fetching A–T…\n');
  for (const [letter, meta] of Object.entries(TABLE_META)) {
    const title    = meta.wikiPage;
    // Also try with underscores as a fallback
    const titleAlt = title.replace(/ /g, '_');
    process.stdout.write(`     Table ${letter} ("${title}")… `);

    let wikitext = null;
    let source   = null;

    for (const t of [title, titleAlt]) {
      const result = await fetchPageWikitext(t);
      if (result.wikitext) { wikitext = result.wikitext; source = result.source; break; }
      await sleep(100);
    }

    if (!wikitext) {
      // HTML fallback for this table
      const htmlUrl = `https://adnd2e.fandom.com/wiki/${encodeURIComponent(titleAlt)}`;
      try {
        const html  = await fetchHtmlPage(htmlUrl);
        const hRows = parseHtmlTablePage(html);
        // parseHtmlTablePage needs headings in the page — individual pages may not have them
        // so also try treating the whole HTML as one table for letter
        const fallbackRows = hRows.length > 0
          ? hRows.map(r => ({ ...r, table_letter: letter }))
          : parseHtmlSingleTable(html, letter, meta.name, meta.dice);
        if (fallbackRows.length > 0) {
          process.stdout.write(`✓ HTML fallback (${fallbackRows.length} rows)\n`);
          allRows.push(...fallbackRows);
          await sleep(DELAY_MS);
          continue;
        }
      } catch { /* silent */ }
      process.stdout.write('not found\n');
      await sleep(DELAY_MS);
      continue;
    }

    // Debug: show first 300 chars of first successful table
    if (allRows.filter(r => r.table_letter !== 'overview').length === 0) {
      process.stdout.write('\n   ── First individual table wikitext preview (first 300 chars) ──\n   ');
      process.stdout.write(wikitext.slice(0, 300).replace(/\n/g, '\n   '));
      process.stdout.write('\n   ───────────────────────────────────────────────────────────────\n');
    }

    const rows = parseWikitableRows(wikitext, letter, meta.name, meta.dice);
    process.stdout.write(`✓ via ${source} — ${rows.length} rows\n`);
    allRows.push(...rows);
    await sleep(DELAY_MS);
  }

  // ── Summary ──
  const letterCounts = {};
  for (const r of allRows) letterCounts[r.table_letter] = (letterCounts[r.table_letter] ?? 0) + 1;
  process.stdout.write('\n   Row counts per table:\n');
  for (const [letter, count] of Object.entries(letterCounts)) {
    process.stdout.write(`     Table ${letter}: ${count} rows\n`);
  }
  process.stdout.write(`   Total: ${allRows.length} rows\n`);

  if (allRows.length === 0) {
    process.stdout.write('  ⚠ No rows parsed — skipping table import.\n');
    return 0;
  }

  if (DRY_RUN) {
    const sample = allRows.filter(r => r.table_letter !== 'overview').slice(0, 10);
    sample.forEach(r =>
      process.stdout.write(`   [DRY] Table ${r.table_letter}: ${r.roll_min}-${r.roll_max} → ${r.item_name}\n`)
    );
    process.stdout.write(`   [DRY] Would insert ${allRows.length} rows total.\n`);
    return allRows.length;
  }

  await dbQuery('DELETE FROM random_item_tables');
  let inserted = 0;
  for (const row of allRows) {
    try {
      await upsertTableRow(row);
      inserted++;
    } catch (e) {
      process.stderr.write(`\n  ⚠ Table row error (${row.table_letter}): ${row.item_name} — ${e.message}`);
    }
  }
  process.stdout.write(`   Inserted ${inserted} rows.\n`);
  return inserted;
}

/**
 * HTML fallback for a single-table page (no heading context needed).
 * Grabs the first wikitable on the page and extracts roll → item rows.
 */
function parseHtmlSingleTable(html, letter, name, dice) {
  const rows  = [];
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const tableMatch = clean.match(/<table[^>]*wikitable[^>]*>([\s\S]*?)<\/table>/i)
                  || clean.match(/<table[^>]*article-table[^>]*>([\s\S]*?)<\/table>/i)
                  || clean.match(/<table([\s\S]*?)<\/table>/i);
  if (!tableMatch) return rows;

  const trRe = /<tr[\s\S]*?<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(tableMatch[0])) !== null) {
    const tdRe  = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let td;
    while ((td = tdRe.exec(tr[0])) !== null) {
      cells.push(td[1].replace(/<[^>]+>/g, '')
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim());
    }
    if (cells.length < 2) continue;
    const rollRange = parseRollRange(cells[0]);
    if (!rollRange) continue;
    const itemName = cells[1].trim();
    if (itemName.length > 1) {
      rows.push({ table_letter: letter, table_name: name, dice,
                  roll_min: rollRange.min, roll_max: rollRange.max, item_name: itemName });
    }
  }
  return rows;
}

// ── STEP 2: Import item pages ─────────────────────────────────────────────────
async function importItems() {
  process.stdout.write('\n📚 STEP 2 — Discovering item pages…\n');

  const allTitles   = new Set();
  const catResults  = [];  // track which categories yielded pages

  for (const cat of ITEM_CATEGORIES) {
    process.stdout.write(`   Category: "${cat}"… `);
    try {
      const titles = await fetchCategoryPages(cat);
      const newCount = titles.filter(t => !allTitles.has(t)).length;
      titles.forEach(t => allTitles.add(t));
      const marker = titles.length > 0 ? '✓' : '–';
      process.stdout.write(`${marker} ${titles.length} pages (${newCount} new)\n`);
      catResults.push({ cat, total: titles.length, new: newCount });
    } catch (e) {
      process.stdout.write(`✗ error (${e.message})\n`);
      catResults.push({ cat, total: 0, new: 0 });
    }
    await sleep(DELAY_MS);
  }

  // Summary of which categories worked
  const working = catResults.filter(r => r.total > 0);
  process.stdout.write(`\n   Categories with results (${working.length}/${catResults.length}):\n`);
  for (const r of working) {
    process.stdout.write(`     "${r.cat}": ${r.total} pages\n`);
  }

  const SKIP_PREFIXES = ['Category:', 'File:', 'Template:', 'Help:', 'User:', 'Talk:', 'Special:', 'MediaWiki:'];
  const titles = [...allTitles].filter(t => !SKIP_PREFIXES.some(p => t.startsWith(p)));

  process.stdout.write(`   Total unique titles: ${titles.length}\n`);

  const limit = isFinite(LIMIT) ? Math.min(LIMIT, titles.length) : titles.length;
  process.stdout.write(`\n🔮 STEP 2b — Fetching & parsing ${limit} item pages…\n`);

  let ok = 0, skip = 0, fail = 0;

  for (let i = 0; i < limit; i++) {
    const title = titles[i];
    progress(i + 1, limit, title.slice(0, 30));

    try {
      await sleep(DELAY_MS);
      const wikitext = await fetchWikitext(title);
      if (!wikitext) { skip++; continue; }

      const item = parseItemPage(title, wikitext);

      if (DRY_RUN) {
        if (i < 3) process.stdout.write(`\n   [DRY] ${item.name} → category=${item.category}, cursed=${item.cursed}\n`);
        ok++;
        continue;
      }

      await upsertItem(item);
      ok++;
    } catch (e) {
      fail++;
      process.stderr.write(`\n  ✗ ${title}: ${e.message}`);
    }
  }

  process.stdout.write(`\n   Done: ${ok} ok, ${skip} skipped, ${fail} failed\n`);
  return ok;
}

// ── STEP 3: Link table entries to items ───────────────────────────────────────
async function linkItems() {
  if (DRY_RUN) {
    process.stdout.write('\n🔗 [DRY] Skipping link step in dry-run mode.\n');
    return;
  }
  await linkTableItems();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  process.stdout.write('═══════════════════════════════════════════════\n');
  process.stdout.write(' AD&D 2E Magical Items Import\n');
  process.stdout.write(` DRY_RUN=${DRY_RUN}  LIMIT=${LIMIT}  TABLES_ONLY=${TABLES_ONLY}  ITEMS_ONLY=${ITEMS_ONLY}\n`);
  process.stdout.write('═══════════════════════════════════════════════\n');

  if (!DRY_RUN) {
    process.stdout.write('\n⚙ Verifying DB connection…');
    try { await dbQuery('SELECT 1'); process.stdout.write(' ✓\n'); }
    catch (e) { process.stderr.write(`\n✗ DB error: ${e.message}\n`); process.exit(1); }
  }

  if (!ITEMS_ONLY) await importTables();
  if (!TABLES_ONLY) await importItems();
  if (!TABLES_ONLY && !ITEMS_ONLY && !DRY_RUN) await linkItems();

  if (!DRY_RUN && _pool) await _pool.end();

  process.stdout.write('\n✅ Import complete.\n');
}

main().catch(e => {
  process.stderr.write(`\n✗ Fatal error: ${e.message}\n${e.stack}\n`);
  process.exit(1);
});
