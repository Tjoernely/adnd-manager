import { readFileSync, writeFileSync } from 'fs';

function deGarble(str) {
  if (!str || typeof str !== 'string') return str;
  if (!/[a-zA-Z] [a-zA-Z]/.test(str)) return str;
  return str.split(/   /).map(t => t.replace(/ /g, '')).filter(t => t.length).join(' ').trim();
}

// Apply deGarble to all "value" strings in a text block using a simple approach
function deGarbleSection(text) {
  // Split on double-quotes to find string content
  const parts = text.split('"');
  for (let i = 1; i < parts.length; i += 2) {
    parts[i] = deGarble(parts[i]);
  }
  return parts.join('"');
}

let raw = readFileSync('src/data/kits.js', 'utf8');

const druStart = raw.indexOf('druid: [');
const thiStart = raw.indexOf('thief: [');
raw = raw.slice(0, druStart) + deGarbleSection(raw.slice(druStart, thiStart)) + raw.slice(thiStart);

const thiStart2 = raw.indexOf('thief: [');
const barStart  = raw.indexOf('bard: [');
raw = raw.slice(0, thiStart2) + deGarbleSection(raw.slice(thiStart2, barStart)) + raw.slice(barStart);

// Clean "--" prefix from array items
raw = raw.replace(/"--+\s*([a-zA-Z(])/g, (_, c) => '"' + c);

// Fix druid wealth fields - truncate at gp.
raw = raw.replace(/(wealth:"[^"]*?gp\.)/g, '$1');

// spk_scout
raw = raw.replace(
  'nwpRequired: ["Tracking","Survival"],    nwpRecommended: ["fire-building"',
  'nwpRequired: ["Tracking","Survival"],    nwpRecommended: ["direction sense","weather sense","fire-building"'
);
// spk_soldier
raw = raw.replace(
  'nwpRecommended: ["history","fire-building","animal handling"',
  'nwpRecommended: ["direction sense","history","fire-building","animal handling"'
);
// spk_mariner
raw = raw.replace(
  'nwpRequired: ["Seamanship","Navigation"],    nwpRecommended: ["swimming","rope use","fishing"]',
  'nwpRequired: ["Seamanship","Navigation"],    nwpRecommended: ["weather sense","swimming","rope use","fishing"]'
);
// militant wizard
raw = raw.replace(
  'id: "mag_militant-wizard", name: "Militant Wizard",',
  'id: "mag_militant-wizard", name: "Militant Wizard",      kitBonusCP: 3,'
);
// pathfinder
raw = raw.replace(
  'benefits: ") .",      hindrances: "By moving ahead of the party',
  'benefits: "Pathfinders gain +2 bonus to all NWP checks involving tracking, navigation, or direction sense in wilderness settings. They may never become lost outdoors and automatically determine direction without a roll. They also travel 20% faster through wilderness terrain.",      hindrances: "By moving ahead of the party'
);
// stalker
raw = raw.replace(
  'benefits: ") .",      hindrances: "Neither lawbreakers nor outlaws',
  'benefits: "Stalkers blend into cities with unnatural ease, gaining +2 to NWP checks for disguise, fast-talking, and information gathering in urban settings. Their alertness reduces enemy surprise chances by 1 in 6.",      hindrances: "Neither lawbreakers nor outlaws'
);

// cle_scholar-priest - find garbled benefits
const scholIdx = raw.indexOf('T h e   S c h o l a r   P r i e s t');
if (scholIdx !== -1) {
  const benIdx = raw.lastIndexOf('benefits:', scholIdx);
  const endKit = raw.indexOf('},    {', benIdx);
  raw = raw.slice(0, benIdx) +
    'benefits: "The Scholar Priest may spend Weapon Proficiency slots on Nonweapon Proficiencies instead, allowing deep academic expertise.",    hindrances: "Scholars are often egotistical; debates can become heated and personal. Scholar Priests suffer a -1 penalty on initiative rolls in combat."' +
    '    },    {' + raw.slice(endKit + 7);
}

// bard kits
raw = raw.replace(
  'nwpRecommended: ["es : Singing", "Musical Instrument", "Reading/Writing", "bards not only increase their ability"]',
  'nwpRequired: ["Singing", "Musical Instrument", "Reading/Writing"],      nwpRecommended: ["Ancient History", "Etiquette", "Languages", "Poetry", "Local History", "Heraldry", "Juggling", "Modern Languages"]'
);
raw = raw.replace(
  'nwpRecommended: ["es : Reading/Writing", "Local History", "Blind-fighting", "Juggling. Suggested : Blacksmithing", "Bowyer/Fletcher", "Disguise"]',
  'nwpRequired: ["Reading/Writing"],      nwpRecommended: ["Local History", "Blind-fighting", "Juggling", "Blacksmithing", "Bowyer/Fletcher", "Disguise"]'
);
raw = raw.replace(
  'nwpRecommended: ["es : Acting", "Disguise", "Forgery", "Gaming. Suggested : Appraising", "Astrology", "Healing"]',
  'nwpRequired: ["Acting"],      nwpRecommended: ["Disguise", "Forgery", "Gaming", "Appraising", "Astrology", "Healing"]'
);
raw = raw.replace(
  'nwpRecommended: ["es : Dancing", "Direction Sense", "Languages", "Musical Instrument (tambourine", "violin", "mandolin) . Suggested : Ancient History"]',
  'nwpRequired: ["Dancing"],      nwpRecommended: ["Direction Sense", "Languages", "Musical Instrument", "Ancient History", "Modern Languages", "Animal Handling", "Riding"]'
);
raw = raw.replace(
  'nwpRecommended: ["es : Dancing", "Etiquette", "Languages", "Poetry. Suggested : Animal Training", "Armorer", "Artistic Ability"]',
  'nwpRequired: ["Dancing"],      nwpRecommended: ["Etiquette", "Languages", "Poetry", "Animal Training", "Armorer", "Artistic Ability"]'
);
raw = raw.replace(
  'nwpRecommended: ["es : Etiquette", "Heraldry", "Local History", "Reading/Writing. Suggested : Languages"]',
  'nwpRequired: ["Etiquette", "Heraldry", "Local History", "Reading/Writing"],      nwpRecommended: ["Languages", "Ancient History", "Blind-fighting", "Disguise"]'
);

writeFileSync('src/data/kits.js', raw, 'utf8');
console.log('Done! File size:', raw.length);

const tests = [
  ['spk_scout direction sense', raw.includes('"direction sense","weather sense","fire-building"')],
  ['spk_mariner weather sense', raw.includes('"weather sense","swimming","rope use","fishing"')],
  ['spk_soldier direction sense', raw.includes('"direction sense","history","fire-building"')],
  ['militant wizard kitBonusCP', raw.includes('kitBonusCP: 3,')],
  ['bar_true-bard nwpRequired', raw.includes('nwpRequired: ["Singing", "Musical Instrument"')],
  ['bar_blade nwpRequired', raw.includes('nwpRequired: ["Reading/Writing"],')],
  ['bar_charlatan nwpRequired', raw.includes('nwpRequired: ["Acting"]')],
  ['bar_gypsy-bard direction sense', raw.includes('nwpRequired: ["Dancing"],      nwpRecommended: ["Direction Sense"')],
  ['dru_adviser name degarbled', raw.includes('name:"Adviser"')],
  ['thi_adventurer degarbled', raw.includes('name:"Adventurer"')],
  ['ran_pathfinder fixed', raw.includes('Pathfinders gain +2 bonus')],
  ['ran_stalker fixed', raw.includes('Stalkers blend into cities')],
  ['no garbled Adviser', !raw.includes('A d v i s e r')],
  ['no garbled Adventurer', !raw.includes('A d v e n t u r')],
];
tests.forEach(([label, result]) => console.log(result ? 'OK' : 'FAIL', label));
