const fs = require('fs');
let src = fs.readFileSync('src/data/kits.js', 'utf8');

// Fix text artifacts from spaced-text encoding
src = src.replace(/ - /g, '-');
src = src.replace(/ \/ /g, '/');
src = src.replace(/\( /g, '(');
src = src.replace(/ \)/g, ')');

function setNwp(kitId, arr) {
  const arrStr = JSON.stringify(arr);
  const re = new RegExp('(id: "' + kitId.replace('-', '\\-') + '"[\\s\\S]*?nwpRecommended: )\\[[^\\]]*\\]');
  if (re.test(src)) {
    src = src.replace(re, '$1' + arrStr);
    console.log('  OK nwpRec:', kitId);
  } else {
    console.warn('  WARN: nwpRecommended not found for', kitId);
  }
}

function setBarred(kitId, arr) {
  const arrStr = JSON.stringify(arr);
  const re = new RegExp('(id: "' + kitId.replace('-', '\\-') + '"[\\s\\S]*?barredClasses: )\\[[^\\]]*\\]');
  if (re.test(src)) {
    src = src.replace(re, '$1' + arrStr);
    console.log('  OK barred:', kitId);
  } else {
    console.warn('  WARN: barredClasses not found for', kitId);
  }
}

function setReqStats(kitId, obj) {
  const objStr = JSON.stringify(obj);
  const re = new RegExp('(id: "' + kitId.replace('-', '\\-') + '"[\\s\\S]*?reqStats: )\\{[^}]*\\}');
  if (re.test(src)) {
    src = src.replace(re, '$1' + objStr);
    console.log('  OK reqStats:', kitId);
  } else {
    console.warn('  WARN: reqStats not found for', kitId);
  }
}

console.log('Fixing Acrobat...');
setNwp('spk_acrobat', ['tumbling','jumping','tightrope walking','juggling','dancing','escape artist']);

console.log('Fixing Assassin...');
setNwp('spk_assassin', ['disguise','poison use','move silently','hide in shadows']);

console.log('Fixing Barbarian...');
setNwp('spk_barbarian', ['survival','tracking','hunting','set snares','fire-building','animal lore']);

console.log('Fixing Gladiator...');
setNwp('spk_gladiator', ['blind-fighting','endurance','jumping','tumbling']);

console.log('Fixing Jester...');
setNwp('spk_jester', ['singing','etiquette','modern languages','reading/writing','ventriloquism','juggling','disguise','jumping']);
setBarred('spk_jester', ['fighter','ranger','paladin','mage','illusionist','specialist','cleric','druid','shaman']);

console.log('Fixing Mariner...');
setNwp('spk_mariner', ['seamanship','navigation','swimming','weather sense','rope use','fishing']);

console.log('Fixing Savage...');
setNwp('spk_savage', ['animal lore','hunting','running','set snares','survival','tracking','fishing','swimming']);

console.log('Fixing Scholar...');
setNwp('spk_scholar', ['reading/writing','history','languages','heraldry','astrology','astronomy','herbalism','engineering','gem cutting','religion','spellcraft']);
setBarred('spk_scholar', ['fighter']);

console.log('Fixing Scout...');
setNwp('spk_scout', ['tracking','survival','fire-building','hunting','mountaineering','rope use','set snares','swimming','carpentry','direction sense','weather sense']);

console.log('Fixing Sharpshooter...');
setNwp('spk_sharpshooter', ['bowyer/fletcher','hunting','heraldry','riding','weaponsmithing']);
setBarred('spk_sharpshooter', ['mage','illusionist','specialist','cleric','druid','shaman']);
setReqStats('spk_sharpshooter', {aim: 13});

console.log('Fixing Soldier...');
setNwp('spk_soldier', ['history','fire-building','direction sense','animal handling','cooking','heraldry','riding','seamanship','swimming','disguise','armorer','blind-fighting','bowyer/fletcher','charioteering','endurance','navigation','survival','weaponsmithing']);

console.log('Fixing Spy...');
setReqStats('spk_spy', {knowledge: 13, appearance: 13});

console.log('Fixing Weapon Master...');
setNwp('spk_weapon-master', ['blind-fighting','juggling','weaponsmithing','bowyer/fletcher','endurance']);
setReqStats('spk_weapon-master', {stamina: 13, aim: 13});
setBarred('spk_weapon-master', ['ranger','mage','illusionist','specialist','druid','shaman','bard']);

fs.writeFileSync('src/data/kits.js', src, 'utf8');
console.log('\nDone! File size:', src.length);
