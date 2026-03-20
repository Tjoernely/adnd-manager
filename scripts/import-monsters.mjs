#!/usr/bin/env node
/**
 * AD&D 2E Monster Importer
 * 
 * Reads from monsters-list.json (extracted from Excel)
 * Fetches full stats from Fandom wiki for each monster
 * Stores ALL data in one pass — no re-runs needed
 * 
 * Usage (run from /var/www/adnd-manager/server):
 *   node import-monsters.mjs [options]
 * 
 * Options:
 *   --dry-run     Parse but don't write to DB
 *   --limit N     Only process first N monsters
 *   --offset N    Skip first N monsters (resume)
 *   --missing     Only process monsters with no description yet
 *   --name "X"    Only process monster with this exact name
 */

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load .env
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch(e) {}

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun  = args.includes('--dry-run');
const isMissing = args.includes('--missing');
const limitIdx  = args.indexOf('--limit');
const offsetIdx = args.indexOf('--offset');
const nameIdx   = args.indexOf('--name');
const LIMIT     = limitIdx  > -1 ? parseInt(args[limitIdx  + 1]) : 9999999;
const OFFSET    = offsetIdx > -1 ? parseInt(args[offsetIdx + 1]) : 0;
const NAME_FILTER = nameIdx > -1 ? args[nameIdx + 1] : null;
const DELAY_MS  = 150; // ms between wiki API calls

// ── DB connection ─────────────────────────────────────────────────────────────
const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'adnddb',
  user:     process.env.DB_USER     || 'adnduser',
  password: process.env.DB_PASSWORD,
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseSize(sizeStr) {
  if (!sizeStr) return 'medium';
  const s = sizeStr.toUpperCase();
  if (s.startsWith('T')) return 'tiny';
  if (s.startsWith('S')) return 'small';
  if (s.startsWith('M')) return 'medium';
  if (s.startsWith('L')) return 'large';
  if (s.startsWith('H')) return 'huge';
  if (s.startsWith('G')) return 'gargantuan';
  if (s.startsWith('C')) return 'colossal';
  return 'medium';
}

function inferKind(type) {
  if (!type) return 'monstrous';
  const t = type.toLowerCase();
  if (t.includes('dragon'))    return 'dragon';
  if (t.includes('undead'))    return 'undead';
  if (t.includes('golem') || t.includes('construct')) return 'construct';
  if (t.includes('elemental')) return 'elemental';
  if (t.includes('humanoid') || t.includes('human') || t.includes('demi-human')) return 'humanoid';
  if (t.includes('beast') || t.includes('animal') || t.includes('bird') || t.includes('fish')) return 'beast';
  return 'monstrous';
}

function getArmorProfile(type, ac) {
  if (!type) return 'dense_flesh';
  const t = type.toLowerCase();
  if (t.includes('dragon'))  return 'dragon_scales';
  if (t.includes('golem') || t.includes('stone') || t.includes('iron construct')) return 'stone_body';
  if (t.includes('beetle') || t.includes('crab') || t.includes('insect') || t.includes('scorpion')) return 'carapace';
  if (t.includes('undead')) return (t.includes('zombie') || t.includes('ghoul') || t.includes('ghast')) ? 'dense_flesh' : 'none';
  if (t.includes('giant') || t.includes('troll') || t.includes('ogre')) return 'thick_hide';
  const acNum = parseInt(ac);
  if (!isNaN(acNum)) {
    if (acNum <= 1)  return 'plate';
    if (acNum <= 4)  return 'chain';
    if (acNum <= 6)  return 'leather';
  }
  return 'dense_flesh';
}

function computeGeneratedHp(size, kind, hitDice) {
  const SIZE_BASE = { tiny:20, small:40, medium:80, large:180, huge:400, gargantuan:900, colossal:1800 };
  const KIND_MOD  = { humanoid:1.0, beast:1.2, monstrous:1.4, undead:1.6, construct:2.0, elemental:1.8, dragon:2.2, boss:2.8 };
  const base = SIZE_BASE[size] || 80;
  const mod  = KIND_MOD[kind]  || 1.0;
  const hd   = parseFloat(String(hitDice).replace(/[^0-9.]/g,'')) || 1;
  let hp = Math.round(base * mod * (1 + hd * 0.12));
  if (hp > 2500) hp = Math.round(2500 + (hp - 2500) * 0.5);
  return hp;
}

function parseIntSafe(val) {
  if (val == null) return null;
  const n = parseInt(String(val).replace(/[^0-9-]/g,''));
  return isNaN(n) ? null : n;
}

// ── Wiki page title from URL ────────────────────────────────────────────────
function titleFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ── Wiki API fetch ─────────────────────────────────────────────────────────
async function fetchWikiPage(pageTitle) {
  if (!pageTitle) return null;
  const url = `https://adnd2e.fandom.com/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=revisions&rvprop=content&format=json&origin=*`;
  try {
    const res = await fetch(url, { 
      headers: { 'User-Agent': 'ADnD-Manager-Import/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (page.missing !== undefined) return null;
    return page?.revisions?.[0]?.['*'] || null;
  } catch(e) {
    return null;
  }
}

// ── Parse monster stats from wikitext ────────────────────────────────────────
function parseMonsterWikitext(raw) {
  if (!raw) return {};
  
  const result = {};
  
  // Extract {{Creature}} or {{Monster}} template fields
  const templateMatch = raw.match(/\{\{(?:Creature|Monster|creature|monster)([\s\S]*?)\n\}\}/i);
  if (templateMatch) {
    const lines = templateMatch[1].split('\n');
    for (const line of lines) {
      const m = line.match(/\|\s*(\w[\w\s]*?)\s*=\s*(.+)/);
      if (m) {
        const key = m[1].trim().toLowerCase().replace(/\s+/g, '_');
        const val = m[2].trim()
          .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
          .replace(/\[\[([^\]]+)\]\]/g, '$1')
          .replace(/'''([^']+)'''/g, '$1')
          .replace(/''([^']+)''/g, '$1')
          .replace(/\{\{br\}\}/gi, ', ')
          .replace(/\{\{[^}]*\}\}/g, '')
          .trim();
        result[key] = val;
      }
    }
  }
  
  // Also try flat key=value format
  const fieldMap = {
    'climate/terrain':   'habitat',
    'climate':          'habitat',
    'terrain':          'habitat',
    'frequency':        'frequency',
    'organization':     'organization',
    'activity cycle':   'activity_cycle',
    'diet':             'diet',
    'intelligence':     'intelligence',
    'treasure':         'treasure',
    'alignment':        'alignment',
    'no. appearing':    'no_appearing',
    'armor class':      'armor_class',
    'movement':         'movement',
    'hit dice':         'hit_dice',
    'thac0':            'thac0',
    'no. of attacks':   'no_attacks',
    'damage/attack':    'damage',
    'special attacks':  'special_attacks',
    'special defenses': 'special_defenses',
    'magic resistance': 'magic_resistance',
    'size':             'size_raw',
    'morale':           'morale',
    'xp value':         'xp_value_wiki',
  };
  
  for (const [pattern, field] of Object.entries(fieldMap)) {
    const re = new RegExp(`\\|\\s*${pattern}\\s*=\\s*([^\\n|\\}]+)`, 'i');
    const m = raw.match(re);
    if (m && !result[field]) {
      result[field] = m[1]
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/'''([^']+)'''/g, '$1')
        .replace(/''([^']+)''/g, '$1')
        .replace(/\{\{br\}\}/gi, ', ')
        .replace(/\{\{[^}]*\}\}/g, '')
        .trim();
    }
  }
  
  // Extract description text (after template block, before categories)
  let body = raw
    .replace(/\{\{(?:Creature|Monster)[^}]*(?:\}\}|\n\}\})/is, '')
    .replace(/\[\[Category:[^\]]+\]\]\n?/g, '')
    .replace(/^[^\n]*\}\}\n?/, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''([^']+)'''/g, '$1')
    .replace(/''([^']+)''/g, '$1')
    .replace(/\{\{br\}\}/gi, ' ')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/==+[^=]+=+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  if (body.length > 50) {
    result.description = body;
  }
  
  return result;
}

// ── Progress bar ───────────────────────────────────────────────────────────
function progressBar(current, total, extras = '') {
  const width = 40;
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(width * pct);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  process.stdout.write(`\r  [${bar}] ${current}/${total}  ${extras}`.padEnd(100));
}

// ── Main import ────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  AD&D 2E Monster Importer                                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Mode     : ${isDryRun ? 'DRY RUN' : 'LIVE IMPORT'}`);
  console.log(`  Source   : monsters-list.json (from Excel)`);
  console.log('');
  
  // Load monster list
  const listPath = path.join(__dirname, '../scripts/monsters-list.json');
  if (!fs.existsSync(listPath)) {
    console.error(`  ERROR: ${listPath} not found!`);
    console.error('  Run: copy monsters-list.json to scripts/ folder');
    process.exit(1);
  }
  
  let monsters = JSON.parse(fs.readFileSync(listPath, 'utf8'));
  console.log(`  Total in list: ${monsters.length}`);
  
  // Apply filters
  if (NAME_FILTER) {
    monsters = monsters.filter(m => m.name.toLowerCase() === NAME_FILTER.toLowerCase());
    console.log(`  Filtered to: "${NAME_FILTER}" (${monsters.length} match)`);
  }
  
  if (isMissing && !isDryRun) {
    const { rows } = await pool.query(
      `SELECT LOWER(name) as name FROM monsters WHERE description IS NOT NULL AND description != ''`
    );
    const existing = new Set(rows.map(r => r.name));
    const before = monsters.length;
    monsters = monsters.filter(m => !existing.has(m.name.toLowerCase()));
    console.log(`  Already in DB: ${before - monsters.length}, remaining: ${monsters.length}`);
  }
  
  monsters = monsters.slice(OFFSET, OFFSET + LIMIT);
  console.log(`  Processing  : ${monsters.length} monsters (offset ${OFFSET})`);
  console.log('');
  
  let inserted = 0, updated = 0, noWiki = 0, errors = 0;
  
  for (let i = 0; i < monsters.length; i++) {
    const m = monsters[i];
    progressBar(i + 1, monsters.length, `${m.name.substring(0,30)}`);
    
    try {
      // Fetch wiki if URL available
      let wikiData = {};
      const pageTitle = titleFromUrl(m.wiki_url);
      
      if (pageTitle) {
        const raw = await fetchWikiPage(pageTitle);
        if (raw) {
          wikiData = parseMonsterWikitext(raw);
        } else {
          noWiki++;
        }
      } else {
        noWiki++;
      }
      
      // Determine size and kind
      const sizeStr = wikiData.size_raw || m.size || 'M';
      const size = parseSize(sizeStr);
      const typeStr = wikiData.type || wikiData.category || '';
      const kind = inferKind(typeStr);
      
      // Parse numeric fields
      const hitDice   = wikiData.hit_dice || wikiData.hd || null;
      const hitPoints = parseIntSafe(wikiData.hit_points || wikiData.hp);
      const ac        = parseIntSafe(wikiData.armor_class || wikiData.ac);
      const thac0     = parseIntSafe(wikiData.thac0);
      const morale    = parseIntSafe(wikiData.morale);
      const xpValue   = m.xp_value || parseIntSafe(wikiData.xp_value_wiki);
      
      const armorProfile = getArmorProfile(typeStr, ac);
      const generatedHp  = computeGeneratedHp(size, kind, hitDice || '1');
      
      if (isDryRun) {
        if (i < 10) {
          console.log(`\n  [DRY] ${m.name}`);
          console.log(`        HD:${hitDice} AC:${ac} THAC0:${thac0} Size:${size} Kind:${kind}`);
          console.log(`        Armor:${armorProfile} GenHP:${generatedHp}`);
          console.log(`        Desc: ${wikiData.description ? wikiData.description.substring(0,80)+'...' : 'none'}`);
        }
        inserted++;
        await sleep(DELAY_MS);
        continue;
      }
      
      // Upsert to DB
      await pool.query(`
        INSERT INTO monsters (
          name, source, wiki_url, source_url,
          hit_dice, hit_points, armor_class, thac0, movement,
          size, type, alignment,
          attacks, damage, special_attacks, special_defenses,
          magic_resistance, save_as, morale, xp_value,
          description, habitat, frequency,
          no_appearing, organization, activity_cycle, 
          diet, intelligence, treasure,
          armor_profile_id, generated_hp
        ) VALUES (
          $1,$2,$3,$4,
          $5,$6,$7,$8,$9,
          $10,$11,$12,
          $13,$14,$15,$16,
          $17,$18,$19,$20,
          $21,$22,$23,
          $24,$25,$26,
          $27,$28,$29,
          $30,$31
        )
        ON CONFLICT (name) DO UPDATE SET
          source            = EXCLUDED.source,
          wiki_url          = COALESCE(EXCLUDED.wiki_url, monsters.wiki_url),
          source_url        = COALESCE(EXCLUDED.source_url, monsters.source_url),
          hit_dice          = COALESCE(EXCLUDED.hit_dice, monsters.hit_dice),
          hit_points        = COALESCE(EXCLUDED.hit_points, monsters.hit_points),
          armor_class       = COALESCE(EXCLUDED.armor_class, monsters.armor_class),
          thac0             = COALESCE(EXCLUDED.thac0, monsters.thac0),
          movement          = COALESCE(EXCLUDED.movement, monsters.movement),
          size              = EXCLUDED.size,
          type              = COALESCE(EXCLUDED.type, monsters.type),
          alignment         = COALESCE(EXCLUDED.alignment, monsters.alignment),
          attacks           = COALESCE(EXCLUDED.attacks, monsters.attacks),
          damage            = COALESCE(EXCLUDED.damage, monsters.damage),
          special_attacks   = COALESCE(EXCLUDED.special_attacks, monsters.special_attacks),
          special_defenses  = COALESCE(EXCLUDED.special_defenses, monsters.special_defenses),
          magic_resistance  = COALESCE(EXCLUDED.magic_resistance, monsters.magic_resistance),
          morale            = COALESCE(EXCLUDED.morale, monsters.morale),
          xp_value          = COALESCE(EXCLUDED.xp_value, monsters.xp_value),
          description       = COALESCE(EXCLUDED.description, monsters.description),
          habitat           = COALESCE(EXCLUDED.habitat, monsters.habitat),
          frequency         = COALESCE(EXCLUDED.frequency, monsters.frequency),
          armor_profile_id  = EXCLUDED.armor_profile_id,
          generated_hp      = EXCLUDED.generated_hp
      `, [
        m.name, m.source, m.wiki_url, m.source_url,
        hitDice, hitPoints, ac, thac0, wikiData.movement || null,
        size, typeStr || null, wikiData.alignment || null,
        wikiData.no_attacks || wikiData.attacks || null,
        wikiData.damage || null,
        wikiData.special_attacks || null,
        wikiData.special_defenses || null,
        wikiData.magic_resistance || null,
        wikiData.save_as || null,
        morale, xpValue,
        wikiData.description || null,
        wikiData.habitat || wikiData['climate/terrain'] || null,
        m.frequency || wikiData.frequency || null,
        wikiData.no_appearing || null,
        wikiData.organization || null,
        wikiData.activity_cycle || null,
        wikiData.diet || null,
        wikiData.intelligence || null,
        wikiData.treasure || null,
        armorProfile, generatedHp
      ]);
      
      inserted++;
    } catch(e) {
      errors++;
      process.stdout.write(`\n  ✗ ${m.name}: ${e.message}\n`);
    }
    
    await sleep(DELAY_MS);
  }
  
  console.log('\n');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${inserted} imported, ${noWiki} no wiki page, ${errors} errors`);
  console.log('══════════════════════════════════════════════════════════');
  
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
