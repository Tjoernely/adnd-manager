/**
 * parseItem.test.js
 *
 * Node built-in assert tests for parseMagicItem().
 * Run with:  node server/lib/magicItemParser/__tests__/parseItem.test.js
 *
 * Uses 5 representative fixtures covering:
 *   1. Nightbringer         — cursed footman's mace with blind-on-command
 *   2. Frost Brand          — sword with conditional "+6 vs. fire"
 *   3. Holy Avenger         — empty description, category fallback
 *   4. Boots of Elvenkind   — non-weapon slot item (boots)
 *   5. Cloak of Displacement— non-weapon slot item (cloak)
 */

'use strict';

const assert = require('node:assert/strict');
const { parseMagicItem } = require('../parseItem');

// ── Stub weapons_catalog ──────────────────────────────────────────────────────
// Only the rows referenced by the fixtures below.
const weaponsCatalog = new Map([
  [
    "Mace, Footman's",
    {
      name: "Mace, Footman's",
      damage_sm: '1d6+1',
      damage_l: '1d6',
      speed_factor: 7,
      weapon_type: 'B',
      is_two_handed: false,
      range_short: null,
      range_medium: null,
      range_long: null,
    },
  ],
  [
    'Sword, Long',
    {
      name: 'Sword, Long',
      damage_sm: '1d8',
      damage_l: '1d12',
      speed_factor: 5,
      weapon_type: 'S',
      is_two_handed: false,
      range_short: null,
      range_medium: null,
      range_long: null,
    },
  ],
  [
    'Sword',
    {
      name: 'Sword',
      damage_sm: '1d8',
      damage_l: '1d12',
      speed_factor: 5,
      weapon_type: 'S',
      is_two_handed: false,
      range_short: null,
      range_medium: null,
      range_long: null,
    },
  ],
]);

// ── Runner ────────────────────────────────────────────────────────────────────
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

test('1. Nightbringer — cursed footman\'s mace with blind-on-command', () => {
  const mi = {
    id: 101,
    name: 'Nightbringer',
    item_type: 'weapon',
    category: 'Mace',
    equip_slot: 'hand_r',
    cursed: true,
    hands_required: 1,
    weight: '10 lbs',
    value_gp: 5000,
    xp_value: 500,
    description:
      "This footman's mace +3 is a cursed weapon. On command word, " +
      'the wielder is struck blind until a cure blindness spell is cast. ' +
      'The head hums softly when undead are within 30 feet.',
  };

  const out = parseMagicItem(mi, weaponsCatalog);

  assert.equal(out.name, 'Nightbringer');
  assert.equal(out.item_type, 'weapon');
  assert.equal(out.slot, 'hand_r');
  assert.equal(out.magic_bonus, 3);
  assert.equal(out.is_cursed, true, 'is_cursed must come from DB flag');
  assert.equal(out.weapon_type, 'B');
  assert.equal(out.damage_s_m, '1d6+1');
  assert.equal(out.damage_l, '1d6');
  assert.equal(out.speed_factor, 7);
  assert.equal(out.is_two_handed, false);
  assert.equal(out.catalog_matched, true);
  assert.equal(out.base_type, "footman's mace");
  assert.equal(out.weight_lbs, 10);
  assert.equal(out.value_gp, 5000);

  // Notes line for combatCalc fallback
  assert.match(out.notes, /Bonus: \+3/);
  assert.match(out.notes, /Type: footman's mace/);

  // Special properties should mention command word / blind
  assert.ok(out.special_properties, 'special_properties should be populated');
  assert.match(
    out.special_properties,
    /(command word|blind)/i,
    'Should surface blind/command word triggers'
  );
});

test('2. Frost Brand — "+3 sword, +6 vs. fire using/dwelling"', () => {
  const mi = {
    id: 102,
    name: 'Frost Brand',
    item_type: 'weapon',
    category: 'Sword',
    equip_slot: 'hand_r',
    cursed: false,
    hands_required: 1,
    weight: '8 lbs',
    value_gp: 10000,
    description:
      'This is a long sword +3, +6 vs. fire using/dwelling creatures. ' +
      'It radiates cold and extinguishes normal fires within 10 feet. ' +
      'On command word, it glows brightly and provides fire resistance.',
  };

  const out = parseMagicItem(mi, weaponsCatalog);

  assert.equal(out.magic_bonus, 3);
  assert.equal(out.is_cursed, false);
  assert.equal(out.item_type, 'weapon');
  assert.equal(out.weapon_type, 'S');
  // "long sword" should have matched the catalog
  assert.equal(out.catalog_matched, true);
  assert.equal(out.base_type, 'long sword');

  // Conditional bonus should appear in special_properties
  assert.ok(out.special_properties, 'special_properties should be populated');
  assert.match(
    out.special_properties,
    /\+6 vs\. fire/i,
    'Should include conditional "+6 vs. fire" bonus'
  );
});

test('3. Holy Avenger — empty description, category fallback', () => {
  const mi = {
    id: 103,
    name: 'Holy Avenger',
    item_type: 'weapon',
    category: 'Sword',
    equip_slot: 'hand_r',
    cursed: false,
    hands_required: 1,
    weight: '4 lbs',
    description: '', // empty — must not crash, must fall back to category
  };

  const out = parseMagicItem(mi, weaponsCatalog);

  assert.equal(out.name, 'Holy Avenger');
  assert.equal(out.description, null);
  assert.equal(out.magic_bonus, 0, 'No +N in description → magic_bonus=0');
  assert.equal(out.is_cursed, false);
  // Category "Sword" → "Sword" in catalog, catalog matched
  assert.equal(out.catalog_matched, true);
  assert.equal(out.base_type, 'sword');
  assert.equal(out.weapon_type, 'S');
  assert.equal(out.special_properties, null, 'No triggers → null special_properties');
});

test('4. Boots of Elvenkind — non-weapon, slot=boots, silent movement', () => {
  const mi = {
    id: 104,
    name: 'Boots of Elvenkind',
    item_type: 'gear',
    category: 'Boots',
    equip_slot: 'boots',
    cursed: false,
    weight: '1 lb',
    description:
      'These soft leather boots enable the wearer to move with absolute ' +
      'silent movement across any surface. A command word activates the ' +
      'magic for up to one turn per day.',
  };

  const out = parseMagicItem(mi, weaponsCatalog);

  assert.equal(out.slot, 'boots');
  assert.equal(out.item_type, 'gear');
  assert.equal(out.magic_bonus, 0);
  assert.equal(out.is_cursed, false);
  assert.equal(out.damage_s_m, null, 'Non-weapon → no damage');
  assert.equal(out.damage_l, null);
  assert.equal(out.weapon_type, null);
  assert.equal(out.armor_ac, null);
  assert.equal(out.catalog_matched, false);

  assert.ok(out.special_properties, 'special_properties should be populated');
  assert.match(
    out.special_properties,
    /silent movement/i,
    'Should surface "silent movement" trigger'
  );
});

test('5. Cloak of Displacement — non-weapon, cloak slot, displacement', () => {
  const mi = {
    id: 105,
    name: 'Cloak of Displacement',
    item_type: 'gear',
    category: 'Cloak',
    equip_slot: 'cloak',
    cursed: false,
    weight: '1 lb',
    description:
      'This cloak causes the wearer to appear to be 2 feet from their actual ' +
      'location via displacement. All attacks against the wearer suffer a ' +
      '-2 penalty, and the wearer gains +2 on saving throws vs. targeted magic.',
  };

  const out = parseMagicItem(mi, weaponsCatalog);

  assert.equal(out.slot, 'cloak');
  assert.equal(out.magic_bonus, 0, 'Cloak should not pull "+2" from save text');
  assert.equal(out.is_cursed, false);
  assert.equal(out.damage_s_m, null);
  assert.equal(out.weapon_type, null);
  assert.equal(out.catalog_matched, false);

  assert.ok(out.special_properties, 'special_properties should be populated');
  assert.match(
    out.special_properties,
    /displacement/i,
    'Should surface "displacement" trigger'
  );
});

// ── Execute ───────────────────────────────────────────────────────────────────
(async () => {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      if (err.actual !== undefined || err.expected !== undefined) {
        console.error(`    actual:   ${JSON.stringify(err.actual)}`);
        console.error(`    expected: ${JSON.stringify(err.expected)}`);
      }
      failed++;
    }
  }
  console.log(`\n${passed}/${tests.length} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
