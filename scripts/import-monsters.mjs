#!/usr/bin/env node
/**
 * import-monsters.mjs
 * Import AD&D 2E monster data into the PostgreSQL monsters table.
 *
 * Usage:
 *   node scripts/import-monsters.mjs
 *   node scripts/import-monsters.mjs --dry-run
 *   node scripts/import-monsters.mjs --limit 20
 *   node scripts/import-monsters.mjs --source https://example.com/monsters.json
 *
 * Run from the server/ directory:
 *   npm run import:monsters
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from server/
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../server/.env') });

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'adnd_manager',
  user:     process.env.DB_USER     || 'adnd',
  password: process.env.DB_PASSWORD,
  max: 5,
});

// ── CLI flags ─────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT   = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i+1]) : Infinity; })();
const SOURCE  = (() => { const i = args.indexOf('--source'); return i >= 0 ? args[i+1] : null; })();

// ── Source URLs to try ────────────────────────────────────────────────────
const SOURCE_URLS = [
  SOURCE,
  'https://raw.githubusercontent.com/jdrueckert/adnd-monster-manual/main/monsters.json',
  'https://api.open5e.com/v1/monsters/?document__slug=adnd&limit=500&format=json',
].filter(Boolean);

// ── Armor profile auto-assignment ─────────────────────────────────────────
function autoAssignArmorProfile(m) {
  const type = (m.type ?? '').toLowerCase();
  const name = (m.name ?? '').toLowerCase();
  const ac   = m.armor_class ?? 10;

  if (type.includes('dragon'))  return 'dragon_scales';
  if (type.includes('construct') || type.includes('golem')) return 'stone_body';
  if (type.includes('undead')) {
    if (name.includes('skeleton') || name.includes('zombie')) return 'none';
    return 'dense_flesh';
  }
  if (name.includes('giant') || name.includes('ogre') ||
      name.includes('troll') || name.includes('ettin')) return 'thick_hide';
  if (name.includes('beetle') || name.includes('crab') ||
      name.includes('scorpion') || name.includes('ant') ||
      name.includes('spider')) return 'carapace';
  if ((type.includes('animal') || type.includes('beast')) &&
      ['large','huge','gargantuan'].includes((m.size ?? '').toLowerCase())) return 'thick_hide';
  if (type.includes('humanoid')) {
    if (ac <= 3) return 'plate';
    if (ac <= 5) return 'chain';
    return 'none';
  }
  return 'dense_flesh';
}

// ── HP generation ─────────────────────────────────────────────────────────
const SIZE_BASE = { tiny:20, small:40, medium:80, large:180, huge:400, gargantuan:900 };
const KIND_MOD  = { humanoid:1.0, beast:1.2, monstrous:1.4, undead:1.6, construct:2.0, dragon:2.2 };

function deriveKind(type) {
  if (!type) return 'monstrous';
  const t = type.toLowerCase();
  if (t.includes('dragon'))   return 'dragon';
  if (t.includes('construct') || t.includes('golem')) return 'construct';
  if (t.includes('undead'))   return 'undead';
  if (t.includes('humanoid')) return 'humanoid';
  if (t.includes('animal') || t.includes('beast')) return 'beast';
  return 'monstrous';
}

function parseHd(hdStr) {
  if (!hdStr) return 1;
  const s = String(hdStr).toLowerCase().trim();
  const d = s.match(/^(\d+(?:\.\d+)?)d/);
  if (d) return parseFloat(d[1]);
  const n = s.match(/^(\d+(?:\.\d+)?)/);
  if (n) return parseFloat(n[1]);
  return 1;
}

function computeGeneratedHp(m) {
  const sizeKey = (m.size ?? 'medium').toLowerCase();
  const base    = SIZE_BASE[sizeKey] ?? SIZE_BASE.medium;
  const kind    = deriveKind(m.type);
  const kindM   = KIND_MOD[kind] ?? 1.0;
  const hd      = parseHd(m.hit_dice);
  return Math.round(base * kindM * (1 + hd * 0.12));
}

// ── Fetch monsters from URL ───────────────────────────────────────────────
async function fetchFromUrl(url) {
  console.log(`  Trying: ${url}`);
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Handle open5e envelope: { results: [...] }
  if (data?.results && Array.isArray(data.results)) return data.results;
  if (Array.isArray(data)) return data;
  throw new Error('Unexpected JSON shape');
}

// ── Normalize monster from source format ─────────────────────────────────
function normalize(raw) {
  // open5e format
  if (raw.challenge_rating !== undefined || raw.hit_dice !== undefined) {
    const ac = Array.isArray(raw.armor_class) ? raw.armor_class[0]?.value : raw.armor_class;
    const speed = raw.speed ? Object.entries(raw.speed).map(([k,v])=>`${k} ${v}`).join(', ') : null;
    const atks = raw.special_abilities?.length
      ? raw.special_abilities.map(a=>a.name).join(', ') : null;

    return {
      name:             raw.name,
      source:           raw.document__slug?.toUpperCase() ?? 'MM',
      hit_dice:         raw.hit_dice ?? String(raw.hit_points_roll ?? ''),
      hit_points:       typeof raw.hit_points === 'number' ? raw.hit_points : null,
      armor_class:      typeof ac === 'number' ? ac : null,
      thac0:            null,
      movement:         speed,
      size:             raw.size?.toLowerCase() ?? null,
      type:             raw.type?.toLowerCase() ?? null,
      alignment:        raw.alignment ?? null,
      attacks:          atks,
      damage:           null,
      special_attacks:  raw.special_abilities?.map(a=>a.desc).join('\n') ?? null,
      special_defenses: raw.special_resistances ?? null,
      save_as:          null,
      morale:           null,
      xp_value:         null,
      description:      raw.desc ?? null,
      habitat:          raw.environments?.join(', ') ?? null,
      frequency:        null,
      tags:             raw.type ? [raw.type.toLowerCase()] : [],
    };
  }

  // jdrueckert format (already AD&D shaped)
  return {
    name:             raw.name ?? null,
    source:           raw.source ?? 'MM',
    hit_dice:         raw.hit_dice ?? raw.hd ?? null,
    hit_points:       raw.hit_points ?? raw.hp ?? null,
    armor_class:      raw.armor_class ?? raw.ac ?? null,
    thac0:            raw.thac0 ?? raw.THAC0 ?? null,
    movement:         raw.movement ?? raw.mv ?? null,
    size:             (raw.size ?? '').toLowerCase() || null,
    type:             (raw.type ?? '').toLowerCase() || null,
    alignment:        raw.alignment ?? null,
    attacks:          raw.attacks ?? raw.no_of_attacks ?? null,
    damage:           raw.damage ?? raw.damage_per_attack ?? null,
    special_attacks:  raw.special_attacks ?? raw.sa ?? null,
    special_defenses: raw.special_defenses ?? raw.sd ?? null,
    save_as:          raw.save_as ?? null,
    morale:           raw.morale ? parseInt(raw.morale) : null,
    xp_value:         raw.xp_value ?? raw.xp ?? null,
    description:      raw.description ?? raw.desc ?? null,
    habitat:          raw.habitat ?? raw.terrain ?? null,
    frequency:        raw.frequency ?? raw.rarity ?? null,
    tags:             Array.isArray(raw.tags) ? raw.tags : (raw.type ? [raw.type.toLowerCase()] : []),
  };
}

// ── Fallback hardcoded monsters (50 classic AD&D types) ──────────────────
function getFallbackMonsters() {
  return [
    { name:'Goblin',        type:'humanoid',  size:'small',  hit_dice:'1-1',  armor_class:6,  thac0:20, movement:'6',  alignment:'le', attacks:'1', damage:'1d6', xp_value:15,  frequency:'Common',   habitat:'Underground, Hills', description:'Small, cruel humanoids that dwell in dark places.' },
    { name:'Orc',           type:'humanoid',  size:'medium', hit_dice:'1',    armor_class:6,  thac0:19, movement:'9',  alignment:'le', attacks:'1', damage:'1d8', xp_value:15,  frequency:'Common',   habitat:'Wilderness, Underground', description:'Savage humanoids with porcine features. Often serve evil masters.' },
    { name:'Hobgoblin',     type:'humanoid',  size:'medium', hit_dice:'1+1',  armor_class:5,  thac0:19, movement:'9',  alignment:'le', attacks:'1', damage:'1d8', xp_value:35,  frequency:'Common',   habitat:'Any Land', description:'Larger, more disciplined cousins of the goblin.' },
    { name:'Gnoll',         type:'humanoid',  size:'large',  hit_dice:'2',    armor_class:5,  thac0:19, movement:'9',  alignment:'ce', attacks:'1', damage:'2d4', xp_value:35,  frequency:'Uncommon', habitat:'Wilderness, Plains', description:'Hyena-headed humanoids, fierce and cunning.' },
    { name:'Bugbear',       type:'humanoid',  size:'large',  hit_dice:'3+1',  armor_class:5,  thac0:17, movement:'9',  alignment:'ce', attacks:'1', damage:'2d4', xp_value:175, frequency:'Uncommon', habitat:'Underground, Forest', description:'Large, hairy goblinoids known for surprise attacks.' },
    { name:'Kobold',        type:'humanoid',  size:'small',  hit_dice:'1/2',  armor_class:7,  thac0:20, movement:'6',  alignment:'le', attacks:'1', damage:'1d4', xp_value:7,   frequency:'Common',   habitat:'Underground', description:'Tiny reptilian humanoids, cowardly but numerous.' },
    { name:'Skeleton',      type:'undead',    size:'medium', hit_dice:'1',    armor_class:7,  thac0:19, movement:'12', alignment:'n',  attacks:'1', damage:'1d6', xp_value:65,  frequency:'Common',   habitat:'Any', description:'Animated bones of the dead, immune to cold and sleep.' },
    { name:'Zombie',        type:'undead',    size:'medium', hit_dice:'2',    armor_class:8,  thac0:19, movement:'6',  alignment:'n',  attacks:'1', damage:'1d8', xp_value:65,  frequency:'Common',   habitat:'Any', description:'Slow, mindless animated corpses that always attack.' },
    { name:'Ghoul',         type:'undead',    size:'medium', hit_dice:'2',    armor_class:6,  thac0:19, movement:'9',  alignment:'ce', attacks:'3', damage:'1d3/1d3/1d6', xp_value:175, frequency:'Uncommon', habitat:'Dungeons, Graveyards', special_attacks:'Paralysis', description:'Flesh-eating undead with paralyzing claws.' },
    { name:'Wight',         type:'undead',    size:'medium', hit_dice:'4+3',  armor_class:5,  thac0:15, movement:'12', alignment:'le', attacks:'1', damage:'1d4', xp_value:650, frequency:'Uncommon', habitat:'Dungeons, Graveyards', special_attacks:'Energy drain', description:'Intelligent undead that drain life levels.' },
    { name:'Wraith',        type:'undead',    size:'medium', hit_dice:'5+3',  armor_class:4,  thac0:15, movement:'12/24', alignment:'le', attacks:'1', damage:'1d6', xp_value:2000, frequency:'Rare', habitat:'Any', special_attacks:'Energy drain', special_defenses:'Silver or +1 to hit', description:'Incorporeal undead that drain life energy.' },
    { name:'Vampire',       type:'undead',    size:'medium', hit_dice:'8+3',  armor_class:1,  thac0:13, movement:'12/18', alignment:'ce', attacks:'1', damage:'1d6+4', xp_value:8000, frequency:'Rare', habitat:'Any', special_attacks:'Energy drain, charm', special_defenses:'Many resistances', description:'Powerful undead lord of the night.' },
    { name:'Lich',          type:'undead',    size:'medium', hit_dice:'11+',  armor_class:0,  thac0:10, movement:'6',  alignment:'any evil', attacks:'1', damage:'1d10', xp_value:11000, frequency:'Very Rare', habitat:'Dungeons', special_attacks:'Paralyzing touch, spells', description:'Undead sorcerer of immense power.' },
    { name:'Troll',         type:'giant',     size:'large',  hit_dice:'6+6',  armor_class:4,  thac0:13, movement:'12', alignment:'ce', attacks:'3', damage:'1d4+4/1d4+4/2d6', xp_value:975, frequency:'Uncommon', habitat:'Hills, Mountains, Swamps', special_defenses:'Regeneration', description:'Rubbery-skinned giants that regenerate damage rapidly.' },
    { name:'Ogre',          type:'giant',     size:'large',  hit_dice:'4+1',  armor_class:5,  thac0:15, movement:'9',  alignment:'ce', attacks:'1', damage:'1d10+2', xp_value:270, frequency:'Common',   habitat:'Hills, Caves', description:'Large, stupid humanoids with great strength.' },
    { name:'Hill Giant',    type:'giant',     size:'huge',   hit_dice:'12+2', armor_class:3,  thac0:9,  movement:'12', alignment:'ce', attacks:'1', damage:'2d8', xp_value:3000, frequency:'Uncommon', habitat:'Hills', description:'The least of the true giants, but still fearsome.' },
    { name:'Stone Giant',   type:'giant',     size:'huge',   hit_dice:'14',   armor_class:0,  thac0:7,  movement:'12', alignment:'n',  attacks:'1', damage:'3d10', xp_value:6000, frequency:'Rare', habitat:'Mountains, Caves', description:'Reclusive giants of mountain caverns.' },
    { name:'Fire Giant',    type:'giant',     size:'huge',   hit_dice:'15',   armor_class:-1, thac0:5,  movement:'12', alignment:'le', attacks:'1', damage:'3d10', xp_value:8000, frequency:'Rare', habitat:'Volcanic Regions', special_defenses:'Fire immunity', description:'Smithing giants immune to fire damage.' },
    { name:'Frost Giant',   type:'giant',     size:'huge',   hit_dice:'14+1', armor_class:0,  thac0:7,  movement:'12', alignment:'ce', attacks:'1', damage:'2d12', xp_value:7000, frequency:'Rare', habitat:'Arctic', special_defenses:'Cold immunity', description:'Giants of frozen wastes, immune to cold.' },
    { name:'Dragon (Red)',  type:'dragon',    size:'gargantuan', hit_dice:'13', armor_class:-1, thac0:7, movement:'9/24', alignment:'ce', attacks:'3', damage:'1d8/1d8/3d10', xp_value:13000, frequency:'Rare', habitat:'Mountains', special_attacks:'Fire breath (10d10)', description:'Greatest of evil dragonkind, lair in volcanic mountains.' },
    { name:'Dragon (Black)',type:'dragon',    size:'huge',   hit_dice:'8',    armor_class:3,  thac0:11, movement:'12/24', alignment:'ce', attacks:'3', damage:'1d6/1d6/2d8', xp_value:3000, frequency:'Uncommon', habitat:'Swamps', special_attacks:'Acid breath (8d4+4)', description:'Evil dragons that spit corrosive acid.' },
    { name:'Dragon (White)',type:'dragon',    size:'large',  hit_dice:'6',    armor_class:3,  thac0:13, movement:'12/24/12', alignment:'ce', attacks:'3', damage:'1d4/1d4/2d6', xp_value:1400, frequency:'Uncommon', habitat:'Arctic', special_attacks:'Cold breath (6d6)', description:'Least of evil dragons, cold-breathing.' },
    { name:'Dragon (Gold)', type:'dragon',    size:'gargantuan', hit_dice:'16', armor_class:-2, thac0:5, movement:'12/30', alignment:'lg', attacks:'3', damage:'1d10/1d10/4d8', xp_value:18000, frequency:'Rare', habitat:'Any', special_attacks:'Fire/gas breath', description:'Noblest of dragons, wise and just.' },
    { name:'Wolf',          type:'animal',    size:'medium', hit_dice:'2+2',  armor_class:7,  thac0:19, movement:'18', alignment:'n',  attacks:'1', damage:'2d4', xp_value:120, frequency:'Common',   habitat:'Forest, Plains', description:'Pack hunters of the wilderness.' },
    { name:'Bear (Brown)',  type:'animal',    size:'large',  hit_dice:'5+5',  armor_class:6,  thac0:15, movement:'12', alignment:'n',  attacks:'3', damage:'1d6/1d6/1d8', xp_value:975, frequency:'Common',   habitat:'Forest, Hills', special_attacks:'Hug attack', description:'Powerful omnivores, dangerous when threatened.' },
    { name:'Lion',          type:'animal',    size:'large',  hit_dice:'5+2',  armor_class:6,  thac0:15, movement:'12', alignment:'n',  attacks:'3', damage:'1d4/1d4/2d6', xp_value:650, frequency:'Common',   habitat:'Plains, Savanna', description:'Apex predators of open grasslands.' },
    { name:'Giant Spider',  type:'monstrous', size:'large',  hit_dice:'4+4',  armor_class:4,  thac0:15, movement:'3/9', alignment:'n',  attacks:'1', damage:'2d4', xp_value:975, frequency:'Uncommon', habitat:'Caves, Forests', special_attacks:'Venom (save vs. poison)', description:'Web-spinning hunters of considerable size.' },
    { name:'Owlbear',       type:'monstrous', size:'large',  hit_dice:'5+2',  armor_class:5,  thac0:15, movement:'12', alignment:'n',  attacks:'3', damage:'1d6/1d6/2d6', xp_value:975, frequency:'Uncommon', habitat:'Forest', special_attacks:'Hug (2d8)', description:'Bear body, owl head — fierce territorial predator.' },
    { name:'Beholder',      type:'monstrous', size:'large',  hit_dice:'45hp', armor_class:0,  thac0:9,  movement:'3',  alignment:'le', attacks:'1', damage:'2d4', xp_value:10000, frequency:'Very Rare', habitat:'Dungeons', special_attacks:'10 eye rays', description:'Floating orb of many eyes. Central eye negates magic.' },
    { name:'Mind Flayer',   type:'monstrous', size:'medium', hit_dice:'8+4',  armor_class:5,  thac0:13, movement:'12', alignment:'le', attacks:'4', damage:'2d4(x4)', xp_value:3000, frequency:'Very Rare', habitat:'Underground', special_attacks:'Mind blast, brain extraction', description:'Psionic terror that consumes brains.' },
    { name:'Medusa',        type:'monstrous', size:'medium', hit_dice:'6',    armor_class:5,  thac0:15, movement:'9',  alignment:'le', attacks:'1', damage:'1d4', xp_value:1400, frequency:'Very Rare', habitat:'Ruins, Caves', special_attacks:'Petrifying gaze', description:'Snake-haired woman whose gaze turns flesh to stone.' },
    { name:'Basilisk',      type:'monstrous', size:'medium', hit_dice:'6+1',  armor_class:4,  thac0:13, movement:'6',  alignment:'n',  attacks:'1', damage:'1d10', xp_value:1400, frequency:'Uncommon', habitat:'Wilderness', special_attacks:'Petrifying gaze', description:'Eight-legged lizard whose gaze turns victims to stone.' },
    { name:'Cockatrice',    type:'monstrous', size:'small',  hit_dice:'5',    armor_class:6,  thac0:15, movement:'6/18', alignment:'n', attacks:'1', damage:'1d3', xp_value:975, frequency:'Uncommon', habitat:'Forests, Hills', special_attacks:'Petrification on hit', description:'Rooster-lizard hybrid that petrifies on touch.' },
    { name:'Manticore',     type:'monstrous', size:'large',  hit_dice:'6+3',  armor_class:4,  thac0:13, movement:'12/18', alignment:'le', attacks:'3', damage:'1d4/1d4/2d4', xp_value:975, frequency:'Uncommon', habitat:'Hills, Scrublands', special_attacks:'Tail spikes (1d6, x6)', description:'Lion body, human face, dragon wings, spike tail.' },
    { name:'Harpy',         type:'monstrous', size:'medium', hit_dice:'3',    armor_class:7,  thac0:17, movement:'6/15', alignment:'ce', attacks:'3', damage:'1d3/1d3/1d6', xp_value:270, frequency:'Uncommon', habitat:'Coasts, Ruins', special_attacks:'Charm song', description:'Winged women with deadly song.' },
    { name:'Griffon',       type:'monstrous', size:'large',  hit_dice:'7',    armor_class:3,  thac0:13, movement:'12/30', alignment:'n', attacks:'3', damage:'1d4/1d4/2d8', xp_value:2000, frequency:'Rare', habitat:'Mountains', description:'Eagle foreparts, lion hindquarters. Can be trained as a mount.' },
    { name:'Hippogriff',    type:'monstrous', size:'large',  hit_dice:'3+3',  armor_class:5,  thac0:17, movement:'18/36', alignment:'n', attacks:'3', damage:'1d6/1d6/1d10', xp_value:175, frequency:'Uncommon', habitat:'Hills, Mountains', description:'Horse and eagle hybrid. Faster and less aggressive than griffons.' },
    { name:'Pegasus',       type:'monstrous', size:'large',  hit_dice:'4',    armor_class:6,  thac0:17, movement:'24/48', alignment:'cg', attacks:'3', damage:'1d6/1d6/1d8', xp_value:650, frequency:'Rare', habitat:'Mountains, Forests', description:'Winged horse of good alignment.' },
    { name:'Unicorn',       type:'monstrous', size:'large',  hit_dice:'4+4',  armor_class:2,  thac0:15, movement:'24', alignment:'cg',  attacks:'3', damage:'1d6/1d6/1d8', xp_value:2000, frequency:'Rare', habitat:'Forests', special_defenses:'Magic resistance 25%', description:'Holy steed that can only be ridden by virgins.' },
    { name:'Centaur',       type:'monstrous', size:'large',  hit_dice:'4',    armor_class:5,  thac0:17, movement:'18', alignment:'ng',  attacks:'3', damage:'1d6/1d6/1d6', xp_value:420, frequency:'Uncommon', habitat:'Forests, Plains', description:'Half-human, half-horse beings of noble bearing.' },
    { name:'Minotaur',      type:'monstrous', size:'large',  hit_dice:'6+3',  armor_class:6,  thac0:13, movement:'12', alignment:'ce', attacks:'3', damage:'2d4/2d4/1d8', xp_value:975, frequency:'Uncommon', habitat:'Labyrinths', description:'Bull-headed man, never lost in mazes.' },
    { name:'Werewolf',      type:'lycanthrope', size:'medium', hit_dice:'4+3', armor_class:5, thac0:15, movement:'15', alignment:'ce', attacks:'1', damage:'2d4', xp_value:975, frequency:'Uncommon', habitat:'Any', special_defenses:'Silver or +1 to hit', description:'Cursed shapechanger that transmits lycanthropy by bite.' },
    { name:'Gelatinous Cube', type:'ooze',    size:'large',  hit_dice:'4',    armor_class:8,  thac0:17, movement:'6',  alignment:'n',  attacks:'1', damage:'2d4', xp_value:270, frequency:'Common',   habitat:'Dungeons', special_attacks:'Paralysis, engulf', description:'Transparent cube of acidic jelly cleaning dungeon corridors.' },
    { name:'Black Pudding',  type:'ooze',    size:'large',  hit_dice:'10',   armor_class:6,  thac0:11, movement:'6',  alignment:'n',  attacks:'1', damage:'3d8', xp_value:2000, frequency:'Uncommon', habitat:'Dungeons', special_attacks:'Dissolves metal, wood', description:'Dark acidic ooze that corrodes weapons and armor.' },
    { name:'Rust Monster',   type:'monstrous', size:'medium', hit_dice:'5',   armor_class:2,  thac0:15, movement:'18', alignment:'n',  attacks:'2', damage:'0/0',  xp_value:1400, frequency:'Uncommon', habitat:'Dungeons', special_attacks:'Rust metal on touch', description:'Insectoid creature that destroys metal equipment.' },
    { name:'Displacer Beast', type:'monstrous', size:'large', hit_dice:'6',   armor_class:4,  thac0:13, movement:'15', alignment:'le', attacks:'2', damage:'2d6/2d6', xp_value:975, frequency:'Uncommon', habitat:'Forest, Dungeons', special_defenses:'Displacement (-2 to hit)', description:'Six-legged panther with two whipping tentacles. Appears displaced.' },
    { name:'Carrion Crawler', type:'monstrous', size:'large', hit_dice:'3+1', armor_class:3/7, thac0:17, movement:'12', alignment:'n', attacks:'8', damage:'0(x8)', xp_value:650, frequency:'Common', habitat:'Dungeons', special_attacks:'Paralysis on each tentacle hit', description:'Long, pale, multi-legged scavenger with paralyzing tentacles.' },
    { name:'Gargoyle',      type:'monstrous', size:'medium', hit_dice:'4+4',  armor_class:5,  thac0:15, movement:'9/15', alignment:'ce', attacks:'4', damage:'1d3/1d3/1d6/1d4', xp_value:650, frequency:'Uncommon', habitat:'Ruins, Mountains', special_defenses:'+1 to hit', description:'Winged stone-like demon that lurks on architecture.' },
    { name:'Doppelganger',  type:'monstrous', size:'medium', hit_dice:'4',    armor_class:5,  thac0:17, movement:'9',  alignment:'n',  attacks:'1', damage:'1d12', xp_value:420, frequency:'Uncommon', habitat:'Any Urban', special_attacks:'Shape change to any humanoid', description:'Shapechanger that mimics any humanoid perfectly.' },
    { name:'Ettin',         type:'giant',     size:'large',  hit_dice:'10',   armor_class:3,  thac0:11, movement:'12', alignment:'ce', attacks:'2', damage:'2d8/3d6', xp_value:2000, frequency:'Rare', habitat:'Hills, Mountains', description:'Two-headed giant with attack from each head.' },
  ].map(m => ({
    ...m,
    source: m.source ?? 'MM',
    armor_profile_id: autoAssignArmorProfile(m),
    generated_hp: computeGeneratedHp(m),
    tags: m.type ? [m.type] : [],
  }));
}

// ── Insert a single monster ───────────────────────────────────────────────
async function insertMonster(client, m) {
  await client.query(
    `INSERT INTO monsters
       (name, source, hit_dice, hit_points, armor_class, thac0, movement,
        size, type, alignment, attacks, damage, special_attacks, special_defenses,
        save_as, morale, xp_value, description, habitat, frequency,
        armor_profile_id, generated_hp, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     ON CONFLICT DO NOTHING`,
    [
      m.name ?? null,
      m.source ?? 'MM',
      m.hit_dice ?? null,
      m.hit_points != null ? parseInt(m.hit_points) : null,
      m.armor_class != null ? parseInt(m.armor_class) : null,
      m.thac0 != null ? parseInt(m.thac0) : null,
      m.movement ?? null,
      m.size ?? null,
      m.type ?? null,
      m.alignment ?? null,
      m.attacks ?? null,
      m.damage ?? null,
      m.special_attacks ?? null,
      m.special_defenses ?? null,
      m.save_as ?? null,
      m.morale != null ? parseInt(m.morale) : null,
      m.xp_value != null ? parseInt(m.xp_value) : null,
      m.description ?? null,
      m.habitat ?? null,
      m.frequency ?? null,
      m.armor_profile_id ?? 'dense_flesh',
      m.generated_hp ?? null,
      m.tags ?? [],
    ],
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  AD&D Monster Import                                  ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  if (DRY_RUN)  console.log('  ⚑  DRY RUN — no data will be written\n');
  if (LIMIT < Infinity) console.log(`  ⚑  LIMIT — importing first ${LIMIT} monsters\n`);

  // 1. Fetch data
  let rawMonsters = null;
  for (const url of SOURCE_URLS) {
    try {
      rawMonsters = await fetchFromUrl(url);
      console.log(`  ✓  Fetched ${rawMonsters.length} monsters from ${url}\n`);
      break;
    } catch (err) {
      console.log(`  ✗  Failed: ${err.message}`);
    }
  }

  let monsters;
  if (rawMonsters) {
    monsters = rawMonsters.map(normalize).filter(m => m.name);
  } else {
    console.log('\n  ⚑  All URLs failed — using hardcoded fallback data (50 monsters)\n');
    monsters = getFallbackMonsters();
  }

  // Apply limit
  if (LIMIT < Infinity) monsters = monsters.slice(0, LIMIT);

  // 2. Dry run preview
  if (DRY_RUN) {
    console.log('  Preview (first 10):\n');
    monsters.slice(0, 10).forEach((m, i) => {
      console.log(`  [${i+1}] ${m.name} | ${m.type ?? '—'} | ${m.size ?? '—'} | HD:${m.hit_dice ?? '—'} | AC:${m.armor_class ?? '—'} | Profile:${m.armor_profile_id}`);
    });
    console.log(`\n  Total: ${monsters.length} monsters would be imported.\n`);
    await pool.end();
    return;
  }

  // 3. Import
  const client = await pool.connect();
  let imported = 0, skipped = 0, errors = 0;

  try {
    await client.query('BEGIN');

    for (const m of monsters) {
      try {
        await insertMonster(client, m);
        console.log(`  ✓  ${m.name} [${m.type ?? '?'} / ${m.size ?? '?'}] → ${m.armor_profile_id}`);
        imported++;
      } catch (err) {
        console.log(`  ✗  ${m.name}: ${err.message}`);
        errors++;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[FATAL] Transaction rolled back:', err.message);
    errors += monsters.length - imported;
  } finally {
    client.release();
  }

  console.log('\n╔══════════════════════════════════╗');
  console.log(`║  Imported : ${String(imported).padStart(4)}                  ║`);
  console.log(`║  Skipped  : ${String(skipped).padStart(4)}  (already exist)  ║`);
  console.log(`║  Errors   : ${String(errors).padStart(4)}                  ║`);
  console.log('╚══════════════════════════════════╝\n');

  await pool.end();
}

main().catch(err => {
  console.error('[import-monsters] Fatal:', err.message);
  process.exit(1);
});
