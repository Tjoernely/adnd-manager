const fs = require('fs');
const content = fs.readFileSync('src/data/kits.js', 'utf8');

function fixSpaced(str) {
  return str.replace(/"([^"]*)"/g, function(match, inner) {
    let c = inner;
    let prev = '';
    while (prev !== c) {
      prev = c;
      c = c.replace(/([a-zA-Z0-9'\/\-\+\.\,\!\?\:\;\(\)&%]) ([a-zA-Z0-9'\/\-\+\.\,\!\?\:\;\(\)&%])/g, '$1$2');
    }
    c = c.replace(/ {2,}/g, ' ').trim();
    return '"' + c + '"';
  });
}

const fixed = fixSpaced(content);
fs.writeFileSync('src/data/kits.js', fixed, 'utf8');

console.log('Done! Original:', content.length, 'chars -> Fixed:', fixed.length, 'chars');
const names = [...fixed.matchAll(/name: "([^"]+)"/g)].map(m => m[1]).slice(0,25);
console.log('Sample kit names:');
names.forEach(n => console.log(' -', n));

// Show first kit
const match = fixed.match(/spk_acrobat[^;]+?(?=\},\s*\{|\}])/s);
if (match) console.log('\nAcrobat sample:\n', match[0].slice(0,600));
