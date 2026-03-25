import { useState, useRef, useEffect } from 'react';
import { api } from '../../api/client.js';
import DiceRoller from './DiceRoller.jsx';
import './Items.css';
import { S3_DATA, S3_CATEGORIES as S3_CATS } from './s3_data.js';
import { buildS3WikiTitle, getS3WikiUrl } from './s3_wiki_links.js';

// ── Table 1 master overview ────────────────────────────────────────────────
const TABLE_1 = [
  { rollMin:  1, rollMax: 20,  label: '01–20', category: 'Magical Liquids',             table: 'A', dice: 'd20'   },
  { rollMin: 21, rollMax: 35,  label: '21–35', category: 'Scrolls',                     table: 'B', dice: 'd20'   },
  { rollMin: 36, rollMax: 40,  label: '36–40', category: 'Rings',                       table: 'C', dice: 'd20'   },
  { rollMin: 41, rollMax: 45,  label: '41–45', category: 'Rods',                        table: 'D', dice: 'd20'   },
  { rollMin: 46, rollMax: 50,  label: '46–50', category: 'Staves',                      table: 'E', dice: 'd20'   },
  { rollMin: 51, rollMax: 55,  label: '51–55', category: 'Wands',                       table: 'F', dice: 'd20'   },
  { rollMin: 56, rollMax: 60,  label: '56–60', category: 'Books & Tomes',               table: 'G', dice: 'd20'   },
  { rollMin: 61, rollMax: 65,  label: '61–65', category: 'Gems & Jewelry',              table: 'H', dice: 'd20'   },
  { rollMin: 66, rollMax: 68,  label: '66–68', category: 'Clothing',                    table: 'I', dice: 'd20'   },
  { rollMin: 69, rollMax: 72,  label: '69–72', category: 'Boots, Gloves & Accessories', table: 'J', dice: 'd20'   },
  { rollMin: 73, rollMax: 74,  label: '73–74', category: 'Girdles & Helmets',           table: 'K', dice: 'd20'   },
  { rollMin: 75, rollMax: 77,  label: '75–77', category: 'Bags, Bands & Bottles',       table: 'L', dice: 'd20'   },
  { rollMin: 78, rollMax: 80,  label: '78–80', category: 'Dusts & Stones',              table: 'M', dice: 'd20'   },
  { rollMin: 81, rollMax: 83,  label: '81–83', category: 'Household Items',             table: 'N', dice: 'd20'   },
  { rollMin: 84, rollMax: 85,  label: '84–85', category: 'Musical Instruments',         table: 'O', dice: 'd20'   },
  { rollMin: 86, rollMax: 87,  label: '86–87', category: 'Weird Stuff',                 table: 'P', dice: 'd20'   },
  { rollMin: 88, rollMax: 89,  label: '88–89', category: 'Humorous Items',              table: 'Q', dice: 'd20'   },
  { rollMin: 90, rollMax: 95,  label: '90–95', category: 'Armor & Shields',             table: 'R', dice: 'd1000' },
  { rollMin: 96, rollMax: 99,  label: '96–99', category: 'Weapons',                     table: 'S', dice: 'd1000' },
  { rollMin:100, rollMax:100,  label: '00',    category: 'Artifacts & Relics',          table: 'T', dice: 'd20'   },
];

// ── Hardcoded S1 — Generic Magical Weapons (d1000) ────────────────────────
const S1_WEAPONS = [
  { roll_min: 1,    roll_max: 97,   item_name: 'Arrow'                          },
  { roll_min: 98,   roll_max: 100,  item_name: 'Quarrel (Bolt)'                 },
  { roll_min: 101,  roll_max: 102,  item_name: 'Arrowhead'                      },
  { roll_min: 103,  roll_max: 143,  item_name: 'Axe'                            },
  { roll_min: 144,  roll_max: 146,  item_name: 'Ballista'                       },
  { roll_min: 147,  roll_max: 148,  item_name: 'Battering Ram'                  },
  { roll_min: 149,  roll_max: 151,  item_name: 'Blowgun'                        },
  { roll_min: 152,  roll_max: 152,  item_name: 'Bombard'                        },
  { roll_min: 153,  roll_max: 206,  item_name: 'Bow'                            },
  { roll_min: 207,  roll_max: 213,  item_name: 'Crossbow'                       },
  { roll_min: 214,  roll_max: 216,  item_name: 'Catapult'                       },
  { roll_min: 217,  roll_max: 223,  item_name: 'Club'                           },
  { roll_min: 224,  roll_max: 302,  item_name: 'Dagger'                         },
  { roll_min: 303,  roll_max: 332,  item_name: 'Dart'                           },
  { roll_min: 333,  roll_max: 343,  item_name: 'Flail'                          },
  { roll_min: 344,  roll_max: 372,  item_name: 'Hammer'                         },
  { roll_min: 373,  roll_max: 373,  item_name: 'Harpoon'                        },
  { roll_min: 374,  roll_max: 380,  item_name: 'Javelin'                        },
  { roll_min: 381,  roll_max: 387,  item_name: 'Jettison'                       },
  { roll_min: 388,  roll_max: 404,  item_name: 'Lance'                          },
  { roll_min: 405,  roll_max: 440,  item_name: 'Mace'                           },
  { roll_min: 441,  roll_max: 442,  item_name: 'Mattock'                        },
  { roll_min: 443,  roll_max: 473,  item_name: 'Net'                            },
  { roll_min: 474,  roll_max: 505,  item_name: 'Polearm'                        },
  { roll_min: 506,  roll_max: 513,  item_name: 'Quiver'                         },
  { roll_min: 514,  roll_max: 522,  item_name: 'Sickle'                         },
  { roll_min: 523,  roll_max: 526,  item_name: 'Sling'                          },
  { roll_min: 527,  roll_max: 527,  item_name: 'Sling Bullet'                   },
  { roll_min: 528,  roll_max: 528,  item_name: 'Slingstone'                     },
  { roll_min: 529,  roll_max: 555,  item_name: 'Spear'                          },
  { roll_min: 556,  roll_max: 559,  item_name: 'Spelljamming Ram'               },
  { roll_min: 560,  roll_max: 958,  item_name: 'Sword'                          },
  { roll_min: 959,  roll_max: 960,  item_name: 'Throwing Stars'                 },
  { roll_min: 961,  roll_max: 974,  item_name: 'Whip'                           },
  { roll_min: 975,  roll_max: 1000, item_name: '✦ Special (Roll on Table S3)',  isSpecialRow: true },
];

// ── Hardcoded S2 — Bonus tables (d100) ────────────────────────────────────
// Curse is NOT encoded here — determined probabilistically in pushCompositePane.
const S2_ATTACK = [
  { roll_min:  1, roll_max:  1,  item_name: '−3', bonus: -3 },
  { roll_min:  2, roll_max:  4,  item_name: '−2', bonus: -2 },
  { roll_min:  5, roll_max: 10,  item_name: '−1', bonus: -1 },
  { roll_min: 11, roll_max: 20,  item_name: '0',  bonus:  0 },
  { roll_min: 21, roll_max: 55,  item_name: '+1', bonus:  1 },
  { roll_min: 56, roll_max: 76,  item_name: '+2', bonus:  2 },
  { roll_min: 77, roll_max: 87,  item_name: '+3', bonus:  3 },
  { roll_min: 88, roll_max: 98,  item_name: '+4', bonus:  4 },
  { roll_min: 99, roll_max: 100, item_name: '+5', bonus:  5 },
];
const S2_DAMAGE = [
  { roll_min:  1, roll_max:  2,  item_name: '−3', bonus: -3 },
  { roll_min:  3, roll_max:  7,  item_name: '−2', bonus: -2 },
  { roll_min:  8, roll_max: 12,  item_name: '−1', bonus: -1 },
  { roll_min: 13, roll_max: 20,  item_name: '0',  bonus:  0 },
  { roll_min: 21, roll_max: 41,  item_name: '+1', bonus:  1 },
  { roll_min: 42, roll_max: 62,  item_name: '+2', bonus:  2 },
  { roll_min: 63, roll_max: 83,  item_name: '+3', bonus:  3 },
  { roll_min: 84, roll_max: 95,  item_name: '+4', bonus:  4 },
  { roll_min: 96, roll_max: 100, item_name: '+5', bonus:  5 },
];

// ── Hardcoded R1 — Generic Magical Armor (d1000) ──────────────────────────
const R1_ARMOR = [
  { roll_min: 1,    roll_max: 50,   item_name: 'Banded Mail'       },
  { roll_min: 51,   roll_max: 100,  item_name: 'Brigandine'        },
  { roll_min: 101,  roll_max: 150,  item_name: 'Bronze Plate'      },
  { roll_min: 151,  roll_max: 300,  item_name: 'Chain Mail'        },
  { roll_min: 301,  roll_max: 350,  item_name: 'Field Plate'       },
  { roll_min: 351,  roll_max: 400,  item_name: 'Full Plate'        },
  { roll_min: 401,  roll_max: 440,  item_name: 'Hide Armor'        },
  { roll_min: 441,  roll_max: 530,  item_name: 'Leather Armor'     },
  { roll_min: 531,  roll_max: 580,  item_name: 'Padded Armor'      },
  { roll_min: 581,  roll_max: 660,  item_name: 'Plate Mail'        },
  { roll_min: 661,  roll_max: 710,  item_name: 'Ring Mail'         },
  { roll_min: 711,  roll_max: 760,  item_name: 'Scale Mail'        },
  { roll_min: 761,  roll_max: 860,  item_name: 'Shield'            },
  { roll_min: 861,  roll_max: 910,  item_name: 'Splint Mail'       },
  { roll_min: 911,  roll_max: 960,  item_name: 'Studded Leather'   },
  { roll_min: 961,  roll_max: 974,  item_name: 'War Hammer'        },
  { roll_min: 975,  roll_max: 1000, item_name: '✦ Special (Roll on Table R3)', isSpecialRow: true },
];

// ── Hardcoded R2 — Armor Bonus (d20) ──────────────────────────────────────
const R2_BONUS = [
  { roll_min: 1,  roll_max: 2,  item_name: '+1',          bonus: 1,  cursed: false },
  { roll_min: 3,  roll_max: 5,  item_name: '+2',          bonus: 2,  cursed: false },
  { roll_min: 6,  roll_max: 9,  item_name: '+3',          bonus: 3,  cursed: false },
  { roll_min: 10, roll_max: 14, item_name: '+4',          bonus: 4,  cursed: false },
  { roll_min: 15, roll_max: 17, item_name: '+5',          bonus: 5,  cursed: false },
  { roll_min: 18, roll_max: 18, item_name: '−1 (Cursed)', bonus: -1, cursed: true  },
  { roll_min: 19, roll_max: 19, item_name: '−2 (Cursed)', bonus: -2, cursed: true  },
  { roll_min: 20, roll_max: 20, item_name: '−3 (Cursed)', bonus: -3, cursed: true  },
];

// ── S3 helpers — parse roll string from s3_data.js ────────────────────────
function parseS3Roll(rollStr) {
  const raw = String(rollStr);
  if (raw.includes('-')) {
    const [a, b] = raw.split('-').map(x => parseInt(x, 10));
    return { roll_min: a, roll_max: b };
  }
  const n = parseInt(raw, 10);
  return { roll_min: n, roll_max: n };
}
// Returns short names as-is from s3_data (e.g. "Acid", "of Aggravation")
// Full name / wiki title is derived in selectSpecialItem using buildS3WikiTitle.
function s3DataToItems(key) {
  return (S3_DATA[key] ?? []).map(e => ({
    ...parseS3Roll(e.roll),
    item_name: e.name,
  }));
}

// ── Hardcoded R3 — Special Armor Categories ───────────────────────────────
const R3_CATEGORIES = [
  { name: 'Banded Mail',       min: 1,   max: 100  },
  { name: 'Chain Mail',        min: 101, max: 300  },
  { name: 'Field Plate',       min: 301, max: 360  },
  { name: 'Full Plate',        min: 361, max: 430  },
  { name: 'Leather Armor',     min: 431, max: 550  },
  { name: 'Plate Mail',        min: 551, max: 680  },
  { name: 'Ring Mail',         min: 681, max: 730  },
  { name: 'Shield',            min: 731, max: 880  },
  { name: 'Splint Mail',       min: 881, max: 920  },
  { name: 'Studded Leather',   min: 921, max: 970  },
  { name: 'Miscellaneous',     min: 971, max: 1000 },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function rollDie(sides) { return Math.floor(Math.random() * sides) + 1; }
function parseSides(d)  { const m = String(d ?? 'd20').match(/d(\d+)/i); return m ? +m[1] : 20; }
function pad3(n) { return String(n).padStart(3, '0'); }
function pad2(n) { return n === 100 ? '00' : String(n).padStart(2, '0'); }

function fmtRange(min, max, dice) {
  const sides = parseSides(dice);
  if (min >= 975 && sides >= 1000) return '975–000';
  if (sides >= 1000) return min === max ? pad3(min) : `${pad3(min)}–${pad3(max)}`;
  if (sides >= 100)  return min === max ? pad2(min)  : `${pad2(min)}–${pad2(max)}`;
  return min === max ? String(min) : `${min}–${max}`;
}

function findRow(entries, n) {
  return entries.find(e => n >= e.roll_min && n <= e.roll_max) ?? null;
}

function findCat(cats, n) {
  return cats.find(c => n >= c.min && n <= c.max) ?? null;
}

function buildWikiUrl(name) {
  if (!name) return null;
  const wikiName = String(name)
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/\s+/g, '_');
  return `https://adnd2e.fandom.com/wiki/${wikiName}_(EM)`;
}

// ── Curse determination for weapon S2 rolls ───────────────────────────────
// Rules:
//   Both hit AND damage negative  → always cursed (100%)
//   Either modifier is −1         → 30% chance cursed
//   Either modifier is −2         → 60% chance cursed
//   Either modifier is −3         → 90% chance cursed
//   No negative modifier          → not cursed
function determineCursed(atkEntry, dmgEntry) {
  const atkBonus = atkEntry?.bonus ?? 0;
  const hasDmg   = dmgEntry != null;
  const dmgBonus = hasDmg ? (dmgEntry?.bonus ?? 0) : 0;

  // Both negative → always cursed
  if (hasDmg && atkBonus < 0 && dmgBonus < 0) return true;

  // Worst (most negative) single modifier
  const worstBonus = hasDmg ? Math.min(atkBonus, dmgBonus) : atkBonus;
  if (worstBonus >= 0) return false;

  const chance = worstBonus === -1 ? 0.30 : worstBonus === -2 ? 0.60 : 0.90;
  return Math.random() < chance;
}

// ── Module-level fetch helpers ─────────────────────────────────────────────
// tableLetter (optional) — restricts search to one table, preventing
// cross-category false matches (e.g. "of Distortion" in D hitting Table A).
async function fetchItemByName(name, tableLetter) {
  if (!name) return null;
  try {
    const opts = { search: name, limit: 1 };
    if (tableLetter) opts.table_letter = tableLetter;
    const res = await api.searchMagicalItems(opts);
    return res?.items?.[0] ?? null;
  } catch { return null; }
}

async function fetchItemByNameExact(name, tableLetter) {
  if (!name) return null;
  try {
    const opts = { search: name, exact: true, limit: 1 };
    if (tableLetter) opts.table_letter = tableLetter;
    const res = await api.searchMagicalItems(opts);
    return res?.items?.[0] ?? null;
  } catch { return null; }
}

async function fetchEntry(entry, tableLetter) {
  if (!entry) return null;
  if (entry.item_id) {
    try { return await api.getMagicalItem(entry.item_id); } catch { /* fall through */ }
  }
  return fetchItemByName(entry.item_name ?? entry.name, tableLetter);
}

// ── Parse {{Item|...}} template from wikitext ──────────────────────────────
function parseItemTemplate(wikitext) {
  const match = wikitext.match(/\{\{Item([\s\S]*?)\}\}/);
  if (!match) return {};
  const body = match[1];
  const extract = (field) => {
    const m = body.match(new RegExp(`\\|\\s*${field}\\s*=\\s*([^|\n}]+)`));
    if (!m) return null;
    return m[1]
      .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2') // strip wiki links
      .replace(/\{\{[^}]+\}\}/g, '')                   // strip templates
      .trim() || null;
  };
  return {
    name:   extract('name'),
    type:   extract('type'),
    xp:     extract('xp'),
    value:  extract('value'),
    source: extract('source'),
  };
}

// ── Wiki description fetcher (S3 items) ────────────────────────────────────
async function fetchWikiDescription(displayName) {
  console.log('fetchWikiDescription called with:', displayName);
  const normalized = displayName.replace(/[\u2018\u2019\u02BC]/g, "'");
  let wikiPage = S3_WIKI_LINKS[normalized] || S3_WIKI_LINKS[displayName];
  console.log('keys sample:', Object.keys(S3_WIKI_LINKS).slice(0,3));
  console.log('lookup result:', S3_WIKI_LINKS["Abaris'"]);
  console.log('wikiPage lookup:', wikiPage);
  const wikiUrl = wikiPage
    ? 'https://adnd2e.fandom.com/wiki/' + wikiPage.replace(/ /g, '_').replace(/'/g, '%27')
    : null;
  if (!wikiPage) return { html: null, stats: null, wikiUrl: null };
  const apiUrl = 'https://adnd2e.fandom.com/api.php?action=query&titles='
    + encodeURIComponent(wikiPage)
    + '&prop=revisions&rvprop=content&format=json&origin=*';
  try {
    const res = await fetch(apiUrl);
    const data = await res.json();
    const pages = data.query.pages;
    const page = Object.values(pages)[0];
    if (page.missing !== undefined) return { html: null, stats: null, wikiUrl };
    const raw = page.revisions[0]['*'];
    // --- Parse {{Item|...}} stats block (multi-line) ---
    const stats = {};
    const templateMatch = raw.match(/\{\{Item([\s\S]*?)\}\}/);
    if (templateMatch) {
      const lines = templateMatch[1].split('\n');
      for (const line of lines) {
        const m = line.match(/\|\s*(\w+)\s*=\s*(.+)/);
        if (m) stats[m[1].trim()] = m[2].trim();
      }
    }
    // --- Extract body text (everything after the closing }}) ---
    // \n\}\} matches }} on its own line, avoiding the }} inside {{br}}
    let body = raw.replace(/\{\{Item[\s\S]*?\n\}\}\n?/, '');
    body = body.replace(/\[\[Category:[^\]]+\]\]\n?/g, '');
    body = body.replace(/^[^\n]*\}\}\n?/, ''); // safety: strip any leaked }} remnant
    body = body.trim();
    // --- Convert wikitext to HTML ---
    // [[Page|Display]] → clickable link
    body = body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_, pg, disp) =>
      `<a href="https://adnd2e.fandom.com/wiki/${pg.trim().replace(/ /g,'_')}" target="_blank" style="color:#c8a84b;text-decoration:underline">${disp.trim()}</a>`
    );
    // [[Page]] → clickable link
    body = body.replace(/\[\[([^\]]+)\]\]/g, (_, pg) =>
      `<a href="https://adnd2e.fandom.com/wiki/${pg.trim().replace(/ /g,'_')}" target="_blank" style="color:#c8a84b;text-decoration:underline">${pg.trim()}</a>`
    );
    // '''bold''' and ''italic''
    body = body.replace(/'''([^']+)'''/g, '<strong>$1</strong>');
    body = body.replace(/''([^']+)''/g, '<em>$1</em>');
    // {{br}} → <br>
    body = body.replace(/\{\{br\}\}/gi, '<br>');
    // Remove remaining {{...}}
    body = body.replace(/\{\{[^}]*\}\}/g, '');
    // Paragraphs
    body = '<p>' + body.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, ' ') + '</p>';
    return { html: body, stats, wikiUrl };
  } catch (e) {
    console.error('Wiki fetch failed:', e);
    return { html: null, stats: null, wikiUrl };
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PaneHeader({ title, subtitle, extra }) {
  return (
    <div className="mi-pane-header">
      <div className="mi-pane-title">{title}</div>
      {subtitle && <div className="mi-pane-subtitle">{subtitle}</div>}
      {extra    && <div className="mi-pane-dice-row">{extra}</div>}
    </div>
  );
}

function TableRow({ entry, selected, dice, onClick }) {
  const isSpecial = !!entry.isSpecialRow;
  const isCursed  = !isSpecial && !!entry.cursed;
  const range     = fmtRange(entry.roll_min, entry.roll_max, dice ?? 'd20');
  const cls = [
    'mi-table-row',
    selected  ? 'mi-table-row--selected' : '',
    isSpecial ? 'mi-table-row--special'  : '',
    isCursed  ? 'mi-table-row--cursed'   : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0}
         onKeyDown={e => e.key === 'Enter' && onClick?.()}>
      <span className="mi-row-range">{range}</span>
      <span className="mi-row-name">{entry.item_name}</span>
      {!isSpecial && !!(entry.notes || entry.description) && (
        <span className="mi-row-dot" title="Has description">●</span>
      )}
      {isSpecial && <span className="mi-row-arrow">›</span>}
    </div>
  );
}

function BonusRow({ entry, selected, onClick }) {
  const isCursed = entry.cursed || entry.bonus < 0;
  const cls = [
    'mi-bonus-row',
    selected ? 'mi-bonus-row--selected' : '',
    isCursed ? 'mi-bonus-row--cursed'   : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0}
         onKeyDown={e => e.key === 'Enter' && onClick?.()}>
      <span className="mi-bonus-row-range">{entry.roll_min}–{entry.roll_max}</span>
      <span className="mi-bonus-row-name">{entry.item_name}</span>
    </div>
  );
}

function CatRow({ cat, selected, onClick }) {
  const isSpecCat = !!cat.special;
  const rangeStr  = cat.min === cat.max ? String(cat.min) : `${pad3(cat.min)}–${pad3(cat.max)}`;
  const cls = [
    'mi-table-row',
    selected   ? 'mi-table-row--selected' : '',
    isSpecCat  ? 'mi-table-row--special'  : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0}
         onKeyDown={e => e.key === 'Enter' && onClick?.()}>
      <span className="mi-row-range" style={{ minWidth: 56 }}>{rangeStr}</span>
      <span className="mi-row-name">{cat.name}</span>
      {!isSpecCat && (
        <span className="mi-row-arrow" style={{ fontSize: 9, opacity: 0.5 }}>
          {cat.count ?? (cat.max - cat.min + 1)}
        </span>
      )}
      <span className="mi-row-arrow">›</span>
    </div>
  );
}

function ItemListRow({ item, selected, onClick }) {
  const name      = item.item_name ?? item.name ?? '—';
  const isSpecial = name.includes('*');
  const rangeStr  = item.roll_min != null
    ? (item.roll_min === item.roll_max ? pad3(item.roll_min) : `${pad3(item.roll_min)}–${pad3(item.roll_max)}`)
    : null;
  return (
    <div
      className={`mi-table-row${selected ? ' mi-table-row--selected' : ''}`}
      onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
    >
      {rangeStr && <span className="mi-row-range">{rangeStr}</span>}
      <span
        className="mi-row-name"
        style={isSpecial ? { fontWeight: 700, color: '#d4a840' } : undefined}
      >{name}</span>
      {!!(item.description_preview || item.description || item.fallback_description) && (
        <span className="mi-row-dot" title="Has description">●</span>
      )}
      <span className="mi-row-arrow">›</span>
    </div>
  );
}

function DetailPanel({ item, loading, error, compositeName, compositeAtk, compositeDmg, cursed: forceCursed, fallback, note, children }) {
  if (loading) {
    return (
      <div className="mi-pane-loading" style={{ flex: 1, flexDirection: 'column', padding: 24 }}>
        <div className="mi-spinner" />Loading…
      </div>
    );
  }
  if (error) return <div className="mi-pane-empty" style={{ flex: 1 }}>{error}</div>;

  const isCursed    = !!forceCursed || compositeAtk?.cursed || compositeDmg?.cursed || !!item?.cursed;
  const displayName = compositeName ?? item?.name ?? '—';
  const description = item?.description_preview || item?.description || item?.fallback_description || null;

  return (
    <div className="mi-detail-body">
      <h2 className={`mi-result-name${isCursed ? ' mi-result-name--cursed' : ''}`}>
        {displayName}
      </h2>

      {compositeName && (compositeAtk || compositeDmg) && (
        <div className="mi-result-subtitle">
          {compositeAtk && `${compositeAtk.item_name} to hit`}
          {compositeAtk && compositeDmg && ',  '}
          {compositeDmg && `${compositeDmg.item_name} to damage`}
        </div>
      )}

      {isCursed && (
        <div className="mi-result-cursed-warning">⚠ CURSED — imposes penalties instead of bonuses!</div>
      )}

      <div className="mi-detail-badges">
        {item?.category && <span className="ic-cat-badge">{item.category}</span>}
        {item?.rarity   && (
          <span className={`ic-rarity-badge ic-rarity-badge--${item.rarity.toLowerCase().replace(/\s+/g, '-')}`}>
            {item.rarity}
          </span>
        )}
        {item?.cursed && !compositeName && (
          <span className="mi-meta-badge mi-meta-badge--cursed">☠ Cursed</span>
        )}
      </div>

      {item && (item.charges || item.value_gp || item.xp_value || item.alignment || item.intelligence) && (
        <div className="mi-detail-stat-grid">
          {item.charges      && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Charges:</span> <span className="mi-detail-stat-value">{item.charges}</span></div>}
          {item.value_gp     && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Value:</span> <span className="mi-detail-stat-value">{item.value_gp.toLocaleString()} gp</span></div>}
          {item.xp_value     && <div className="mi-detail-stat"><span className="mi-detail-stat-label">XP Value:</span> <span className="mi-detail-stat-value">{item.xp_value.toLocaleString()} xp</span></div>}
          {item.alignment    && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Alignment:</span> <span className="mi-detail-stat-value">{item.alignment}</span></div>}
          {item.intelligence && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Intelligence:</span> <span className="mi-detail-stat-value">{item.intelligence}</span></div>}
        </div>
      )}

      {description ? (
        <>
          <div className="mi-detail-divider"><span className="mi-detail-divider-label">Description</span></div>
          <div className="mi-detail-text">
            {description.split('\n').map((para, i) =>
              para.trim() ? <p key={i}>{para.trim()}</p> : null
            )}
          </div>
        </>
      ) : fallback ? (
        <>
          <div className="mi-detail-divider"><span className="mi-detail-divider-label">Notes</span></div>
          <div className="mi-detail-text" style={{ fontStyle: 'italic', opacity: 0.7 }}>{fallback}</div>
        </>
      ) : (
        <div className="mi-detail-text" style={{ marginTop: 12, fontStyle: 'italic', opacity: 0.45 }}>
          No wiki description available for this item.
        </div>
      )}

      {item?.powers && (
        <>
          <div className="mi-detail-divider"><span className="mi-detail-divider-label">Powers</span></div>
          <div className="mi-detail-text">
            {item.powers.split('\n').map((para, i) =>
              para.trim() ? <p key={i}>{para.trim()}</p> : null
            )}
          </div>
        </>
      )}

      {note && (
        <div style={{ margin: '10px 0 4px', padding: '6px 10px', background: 'rgba(212,168,64,0.08)', borderLeft: '2px solid rgba(212,168,64,0.4)', borderRadius: 3, fontSize: 12, opacity: 0.8, fontStyle: 'italic' }}>
          {note}
        </div>
      )}

      {item?.source_url && (
        <a className="mi-detail-source-link" href={item.source_url} target="_blank" rel="noopener noreferrer">
          📖 View on Fandom Wiki ↗
        </a>
      )}

      {children}
    </div>
  );
}

// ── Main component — dynamic pane stack ───────────────────────────────────
export default function DrillDown() {
  const [panes, setPanes] = useState([{ type: 'overview' }]);
  const containerRef = useRef(null);

  // Scroll right when a new pane is added
  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [panes.length]);

  function pushPane(fromIdx, newPane) {
    setPanes(prev => [...prev.slice(0, fromIdx + 1), newPane]);
  }

  function updatePane(idx, updates) {
    setPanes(prev => prev.map((p, i) => i === idx ? { ...p, ...updates } : p));
  }

  // ── Table 1 click ──────────────────────────────────────────────────────────
  function selectTable1Row(fromIdx, row) {
    if (row.table === 'S') {
      pushPane(fromIdx, { type: 'weapons_s1', tableRow: row });
    } else if (row.table === 'R') {
      pushPane(fromIdx, { type: 'weapons_r1', tableRow: row });
    } else {
      const newIdx = fromIdx + 1;
      pushPane(fromIdx, { type: 'table', tableRow: row, loading: true, entries: [], error: null });
      api.getTableEntries(row.table, { limit: 500 })
        .then(data  => updatePane(newIdx, { loading: false, entries: data.entries ?? [] }))
        .catch(e    => updatePane(newIdx, { loading: false, error: e.message ?? 'Failed to load' }));
    }
  }

  // ── Simple table entry → description (all tables A–Q, T) ─────────────────
  // Search order: 1) exact name in DB → 2) item_id / fuzzy fallback
  // tableLetter is passed so queries are scoped to the correct table,
  // preventing cross-category false matches (e.g. "of Distortion" in D).
  function selectTableEntry(fromIdx, entry, tableLetter) {
    const name   = entry.item_name ?? entry.name ?? '';
    const newIdx = fromIdx + 1;
    pushPane(fromIdx, { type: 'description', mode: 'simple', name, loading: true, item: null, error: null });

    // Fallback wiki URL: most non-S items use the "(EM)" suffix on the wiki
    const wikiUrl = entry.source_url ?? buildWikiUrl(name);

    // 1. Exact match on the full item name, scoped to this table
    // 2. item_id lookup or fuzzy text-search via fetchEntry (also scoped)
    fetchItemByNameExact(name, tableLetter)
      .then(item => item || fetchEntry(entry, tableLetter))
      .then(item => updatePane(newIdx, {
        loading: false,
        item: item
          ? { ...item, source_url: item.source_url || wikiUrl }
          : { name, description: entry.notes ?? null, source_url: wikiUrl },
      }))
      .catch(e => updatePane(newIdx, { loading: false, error: e.message }));
  }

  // ── S1 / R1 click ─────────────────────────────────────────────────────────
  function selectS1Entry(fromIdx, tableRow, entry) {
    if (entry.isSpecialRow) {
      pushPane(fromIdx, tableRow.table === 'S'
        ? { type: 'weapons_s3', tableRow }
        : { type: 'weapons_r3', tableRow });
    } else {
      pushPane(fromIdx, tableRow.table === 'S'
        ? { type: 'weapons_s2', tableRow, weaponEntry: entry, atkSel: null, dmgSel: null, lastRoll: null }
        : { type: 'weapons_r2', tableRow, armorEntry: entry, bonusSel: null });
    }
  }

  // ── Push a composite (bonus + base item) description pane ─────────────────
  function pushCompositePane(fromIdx, baseEntry, atkEntry, dmgEntry) {
    const atkStr  = atkEntry?.item_name ?? '?';
    const dmgStr  = dmgEntry?.item_name ?? null;
    const isArmor = !dmgEntry;
    const name    = dmgStr
      ? `${baseEntry?.item_name ?? 'Weapon'} ${atkStr} / ${dmgStr}`
      : `${baseEntry?.item_name ?? 'Armor'} ${atkStr}`;
    const newIdx  = fromIdx + 1;
    // Composite panes are always weapons (S) or armor (R)
    const tbl     = isArmor ? 'R' : 'S';

    // For weapons: probabilistic curse from S2 modifiers.
    // For armor:  use cursed flag from R2_BONUS entry (old behaviour preserved).
    const isCursed = isArmor
      ? (atkEntry?.cursed ?? false)
      : determineCursed(atkEntry, dmgEntry);

    pushPane(fromIdx, { type: 'description', mode: 'composite', name, baseEntry, atkEntry, dmgEntry, isArmor, cursed: isCursed, loading: true, item: null, error: null });

    const catName = baseEntry?.item_name ?? '';
    const wikiUrl = buildWikiUrl(catName);
    fetchItemByName(catName, tbl)
      .then(item => item || fetchItemByName(`${catName} (EM)`, tbl))
      .then(item => updatePane(newIdx, {
        loading: false,
        item: item
          ? { ...item, source_url: item.source_url || wikiUrl }
          : { name: catName, description: null, source_url: wikiUrl },
      }))
      .catch(() => updatePane(newIdx, { loading: false, item: { name: catName, description: null, source_url: wikiUrl } }));
  }

  // ── S2 atk / dmg clicks ───────────────────────────────────────────────────
  function selectS2Atk(fromIdx, pane, entry) {
    updatePane(fromIdx, { atkSel: entry });
    pushCompositePane(fromIdx, pane.weaponEntry, entry, pane.dmgSel);
  }
  function selectS2Dmg(fromIdx, pane, entry) {
    updatePane(fromIdx, { dmgSel: entry });
    pushCompositePane(fromIdx, pane.weaponEntry, pane.atkSel, entry);
  }
  function rollBothS2(fromIdx, pane) {
    const atkN     = rollDie(100);
    const dmgN     = rollDie(100);
    const atkEntry = findRow(S2_ATTACK, atkN);
    const dmgEntry = findRow(S2_DAMAGE, dmgN);
    updatePane(fromIdx, { atkSel: atkEntry, dmgSel: dmgEntry, lastRoll: [atkN, dmgN] });
    if (atkEntry && dmgEntry) pushCompositePane(fromIdx, pane.weaponEntry, atkEntry, dmgEntry);
  }

  // ── R2 bonus click ────────────────────────────────────────────────────────
  function selectR2Bonus(fromIdx, pane, entry) {
    updatePane(fromIdx, { bonusSel: entry });
    pushCompositePane(fromIdx, pane.armorEntry, entry, null);
  }

  // ── S3 / R3 category click → items pane ───────────────────────────────────
  function selectSpecialCategory(fromIdx, tableRow, cat) {
    const tbl    = tableRow?.table ?? 'S';
    const newIdx = fromIdx + 1;
    pushPane(fromIdx, { type: 'special_items', tableRow, cat, fromS3: tbl === 'S', loading: true, items: [], error: null });

    if (tbl === 'S' && cat.key && S3_DATA[cat.key] !== undefined) {
      updatePane(newIdx, { loading: false, items: s3DataToItems(cat.key) });
      return;
    }

    const term = cat.name.replace(/[✦*]/g, '').trim();
    const searchOpts = { search: term, limit: 200 };
    if (tbl) searchOpts.table_letter = tbl;
    api.searchMagicalItems(searchOpts)
      .then(res => {
        const items = (res?.items ?? []).map(it => ({
          roll_min: null, roll_max: null,
          item_name: it.name, description: it.description,
          source_url: it.source_url, _fullItem: it,
        }));
        updatePane(newIdx, { loading: false, items });
      })
      .catch(e => updatePane(newIdx, { loading: false, error: e.message ?? 'Failed to load' }));
  }

  // ── Special item click → description pane ─────────────────────────────────
  function selectSpecialItem(fromIdx, pane, item) {
    const catName  = (pane.cat?.name ?? '').replace(/[✦*]/g, '').trim();
    const itemName = item.item_name ?? item.name ?? '';
    const tbl      = pane.tableRow?.table ?? 'S';
    const newIdx   = fromIdx + 1;
    const isS3Item = tbl === 'S' || pane.fromS3 === true;

    if (isS3Item) {
      // S3 items: itemName is the SHORT name from s3_data (e.g. "Acid", "of Aggravation").
      // Use buildS3WikiTitle to derive the full DB name and wiki URL.
      const catKey   = pane.cat?.key ?? catName;
      const wikiPage = buildS3WikiTitle(catKey, itemName);
      // Strip "(Magic …)" suffix to get the name stored in the DB: "Acid Arrow"
      const dbName   = wikiPage
        ? wikiPage.replace(/\s*\([^)]+\)\s*$/, '').trim()
        : itemName;
      const wikiUrl  = wikiPage
        ? 'https://adnd2e.fandom.com/wiki/' + wikiPage.replace(/\s+/g, '_')
        : getS3WikiUrl(catKey, itemName);

      pushPane(fromIdx, { type: 'description', mode: 'simple', name: dbName, loading: true, item: null, error: null });
      fetchItemByNameExact(dbName, 'S')
        .then(fullItem => fullItem || fetchItemByName(dbName, 'S'))
        .then(fullItem => updatePane(newIdx, {
          loading: false,
          item: fullItem
            ? { ...fullItem, source_url: fullItem.source_url || wikiUrl }
            : { name: dbName, description: null, source_url: wikiUrl },
        }))
        .catch(() => updatePane(newIdx, { loading: false, item: { name: dbName, description: null, source_url: wikiUrl } }));
    } else {
      // R3: use DB lookup scoped to Table R
      const wikiUrl = buildWikiUrl(itemName);
      pushPane(fromIdx, { type: 'description', mode: 'simple', name: itemName, loading: true, item: null, error: null });

      (item._fullItem
        ? Promise.resolve(item._fullItem)
        : fetchItemByNameExact(itemName, 'R')
            .then(r => r || fetchItemByNameExact(`${itemName} (EM)`, 'R'))
            .then(r => r || (catName ? fetchItemByNameExact(`${catName} (EM)`, 'R') : null))
            .then(r => r || (catName ? fetchItemByNameExact(catName, 'R') : null))
      )
        .then(fullItem => updatePane(newIdx, {
          loading: false,
          item: fullItem
            ? { ...fullItem, source_url: fullItem.source_url || wikiUrl }
            : { name: itemName, description: null, source_url: wikiUrl },
        }))
        .catch(() => updatePane(newIdx, { loading: false, item: { name: itemName, description: null, source_url: wikiUrl } }));
    }
  }

  // ── Render description pane ────────────────────────────────────────────────
  function renderDescriptionPane(pane) {
    if (pane.loading) {
      return (
        <div className="mi-pane-loading" style={{ flex: 1, flexDirection: 'column', padding: 24 }}>
          <div className="mi-spinner" />Loading…
        </div>
      );
    }

    const { item, mode } = pane;

    if (mode === 'wiki') {
      const wikiUrl = item?.wikiUrl ?? item?.source_url ?? getS3WikiUrl(pane.displayName);
      const stats = {
        type:  item?.category || '',
        value: item?.value_gp ? item.value_gp.toLocaleString() + ' gp' : '—',
        xp:    item?.xp_value ? item.xp_value.toLocaleString() + ' xp' : '—',
      };
      const hasStats = !!(item?.category || item?.value_gp != null || item?.xp_value != null);
      return (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Large gold item name */}
          <h2 style={{ fontSize: '1.6em', color: '#d4a840', margin: '0 0 8px', fontWeight: 700, lineHeight: 1.2 }}>
            {pane.itemName}
          </h2>

          {/* Stats row */}
          {hasStats && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'rgba(212,168,64,0.65)', marginBottom: 10 }}>
              {stats.type  && <span>Type: {stats.type}</span>}
              {stats.xp    && <span>XP: {stats.xp}</span>}
              {stats.value && <span>Value: {stats.value}</span>}
            </div>
          )}

          {/* Horizontal rule */}
          <hr style={{ border: 'none', borderTop: '1px solid rgba(212,168,64,0.25)', margin: '0 0 14px' }} />

          {/* Description HTML */}
          {item?.html ? (
            <div className="mi-detail-text" dangerouslySetInnerHTML={{ __html: item.html }} />
          ) : (
            <div className="mi-detail-text" style={{ fontStyle: 'italic', opacity: 0.45 }}>
              No description available on the wiki.
            </div>
          )}

          {/* Wiki button */}
          {wikiUrl && (
            <a
              href={wikiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mi-detail-source-link"
              style={{ marginTop: 20, display: 'inline-block' }}
            >
              📖 View on Fandom Wiki ↗
            </a>
          )}
        </div>
      );
    }

    if (mode === 'composite') {
      return (
        <>
          <PaneHeader title="Result" />
          <DetailPanel
            item={item}
            loading={false}
            error={pane.error}
            compositeName={pane.name}
            compositeAtk={pane.atkEntry}
            compositeDmg={pane.dmgEntry}
            cursed={pane.cursed}
            fallback={
              pane.isArmor
                ? `A magically enhanced ${pane.baseEntry?.item_name ?? 'armor'}. Apply the listed bonus to armor class.`
                : `A magically enhanced ${pane.baseEntry?.item_name ?? 'weapon'}. Apply the listed bonuses to attack and damage rolls.`
            }
            note={!pane.isArmor ? 'For a specific named weapon variant, roll on Table S3 — Special Weapons.' : null}
          />
        </>
      );
    }

    // simple
    return (
      <>
        <PaneHeader title={item?.name ?? pane.name ?? 'Item Detail'} subtitle="Description" />
        <DetailPanel item={item} loading={false} error={pane.error}
          fallback="No description available — see Fandom Wiki for details." />
      </>
    );
  }

  // ── Render a single pane by type ───────────────────────────────────────────
  function renderPaneContent(pane, i) {
    const next = panes[i + 1];

    switch (pane.type) {

      case 'overview':
        return (
          <>
            <PaneHeader
              title="Table 1 — Overview"
              subtitle="Roll d100"
              extra={<DiceRoller sides={100} label="d100" onRoll={n => {
                const row = TABLE_1.find(r => n >= r.rollMin && n <= r.rollMax);
                if (row) selectTable1Row(i, row);
              }} />}
            />
            <div className="mi-pane-body">
              {TABLE_1.map(row => {
                const isSelected = next?.tableRow?.table === row.table;
                return (
                  <div key={row.table}
                    className={['mi-table-row', isSelected ? 'mi-table-row--selected' : ''].filter(Boolean).join(' ')}
                    onClick={() => selectTable1Row(i, row)}
                    role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && selectTable1Row(i, row)}
                  >
                    <span className="mi-row-range">{row.label}</span>
                    <span className="mi-row-name">{row.category}</span>
                    <span className="mi-row-arrow" style={{ fontSize: 9 }}>Tbl {row.table}</span>
                  </div>
                );
              })}
            </div>
          </>
        );

      case 'table':
        return (
          <>
            <PaneHeader
              title={`Table ${pane.tableRow.table} — ${pane.tableRow.category}`}
              subtitle={pane.tableRow.dice}
              extra={!pane.loading && pane.entries.length > 0 && (
                <DiceRoller sides={parseSides(pane.tableRow.dice)} label={pane.tableRow.dice}
                  onRoll={n => {
                    // Scale d1000 roll to match the actual entry range (e.g. 1-20 in DB)
                    const sides    = parseSides(pane.tableRow.dice);
                    const maxEntry = pane.entries.reduce((m, e) => Math.max(m, e.roll_max ?? 0), 0);
                    const scaled   = (sides > maxEntry && maxEntry > 0) ? Math.ceil(n * maxEntry / sides) : n;
                    const e = findRow(pane.entries, scaled);
                    if (e) selectTableEntry(i, e, pane.tableRow.table);
                  }} />
              )}
            />
            <div className="mi-pane-body">
              {pane.loading ? (
                <div className="mi-pane-loading"><div className="mi-spinner" />Loading…</div>
              ) : pane.error ? (
                <div className="mi-pane-empty">{pane.error}</div>
              ) : pane.entries.length === 0 ? (
                <div className="mi-pane-empty">No entries. Run the import script to populate.</div>
              ) : pane.entries.map((entry, j) => {
                const isSelected = next?.mode === 'simple' && next?.name === (entry.item_name ?? entry.name);
                return (
                  <TableRow key={j} entry={entry} selected={isSelected}
                    dice={pane.tableRow.dice} onClick={() => selectTableEntry(i, entry, pane.tableRow.table)} />
                );
              })}
            </div>
          </>
        );

      case 'weapons_s1':
        return (
          <>
            <PaneHeader
              title="Table S1 — Generic Magical Weapons" subtitle="Roll d1000"
              extra={<DiceRoller sides={1000} label="d1000" onRoll={n => {
                const e = findRow(S1_WEAPONS.filter(x => !x.isSpecialRow), n)
                       ?? (n >= 975 ? S1_WEAPONS.find(x => x.isSpecialRow) : null);
                if (e) selectS1Entry(i, pane.tableRow, e);
              }} />}
            />
            <div className="mi-pane-body">
              {S1_WEAPONS.map((entry, j) => {
                const isSelected = entry.isSpecialRow
                  ? next?.type === 'weapons_s3'
                  : next?.type === 'weapons_s2' && next.weaponEntry?.roll_min === entry.roll_min && next.weaponEntry?.item_name === entry.item_name;
                return (
                  <div key={j}>
                    {entry.isSpecialRow && <div style={{ borderTop: '1px solid rgba(212,168,64,0.25)', margin: '4px 0' }} />}
                    <TableRow entry={entry} selected={isSelected} dice="d1000"
                      onClick={() => selectS1Entry(i, pane.tableRow, entry)} />
                  </div>
                );
              })}
            </div>
          </>
        );

      case 'weapons_r1':
        return (
          <>
            <PaneHeader
              title="Table R1 — Generic Magical Armor" subtitle="Roll d1000"
              extra={<DiceRoller sides={1000} label="d1000" onRoll={n => {
                const e = findRow(R1_ARMOR.filter(x => !x.isSpecialRow), n)
                       ?? (n >= 975 ? R1_ARMOR.find(x => x.isSpecialRow) : null);
                if (e) selectS1Entry(i, pane.tableRow, e);
              }} />}
            />
            <div className="mi-pane-body">
              {R1_ARMOR.map((entry, j) => {
                const isSelected = entry.isSpecialRow
                  ? next?.type === 'weapons_r3'
                  : next?.type === 'weapons_r2' && next.armorEntry?.roll_min === entry.roll_min && next.armorEntry?.item_name === entry.item_name;
                return (
                  <div key={j}>
                    {entry.isSpecialRow && <div style={{ borderTop: '1px solid rgba(212,168,64,0.25)', margin: '4px 0' }} />}
                    <TableRow entry={entry} selected={isSelected} dice="d1000"
                      onClick={() => selectS1Entry(i, pane.tableRow, entry)} />
                  </div>
                );
              })}
            </div>
          </>
        );

      case 'weapons_s2':
        return (
          <>
            <PaneHeader
              title="Table S2 — Attack & Damage Adjustments"
              subtitle={`Weapon: ${pane.weaponEntry?.item_name ?? '—'}`}
              extra={
                <button className="mi-dice-btn" onClick={() => rollBothS2(i, pane)}>
                  🎲 Roll Both
                  {pane.lastRoll && (
                    <span className="mi-roll-result" style={{ fontSize: 11, marginLeft: 4 }}>
                      {pane.lastRoll[0]}/{pane.lastRoll[1]}
                    </span>
                  )}
                </button>
              }
            />
            <div className="mi-bonus-cols">
              <div className="mi-bonus-col">
                <div className="mi-bonus-col-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
                  <span>Attack Bonus</span>
                  <DiceRoller sides={100} label="d100" onRoll={n => { const e = findRow(S2_ATTACK, n); if (e) selectS2Atk(i, pane, e); }} />
                </div>
                <div className="mi-bonus-col-body">
                  {S2_ATTACK.map((entry, j) => (
                    <BonusRow key={j} entry={entry}
                      selected={pane.atkSel?.roll_min === entry.roll_min && pane.atkSel?.item_name === entry.item_name}
                      onClick={() => selectS2Atk(i, pane, entry)} />
                  ))}
                </div>
              </div>
              <div className="mi-bonus-col">
                <div className="mi-bonus-col-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
                  <span>Damage Bonus</span>
                  <DiceRoller sides={100} label="d100" onRoll={n => { const e = findRow(S2_DAMAGE, n); if (e) selectS2Dmg(i, pane, e); }} />
                </div>
                <div className="mi-bonus-col-body">
                  {S2_DAMAGE.map((entry, j) => (
                    <BonusRow key={j} entry={entry}
                      selected={pane.dmgSel?.roll_min === entry.roll_min && pane.dmgSel?.item_name === entry.item_name}
                      onClick={() => selectS2Dmg(i, pane, entry)} />
                  ))}
                </div>
              </div>
            </div>
          </>
        );

      case 'weapons_r2':
        return (
          <>
            <PaneHeader
              title="Table R2 — Armor Bonus"
              subtitle={`Armor: ${pane.armorEntry?.item_name ?? '—'}`}
            />
            <div className="mi-bonus-cols">
              <div className="mi-bonus-col">
                <div className="mi-bonus-col-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
                  <span>AC Bonus</span>
                  <DiceRoller sides={1000} label="d1000" onRoll={n => { const scaled = Math.ceil(n * 20 / 1000); const e = findRow(R2_BONUS, scaled); if (e) selectR2Bonus(i, pane, e); }} />
                </div>
                <div className="mi-bonus-col-body">
                  {R2_BONUS.map((entry, j) => (
                    <BonusRow key={j} entry={entry}
                      selected={pane.bonusSel?.roll_min === entry.roll_min && pane.bonusSel?.item_name === entry.item_name}
                      onClick={() => selectR2Bonus(i, pane, entry)} />
                  ))}
                </div>
              </div>
            </div>
          </>
        );

      case 'weapons_s3':
        return (
          <>
            <PaneHeader
              title="Table S3 — Special Weapons" subtitle="Select a weapon type"
              extra={<DiceRoller sides={1000} label="d1000" onRoll={n => {
                const cat = findCat(S3_CATS, n);
                if (cat) selectSpecialCategory(i, pane.tableRow, cat);
              }} />}
            />
            <div className="mi-pane-body">
              {S3_CATS.map((cat, j) => {
                const isSelected = next?.type === 'special_items' && next.cat?.name === cat.name;
                const prevIsSpec = !!S3_CATS[j - 1]?.special;
                const showSep    = j > 0 && !!cat.special !== prevIsSpec;
                return (
                  <div key={j}>
                    {showSep && <div style={{ borderTop: '1px solid rgba(212,168,64,0.25)', margin: '4px 0' }} />}
                    <CatRow cat={cat} selected={isSelected} onClick={() => selectSpecialCategory(i, pane.tableRow, cat)} />
                  </div>
                );
              })}
            </div>
          </>
        );

      case 'weapons_r3':
        return (
          <>
            <PaneHeader
              title="Table R3 — Special Armor" subtitle="Select an armor type"
              extra={<DiceRoller sides={1000} label="d1000" onRoll={n => {
                const cat = findCat(R3_CATEGORIES, n);
                if (cat) selectSpecialCategory(i, pane.tableRow, cat);
              }} />}
            />
            <div className="mi-pane-body">
              {R3_CATEGORIES.map((cat, j) => {
                const isSelected = next?.type === 'special_items' && next.cat?.name === cat.name;
                return <CatRow key={j} cat={cat} selected={isSelected} onClick={() => selectSpecialCategory(i, pane.tableRow, cat)} />;
              })}
            </div>
          </>
        );

      case 'special_items': {
        const cnt = pane.cat?.count ?? pane.items?.length ?? 0;
        return (
          <>
            <PaneHeader
              title={`${pane.cat?.name ?? 'Special'} — Items`}
              subtitle={`${cnt} item${cnt !== 1 ? 's' : ''}`}
              extra={
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="mi-dice-btn" style={{ fontSize: 10 }}
                    disabled={pane.loading || !pane.items?.length}
                    onClick={() => {
                      const idx = Math.floor(Math.random() * pane.items.length);
                      selectSpecialItem(i, pane, pane.items[idx]);
                    }}>
                    🎲 Random
                  </button>
                </div>
              }
            />
            {pane.loading ? (
              <div className="mi-pane-loading" style={{ flex: 1 }}><div className="mi-spinner" />Loading…</div>
            ) : pane.error ? (
              <div className="mi-pane-empty">{pane.error}</div>
            ) : !pane.items?.length ? (
              <div className="mi-pane-empty">No items found for this category.</div>
            ) : (
              <div className="mi-pane-body">
                {pane.items.map((item, j) => {
                  const isSelected = next?.type === 'description' && next.itemName === item.item_name;
                  return (
                    <ItemListRow key={j} item={item} selected={isSelected}
                      onClick={() => selectSpecialItem(i, pane, item)} />
                  );
                })}
              </div>
            )}
          </>
        );
      }

      case 'description':
        return renderDescriptionPane(pane);

      default:
        return null;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="mi-drilldown mi-drilldown--warm"
      style={{ display: 'flex', flexDirection: 'row', overflowX: 'auto', height: '100%' }}
    >
      {panes.map((pane, i) => {
        const isDesc = pane.type === 'description';
        return (
          <div
            key={i}
            className="mi-pane mi-pane--dd-fixed"
            style={isDesc
              ? { flex: 1, minWidth: 420, height: '100%', overflowY: 'auto', background: '#1a1108', borderRight: '1px solid #3a2a12', display: 'flex', flexDirection: 'column' }
              : { minWidth: 220, maxWidth: 260, height: '100%', overflowY: 'auto', borderRight: '1px solid #3a2a12', display: 'flex', flexDirection: 'column', flexShrink: 0 }
            }
          >
            {renderPaneContent(pane, i)}
          </div>
        );
      })}
    </div>
  );
}
