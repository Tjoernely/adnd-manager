/**
 * /api/magical-items
 *   GET  /               — search/filter items (public)
 *   GET  /meta           — counts, categories, rarities, tables
 *   GET  /random         — random item(s)
 *   GET  /roll-table     — roll on a specific table (A-T)
 *   GET  /random-hoard   — generate a full random treasure hoard
 *   GET  /:id            — single item
 *
 * Query params for GET /:
 *   search / q    — text search on name + description
 *   category      — comma-separated category IDs
 *   rarity        — comma-separated rarity values
 *   table_letter  — comma-separated table letters (A-T)
 *   cursed        — 'true' to show only cursed items
 *   sort          — 'name' (default) | 'category' | 'rarity'
 *   limit         — default 50, max 200
 *   offset        — default 0
 */
const express = require('express');
const db      = require('../db');

const router = express.Router();

// ── Hardcoded S2/R2 bonus tables ──────────────────────────────────────────────
const S2_BONUS = [
  { id: 's2-1',  roll_min:  1, roll_max:  2, item_name: '+1',           bonus: 1,  cursed: false },
  { id: 's2-2',  roll_min:  3, roll_max:  5, item_name: '+2',           bonus: 2,  cursed: false },
  { id: 's2-3',  roll_min:  6, roll_max:  9, item_name: '+3',           bonus: 3,  cursed: false },
  { id: 's2-4',  roll_min: 10, roll_max: 14, item_name: '+4',           bonus: 4,  cursed: false },
  { id: 's2-5',  roll_min: 15, roll_max: 17, item_name: '+5',           bonus: 5,  cursed: false },
  { id: 's2-6',  roll_min: 18, roll_max: 18, item_name: '−1 (Cursed)', bonus: -1, cursed: true  },
  { id: 's2-7',  roll_min: 19, roll_max: 19, item_name: '−2 (Cursed)', bonus: -2, cursed: true  },
  { id: 's2-8',  roll_min: 20, roll_max: 20, item_name: '−3 (Cursed)', bonus: -3, cursed: true  },
];
const R2_BONUS = [
  { id: 'r2-1',  roll_min:  1, roll_max:  5, item_name: '+1',           bonus: 1,  cursed: false },
  { id: 'r2-2',  roll_min:  6, roll_max:  9, item_name: '+2',           bonus: 2,  cursed: false },
  { id: 'r2-3',  roll_min: 10, roll_max: 13, item_name: '+3',           bonus: 3,  cursed: false },
  { id: 'r2-4',  roll_min: 14, roll_max: 16, item_name: '+4',           bonus: 4,  cursed: false },
  { id: 'r2-5',  roll_min: 17, roll_max: 18, item_name: '+5',           bonus: 5,  cursed: false },
  { id: 'r2-6',  roll_min: 19, roll_max: 19, item_name: '−1 (Cursed)', bonus: -1, cursed: true  },
  { id: 'r2-7',  roll_min: 20, roll_max: 20, item_name: '−2 (Cursed)', bonus: -2, cursed: true  },
];

// ── Table metadata (for roll-table endpoint) ──────────────────────────────────
const TABLE_META = {
  A: { name: 'Magical Liquids',             dice: 'd1000', category: 'liquid'       },
  B: { name: 'Scrolls',                     dice: 'd1000', category: 'scroll'       },
  C: { name: 'Rings',                       dice: 'd1000', category: 'ring'         },
  D: { name: 'Rods',                        dice: 'd1000', category: 'rod'          },
  E: { name: 'Staves',                      dice: 'd1000', category: 'staff'        },
  F: { name: 'Wands',                       dice: 'd1000', category: 'wand'         },
  G: { name: 'Books & Tomes',               dice: 'd1000', category: 'book'         },
  H: { name: 'Gems & Jewelry',              dice: 'd1000', category: 'gem'          },
  I: { name: 'Clothing',                    dice: 'd1000', category: 'clothing'     },
  J: { name: 'Boots, Gloves & Accessories', dice: 'd1000', category: 'boots_gloves' },
  K: { name: 'Girdles & Helmets',           dice: 'd1000', category: 'girdle_helm'  },
  L: { name: 'Bags, Bands & Bottles',       dice: 'd1000', category: 'bag_bottle'   },
  M: { name: 'Dusts & Stones',              dice: 'd1000', category: 'dust_stone'   },
  N: { name: 'Household Items',             dice: 'd1000', category: 'household'    },
  O: { name: 'Musical Instruments',         dice: 'd1000', category: 'instrument'   },
  P: { name: 'Weird Stuff',                 dice: 'd1000', category: 'weird'        },
  Q: { name: 'Humorous Items',              dice: 'd1000', category: 'humorous'     },
  R: { name: 'Armor & Shields',             dice: 'd1000', category: 'armor'        },
  S: { name: 'Weapons',                     dice: 'd1000', category: 'weapon'       },
  T: { name: 'Artifacts & Relics',          dice: 'd1000', category: 'artifact'     },
};

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}
function parseDiceSides(dice) {
  const m = dice.match(/d(\d+)/i);
  return m ? parseInt(m[1]) : 20;
}

// ── Meta (/meta must be before /:id) ─────────────────────────────────────────
router.get('/meta', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*)                                                        AS total,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT category ORDER BY category),NULL) AS categories,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT rarity   ORDER BY rarity  ),NULL) AS rarities,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT table_letter ORDER BY table_letter),NULL) AS tables,
        COUNT(*) FILTER (WHERE cursed = true)                           AS cursed_count
      FROM magical_items
    `);
    const row = rows[0];
    res.json({
      total:        parseInt(row.total, 10),
      cursed_count: parseInt(row.cursed_count, 10),
      categories:   row.categories  ?? [],
      rarities:     row.rarities    ?? [],
      tables:       row.tables      ?? [],
      table_meta:   TABLE_META,
    });
  } catch (e) { next500(e, res); }
});

// ── Random item(s) (/random before /:id) ─────────────────────────────────────
router.get('/random', async (req, res) => {
  try {
    const { conditions, params } = buildFilters(req.query);
    const count = Math.max(1, Math.min(20, parseInt(req.query.count ?? 1, 10) || 1));
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(count);
    const items = await db.all(
      `SELECT * FROM magical_items ${where} ORDER BY RANDOM() LIMIT $${params.length}`,
      params,
    );
    res.json(items);
  } catch (e) { next500(e, res); }
});

// ── Roll on a specific table ──────────────────────────────────────────────────
router.get('/roll-table', async (req, res) => {
  try {
    const letter = (req.query.table ?? '').toUpperCase();
    if (!TABLE_META[letter]) {
      return res.status(400).json({ error: `Invalid table letter. Use A–T.` });
    }
    const meta  = TABLE_META[letter];
    const sides = parseDiceSides(meta.dice);
    const roll  = rollDie(sides);

    // Find the matching row in random_item_tables
    const tableRow = await db.one(
      `SELECT rit.*, mi.*
       FROM   random_item_tables rit
       LEFT JOIN magical_items mi ON mi.id = rit.item_id
       WHERE  rit.table_letter = $1
         AND  $2 BETWEEN rit.roll_min AND rit.roll_max
       LIMIT  1`,
      [letter, roll],
    );

    res.json({
      table_letter: letter,
      table_name:   meta.name,
      dice:         meta.dice,
      roll,
      item_name:    tableRow?.item_name ?? 'Unknown item',
      item:         tableRow?.id ? tableRow : null,
    });
  } catch (e) { next500(e, res); }
});

// ── Random hoard ─────────────────────────────────────────────────────────────
router.get('/random-hoard', async (req, res) => {
  try {
    const level   = Math.max(1, Math.min(20, parseInt(req.query.level ?? 5, 10) || 5));
    const type    = req.query.type ?? 'dungeon'; // dungeon | treasure | monster

    // Simplified AD&D 2E treasure hoard generation:
    // Higher dungeon level → more items, higher rarity categories
    const numItems    = Math.max(1, Math.min(10, Math.floor(level / 3) + rollDie(3)));
    const tablePool   = getHoardTables(level, type);
    const results     = [];

    for (let i = 0; i < numItems; i++) {
      const letter  = tablePool[Math.floor(Math.random() * tablePool.length)];
      const meta    = TABLE_META[letter];
      if (!meta) continue;
      const sides   = parseDiceSides(meta.dice);
      const roll    = rollDie(sides);

      // Try to find a matching table row
      const tableRow = await db.one(
        `SELECT rit.*, mi.*
         FROM   random_item_tables rit
         LEFT JOIN magical_items mi ON mi.id = rit.item_id
         WHERE  rit.table_letter = $1
           AND  $2 BETWEEN rit.roll_min AND rit.roll_max
         LIMIT  1`,
        [letter, roll],
      );

      if (tableRow) {
        results.push({
          table_letter: letter,
          table_name:   meta.name,
          dice:         meta.dice,
          roll,
          item_name:    tableRow.item_name,
          item:         tableRow.id ? { ...tableRow } : null,
        });
      } else {
        // If no table data, fall back to random item in category
        const fallback = await db.one(
          `SELECT * FROM magical_items WHERE category = $1 ORDER BY RANDOM() LIMIT 1`,
          [meta.category],
        );
        results.push({
          table_letter: letter,
          table_name:   meta.name,
          dice:         meta.dice,
          roll,
          item_name:    fallback?.name ?? `${meta.name} (roll ${roll})`,
          item:         fallback ?? null,
        });
      }
    }

    res.json({
      level,
      type,
      items: results,
    });
  } catch (e) { next500(e, res); }
});

// ── List all entries for a table (/table-entries before /:id) ────────────────
// Query params:
//   table=X         — table letter A–T (required)
//   subtable=1|2|3  — for R/S: 1=generic, 2=bonus(hardcoded), 3=special
//   limit=N         — max rows (default 500)
router.get('/table-entries', async (req, res) => {
  try {
    const letter   = (req.query.table ?? '').toUpperCase();
    const subtable = req.query.subtable; // '1' | '2' | '3' | undefined

    if (!TABLE_META[letter]) {
      return res.status(400).json({ error: 'Invalid table letter. Use A–T.' });
    }
    const meta  = TABLE_META[letter];
    const limit = Math.min(parseInt(req.query.limit ?? 500, 10), 1000);

    // S2 / R2: return hardcoded bonus table
    if (subtable === '2' && (letter === 'S' || letter === 'R')) {
      const bonus = letter === 'S' ? S2_BONUS : R2_BONUS;
      return res.json({
        table_letter: letter,
        subtable:     '2',
        table_name:   letter === 'S' ? 'Attack Adjustment (S2)' : 'Armor Bonus (R2)',
        dice:         'd20',
        total:        bonus.length,
        entries:      bonus,
        is_bonus:     true,
      });
    }

    // Tables R and S are handled by their own pane types in the client (S1/R1 etc.)
    // and should never reach here without a subtable param. For safety, fall through
    // to the magical_items path below which handles them correctly.

    // ── Primary: items with roll ranges already assigned by assign-roll-ranges.mjs ──
    const rangedRows = await db.all(
      `SELECT id AS item_id, name AS item_name, roll_min, roll_max,
              description_preview AS description, cursed, source_url
       FROM   magical_items
       WHERE  UPPER(table_letter) = $1 AND roll_min IS NOT NULL
       ORDER  BY roll_min ASC
       LIMIT  $2`,
      [letter, limit],
    );

    if (rangedRows.length > 0) {
      return res.json({
        table_letter:  letter,
        subtable:      subtable ?? null,
        table_name:    meta.name,
        dice:          'd1000',
        total:         rangedRows.length,
        entries:       rangedRows,
        has_subtables: letter === 'S' || letter === 'R',
      });
    }

    // ── Fallback: compute virtual 1-1000 ranges from item position in table ──
    const allRows = await db.all(
      `SELECT id AS item_id, name AS item_name,
              description_preview AS description, cursed, source_url
       FROM   magical_items
       WHERE  UPPER(table_letter) = $1
       ORDER  BY id ASC
       LIMIT  $2`,
      [letter, limit],
    );

    const n = allRows.length;
    const entries = allRows.map((row, i) => ({
      ...row,
      roll_min: n === 0 ? 1    : Math.round(i * 1000 / n) + 1,
      roll_max: n === 0 ? 1000 : (i === n - 1 ? 1000 : Math.round((i + 1) * 1000 / n)),
    }));

    res.json({
      table_letter:  letter,
      subtable:      subtable ?? null,
      table_name:    meta.name,
      dice:          'd1000',
      total:         entries.length,
      entries,
      has_subtables: letter === 'S' || letter === 'R',
    });
  } catch (e) { next500(e, res); }
});

// ── Table-letter → LootItem category mapping ──────────────────────────────────
// Used by /loot-pool to produce LootItem-compatible JSON for the XP engine.
const TABLE_TO_LOOT_CATEGORY = {
  A: 'misc',   B: 'potion', C: 'scroll', D: 'ring',
  E: 'rod',    F: 'staff',  G: 'wand',   H: 'gem',
  I: 'jewelry', J: 'boots_gloves_accessories',
  K: 'misc',   L: 'armor_shield', M: 'weapon',
  N: 'potion', O: 'scroll', P: 'misc',
  Q: 'artifact_relic', R: 'misc', S: 'weapon', T: 'misc',
};

// ── Loot pool for the XP engine (/loot-pool before /:id) ─────────────────────
// Query params: table_letter (single letter), min_xp, max_xp, limit (default 200, max 500)
// Returns items in LootItem-compatible format.
// Uses nullable params so omitting min_xp/max_xp returns all items (no mandatory xp filter).
router.get('/loot-pool', async (req, res) => {
  try {
    const tableLetter = req.query.table_letter
      ? String(req.query.table_letter).trim().toUpperCase()
      : null;
    const minXp  = req.query.min_xp  != null && req.query.min_xp  !== '' ? parseInt(req.query.min_xp,  10) : null;
    const maxXp  = req.query.max_xp  != null && req.query.max_xp  !== '' ? parseInt(req.query.max_xp,  10) : null;
    const limit  = Math.min(parseInt(req.query.limit ?? 200, 10) || 200, 500);

    const rows = await db.all(
      `SELECT id, name, table_letter, xp_value, value_gp, cursed
       FROM   magical_items
       WHERE  ($1::text IS NULL OR UPPER(table_letter) = $1)
         AND  ($2::int  IS NULL OR xp_value >= $2)
         AND  ($3::int  IS NULL OR xp_value <= $3)
       ORDER  BY RANDOM()
       LIMIT  $4`,
      [tableLetter, minXp, maxXp, limit],
    );

    res.json(rows.map(r => ({
      id:                String(r.id),
      name:              r.name,
      table_letter:      r.table_letter ?? null,
      category:          TABLE_TO_LOOT_CATEGORY[r.table_letter?.toUpperCase()] ?? 'misc',
      listedXp:          r.xp_value ?? 0,
      gpValue:           r.value_gp ?? 0,
      excludedByDefault: r.cursed   === true,
    })));
  } catch (e) { next500(e, res); }
});

// ── Search / list items ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  ?? 50,  10), 200);
    const offset =           parseInt(req.query.offset ?? 0,   10);
    const sortBy = {
      category: 'category ASC, name ASC',
      rarity:   'rarity ASC NULLS LAST, name ASC',
    }[req.query.sort] ?? 'name ASC';

    const { conditions, params, searchTerm } = buildFilters(req.query);

    let orderBy = sortBy;
    if (searchTerm) {
      orderBy = `ts_rank(to_tsvector('english', name || ' ' || COALESCE(description,'')),
                         plainto_tsquery('english', $${params.indexOf(searchTerm) + 1})) DESC, ${sortBy}`;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    const rows = await db.all(
      `SELECT id, name, category, subcategory, source_url, cursed, rarity,
              table_letter, charges, alignment, classes, value_gp, xp_value, intelligence, ego,
              LEFT(description, 300) AS description_preview,
              LEFT(powers, 200) AS powers_preview,
              COALESCE(
                LEFT(description, 300),
                (SELECT LEFT(rit.notes, 300)
                 FROM random_item_tables rit
                 WHERE rit.item_id = magical_items.id AND rit.notes IS NOT NULL
                 ORDER BY rit.roll_min ASC LIMIT 1)
              ) AS fallback_description
       FROM magical_items
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const countParams = params.slice(0, -2);
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) AS total FROM magical_items ${where}`,
      countParams,
    );

    res.json({
      total: parseInt(countRows[0].total, 10),
      page:  Math.floor(offset / limit) + 1,
      items: rows,
    });
  } catch (e) { next500(e, res); }
});

// ── Single item ───────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const item = await db.one(
      `SELECT mi.*,
              rit.table_letter AS source_table_letter,
              rit.roll_min     AS source_roll_min,
              rit.roll_max     AS source_roll_max,
              COALESCE(mi.description, rit.notes) AS fallback_description
       FROM magical_items mi
       LEFT JOIN LATERAL (
         SELECT table_letter, roll_min, roll_max, notes
         FROM   random_item_tables
         WHERE  item_id = mi.id
         ORDER  BY roll_min ASC
         LIMIT  1
       ) rit ON true
       WHERE mi.id = $1`,
      [req.params.id],
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (e) { next500(e, res); }
});

// ── Filter builder ────────────────────────────────────────────────────────────
function buildFilters(query) {
  const { category, rarity, table_letter, cursed } = query;
  const q = query.search ?? query.q;

  const conditions = [];
  const params     = [];
  let searchTerm   = null;

  // Multi-select category (comma-separated)
  if (category && category !== '') {
    const cats = category.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (cats.length === 1) {
      params.push(cats[0]);
      conditions.push(`LOWER(category) = $${params.length}`);
    } else if (cats.length > 1) {
      params.push(cats);
      conditions.push(`LOWER(category) = ANY($${params.length})`);
    }
  }

  // Multi-select rarity
  if (rarity && rarity !== '') {
    const rarities = rarity.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (rarities.length === 1) {
      params.push(rarities[0]);
      conditions.push(`LOWER(rarity) = $${params.length}`);
    } else if (rarities.length > 1) {
      params.push(rarities);
      conditions.push(`LOWER(rarity) = ANY($${params.length})`);
    }
  }

  // Multi-select table_letter
  if (table_letter && table_letter !== '') {
    const letters = table_letter.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (letters.length === 1) {
      params.push(letters[0]);
      conditions.push(`UPPER(table_letter) = $${params.length}`);
    } else if (letters.length > 1) {
      params.push(letters);
      conditions.push(`UPPER(table_letter) = ANY($${params.length})`);
    }
  }

  if (cursed === 'true') {
    conditions.push(`cursed = true`);
  }

  if (q && q.trim()) {
    searchTerm = q.trim();
    if (query.exact === 'true') {
      params.push(searchTerm);
      conditions.push(`LOWER(name) = LOWER($${params.length})`);
      searchTerm = null; // skip ts_rank ordering
    } else {
      params.push(searchTerm);
      const qi = params.length;
      conditions.push(
        `(to_tsvector('english', name || ' ' || COALESCE(description,'')) @@ plainto_tsquery('english', $${qi})
          OR name ILIKE $${qi + 1})`,
      );
      params.push(`%${searchTerm}%`);
    }
  }

  return { conditions, params, searchTerm };
}

// ── Hoard table pool by dungeon level ────────────────────────────────────────
function getHoardTables(level, type) {
  // Always possible
  const base = ['A', 'B', 'C', 'H'];
  // Mid-level additions
  if (level >= 3)  base.push('D', 'E', 'F', 'I', 'J', 'K');
  if (level >= 5)  base.push('L', 'M', 'N', 'O', 'R', 'S');
  if (level >= 8)  base.push('G', 'P', 'Q');
  if (level >= 12) base.push('T');
  if (type === 'monster') base.push('A', 'B', 'H'); // potions/scrolls more common
  if (type === 'treasure') base.push('R', 'S', 'C', 'H'); // armor/weapons/rings more common
  return base;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function next500(e, res) {
  console.error('[magical-items]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
