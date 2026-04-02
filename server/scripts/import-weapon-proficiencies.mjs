#!/usr/bin/env node
/**
 * import-weapon-proficiencies.mjs
 * Scraper AD&D 2E wiki for weapon proficiencies og seeder weapon_proficiencies-tabellen.
 * Kør fra: /var/www/adnd-manager/server/
 *   node scripts/import-weapon-proficiencies.mjs [--dry-run]
 *
 * Strategi (to trin):
 *   1. Scrape https://adnd2e.fandom.com/wiki/Weapon_Proficiencies — giver gruppe-info
 *   2. Fyld huller fra weapons_catalog (allerede i DB) — sikrer fuld dækning
 */
import { createRequire } from 'module';
import { fileURLToPath }  from 'url';
import path               from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const db        = require('../db');

const DRY_RUN   = process.argv.includes('--dry-run');
const WIKI_URL  = 'https://adnd2e.fandom.com/wiki/Weapon_Proficiencies';
const SOURCE    = "Player's Handbook (AD&D 2E)";

function toId(name) {
  return name.toLowerCase()
    .replace(/[(),\/\\:]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Trin 1: Scrape wiki ───────────────────────────────────────────────────────
async function scrapeWiki() {
  console.log('[wp] Trin 1: scrape wiki…');
  let html;
  try {
    html = await fetch(WIKI_URL).then(r => r.text());
  } catch (e) {
    console.warn('  Wiki fetch fejlede:', e.message);
    return [];
  }

  const weapons = [];

  // Wiki-siden bruger typisk <h2>/<h3>-overskrifter til grupper og <li>/<td> til våben.
  // Vi parser linje for linje og holder styr på nuværende gruppe.
  let currentGroup = 'general';

  // Normaliser HTML til én linje pr. tag
  const lines = html.replace(/>\s*</g, '>\n<').split('\n');

  for (const line of lines) {
    // Detekter gruppe-overskrift: <h2 ...>Swords</h2> eller <span ...>Swords</span>
    const h2 = line.match(/<h[23][^>]*>.*?<span[^>]*>([^<]{3,40})<\/span>/i)
            || line.match(/<h[23][^>]*>([^<]{3,40})<\/h[23]>/i);
    if (h2) {
      const g = h2[1].trim().toLowerCase().replace(/\s+/g, '-');
      if (g && g !== 'contents' && g !== 'references' && g !== 'navigation') {
        currentGroup = g;
      }
      continue;
    }

    // Detekter våben i listeform: <li>...<a ...>Dagger</a>...</li>
    // eller i tabel: <td>...<a ...>Dagger</a>...</td>
    const cell = line.match(/<(?:li|td)[^>]*>(.*?)<\/(?:li|td)>/i);
    if (!cell) continue;
    const text = cell[1].replace(/<[^>]+>/g, '').replace(/\[.*?\]/g, '').trim();
    if (!text || text.length < 2 || /^\d+$/.test(text)) continue;

    // Skip navigation/tabel-headers
    const skip = ['weapon','proficiency','group','slots','cost','class','notes','source'];
    if (skip.includes(text.toLowerCase())) continue;

    weapons.push({ name: text, group: currentGroup, source: SOURCE, url: WIKI_URL });
  }

  // Dedupliker på navn
  const seen = new Set();
  const unique = weapons.filter(w => {
    if (seen.has(w.name)) return false;
    seen.add(w.name);
    return true;
  });

  console.log(`  Fundet ${unique.length} unikke våben fra wiki`);
  return unique;
}

// ── Trin 2: Fyld fra weapons_catalog ────────────────────────────────────────
async function fromCatalog() {
  console.log('[wp] Trin 2: supplement fra weapons_catalog…');
  const { rows } = await db.query(`
    SELECT DISTINCT name,
      COALESCE(weapon_type, 'general') AS weapon_group
    FROM weapons_catalog
    ORDER BY name
  `).catch(() => ({ rows: [] }));

  if (!rows.length) {
    console.log('  Ingen weapons_catalog-data (tabel mangler måske)');
    return [];
  }

  console.log(`  ${rows.length} våben i catalog`);
  return rows.map(r => ({
    name:   r.name,
    group:  r.weapon_group?.toLowerCase()?.replace(/\s+/g,'-') || 'general',
    source: SOURCE,
    url:    null,
  }));
}

// ── Trin 3: Upsert ──────────────────────────────────────────────────────────
async function upsert(weapons) {
  console.log(`[wp] Trin 3: upsert ${weapons.length} våben${DRY_RUN ? ' (DRY RUN)' : ''}…`);
  let ins = 0, skip = 0;

  for (const w of weapons) {
    const cid = toId(w.name);
    if (!cid) continue;

    if (DRY_RUN) {
      console.log(`  DRY: ${cid} | ${w.name} | ${w.group}`);
      ins++;
      continue;
    }

    try {
      const res = await db.query(`
        INSERT INTO weapon_proficiencies
          (canonical_id, name, weapon_group, source_book, source_url)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (canonical_id) DO UPDATE
          SET weapon_group = COALESCE(EXCLUDED.weapon_group, weapon_proficiencies.weapon_group),
              source_book  = COALESCE(EXCLUDED.source_book,  weapon_proficiencies.source_book),
              source_url   = COALESCE(EXCLUDED.source_url,   weapon_proficiencies.source_url)
        RETURNING (xmax = 0) AS inserted
      `, [cid, w.name, w.group, w.source, w.url]);

      if (res.rows[0]?.inserted) ins++; else skip++;
    } catch (e) {
      console.error(`  ERR ${w.name}: ${e.message}`);
    }
  }

  console.log(`  Nye: ${ins}, allerede der: ${skip}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== import-weapon-proficiencies.mjs ===');
  try {
    const wikiWeapons    = await scrapeWiki();
    const catalogWeapons = await fromCatalog();

    // Merge: wiki har forrang (gruppe-info er bedre), catalog fylder huller
    const seen = new Set(wikiWeapons.map(w => w.name));
    const merged = [
      ...wikiWeapons,
      ...catalogWeapons.filter(w => !seen.has(w.name)),
    ];

    console.log(`[wp] Samlet: ${merged.length} våben til import`);
    await upsert(merged);

    if (!DRY_RUN) {
      const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM weapon_proficiencies');
      console.log(`\n✓ Færdig. ${rows[0].n} weapon proficiencies i DB.`);
    }
  } finally {
    await db.pool.end();
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
