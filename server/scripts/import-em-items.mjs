/**
 * import-em-items.mjs
 *
 * Fetches magical item tables from adnd2e.fandom.com (EM sourcebook)
 * via the MediaWiki API (bypasses Cloudflare) and writes parsed items
 * to a staging table for review / merge.
 *
 * Default (safe): --table A --dry-run --limit 10
 */

import pg                from 'pg';
import fs                from 'fs';
import path              from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool }  = pg;

// ── CLI parsing ───────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2);

function getFlag(name, defaultVal = null) {
  const i = ARGV.indexOf(name);
  return (i !== -1 && i + 1 < ARGV.length) ? ARGV[i + 1] : defaultVal;
}
function hasFlag(name) { return ARGV.includes(name); }

const tableArg  = (getFlag('--table', 'A')).toUpperCase();
const doAll     = hasFlag('--all');
const upsertDb  = hasFlag('--upsert-db') && !hasFlag('--dry-run');
const dryRun    = !upsertDb;
const writeJson = hasFlag('--write-json');
const delayMs   = parseInt(getFlag('--delay', '500'), 10);

// Limit defaults to 10 in dry-run, unlimited in upsert mode
const hasLimitFlag = ARGV.includes('--limit');
const limitN       = hasLimitFlag
  ? parseInt(getFlag('--limit', '10'), 10)
  : (upsertDb ? Number.MAX_SAFE_INTEGER : 10);

const tablesToProcess = doAll ? 'ABCDEFGHIJKLMNOPQRST'.split('') : [tableArg];

console.log('─'.repeat(64));
console.log('  import-em-items.mjs');
console.log(`  Tables  : ${doAll ? 'ALL (A–T)' : tablesToProcess.join(', ')}`);
console.log(`  Mode    : ${dryRun ? 'dry-run (no DB write)' : 'UPSERT to staging table'}`);
console.log(`  Limit   : ${limitN === Number.MAX_SAFE_INTEGER ? 'all' : limitN}`);
console.log(`  Delay   : ${delayMs}ms`);
console.log(`  JSON    : ${writeJson}`);
console.log('─'.repeat(64));

// ── Lazy DB pool ──────────────────────────────────────────────────────────────
let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME     || 'adnddb',
      user:     process.env.DB_USER     || 'adnduser',
      password: process.env.DB_PASSWORD || '',
    });
  }
  return pool;
}

// ── Table metadata ────────────────────────────────────────────────────────────
const BASE_WIKI = 'https://adnd2e.fandom.com';
const API_BASE  = 'https://adnd2e.fandom.com/api.php';

const TABLE_MAP = {
  A: 'Table A: Magical Liquids (EM)',
  B: 'Table B: Scrolls (EM)',
  C: 'Table C: Rings (EM)',
  D: 'Table D: Rods (EM)',
  E: 'Table E: Staves (EM)',
  F: 'Table F: Wands (EM)',
  G: 'Table G: Books (EM)',
  H: 'Table H: Gems & Jewelry (EM)',
  I: 'Table I: Clothing (EM)',
  J: 'Table J: Boots, Gloves, and Accessories (EM)',
  K: 'Table K: Girdles and Helmets (EM)',
  L: 'Table L: Bags, Bands, Bottles, and Basins (EM)',
  M: 'Table M: Dust and Stones (EM)',
  N: 'Table N: Household Items (EM)',
  O: 'Table O: Musical Instruments (EM)',
  P: 'Table P: Weird Stuff (EM)',
  Q: 'Table Q: Humorous Items (EM)',
  R: 'Table R: Armor and Shields (EM)',
  S: 'Table S: Weapons (EM)',
  T: 'Table T: Artifacts (EM)',
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── MediaWiki API fetch ───────────────────────────────────────────────────────
/**
 * Fetch raw wikitext for a page via the MediaWiki API.
 * API does NOT hit Cloudflare protection — safe from Node.js.
 */
function extractWikitext(pages) {
  const pageId = Object.keys(pages)[0];
  if (pageId === '-1') {
    const title = pages[pageId]?.title || 'unknown';
    throw new Error('Page not found for title: ' + title);
  }
  const p   = pages[pageId];
  const rev = p?.revisions?.[0];
  if (!rev) throw new Error('No revisions found');
  const content = rev['*'] ?? rev?.slots?.main?.['*'];
  if (!content) throw new Error('No content in revision');
  return content;
}

async function fetchWikitext(pageTitle, retries = 3) {
  const apiUrl =
    'https://adnd2e.fandom.com/api.php' +
    '?action=query' +
    '&titles=' + encodeURIComponent(pageTitle) +
    '&prop=revisions&rvprop=content&format=json&redirects=1';
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'ADnD-Manager-Bot/1.0 (import script; non-commercial)',
          'Accept':     'application/json',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data  = await res.json();
      const pages = data?.query?.pages;
      if (!pages) throw new Error('No pages in API response');
      return extractWikitext(pages);
    } catch (e) {
      if (attempt === retries) throw new Error(`${e.message} — ${pageTitle}`);
      console.warn(`    ⚠ Attempt ${attempt}/${retries} failed: ${e.message} — retry in ${currentDelay * 2}ms`);
      await sleep(currentDelay * 2);
      currentDelay *= 2;
    }
  }
}

// ── Wikitext helpers ──────────────────────────────────────────────────────────

/**
 * Strip wikitext markup, returning plain text.
 */
function stripWikiMarkup(text) {
  if (!text) return '';
  return text
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1') // [[link|display]] → display
    .replace(/\{\{[^}]*\}\}/g, '')                      // remove {{templates}}
    .replace(/'''([^']*?)'''/g, '$1')                   // '''bold''' → bold
    .replace(/''([^']*?)''/g, '$1')                     // ''italic'' → italic
    .replace(/<ref[^>]*?>[\s\S]*?<\/ref>/g, '')         // strip <ref>...</ref>
    .replace(/<[^>]+>/g, '')                            // strip other HTML tags
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the first [[link|display]] or [[link]] from text.
 * Returns { linkTarget, displayName }.
 */
function extractLink(text) {
  const match = text.match(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/);
  if (!match) return { linkTarget: null, displayName: stripWikiMarkup(text) };
  return {
    linkTarget:  match[1].trim(),
    displayName: (match[2] || match[1]).trim(),
  };
}

/**
 * Strip cell attribute prefix from a raw cell string.
 * Wikitext: `colspan="2" style="..." | actual content` → `actual content`
 */
function getCellContent(rawCell) {
  const pipeIdx = rawCell.indexOf(' | ');
  if (pipeIdx !== -1 && rawCell.slice(0, pipeIdx).includes('=')) {
    return rawCell.slice(pipeIdx + 3).trim();
  }
  return rawCell.trim();
}

/**
 * Extract all cells from a wikitext table row block
 * (the text between two \n|- delimiters).
 */
function extractCellsFromRow(rowBlock) {
  const cells = [];
  for (const line of rowBlock.split('\n')) {
    const t = line.trim();
    let isData    = t.startsWith('|') && !t.startsWith('|}') && !t.startsWith('{|');
    let isHeader  = t.startsWith('!');
    if (!isData && !isHeader) continue;

    const content = t.slice(1).trim();               // strip leading | or !
    const sep     = isHeader ? ' !! ' : ' || ';       // inline cell separator
    if (content.includes(sep)) {
      for (const part of content.split(sep)) {
        cells.push(getCellContent(part.trim()));
      }
    } else {
      cells.push(getCellContent(content));
    }
  }
  return cells;
}

// ── Roll text parsing ─────────────────────────────────────────────────────────
function parseRoll(rollText) {
  const norm  = rollText.trim().replace(/[–—]/g, '-');
  const parts = norm.split('-').map(s => s.trim());
  const toNum = s => (s === '000' ? 1000 : parseInt(s.replace(/^0+/, '') || '0', 10));
  if (parts.length >= 2) {
    return { rollMin: toNum(parts[0]), rollMax: toNum(parts[parts.length - 1]) };
  }
  const n = toNum(parts[0]);
  return { rollMin: n, rollMax: n };
}

function isRollText(text) {
  const t = text.trim();
  return /^\d{1,4}[-–—]\d{1,4}$/.test(t) || /^\d{1,4}$/.test(t);
}

function isHeaderLikeCategory(text) {
  const t = (text || '')
    .replace(/\s+/g, '')
    .toLowerCase();
  return [
    'd1000roll',
    'roll',
    'item',
    'rollitem',
    'd1000',
    'd1000item',
  ].includes(t);
}

function isRealCategoryLabel(text) {
  const t = (text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!t) return false;

  const compact = t.replace(/\s+/g, '').toLowerCase();

  const blacklist = new Set([
    'd1000',
    'roll',
    'item',
    'd1000roll',
    'rollitem',
    'd1000item',
  ]);

  if (blacklist.has(compact)) return false;

  // Category labels are short single labels like: Elixir, Perfume, Philter
  if (t.length > 40) return false;

  return true;
}

// ── Weapon family detection ───────────────────────────────────────────────────
function detectWeaponFamily(name) {
  if (name.includes('sword') || name.includes('saber') ||
      name.includes('scimitar') || name.includes('rapier') ||
      name.includes('blade') || name.includes('falchion') ||
      name.includes('katana') || name.includes('wakizashi')) return 'sword';
  if (name.includes('axe') || name.includes('hatchet'))       return 'axe';
  if (name.includes('mace') || name.includes('morningstar'))  return 'mace';
  if (name.includes('hammer') || name.includes('warhammer'))  return 'hammer';
  if (name.includes('dagger') || name.includes('knife') ||
      name.includes('dirk')  || name.includes('stiletto'))    return 'dagger';
  if (name.includes('spear') || name.includes('javelin'))     return 'spear';
  if (name.includes('flail'))                                 return 'flail';
  if (name.includes('staff') || name.includes('quarterstaff'))return 'staff';
  if (name.includes('lance'))                                 return 'lance';
  return 'misc';
}

// ── Item type normalizer — applied as a post-parse layer ──────────────────────
// Uses tableCode + subtable + finalName. Raw parsed fields stay unchanged.
function normalizeItem(item) {
  const name  = (item.finalName || '').toLowerCase();
  const table = item.tableCode;
  const sub   = item.subtable || '';

  if (table === 'A')
    return { item_type: 'potion',      equip_slot: null,      inventory_group: 'potions' };

  if (table === 'B')
    return { item_type: 'scroll',      equip_slot: null,      inventory_group: 'scrolls' };

  if (table === 'C')
    return { item_type: 'ring',        equip_slot: null,      inventory_group: 'magic' };

  if (table === 'D')
    return { item_type: 'rod',         equip_slot: null,      inventory_group: 'magic' };

  if (table === 'E')
    return { item_type: 'staff',       equip_slot: 'hand_r',  hands_required: 2, inventory_group: 'magic' };

  if (table === 'F')
    return { item_type: 'wand',        equip_slot: 'hand_r',  inventory_group: 'magic' };

  if (table === 'G')
    return { item_type: 'book',        equip_slot: null,      inventory_group: 'misc' };

  if (table === 'H') {
    if (name.includes('ring'))
      return { item_type: 'ring',      equip_slot: null,      inventory_group: 'magic' };
    if (name.includes('amulet') || name.includes('medallion') ||
        name.includes('necklace') || name.includes('pendant') ||
        name.includes('periapt') || name.includes('talisman'))
      return { item_type: 'amulet',    equip_slot: 'neck',    inventory_group: 'magic' };
    if (name.includes('bracelet') || name.includes('bracer') ||
        name.includes('bangle'))
      return { item_type: 'bracers',   equip_slot: 'wrists',  inventory_group: 'magic' };
    if (name.includes('crown') || name.includes('circlet') ||
        name.includes('tiara') || name.includes('diadem'))
      return { item_type: 'helmet',    equip_slot: 'head',    inventory_group: 'magic' };
    return { item_type: 'jewelry',     equip_slot: null,      inventory_group: 'magic' };
  }

  if (table === 'I') {
    if (name.includes('cloak') || name.includes('robe') || name.includes('cape'))
      return { item_type: 'cloak',     equip_slot: 'cloak',   inventory_group: 'clothing' };
    return { item_type: 'clothing',    equip_slot: 'body',    inventory_group: 'clothing' };
  }

  if (table === 'J') {
    if (name.includes('boot') || name.includes('sandal') || name.includes('slipper'))
      return { item_type: 'boots',     equip_slot: 'boots',   inventory_group: 'clothing' };
    if (name.includes('glove') || name.includes('gauntlet'))
      return { item_type: 'gloves',    equip_slot: 'gloves',  inventory_group: 'clothing' };
    return { item_type: 'accessory',   equip_slot: null,      inventory_group: 'clothing' };
  }

  if (table === 'K') {
    if (name.includes('girdle') || name.includes('belt') || name.includes('sash'))
      return { item_type: 'belt',      equip_slot: 'belt',    inventory_group: 'clothing' };
    if (name.includes('helm') || name.includes('hat') || name.includes('crown') ||
        name.includes('bonnet') || name.includes('cap') || name.includes('coif'))
      return { item_type: 'helmet',    equip_slot: 'head',    inventory_group: 'clothing' };
    return { item_type: 'accessory',   equip_slot: null,      inventory_group: 'clothing' };
  }

  if (table === 'L')
    return { item_type: 'container',   equip_slot: null,      inventory_group: 'misc' };

  if (table === 'M')
    return { item_type: 'misc',        equip_slot: null,      inventory_group: 'misc' };

  if (table === 'N')
    return { item_type: 'misc',        equip_slot: null,      inventory_group: 'misc' };

  if (table === 'O')
    return { item_type: 'instrument',  equip_slot: null,      inventory_group: 'misc' };

  if (table === 'P')
    return { item_type: 'misc',        equip_slot: null,      inventory_group: 'misc' };

  if (table === 'Q')
    return { item_type: 'misc',        equip_slot: null,      inventory_group: 'misc' };

  if (table === 'R') {
    if (sub === 'R2')
      return { item_type: 'armor_enchantment', equip_slot: null, inventory_group: 'armor' };
    if (name.includes('shield') || name.includes('buckler'))
      return { item_type: 'shield',      equip_slot: 'hand_l', inventory_group: 'armor' };
    // Check caparison before 'cap' to avoid false helmet match
    if (name.includes('barding') || name.includes('caparison'))
      return { item_type: 'mount_armor', equip_slot: null,     inventory_group: 'armor' };
    if (name.includes('bonnet') || name.includes('helm') ||
        name.includes('cap') || name.includes('coif'))
      return { item_type: 'helmet',      equip_slot: 'head',   inventory_group: 'armor' };
    return { item_type: 'armor',         equip_slot: 'body',   inventory_group: 'armor' };
  }

  if (table === 'S') {
    if (sub === 'S2')
      return { item_type: 'weapon_modifier', equip_slot: null, inventory_group: 'weapons' };
    if (name.includes('arrow') || name.includes('quarrel') ||
        name.includes('bolt') || name.includes('bullet') ||
        name.includes('dart') || name.includes('needle') ||
        name.includes('shot') || name.includes('stone')) {
      const ammo_type = name.includes('arrow')   ? 'arrow'
                      : (name.includes('bolt') || name.includes('quarrel')) ? 'bolt'
                      : name.includes('bullet')  ? 'bullet' : 'misc';
      return { item_type: 'ammo', equip_slot: 'ammo', ammo_type, inventory_group: 'ammo' };
    }
    if (name.includes('bow') || name.includes('crossbow') ||
        name.includes('sling') || name.includes('blowgun')) {
      const weapon_family = name.includes('crossbow') ? 'crossbow'
                          : name.includes('bow')      ? 'bow'
                          : name.includes('sling')    ? 'sling' : 'blowgun';
      return { item_type: 'ranged', equip_slot: 'ranged', weapon_family, hands_required: 2, inventory_group: 'weapons' };
    }
    // Siege / oversized weapons — not hand-carried
    if (name.includes('ballista') || name.includes('battering ram') || name.includes('bombard'))
      return { item_type: 'siege_weapon', equip_slot: null, hands_required: null, inventory_group: 'weapons' };
    if (name.includes('two-handed') || name.includes('great sword') ||
        name.includes('pike') || name.includes('halberd') ||
        name.includes('polearm') || name.includes('quarterstaff') ||
        name.includes('lance') || name.includes('great axe'))
      return { item_type: 'weapon', equip_slot: 'hand_r', weapon_family: detectWeaponFamily(name), hands_required: 2, inventory_group: 'weapons' };
    return { item_type: 'weapon', equip_slot: 'hand_r', weapon_family: detectWeaponFamily(name), hands_required: 1, inventory_group: 'weapons' };
  }

  if (table === 'T')
    return { item_type: 'artifact',    equip_slot: null,      inventory_group: 'artifacts' };

  return { item_type: 'misc',          equip_slot: null,      inventory_group: 'misc' };
}

// ── Parse a single table page from wikitext ───────────────────────────────────
function parseWikitextTable(tableCode, tableUrl, wikitext) {
  const items = [];
  let   currentCategory = '';
  let   debugRowCount   = 0;  // temporary: log first 10 row blocks

  // Find the first wikitable block {| ... |}
  const tableStart = wikitext.indexOf('{|');
  if (tableStart === -1) {
    console.warn(`  ⚠ No wikitable found in wikitext for ${tableUrl}`);
    return items;
  }

  // Walk to find matching |}
  let depth = 0, tableEnd = -1;
  for (let i = tableStart; i < wikitext.length - 1; i++) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '|') { depth++; i++; }
    else if (wikitext[i] === '|' && wikitext[i + 1] === '}') {
      depth--;
      if (depth === 0) { tableEnd = i + 2; break; }
      i++;
    }
  }
  const tableText = tableEnd !== -1 ? wikitext.slice(tableStart, tableEnd) : wikitext.slice(tableStart);

  // Split into row blocks by \n|-
  const rowBlocks = tableText.split(/\n\s*\|-/);

  // ── Category text cleaner ─────────────────────────────────────────────────
  const cleanCat = (raw) => {
    const cleaned = raw
      .replace(/\|\|/g, '')
      .replace(/\|/g, '')
      .replace(/'''/g, '')
      .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
      .replace(/\s*!+\s*$/, '')   // strip trailing "!!" wiki header markers
      .trim();
    return cleaned || null;
  };

  for (const block of rowBlocks) {
    const cells = extractCellsFromRow(block);

    // ── DEBUG: first 20 row blocks ────────────────────────────────────────────
    if (debugRowCount < 20) {
      const rawLines = block.split('\n').map(l => l.trimEnd()).filter(Boolean);
      const hasExcl  = rawLines.some(l => l.trimStart().startsWith('!'));
      console.log(`  [ROW ${debugRowCount}] lines=${rawLines.length} cells=${cells.length} hasBang=${hasExcl} catBefore="${currentCategory}"`);
      if (rawLines.length) console.log(`    raw[0]: ${rawLines[0].slice(0, 80)}`);
      if (cells.length)    console.log(`    cells : ${JSON.stringify(cells.slice(0, 3))}`);
    }

    if (cells.length === 0) {
      if (debugRowCount < 20) console.log(`    → SKIP (no cells)`);
      debugRowCount++;
      continue;
    }

    // ── Single cell — category row (colspan="2" or ! header with colspan) ─────
    // NOTE: real category rows may use either | or ! with colspan="2".
    // We rely on isHeaderLikeCategory to block column-header text, NOT on
    // whether the line starts with ! (which would also block Elixir etc.).
    if (cells.length === 1) {
      const catText    = stripWikiMarkup(cells[0]).trim();
      const cleanedCat = cleanCat(stripWikiMarkup(catText));
      const blocked    = !cleanedCat || isRollText(cleanedCat) || isHeaderLikeCategory(cleanedCat);
      if (!blocked) {
        currentCategory = cleanedCat;
        if (debugRowCount < 20) console.log(`    → CATEGORY: "${currentCategory}"`);
      } else {
        if (debugRowCount < 20) console.log(`    → SKIP (single-cell blocked: cleanedCat="${cleanedCat}")`);
      }
      debugRowCount++;
      continue;
    }

    // ── Two+ cells — check if first cell is a roll number ────────────────────
    const firstClean = stripWikiMarkup(cells[0]).trim();

    if (!isRollText(firstClean)) {
      // Not a roll row — candidate category from first non-empty cell.
      // isRealCategoryLabel blocks column-header text (d1000Roll, Item, etc.)
      const rawCat = stripWikiMarkup(cells[0]).trim() || stripWikiMarkup(cells[1]).trim();
      const cat    = cleanCat(stripWikiMarkup(rawCat));
      if (isRealCategoryLabel(cat)) {
        currentCategory = cat;
        if (debugRowCount < 20) console.log(`    → CATEGORY (multi): "${currentCategory}"`);
      } else {
        if (debugRowCount < 20) console.log(`    → SKIP (multi-cell blocked: cat="${cat}")`);
      }
      debugRowCount++;
      continue;
    }

    // ── Item row ─────────────────────────────────────────────────────────────
    if (debugRowCount < 20) console.log(`    → ITEM: roll="${firstClean}" catNow="${currentCategory}"`);
    debugRowCount++;
    const rollText               = firstClean;
    const { rollMin, rollMax }   = parseRoll(rollText);
    const { linkTarget, displayName } = extractLink(cells[1]);
    const rawName                = (displayName || stripWikiMarkup(cells[1])).trim();
    if (!rawName) continue;

    const slug      = linkTarget ? linkTarget.replace(/ /g, '_') : null;
    const sourceUrl = slug ? `${BASE_WIKI}/wiki/${slug}` : null;

    const finalName = rawName.toLowerCase().startsWith('of ') && currentCategory
      ? `${currentCategory} ${rawName}`.trim()
      : rawName;

    items.push({
      tableCode,
      tableUrl,
      rollText,
      rollMin,
      rollMax,
      category:      currentCategory || null,
      rawName,
      finalName,
      slug,
      hasDetailPage: !!sourceUrl,
      sourceUrl,
      descTitle:     null,
      description:   null,
      warnings:      sourceUrl ? null : 'No detail page link',
    });
  }

  return items;
}

// ── Parse Table S (Weapons) — subtable-aware ─────────────────────────────────
// Table S contains named subtables (S1, S2, …).  Their header rows look like:
//   "+ Table S1 : Generic Magical Weapons"
// or split across two cells:
//   cells[0] = "Table S1"   cells[1] = "Generic Magical Weapons"
// These must be stored as subtable/subtableTitle, NOT as category.
function parseTableS(tableCode, tableUrl, wikitext) {
  const items = [];
  let   currentSubtable      = null;
  let   currentSubtableTitle = null;
  let   currentCategory      = '';
  let   debugRowCount        = 0;

  // Regex: matches "Table S1", "Table S2", etc. with optional ": Title" part
  const SUBTABLE_RE = /Table\s+S(\d+)(?:\s*[:\-–]\s*(.+))?/i;

  // ── Collect ALL {| ... |} table blocks from the wikitext ─────────────────────
  const allTableTexts = [];
  let pos = 0;
  while (pos < wikitext.length) {
    const start = wikitext.indexOf('{|', pos);
    if (start === -1) break;
    let depth = 0, end = -1;
    for (let i = start; i < wikitext.length - 1; i++) {
      if (wikitext[i] === '{' && wikitext[i + 1] === '|') { depth++; i++; }
      else if (wikitext[i] === '|' && wikitext[i + 1] === '}') {
        depth--;
        if (depth === 0) { end = i + 2; break; }
        i++;
      }
    }
    allTableTexts.push(wikitext.slice(start, end !== -1 ? end : wikitext.length));
    pos = end !== -1 ? end : wikitext.length;
  }

  if (allTableTexts.length === 0) {
    console.warn(`  ⚠ No wikitables found in wikitext for ${tableUrl}`);
    return items;
  }

  console.log(`  Found ${allTableTexts.length} wiki table block(s) in Table S wikitext`);

  // Flatten all table blocks into a single rowBlocks array
  const rowBlocks = allTableTexts.flatMap(t => t.split(/\n\s*\|-/));

  const cleanCat = (raw) => {
    const cleaned = raw
      .replace(/\|\|/g, '')
      .replace(/\|/g, '')
      .replace(/'''/g, '')
      .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
      .replace(/^\+\s*/, '')   // strip leading "+ " that appears in S subtable headers
      .trim();
    return cleaned || null;
  };

  for (const block of rowBlocks) {
    const cells = extractCellsFromRow(block);

    // ── DEBUG: first 10 row blocks for Table S ────────────────────────────────
    if (debugRowCount < 10) {
      const rawLines = block.split('\n').map(l => l.trimEnd()).filter(Boolean);
      console.log(`  [S-ROW ${debugRowCount}] cells=${cells.length} subtable="${currentSubtable}" cat="${currentCategory}"`);
      if (rawLines.length) console.log(`    raw[0]: ${rawLines[0].slice(0, 80)}`);
      if (cells.length)    console.log(`    cells : ${JSON.stringify(cells.slice(0, 3))}`);
    }

    if (cells.length === 0) { debugRowCount++; continue; }

    // ── Subtable / category detection for single-cell rows ───────────────────
    if (cells.length === 1) {
      const raw     = cleanCat(stripWikiMarkup(cells[0]).trim()) || '';
      const subMatch = raw.match(SUBTABLE_RE);
      if (subMatch) {
        currentSubtable      = `S${subMatch[1]}`;
        currentSubtableTitle = (subMatch[2] || '').trim() || null;
        currentCategory      = '';
        console.log(`  Detected subtable: ${currentSubtable} "${currentSubtableTitle}"`);
        if (debugRowCount < 10) console.log(`    → SUBTABLE: ${currentSubtable} "${currentSubtableTitle}"`);
      } else if (raw && !isRollText(raw) && !isHeaderLikeCategory(raw)) {
        currentCategory = raw;
        if (debugRowCount < 10) console.log(`    → CATEGORY: "${currentCategory}"`);
      } else {
        if (debugRowCount < 10) console.log(`    → SKIP (single-cell: "${raw}")`);
      }
      debugRowCount++;
      continue;
    }

    // ── Two+ cells ────────────────────────────────────────────────────────────
    const firstClean = stripWikiMarkup(cells[0]).trim();
    const rawFirst   = cleanCat(firstClean) || '';

    if (!isRollText(firstClean)) {
      // Check if this is a two-cell subtable header: "Table S1" | "Generic Magical Weapons"
      const subMatch = rawFirst.match(SUBTABLE_RE);
      if (subMatch) {
        currentSubtable      = `S${subMatch[1]}`;
        // Title: from the regex group OR from the second cell
        const titleFromRegex = (subMatch[2] || '').trim();
        const titleFromCell  = cleanCat(stripWikiMarkup(cells[1]).trim()) || '';
        currentSubtableTitle = titleFromRegex || titleFromCell || null;
        currentCategory      = '';
        console.log(`  Detected subtable: ${currentSubtable} "${currentSubtableTitle}"`);
        if (debugRowCount < 10) console.log(`    → SUBTABLE (multi): ${currentSubtable} "${currentSubtableTitle}"`);
      } else if (isRealCategoryLabel(rawFirst)) {
        currentCategory = rawFirst;
        if (debugRowCount < 10) console.log(`    → CATEGORY (multi): "${currentCategory}"`);
      } else {
        if (debugRowCount < 10) console.log(`    → SKIP (multi non-roll: "${rawFirst}")`);
      }
      debugRowCount++;
      continue;
    }

    // ── Item row ─────────────────────────────────────────────────────────────
    if (debugRowCount < 10) console.log(`    → ITEM: roll="${firstClean}" sub="${currentSubtable}" cat="${currentCategory}"`);
    debugRowCount++;
    const rollText                    = firstClean;
    const { rollMin, rollMax }        = parseRoll(rollText);
    const { linkTarget, displayName } = extractLink(cells[1]);
    const rawName                     = (displayName || stripWikiMarkup(cells[1])).trim();
    if (!rawName) continue;

    const slug      = linkTarget ? linkTarget.replace(/ /g, '_') : null;
    const sourceUrl = slug ? `${BASE_WIKI}/wiki/${slug}` : null;

    const finalName = rawName.toLowerCase().startsWith('of ') && currentCategory
      ? `${currentCategory} ${rawName}`.trim()
      : rawName;

    items.push({
      tableCode,
      tableUrl,
      rollText,
      rollMin,
      rollMax,
      subtable:      currentSubtable      || null,
      subtableTitle: currentSubtableTitle || null,
      category:      currentCategory      || null,
      rawName,
      finalName,
      slug,
      hasDetailPage: !!sourceUrl,
      sourceUrl,
      descTitle:     null,
      description:   null,
      warnings:      sourceUrl ? null : 'No detail page link',
    });
  }

  return items;
}

// ── Parse Table R (Armor & Shields) — subtable-aware ─────────────────────────
// Same structure as Table S: multiple {| ... |} blocks, one per subtable.
// Subtable headers look like: "+ Table R1: Generic Magical Armor"
function parseTableR(tableCode, tableUrl, wikitext) {
  const items = [];
  let   currentSubtable      = null;
  let   currentSubtableTitle = null;
  let   currentCategory      = '';
  let   debugRowCount        = 0;

  const SUBTABLE_RE = /Table\s+R(\d+)(?:\s*[:\-–]\s*(.+))?/i;

  // ── Collect ALL {| ... |} table blocks ───────────────────────────────────────
  const allTableTexts = [];
  let pos = 0;
  while (pos < wikitext.length) {
    const start = wikitext.indexOf('{|', pos);
    if (start === -1) break;
    let depth = 0, end = -1;
    for (let i = start; i < wikitext.length - 1; i++) {
      if (wikitext[i] === '{' && wikitext[i + 1] === '|') { depth++; i++; }
      else if (wikitext[i] === '|' && wikitext[i + 1] === '}') {
        depth--;
        if (depth === 0) { end = i + 2; break; }
        i++;
      }
    }
    allTableTexts.push(wikitext.slice(start, end !== -1 ? end : wikitext.length));
    pos = end !== -1 ? end : wikitext.length;
  }

  if (allTableTexts.length === 0) {
    console.warn(`  ⚠ No wikitables found in wikitext for ${tableUrl}`);
    return items;
  }

  console.log(`  Found ${allTableTexts.length} wiki table block(s) in Table R wikitext`);

  const rowBlocks = allTableTexts.flatMap(t => t.split(/\n\s*\|-/));

  const cleanCat = (raw) => {
    const cleaned = raw
      .replace(/\|\|/g, '')
      .replace(/\|/g, '')
      .replace(/'''/g, '')
      .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
      .replace(/^\+\s*/, '')
      .trim();
    return cleaned || null;
  };

  for (const block of rowBlocks) {
    const cells = extractCellsFromRow(block);

    // ── DEBUG: first 10 row blocks for Table R ────────────────────────────────
    if (debugRowCount < 10) {
      const rawLines = block.split('\n').map(l => l.trimEnd()).filter(Boolean);
      console.log(`  [R-ROW ${debugRowCount}] cells=${cells.length} subtable="${currentSubtable}" cat="${currentCategory}"`);
      if (rawLines.length) console.log(`    raw[0]: ${rawLines[0].slice(0, 80)}`);
      if (cells.length)    console.log(`    cells : ${JSON.stringify(cells.slice(0, 3))}`);
    }

    if (cells.length === 0) { debugRowCount++; continue; }

    // ── Subtable / category detection for single-cell rows ───────────────────
    if (cells.length === 1) {
      const raw      = cleanCat(stripWikiMarkup(cells[0]).trim()) || '';
      const subMatch = raw.match(SUBTABLE_RE);
      if (subMatch) {
        currentSubtable      = `R${subMatch[1]}`;
        currentSubtableTitle = (subMatch[2] || '').trim() || null;
        currentCategory      = '';
        console.log(`  Detected subtable: ${currentSubtable} "${currentSubtableTitle}"`);
        if (debugRowCount < 10) console.log(`    → SUBTABLE: ${currentSubtable} "${currentSubtableTitle}"`);
      } else if (raw && !isRollText(raw) && !isHeaderLikeCategory(raw)) {
        currentCategory = raw;
        if (debugRowCount < 10) console.log(`    → CATEGORY: "${currentCategory}"`);
      } else {
        if (debugRowCount < 10) console.log(`    → SKIP (single-cell: "${raw}")`);
      }
      debugRowCount++;
      continue;
    }

    // ── Two+ cells ────────────────────────────────────────────────────────────
    const firstClean = stripWikiMarkup(cells[0]).trim();
    const rawFirst   = cleanCat(firstClean) || '';

    if (!isRollText(firstClean)) {
      const subMatch = rawFirst.match(SUBTABLE_RE);
      if (subMatch) {
        currentSubtable      = `R${subMatch[1]}`;
        const titleFromRegex = (subMatch[2] || '').trim();
        const titleFromCell  = cleanCat(stripWikiMarkup(cells[1]).trim()) || '';
        currentSubtableTitle = titleFromRegex || titleFromCell || null;
        currentCategory      = '';
        console.log(`  Detected subtable: ${currentSubtable} "${currentSubtableTitle}"`);
        if (debugRowCount < 10) console.log(`    → SUBTABLE (multi): ${currentSubtable} "${currentSubtableTitle}"`);
      } else if (isRealCategoryLabel(rawFirst)) {
        currentCategory = rawFirst;
        if (debugRowCount < 10) console.log(`    → CATEGORY (multi): "${currentCategory}"`);
      } else {
        if (debugRowCount < 10) console.log(`    → SKIP (multi non-roll: "${rawFirst}")`);
      }
      debugRowCount++;
      continue;
    }

    // ── Item row ─────────────────────────────────────────────────────────────
    if (debugRowCount < 10) console.log(`    → ITEM: roll="${firstClean}" sub="${currentSubtable}" cat="${currentCategory}"`);
    debugRowCount++;
    const rollText                    = firstClean;
    const { rollMin, rollMax }        = parseRoll(rollText);
    const { linkTarget, displayName } = extractLink(cells[1]);
    const rawName                     = (displayName || stripWikiMarkup(cells[1])).trim();
    if (!rawName) continue;

    const slug      = linkTarget ? linkTarget.replace(/ /g, '_') : null;
    const sourceUrl = slug ? `${BASE_WIKI}/wiki/${slug}` : null;

    const finalName = rawName.toLowerCase().startsWith('of ') && currentCategory
      ? `${currentCategory} ${rawName}`.trim()
      : rawName;

    items.push({
      tableCode,
      tableUrl,
      rollText,
      rollMin,
      rollMax,
      subtable:      currentSubtable      || null,
      subtableTitle: currentSubtableTitle || null,
      category:      currentCategory      || null,
      rawName,
      finalName,
      slug,
      hasDetailPage: !!sourceUrl,
      sourceUrl,
      descTitle:     null,
      description:   null,
      warnings:      sourceUrl ? null : 'No detail page link',
    });
  }

  return items;
}

// ── Fetch description from a detail page via MediaWiki API ───────────────────
async function fetchDescription(url) {
  try {
    const urlPath      = new URL(url).pathname;
    const encodedSlug  = urlPath.replace('/wiki/', '');       // may contain %XX
    // Decode so fetchWikitext can re-encode cleanly (avoids double-encoding)
    const pageTitle    = decodeURIComponent(encodedSlug);     // e.g. "Azuredge,_Slayer..."
    const cleanTitle   = pageTitle.replace(/_/g, ' ');

    console.log(`    [detail] href="${encodedSlug}" title="${pageTitle}" url="${url}"`);

    const wikitext = await fetchWikitext(pageTitle);

    // Extract intro text: everything before the first == section heading ==
    const sectionIdx = wikitext.search(/\n==\s*[^=]/);
    const introText  = sectionIdx !== -1 ? wikitext.slice(0, sectionIdx) : wikitext;

    // Split into paragraphs, strip markup, filter short/template lines
    const paragraphs = introText
      .split(/\n\n+/)
      .map(p => stripWikiMarkup(p).trim())
      .filter(p => p.length > 15 && !p.startsWith('{') && !p.startsWith('|') && !p.startsWith('!'));

    const description = paragraphs.slice(0, 3).join('\n').slice(0, 1000) || null;
    return { title: cleanTitle, description, warning: null };
  } catch (e) {
    console.warn(`    [detail] FAILED url="${url}" error="${e.message}"`);
    return { title: null, description: null, warning: e.message };
  }
}

// ── Get existing DB count for a table letter ──────────────────────────────────
async function getDbCount(letter) {
  try {
    const res = await getPool().query(
      `SELECT COUNT(*) AS cnt FROM magical_items WHERE UPPER(table_letter) = $1`,
      [letter],
    );
    return parseInt(res.rows[0].cnt, 10);
  } catch {
    return null;
  }
}

// ── Ensure staging table exists ───────────────────────────────────────────────
async function ensureStagingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS magical_items_em_import (
      id                SERIAL PRIMARY KEY,
      slug              VARCHAR(300),
      name              VARCHAR(300) NOT NULL,
      raw_name          VARCHAR(300),
      category          VARCHAR(200),
      table_code        VARCHAR(5),
      table_url         TEXT,
      roll_text         VARCHAR(50),
      roll_min          INTEGER,
      roll_max          INTEGER,
      source_url        TEXT,
      description_title VARCHAR(300),
      description       TEXT,
      has_detail_page   BOOLEAN DEFAULT FALSE,
      import_warnings   TEXT,
      created_at        TIMESTAMP DEFAULT NOW(),
      updated_at        TIMESTAMP DEFAULT NOW(),
      UNIQUE(table_code, roll_min, roll_max)
    )
  `);

  // Add normalized typing columns if they don't exist yet
  for (const col of [
    `item_type       VARCHAR(50)`,
    `equip_slot      VARCHAR(50)`,
    `weapon_family   VARCHAR(50)`,
    `hands_required  INTEGER`,
    `ammo_type       VARCHAR(50)`,
    `inventory_group VARCHAR(50)`,
  ]) {
    const colName = col.trim().split(/\s+/)[0];
    try {
      await client.query(
        `ALTER TABLE magical_items_em_import ADD COLUMN IF NOT EXISTS ${col}`,
      );
    } catch (e) {
      console.warn(`  [staging] Could not add column ${colName}: ${e.message}`);
    }
  }

  const dbUser = process.env.DB_USER || 'adnduser';
  try {
    await client.query(`GRANT ALL ON magical_items_em_import TO ${dbUser}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${dbUser}`);
  } catch { /* ignore on managed DBs */ }
}

// ── Upsert items into staging table ──────────────────────────────────────────
async function upsertItems(items) {
  const client = await getPool().connect();
  try {
    await ensureStagingTable(client);

    let inserted = 0, updated = 0;
    for (const item of items) {
      const { rows } = await client.query(
        `INSERT INTO magical_items_em_import
           (slug, name, raw_name, category, table_code, table_url,
            roll_text, roll_min, roll_max, source_url,
            description_title, description, has_detail_page, import_warnings,
            item_type, equip_slot, weapon_family, hands_required, ammo_type, inventory_group)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (table_code, roll_min, roll_max) DO UPDATE SET
           name              = EXCLUDED.name,
           raw_name          = EXCLUDED.raw_name,
           category          = EXCLUDED.category,
           source_url        = EXCLUDED.source_url,
           description_title = EXCLUDED.description_title,
           description       = EXCLUDED.description,
           has_detail_page   = EXCLUDED.has_detail_page,
           import_warnings   = EXCLUDED.import_warnings,
           item_type         = EXCLUDED.item_type,
           equip_slot        = EXCLUDED.equip_slot,
           weapon_family     = EXCLUDED.weapon_family,
           hands_required    = EXCLUDED.hands_required,
           ammo_type         = EXCLUDED.ammo_type,
           inventory_group   = EXCLUDED.inventory_group,
           updated_at        = NOW()
         RETURNING (xmax = 0) AS was_inserted`,
        [
          item.slug, item.finalName, item.rawName, item.category,
          item.tableCode, item.tableUrl, item.rollText, item.rollMin, item.rollMax,
          item.sourceUrl, item.descTitle, item.description, item.hasDetailPage, item.warnings,
          item.item_type, item.equip_slot, item.weapon_family, item.hands_required,
          item.ammo_type, item.inventory_group,
        ],
      );
      if (rows[0]?.was_inserted) inserted++; else updated++;
    }
    console.log(`  DB: ${inserted} inserted, ${updated} updated`);
  } finally {
    client.release();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  for (const tableCode of tablesToProcess) {
    const pageTitle = TABLE_MAP[tableCode];
    if (!pageTitle) {
      console.error(`\n✗ No entry in TABLE_MAP for table ${tableCode} — skipping`);
      continue;
    }

    const tableUrl = `${BASE_WIKI}/wiki/${pageTitle.replace(/ /g, '_')}`;
    const apiUrl   =
      'https://adnd2e.fandom.com/api.php' +
      '?action=query' +
      '&titles=' + encodeURIComponent(pageTitle) +
      '&prop=revisions&rvprop=content&format=json&redirects=1';

    console.log(`\n${'═'.repeat(64)}`);
    console.log(`  Table code: ${tableCode}`);
    console.log(`  Title: ${pageTitle}`);
    console.log(`  API URL: ${apiUrl}`);
    console.log('═'.repeat(64));

    // Fetch wikitext via MediaWiki API
    let wikitext;
    try {
      console.log(`  Fetching wikitext via API…`);
      wikitext = await fetchWikitext(pageTitle);
      await sleep(delayMs);
    } catch (e) {
      console.error(`  ✗ Failed to fetch: ${e.message}`);
      continue;
    }

    const allItems = tableCode === 'S' ? parseTableS(tableCode, tableUrl, wikitext)
                   : tableCode === 'R' ? parseTableR(tableCode, tableUrl, wikitext)
                   : parseWikitextTable(tableCode, tableUrl, wikitext);
    console.log(`  Parsed ${allItems.length} items from wiki`);

    // ── Apply item type normalization (post-parse, non-destructive) ───────────
    for (const item of allItems) {
      const norm = normalizeItem(item);
      item.item_type       = norm.item_type       ?? null;
      item.equip_slot      = norm.equip_slot      ?? null;
      item.weapon_family   = norm.weapon_family   ?? null;
      item.hands_required  = norm.hands_required  ?? null;
      item.ammo_type       = norm.ammo_type       ?? null;
      item.inventory_group = norm.inventory_group ?? null;

      // Table C: ring items named "of X" need a "Ring" prefix in finalName
      // (no category header precedes them in the wiki table)
      if (item.tableCode === 'C' && item.finalName &&
          item.finalName.toLowerCase().startsWith('of ')) {
        item.finalName = 'Ring ' + item.finalName;
      }
    }

    if (!allItems.length) {
      console.warn('  ⚠ No items parsed — check wikitext table format');
      continue;
    }

    // Apply limit
    const items = allItems.slice(0, limitN);

    // Fetch descriptions for items that have a detail page link
    const withLink = items.filter(it => it.hasDetailPage);
    if (withLink.length) {
      console.log(`  Fetching ${withLink.length} description page${withLink.length !== 1 ? 's' : ''}…`);
      for (const item of withLink) {
        const { title, description, warning } = await fetchDescription(item.sourceUrl);
        item.descTitle   = title;
        item.description = description;
        if (warning) item.warnings = (item.warnings ? item.warnings + '; ' : '') + warning;
        process.stdout.write('.');
        await sleep(delayMs);
      }
      process.stdout.write('\n');
    }

    // ── Print first 10 parsed items ──────────────────────────────────────────
    console.log(`\n  First ${Math.min(10, items.length)} items:`);
    for (const item of items.slice(0, 10)) {
      const base = {
        tableCode:      item.tableCode,
        rollText:       item.rollText,
        rollMin:        item.rollMin,
        rollMax:        item.rollMax,
        category:       item.category,
        rawName:        item.rawName,
        finalName:      item.finalName,
        item_type:      item.item_type,
        equip_slot:     item.equip_slot,
        weapon_family:  item.weapon_family,
        hands_required: item.hands_required,
        ammo_type:      item.ammo_type,
        inventory_group:item.inventory_group,
        hasDetailPage:  item.hasDetailPage,
        sourceUrl:      item.sourceUrl,
      };
      if (tableCode === 'S' || tableCode === 'R') {
        base.subtable      = item.subtable;
        base.subtableTitle = item.subtableTitle;
      }
      console.log(JSON.stringify(base, null, 2));
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const dbCount   = await getDbCount(tableCode);
    const wikiCount = allItems.length;
    const diff      = dbCount != null ? wikiCount - dbCount : null;
    console.log(
      `\n  Wiki item count: ${wikiCount} | DB item count: ${dbCount ?? '(no connection)'} | Difference: ${diff ?? '?'}`,
    );

    // ── Write JSON ───────────────────────────────────────────────────────────
    if (writeJson) {
      const tmpDir  = path.join(__dirname, '..', 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const outPath = path.join(tmpDir, `em-items-${tableCode}.json`);
      fs.writeFileSync(outPath, JSON.stringify(items, null, 2));
      console.log(`  JSON → ${outPath}`);
    }

    // ── Upsert to staging table ───────────────────────────────────────────────
    if (upsertDb) {
      console.log(`  Upserting ${items.length} items to staging table…`);
      await upsertItems(items);
    } else {
      console.log('  (dry-run — no DB write)');
    }
  }

  if (pool) await pool.end();

  // ── Usage reminder ───────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(64)}`);
  console.log('  Usage examples:\n');
  console.log('  # Safe test — Table A, no DB write, first 10 items:');
  console.log('  node server/scripts/import-em-items.mjs \\');
  console.log('    --table A --dry-run --write-json --limit 10\n');
  console.log('  # Write Table A to staging DB:');
  console.log('  DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb \\');
  console.log('  DB_USER=adnduser DB_PASSWORD=ADTjoernely53 \\');
  console.log('  node server/scripts/import-em-items.mjs \\');
  console.log('    --table A --upsert-db --delay 500\n');
  console.log('  # Import all tables to staging:');
  console.log('  DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb \\');
  console.log('  DB_USER=adnduser DB_PASSWORD=ADTjoernely53 \\');
  console.log('  node server/scripts/import-em-items.mjs \\');
  console.log('    --all --upsert-db --delay 500');
  console.log('─'.repeat(64));
}

main().catch(e => {
  console.error('\n✗ Fatal:', e.message);
  if (pool) pool.end().catch(() => {});
  process.exit(1);
});
