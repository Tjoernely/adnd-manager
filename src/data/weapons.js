// data/weapons.js — AD&D 2nd Edition weapon groups, mastery, styles, and combat tables

// Weapon CP costs per class group (from combined S&P + Combat & Tactics rules, Excel Tab 1)
// single = one weapon prof; tight = tight group; broad = broad group; shield/armor = special profs
// S&P p.163: single = 1 slot; tight group = 2 slots; broad group = 3 slots
// Warrior: 2 CP/slot. Priest/Rogue/Wizard: 3 CP/slot.
export const WEAP_COSTS = {
  warrior: { single:2, tight:4, broad:6, shield:2, armor:2 },
  rogue:   { single:3, tight:6, broad:9, shield:6, armor:3 },
  priest:  { single:3, tight:6, broad:9, shield:6, armor:3 },
  wizard:  { single:3, tight:6, broad:9, shield:6, armor:3 },
};
export const getWeapCost = (classGroup, level) => (WEAP_COSTS[classGroup] ?? WEAP_COSTS.rogue)[level] ?? 3;

// Legacy: single-weapon slot cost (used in a few display spots)
export const weapSlotCost = (classGroup) => classGroup === "warrior" ? 2 : 3;

// ── S&P p.163 weapon tier system ─────────────────────────────────────────────
// Tier 1 — Wizard weapons (no surcharge for any class)
export const WEAP_TIER_1 = new Set([
  // Daggers & Knives
  "we_dagger", "we_stiletto", "we_jambiya", "we_main_gauche", "we_parry_dagger", "we_knife", "we_katar",
  // Dagger/knife dupes in other sword groups
  "ws_dagger_sw",       // Dagger in Short Swords
  "ws_main_gauche_f",   // Main-Gauche in Fencing
  "ws_parry_dag_f",     // Parrying Dagger in Fencing
  // Quarterstaff, Sling
  "wm_staff", "wm_sling",
  // Dart (in Spears & Javelins group)
  "wh_dart",
]);

// Tier 2 — Rogue/Priest weapons (wizard pays +2 surcharge)
export const WEAP_TIER_2 = new Set([
  // Clubs tight group
  "wc_club", "wc_war_club", "wc_great_club", "wc_ankus", "wc_morning_star",
  // Maces tight group
  "wc_foot_mace", "wc_horse_mace",
  // Flails tight group
  "wc_horse_flail", "wc_foot_flail",
  // Mace-Axe (in both Axes and Maces groups)
  "wa_mace_axe", "wc_mace_axe",
  // Hammers tight group
  "wa_war_hammer", "wa_maul", "wa_sledge",
  // Hand Crossbow only
  "wd_hand_xbow",
  // Short Bow (not Long Bow or Composite Long Bow)
  "wb_short_bow", "wb_comp_short",
  // Broadsword (all dupe instances)
  "ws_broadsword", "ws_broadsword_r", "ws_broadsword_m",
  // Short Sword (all dupe instances)
  "ws_short_sword", "ws_short_sword_me", "ws_short_sword_s",
  // Bo Stick
  "wj_bo_stick",
]);
// Tier 3 — Warrior weapons (rogue/priest pay +1, wizard pays +3): everything not in T1 or T2

// Return tier (1, 2, or 3) for a weapon ID
export function getWeapTier(weapId) {
  if (WEAP_TIER_1.has(weapId)) return 1;
  if (WEAP_TIER_2.has(weapId)) return 2;
  return 3;
}

// Single-weapon CP cost based on class and tier (S&P p.163 restriction rules)
// Warrior: always 2. Rogue/Priest: T1/T2=3, T3=4. Wizard: T1=3, T2=5, T3=6.
export function getWeapSingleCostByTier(classGroup, tier) {
  if (classGroup === "warrior") return 2;
  if (classGroup === "rogue" || classGroup === "priest") return tier <= 2 ? 3 : 4;
  if (classGroup === "wizard") {
    if (tier === 1) return 3;
    if (tier === 2) return 5;
    return 6;
  }
  return 3; // fallback (e.g. null classGroup)
}

// Returns the highest tier of any weapon in a tight or broad group
export function getGroupMaxTier(groupId) {
  for (const bg of WEAPON_GROUPS_49) {
    if (bg.id === groupId) {
      const allWeaps = [...bg.tightGroups.flatMap(tg => tg.weapons), ...bg.unrelated];
      return allWeaps.reduce((max, w) => Math.max(max, getWeapTier(w.id)), 1);
    }
    for (const tg of bg.tightGroups) {
      if (tg.id === groupId) {
        return tg.weapons.reduce((max, w) => Math.max(max, getWeapTier(w.id)), 1);
      }
    }
  }
  return 3; // default if not found
}

// Badge color for a weapon given its tier and the class group
// "green" = no surcharge, "yellow" = small surcharge (+1/+2), "red" = large surcharge (+3)
export function getWeapBadgeColor(classGroup, tier) {
  if (classGroup === "warrior") return "green";
  if (classGroup === "rogue" || classGroup === "priest") {
    return tier <= 2 ? "green" : "yellow";
  }
  if (classGroup === "wizard") {
    if (tier === 1) return "green";
    if (tier === 2) return "yellow";
    return "red";
  }
  return "green";
}

// Human-readable tier name
const TIER_CLASS_NAME = { 1: "Wizard", 2: "Rogue/Priest", 3: "Warrior" };

// Hover tooltip explaining the surcharge for a weapon
export function getWeapCostTooltip(classGroup, tier, weapName) {
  const base = classGroup === "warrior" ? 2 : 3;
  const cost = getWeapSingleCostByTier(classGroup, tier);
  const surcharge = cost - base;
  const tierLabel = TIER_CLASS_NAME[tier];
  if (surcharge === 0) return `${weapName} is a ${tierLabel} weapon. No surcharge for this class. Cost: ${cost} CP.`;
  return `${weapName} is a ${tierLabel} weapon. This class pays +${surcharge} CP surcharge. Total: ${cost} CP.`;
}

// ── Table 49: Weapon Groups (S&P p.168) ─────────────────────────────
export const WEAPON_GROUPS_49 = [
  {
    id:"wg_axe_ph", broad:"Axes, Picks & Hammers",
    tightGroups: [
      { id:"tg_axes",    name:"Axes",    weapons:[
        {id:"wa_battle_axe",   name:"Battle Axe"},
        {id:"wa_hand_axe",     name:"Hand/Throwing Axe"},
        {id:"wa_hatchet",      name:"Hatchet"},
        {id:"wa_2h_axe",       name:"Two-Handed Axe"},
        {id:"wa_sword_axe",    name:"Sword-Axe"},
        {id:"wa_mace_axe",     name:"Mace-Axe"},
      ]},
      { id:"tg_picks",   name:"Picks",   weapons:[
        {id:"wa_horse_pick",   name:"Horseman's Pick"},
        {id:"wa_foot_pick",    name:"Footman's Pick"},
        {id:"wa_pick",         name:"Pick"},
      ]},
      { id:"tg_hammers", name:"Hammers", weapons:[
        {id:"wa_war_hammer",   name:"War Hammer"},
        {id:"wa_maul",         name:"Maul"},
        {id:"wa_sledge",       name:"Sledge"},
      ]},
    ],
    unrelated:[{id:"wa_adze", name:"Adze"}],
  },
  {
    id:"wg_bows", noBroad:true, broad:"Bows",
    tightGroups:[
      { id:"tg_bows", name:"Bows", weapons:[
        {id:"wb_short_bow",    name:"Short Bow"},
        {id:"wb_comp_short",   name:"Composite Short Bow"},
        {id:"wb_long_bow",     name:"Long Bow"},
        {id:"wb_comp_long",    name:"Composite Long Bow"},
      ]},
    ],
    unrelated:[],
  },
  {
    id:"wg_clubs_maces", broad:"Clubs, Maces & Flails",
    tightGroups:[
      { id:"tg_maces",  name:"Maces",  weapons:[
        {id:"wc_foot_mace",    name:"Footman's Mace"},
        {id:"wc_horse_mace",   name:"Horseman's Mace"},
        {id:"wc_mace_axe",     name:"Mace-Axe", dupe:true},
      ]},
      { id:"tg_clubs",  name:"Clubs",  weapons:[
        {id:"wc_club",         name:"Club"},
        {id:"wc_great_club",   name:"Great Club"},
        {id:"wc_war_club",     name:"War Club"},
        {id:"wc_ankus",        name:"Ankus"},
        {id:"wc_morning_star", name:"Morning Star"},
      ]},
      { id:"tg_flails", name:"Flails", weapons:[
        {id:"wc_horse_flail",  name:"Horseman's Flail"},
        {id:"wc_foot_flail",   name:"Footman's Flail"},
      ]},
    ],
    unrelated:[],
  },
  {
    id:"wg_crossbows", noBroad:true, broad:"Crossbows",
    tightGroups:[
      { id:"tg_crossbows", name:"Crossbows", weapons:[
        {id:"wd_hand_xbow",    name:"Hand Crossbow"},
        {id:"wd_light_xbow",   name:"Light Crossbow"},
        {id:"wd_heavy_xbow",   name:"Heavy Crossbow"},
        {id:"wd_pellet_bow",   name:"Pellet Bow"},
        {id:"wd_cho_ku_no",    name:"Cho-Ku-No"},
      ]},
    ],
    unrelated:[],
  },
  {
    id:"wg_daggers", noBroad:true, broad:"Daggers & Knives",
    tightGroups:[
      { id:"tg_daggers", name:"Daggers & Knives", weapons:[
        {id:"we_dagger",       name:"Dagger"},
        {id:"we_stiletto",     name:"Stiletto"},
        {id:"we_jambiya",      name:"Jambiya"},
        {id:"we_main_gauche",  name:"Main-Gauche"},
        {id:"we_parry_dagger", name:"Parrying Dagger"},
        {id:"we_knife",        name:"Knife"},
        {id:"we_katar",        name:"Katar"},
      ]},
    ],
    unrelated:[],
  },
  {
    id:"wg_lances", noBroad:true, broad:"Lances",
    tightGroups:[
      { id:"tg_lances", name:"Lances", weapons:[
        {id:"wf_lance_light",  name:"Lance, Light"},
        {id:"wf_lance_med",    name:"Lance, Medium"},
        {id:"wf_lance_heavy",  name:"Lance, Heavy"},
        {id:"wf_lance_joust",  name:"Lance, Jousting"},
      ]},
    ],
    unrelated:[],
  },
  {
    id:"wg_polearms", broad:"Polearms",
    tightGroups:[
      { id:"tg_spear_poles",  name:"Spear-like Polearms", weapons:[
        {id:"wg_awl_pike",     name:"Awl Pike"},
        {id:"wg_partisan",     name:"Partisan"},
        {id:"wg_ranseur",      name:"Ranseur"},
        {id:"wg_spetum",       name:"Spetum"},
      ]},
      { id:"tg_poleaxes",     name:"Poleaxes", weapons:[
        {id:"wg_bardiche",     name:"Bardiche"},
        {id:"wg_halberd",      name:"Halberd"},
        {id:"wg_voulge",       name:"Voulge"},
      ]},
      { id:"tg_bills",        name:"Bills", weapons:[
        {id:"wg_bill",         name:"Bill"},
        {id:"wg_bill_guis",    name:"Bill-Guisarme"},
        {id:"wg_glaive_guis",  name:"Glaive-Guisarme"},
        {id:"wg_hook_fauchard",name:"Hook Fauchard"},
        {id:"wg_guis_voulge",  name:"Guisarme-Voulge"},
      ]},
      { id:"tg_glaives",      name:"Glaives", weapons:[
        {id:"wg_glaive",       name:"Glaive"},
        {id:"wg_fauchard",     name:"Fauchard"},
        {id:"wg_naginata",     name:"Naginata"},
        {id:"wg_nagimaki",     name:"Nagimaki"},
        {id:"wg_fauchard_fork",name:"Fauchard-Fork"},
      ]},
      { id:"tg_beaked",       name:"Beaked Polearms", weapons:[
        {id:"wg_bec_de_corbin",name:"Bec de Corbin"},
        {id:"wg_lucern",       name:"Lucern Hammer"},
      ]},
    ],
    unrelated:[
      {id:"wg_mil_fork",     name:"Military Fork"},
      {id:"wg_tetsubo",      name:"Tetsubo"},
      {id:"wg_lajatang",     name:"Lajatang"},
    ],
  },
  {
    id:"wg_spears", broad:"Spears & Javelins",
    tightGroups:[
      { id:"tg_spears",   name:"Spears",   weapons:[
        {id:"wh_spear",        name:"Spear"},
        {id:"wh_long_spear",   name:"Long Spear"},
        {id:"wh_awl_pike2",    name:"Awl Pike"},
      ]},
      { id:"tg_javelins", name:"Javelins", weapons:[
        {id:"wh_javelin",      name:"Javelin"},
        {id:"wh_pilum",        name:"Pilum"},
        {id:"wh_dart",         name:"Dart"},
      ]},
    ],
    unrelated:[
      {id:"wh_harpoon",      name:"Harpoon"},
      {id:"wh_trident",      name:"Trident"},
      {id:"wh_brandistock",  name:"Brandistock"},
    ],
  },
  {
    id:"wg_swords", broad:"Swords",
    tightGroups:[
      { id:"tg_sw_ancient",  name:"Ancient Swords",      weapons:[
        {id:"ws_broadsword",      name:"Broadsword"},
        {id:"ws_sapara",          name:"Sapara"},
        {id:"ws_khopesh",         name:"Khopesh"},
        {id:"ws_sword_axe",       name:"Sword-Axe"},
        {id:"ws_short_sword",     name:"Short Sword"},
      ]},
      { id:"tg_sw_roman",    name:"Roman Swords",         weapons:[
        {id:"ws_broadsword_r",    name:"Broadsword",        dupe:true},
        {id:"ws_drusus",          name:"Drusus"},
        {id:"ws_gladius",         name:"Gladius"},
        {id:"ws_spatha",          name:"Spatha"},
      ]},
      { id:"tg_sw_mideast",  name:"Middle Eastern Swords", weapons:[
        {id:"ws_short_sword_me",  name:"Short Sword",       dupe:true},
        {id:"ws_scimitar",        name:"Scimitar"},
        {id:"ws_great_scimitar_me",name:"Great Scimitar",   dupe:true},
        {id:"ws_tulwar",          name:"Tulwar"},
      ]},
      { id:"tg_sw_oriental", name:"Oriental Swords",      weapons:[
        {id:"ws_cutlass",         name:"Cutlass"},
        {id:"ws_katana",          name:"Katana"},
        {id:"ws_wakizashi",       name:"Wakizashi"},
        {id:"ws_no_dachi",        name:"No-Dachi"},
        {id:"ws_ninja_to",        name:"Ninja-to"},
      ]},
      { id:"tg_sw_short",    name:"Short Swords",          weapons:[
        {id:"ws_short_sword_s",   name:"Short Sword",       dupe:true},
        {id:"ws_gladius_s",       name:"Gladius",           dupe:true},
        {id:"ws_drusus_s",        name:"Drusus",            dupe:true},
        {id:"ws_sapara_s",        name:"Sapara",            dupe:true},
        {id:"ws_dagger_sw",       name:"Dagger",            dupe:true},
        {id:"ws_tulwar_s",        name:"Tulwar",            dupe:true},
      ]},
      { id:"tg_sw_medium",   name:"Medium Swords",         weapons:[
        {id:"ws_broadsword_m",    name:"Broadsword",        dupe:true},
        {id:"ws_long_sword",      name:"Long Sword"},
        {id:"ws_cutlass_m",       name:"Cutlass",           dupe:true},
        {id:"ws_sabre",           name:"Sabre"},
        {id:"ws_falchion",        name:"Falchion"},
        {id:"ws_estoc",           name:"Estoc"},
      ]},
      { id:"tg_sw_large",    name:"Large Swords",          weapons:[
        {id:"ws_bastard_sword",   name:"Bastard Sword"},
        {id:"ws_claymore",        name:"Claymore"},
        {id:"ws_2h_sword",        name:"Two-Handed Sword"},
        {id:"ws_great_scimitar",  name:"Great Scimitar"},
        {id:"ws_no_dachi_l",      name:"No-Dachi",          dupe:true},
      ]},
      { id:"tg_sw_fencing",  name:"Fencing Weapons",       weapons:[
        {id:"ws_rapier",          name:"Rapier"},
        {id:"ws_sabre_f",         name:"Sabre",             dupe:true},
        {id:"ws_main_gauche_f",   name:"Main-Gauche",       dupe:true},
        {id:"ws_parry_dag_f",     name:"Parrying Dagger",   dupe:true},
      ]},
    ],
    unrelated:[],
  },
  {
    id:"wg_chain", noBroad:true, broad:"Chain & Rope Weapons",
    tightGroups:[
      { id:"tg_chain", name:"Chain & Rope", weapons:[
        {id:"wi_chain",        name:"Chain"},
        {id:"wi_kau_sin_ke",   name:"Kau Sin Ke"},
        {id:"wi_kusari_gama",  name:"Kusari-Gama"},
        {id:"wi_kawanaga",     name:"Kawanaga"},
        {id:"wi_chijikiri",    name:"Chijikiri"},
      ]},
    ],
    unrelated:[],
  },
  {
    id:"wg_martial", noBroad:true, broad:"Martial Arts Weapons",
    tightGroups:[
      { id:"tg_martial", name:"Martial Arts", weapons:[
        {id:"wj_sai",          name:"Sai"},
        {id:"wj_jitte",        name:"Jitte"},
        {id:"wj_nunchaku",     name:"Nunchaku"},
        {id:"wj_sang_kauw",    name:"Sang Kauw"},
        {id:"wj_3piece_rod",   name:"Three-Piece Rod"},
        {id:"wj_bo_stick",     name:"Bo Stick"},
      ]},
    ],
    unrelated:[],
  },
  {
    id:"wg_misc", noBroad:true, broad:"Individual / Ungrouped Weapons",
    tightGroups:[],
    unrelated:[
      {id:"wm_staff",        name:"Quarterstaff"},
      {id:"wm_sling",        name:"Sling"},
      {id:"wm_whip",         name:"Whip"},
      {id:"wm_net",          name:"Net"},
      {id:"wm_blowgun",      name:"Blowgun"},
      {id:"wm_bolas",        name:"Bolas"},
      {id:"wm_boomerang",    name:"Boomerang"},
      {id:"wm_throwing_star",name:"Throwing Star / Shuriken"},
    ],
  },
  {
    id:"wg_firearms", broad:"Firearms",
    tightGroups:[
      { id:"tg_firearms_hand",  name:"Hand Match Weapons", weapons:[
          {id:"wf_arquebus_h",  name:"Arquebus"}, {id:"wf_hand_gunne",   name:"Hand Gunne"},
        ]},
      { id:"tg_firearms_match", name:"Matchlocks", weapons:[
          {id:"wf_arquebus_m",     name:"Arquebus",              dupe:true},
          {id:"wf_caliver",        name:"Caliver (matchlock)"},
          {id:"wf_musket_m",       name:"Musket (matchlock)"},
        ]},
      { id:"tg_firearms_wheel", name:"Wheellocks", weapons:[
          {id:"wf_arquebus_w",     name:"Arquebus",              dupe:true},
          {id:"wf_belt_pistol_w",  name:"Belt Pistol (wheellock)"},
          {id:"wf_horse_pistol_w", name:"Horse Pistol (wheellock)"},
        ]},
      { id:"tg_firearms_snap",  name:"Snaplocks & Flintlocks", weapons:[
          {id:"wf_musket_s",    name:"Musket (snaplock/flintlock)"},
          {id:"wf_belt_pistol_s",  name:"Belt Pistol (snaplock/flintlock)"},
          {id:"wf_horse_pistol_s", name:"Horse Pistol (snaplock/flintlock)"},
        ]},
    ],
    unrelated:[],
  },
  {
    id:"wg_special", broad:"Special Proficiencies",
    tightGroups:[],
    unrelated:[
      {id:"wsp_shield_buckler", name:"Shield Prof: Buckler (+1 AC, 1 attacker)", level:"shield"},
      {id:"wsp_shield_small",   name:"Shield Prof: Small (+2 AC, 2 attackers)",  level:"shield"},
      {id:"wsp_shield_medium",  name:"Shield Prof: Medium (+3 AC, 3 attackers)", level:"shield"},
      {id:"wsp_shield_body",    name:"Shield Prof: Body (+3/+4 vs missile, 4 attackers)", level:"shield"},
      {id:"wsp_armor",          name:"Armor Proficiency (halves encumbrance of chosen armor)", level:"armor"},
    ],
  },

];

// Flatten all individual weapon IDs for state tracking
export const ALL_WEAPON_IDS = WEAPON_GROUPS_49.flatMap(bg => [
  ...bg.tightGroups.flatMap(tg => tg.weapons.map(w=>w.id)),
  ...bg.unrelated.map(w=>w.id),
]);
export const ALL_TIGHT_GROUP_IDS = WEAPON_GROUPS_49.flatMap(bg => bg.tightGroups.map(tg=>tg.id));
export const ALL_BROAD_GROUP_IDS = WEAPON_GROUPS_49.map(bg=>bg.id);

// Compat alias
export const WEAPON_GROUPS = WEAPON_GROUPS_49;

// ═══════════════════════════════════════════════════════════════════
//  CHAPTER 8 — SPECIALIZATION & MASTERY (Combat & Tactics + S&P)
// ═══════════════════════════════════════════════════════════════════

// Maps app class IDs → specialization column
export const specCol = (classId) => {
  if (classId === "fighter")                        return "fighter";
  if (classId === "ranger" || classId === "paladin") return "rp";
  if (classId === "thief"  || classId === "bard")    return "rogue";
  if (classId === "cleric" || classId === "druid")   return "priest";
  if (["mage","illusionist","specialist"].includes(classId)) return "wizard";
  return "rogue";
};

// Mastery tiers. cp/minLevel keyed by specCol values.
// cp = additional CP cost for that tier; cumulative (you must pay each tier to progress).
export const MASTERY_TIERS = [
  { id:"expertise",
    name:"Expertise",
    note:"Alternative to Specialization (Ranger/Paladin+)",
    cp:     { fighter:null, rp:2,  rogue:4,  priest:3,  wizard:5  },
    minLvl: { fighter:null, rp:3,  rogue:6,  priest:5,  wizard:7  },
    hit:0, dmgM:0, dmgR:0, crit:"-",
    desc:"Grants same number of attacks as Specialization without the hit/damage bonus. Can't be taken by fighters.",
    types:["melee","ranged"],
  },
  { id:"spec",
    name:"Specialization",
    note:"Base tier",
    cp:     { fighter:2, rp:4,  rogue:8,  priest:6,  wizard:10 },
    minLvl: { fighter:1, rp:3,  rogue:6,  priest:5,  wizard:7  },
    hit:1, dmgM:2, dmgR:"*2 (+2 short range)", crit:"-",
    desc:"Adds +1 to hit and +2 dmg (melee) or +2 dmg at short range (ranged). Grants extra attacks (see number of attacks table).",
    types:["melee","ranged"],
  },
  { id:"mastery",
    name:"Mastery",
    note:"Requires training from a Weapon Master",
    cp:     { fighter:4, rp:8,  rogue:12, priest:10, wizard:14 },
    minLvl: { fighter:5, rp:7,  rogue:10, priest:9,  wizard:11 },
    hit:3, dmgM:3, dmgR:"*3 (+3 close range)", crit:"19–20 (×5)",
    desc:"Melee: +3/+3, Expertise in other weapons in same tight group. Ranged: +3/+3 close range, ignore armor – half grace dmg of target's armor. Crit 19+×5.",
    types:["melee","ranged"],
  },
  { id:"highmastery",
    name:"High Mastery",
    note:"Requires training from a High Weapon Master",
    cp:     { fighter:4, rp:8,  rogue:12, priest:10, wizard:14 },
    minLvl: { fighter:9, rp:11, rogue:14, priest:13, wizard:15 },
    hit:null, dmgM:null, dmgR:null, crit:"18–20 (×6)",
    desc:"Melee: Weapon speed halved. Ranged: Extreme range (+⅓ max range, –10 to hit). Crit 18+×6.",
    types:["melee","ranged"],
  },
  { id:"grandmastery",
    name:"Grand Mastery",
    note:"Quest required + training from a Grand Weapon Master",
    cp:     { fighter:4, rp:8,  rogue:12, priest:10, wizard:14 },
    minLvl: { fighter:13, rp:15, rogue:18, priest:17, wizard:19 },
    hit:null, dmgM:null, dmgR:null, crit:"17–20 (×7)",
    desc:"Extra attack. Damage dice size increased (e.g. 2d6 → 2d8). Crit 17+×7.",
    types:["melee","ranged"],
  },
];

// Fighting Style Specializations. cp keyed fighter/rp/rogue/priest/wizard.
// "enhanced" versions replace the basic (cumulative additional cost shown).
export const STYLE_SPECS = [
  { id:"1h",       name:"One-Handed Weapon",
    cp:{ fighter:2, rp:2, rogue:3, priest:3, wizard:4 },
    hit:0, dmg:0, ini:0, ac:1,
    desc:"+1 AC (shield hand empty). Enhanced gives +2 AC.",
    hasEnhanced:true,
    enhCp:{ fighter:4, rp:4, rogue:5, priest:5, wizard:6 },
    enhAC:2,
  },
  { id:"2h",       name:"Two-Handed Weapon",
    cp:{ fighter:2, rp:2, rogue:3, priest:3, wizard:4 },
    hit:"*+1", dmg:0, ini:-3, ac:0,
    desc:"–3 speed factor bonus. *+1 damage when using a one-handed weapon in two hands.",
    hasEnhanced:false,
  },
  { id:"2w",       name:"Two-Weapon",
    cp:{ fighter:2, rp:2, rogue:3, priest:3, wizard:4 },
    hit:0, dmg:0, ini:0, ac:0,
    desc:"Reduced attack penalties: 0 / –2. Off-hand weapon must be smaller than main hand. Enhanced: no off-hand size restriction.",
    hasEnhanced:true,
    enhCp:{ fighter:4, rp:4, rogue:5, priest:5, wizard:6 },
  },
  { id:"shield",   name:"Weapon & Shield",
    cp:{ fighter:2, rp:2, rogue:3, priest:3, wizard:6 },
    hit:0, dmg:0, ini:0, ac:0,
    desc:"Allows 1 free Shield Punch per round. Standard two-weapon penalty applies (–2/–4).",
    hasEnhanced:false,
  },
  { id:"missile",  name:"Missile / Thrown / Ranged",
    cp:{ fighter:2, rp:2, rogue:3, priest:3, wizard:6 },
    hit:0, dmg:0, ini:0, ac:"*+1",
    desc:"+1 AC vs ranged attacks. ½ move: all attacks. Full move: ½ attacks.",
    hasEnhanced:false,
  },
  { id:"stylespec",name:"Style Specialization (DM negotiated)",
    cp:{ fighter:2, rp:2, rogue:3, priest:3, wizard:4 },
    hit:null, dmg:null, ini:null, ac:null,
    desc:"One custom benefit negotiated with DM: –1 AC bonus; +1 to hit; free block/trap maneuver; negate two-weapon penalties; or free unarmed punch/kick.",
    hasEnhanced:false,
  },
];

// Weapon of Choice: costs and bonuses
export const WOC_CP = { fighter:2, rp:2, rogue:3, priest:3, wizard:4 };
export const WOC_BONUS = { hit:1, dmg:0, ini:0, ac:0 };

// Number of Attacks table (for reference display in Tab VIII)
export const NUM_ATTACKS = [
  { rate:"½",   weapon:"Melee Weapons (generic)",      lv1:"3/2", lv7:"2/1", lv13:"5/2" },
  { rate:"½",   weapon:"Blowgun",                      lv1:"2/1", lv7:"5/2", lv13:"3/1" },
  { rate:"½",   weapon:"Bolas",                        lv1:"1/1", lv7:"3/2", lv13:"2/1" },
  { rate:1,     weapon:"Bows",                         lv1:"2/1", lv7:"3/1", lv13:"4/1" },
  { rate:"½",   weapon:"Hand Crossbow",                lv1:"1/1", lv7:"3/2", lv13:"2/1" },
  { rate:"½",   weapon:"Light Crossbow",               lv1:"1/1", lv7:"3/2", lv13:"2/1" },
  { rate:"½",   weapon:"Heavy Crossbow",               lv1:"1/2", lv7:"1/1", lv13:"3/2" },
  { rate:"½",   weapon:"Stonebow",                     lv1:"1/1", lv7:"3/2", lv13:"2/1" },
  { rate:"½",   weapon:"Repeating Crossbow",           lv1:"2/1", lv7:"5/2", lv13:"3/1" },
  { rate:1,     weapon:"Thrown Dagger / Knife",        lv1:"3/1", lv7:"4/1", lv13:"5/1" },
  { rate:1,     weapon:"Thrown Dart",                  lv1:"4/1", lv7:"5/1", lv13:"6/1" },
  { rate:"1/3", weapon:"Arquebus",                     lv1:"1/3", lv7:"1/2", lv13:"1/1" },
  { rate:"½",   weapon:"Matchlocks",                   lv1:"1/2", lv7:"1/1", lv13:"3/2" },
  { rate:"½",   weapon:"Snaplocks / Flintlocks",       lv1:"1/1", lv7:"3/2", lv13:"2/1" },
  { rate:"½",   weapon:"Wheellock Belt Pistol",        lv1:"1/1", lv7:"3/2", lv13:"2/1" },
  { rate:"½",   weapon:"Wheellock Horse Pistol",       lv1:"1/2", lv7:"1/1", lv13:"3/2" },
  { rate:"½",   weapon:"Javelin",                      lv1:"3/2", lv7:"2/1", lv13:"5/2" },
  { rate:"½",   weapon:"Sling",                        lv1:"3/2", lv7:"2/1", lv13:"5/2" },
  { rate:"½",   weapon:"Staff Sling",                  lv1:"1/1", lv7:"3/2", lv13:"2/1" },
  { rate:1,     weapon:"Shuriken",                     lv1:"3/1", lv7:"4/1", lv13:"5/1" },
  { rate:"½",   weapon:"Other Thrown Weapons",         lv1:"1/1", lv7:"3/2", lv13:"2/1" },
];

// Cross-group name lookup: weapon display name → all weapon IDs sharing that name
// Used to highlight a weapon across all groups when proficiency is obtained
export const WEAPON_NAME_TO_IDS = (() => {
  const map = {};
  WEAPON_GROUPS_49.forEach(bg => {
    const addW = (w) => {
      // Normalize name for matching (lowercase, strip punctuation)
      const key = w.name.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
      if (!map[key]) map[key] = [];
      if (!map[key].includes(w.id)) map[key].push(w.id);
    };
    bg.tightGroups.forEach(tg => tg.weapons.forEach(addW));
    bg.unrelated.forEach(addW);
  });
  return map;
})();

// For a given weapon ID, return all IDs of weapons with the same name (across all groups)
export const getWeaponSiblings = (weapId) => {
  let name = null;
  WEAPON_GROUPS_49.forEach(bg => {
    [...bg.tightGroups.flatMap(tg=>tg.weapons), ...bg.unrelated].forEach(w => {
      if (w.id === weapId) name = w.name.toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
    });
  });
  return name ? (WEAPON_NAME_TO_IDS[name] ?? [weapId]) : [weapId];
};
export const ALL_WEAPONS = ALL_WEAPON_IDS.map(id => ({id, cp:1})); // for compat
