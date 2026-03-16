import { useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import DiceRoller from './DiceRoller.jsx';
import './Items.css';

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

// ── Hardcoded S2 — Bonus tables (d20) ─────────────────────────────────────
const S2_ATTACK = [
  { roll_min: 1,  roll_max: 2,  item_name: '+1',          bonus: 1,  cursed: false },
  { roll_min: 3,  roll_max: 5,  item_name: '+2',          bonus: 2,  cursed: false },
  { roll_min: 6,  roll_max: 9,  item_name: '+3',          bonus: 3,  cursed: false },
  { roll_min: 10, roll_max: 14, item_name: '+4',          bonus: 4,  cursed: false },
  { roll_min: 15, roll_max: 17, item_name: '+5',          bonus: 5,  cursed: false },
  { roll_min: 18, roll_max: 18, item_name: '−1 (Cursed)', bonus: -1, cursed: true  },
  { roll_min: 19, roll_max: 19, item_name: '−2 (Cursed)', bonus: -2, cursed: true  },
  { roll_min: 20, roll_max: 20, item_name: '−3 (Cursed)', bonus: -3, cursed: true  },
];
const S2_DAMAGE = [
  { roll_min: 1,  roll_max: 2,  item_name: '+1',          bonus: 1,  cursed: false },
  { roll_min: 3,  roll_max: 5,  item_name: '+2',          bonus: 2,  cursed: false },
  { roll_min: 6,  roll_max: 9,  item_name: '+3',          bonus: 3,  cursed: false },
  { roll_min: 10, roll_max: 14, item_name: '+4',          bonus: 4,  cursed: false },
  { roll_min: 15, roll_max: 17, item_name: '+5',          bonus: 5,  cursed: false },
  { roll_min: 18, roll_max: 18, item_name: '−1 (Cursed)', bonus: -1, cursed: true  },
  { roll_min: 19, roll_max: 19, item_name: '−2 (Cursed)', bonus: -2, cursed: true  },
  { roll_min: 20, roll_max: 20, item_name: '−3 (Cursed)', bonus: -3, cursed: true  },
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

// ── Hardcoded S3 — Axe item list ───────────────────────────────────────────
const S3_AXE = (() => {
  const raw = [
    { roll: 107, name: "Agni's Red" },
    { roll: 108, name: "Ama-Tsu-Mara's Vorpal" },
    { roll: 109, name: 'Arumdina' },
    { roll: 110, name: 'Azuredge' },
    { roll: 111, name: "Brihaspati's" },
    { roll: 112, name: 'of Brotherhood' },
    { roll: 113, name: 'Callarduran Smoothhands' },
    { roll: 114, name: 'Cursed Battle' },
    { roll: 115, name: 'of Cutting' },
    { roll: 116, name: 'Deathstriker' },
    { roll: 117, name: 'of the Dwarvish Lords' },
    { roll: 118, name: 'of Enchantment' },
    { roll: 119, name: 'Frostreaver' },
    { roll: 120, name: "Garl Glittergold's Battle" },
    { roll: 121, name: "Gnarldan's Battle" },
    { roll: 122, name: "Hastseltsi's Hand" },
    { rollMin: 123, rollMax: 124, name: "Hastsezini's Hand" },
    { roll: 125, name: 'of Hurling' },
    { roll: 126, name: "Lortz's Battle" },
    { roll: 127, name: "Maglubiyet's" },
    { roll: 128, name: 'Might of Heroes' },
    { roll: 129, name: "Molydeus'" },
    { roll: 130, name: 'Motopua' },
    { roll: 131, name: "Nanna Sin's Black" },
    { roll: 132, name: "Nomog-Geaya's Hand" },
    { roll: 133, name: 'Pickaxe of Piercing' },
    { roll: 134, name: 'Rocksplitter' },
    { roll: 135, name: "Sampsa's Golden" },
    { roll: 136, name: "Shag's Battle" },
    { roll: 137, name: "Sulward's" },
    { roll: 138, name: "Thor's Kiss" },
    { roll: 139, name: 'Throwing' },
    { roll: 140, name: "Thumb Height Man's" },
    { rollMin: 141, rollMax: 142, name: 'Torshorak' },
    { roll: 143, name: "Tunnelrunner's" },
    { roll: 144, name: 'Withering Pickaxe' },
    { roll: 145, name: 'of the Woodsman' },
    { roll: 146, name: "Zebulon's of Leaving" },
    { roll: 147, name: "Zzzzzz's of Snoring" },
  ];
  return raw.map(e => ({
    roll_min:  e.roll ?? e.rollMin,
    roll_max:  e.roll ?? e.rollMax,
    item_name: e.name,
  }));
})();

// ── Hardcoded S3 — Special Weapon Categories ──────────────────────────────
const S3_CATEGORIES = [
  { name: 'Arrow',                    min: 4,   max: 106, data: 'S3_ARROWS' },
  { name: 'Axe',                      min: 107, max: 147, data: 'S3_AXE'    },
  { name: 'Bow',                      min: 148, max: 195, data: 'fetch'      },
  { name: 'Club',                     min: 196, max: 200, data: 'fetch'      },
  { name: 'Crossbow',                 min: 201, max: 210, data: 'fetch'      },
  { name: 'Dagger',                   min: 211, max: 268, data: 'fetch'      },
  { name: 'Dart',                     min: 269, max: 287, data: 'fetch'      },
  { name: 'Flail',                    min: 288, max: 295, data: 'fetch'      },
  { name: 'Hammer',                   min: 296, max: 315, data: 'fetch'      },
  { name: 'Javelin',                  min: 316, max: 321, data: 'fetch'      },
  { name: 'Lance',                    min: 322, max: 325, data: 'fetch'      },
  { name: 'Mace',                     min: 326, max: 355, data: 'fetch'      },
  { name: 'Net',                      min: 356, max: 358, data: 'fetch'      },
  { name: 'Polearm',                  min: 359, max: 409, data: 'fetch'      },
  { name: 'Sling',                    min: 410, max: 413, data: 'fetch'      },
  { name: 'Spear',                    min: 414, max: 437, data: 'fetch'      },
  { name: 'Sword',                    min: 438, max: 848, data: 'fetch'      },
  { name: 'Whip',                     min: 849, max: 854, data: 'fetch'      },
  { name: 'Enchanted Enhancements*',  min: 1,   max: 1,   data: 'fetch', special: true },
  { name: 'Weapon Enhancements*',     min: 2,   max: 2,   data: 'fetch', special: true },
];

// ── Hardcoded S3 Arrow item list ───────────────────────────────────────────
// Normalized: each entry has roll_min, roll_max, item_name
const S3_ARROWS = (() => {
  const raw = [
    { roll: 4,   name: "Abaris'" },
    { roll: 5,   name: 'Acid' },
    { roll: 6,   name: 'of Aggravation' },
    { roll: 7,   name: 'Antimagic' },
    { roll: 8,   name: "Apollo's" },
    { roll: 9,   name: 'of Attraction' },
    { roll: 10,  name: 'of Biting' },
    { roll: 11,  name: 'Black of Iuz' },
    { roll: 12,  name: 'of Blinding' },
    { roll: 13,  name: 'of Blinking' },
    { roll: 14,  name: 'Bolt of Lightning' },
    { roll: 15,  name: 'of Bow-Breaking' },
    { roll: 16,  name: 'of Burning' },
    { rollMin: 17, rollMax: 18, name: 'of Charming' },
    { roll: 19,  name: 'of Charming II' },
    { roll: 20,  name: 'of Clairaudience' },
    { roll: 21,  name: 'of Clairvoyance' },
    { roll: 22,  name: 'of Climbing' },
    { roll: 23,  name: 'of Connection' },
    { roll: 24,  name: 'of Curing' },
    { roll: 25,  name: 'of Darkness' },
    { roll: 26,  name: 'of Detonation' },
    { roll: 27,  name: 'of Direction' },
    { roll: 28,  name: 'of Disarming' },
    { roll: 29,  name: 'of Disintegration' },
    { roll: 30,  name: 'of Dispelling' },
    { roll: 31,  name: 'of Distance' },
    { roll: 32,  name: 'of Draconian Slaying' },
    { roll: 33,  name: 'Elven' },
    { roll: 34,  name: 'of Enchantment' },
    { rollMin: 35, rollMax: 36, name: 'of Explosions' },
    { roll: 37,  name: 'of Extended Range' },
    { roll: 38,  name: 'Faerie Fire' },
    { roll: 39,  name: 'of Fire' },
    { roll: 40,  name: 'Fire Seed' },
    { roll: 41,  name: 'Fire Trap' },
    { roll: 42,  name: 'Flaming' },
    { roll: 43,  name: 'of Flying' },
    { roll: 44,  name: 'of Force' },
    { roll: 45,  name: 'of Harm' },
    { roll: 46,  name: 'of Holding' },
    { roll: 47,  name: 'of Holding II' },
    { roll: 48,  name: 'of Ice' },
    { roll: 49,  name: 'of Illumination' },
    { roll: 50,  name: 'Illusory Missile' },
    { roll: 51,  name: 'of Justice' },
    { rollMin: 52, rollMax: 53, name: 'of Law' },
    { roll: 54,  name: 'of Light' },
    { roll: 55,  name: 'of Lighting' },
    { roll: 56,  name: 'of Lightning' },
    { roll: 57,  name: 'Lycanthrope Slayer' },
    { roll: 58,  name: "Maglubiyet's Wounding" },
    { roll: 59,  name: 'of Misdirection' },
    { roll: 60,  name: 'Missile Weapon of Accuracy' },
    { roll: 61,  name: 'Missile Weapon of Distance' },
    { roll: 62,  name: 'of Multiplicity' },
    { roll: 63,  name: 'Nilbog' },
    { roll: 64,  name: "Oberon's of Subduing" },
    { roll: 65,  name: "Oberon's of Slaying" },
    { roll: 66,  name: 'of Paralyzation' },
    { roll: 67,  name: 'of Penetrating' },
    { roll: 68,  name: 'of Penetration' },
    { roll: 69,  name: 'of Perseverance' },
    { rollMin: 70, rollMax: 71, name: 'of Piercing' },
    { roll: 72,  name: 'of Polymorphing' },
    { roll: 73,  name: 'of Pursuit' },
    { roll: 74,  name: 'Quarrel of Biting (Acid)' },
    { roll: 75,  name: 'Quarrel of Biting (Normal)' },
    { roll: 76,  name: 'Quarrel of Biting (Poison)' },
    { roll: 77,  name: 'Red' },
    { roll: 78,  name: 'of Refilling' },
    { roll: 79,  name: 'of Returning' },
    { roll: 80,  name: 'of Rock Piercing' },
    { roll: 81,  name: 'of Roping' },
    { roll: 82,  name: 'of Scent Detection' },
    { roll: 83,  name: 'of Screaming' },
    { roll: 84,  name: 'of Screaming II' },
    { roll: 85,  name: 'of Seeking' },
    { roll: 86,  name: 'of Seeking II' },
    { roll: 87,  name: 'of Set' },
    { rollMin: 88, rollMax: 89, name: 'of Signaling' },
    { roll: 90,  name: 'of Silence' },
    { roll: 91,  name: 'of Sinking' },
    { roll: 92,  name: 'of Slaying' },
    { roll: 93,  name: 'of Slaying II' },
    { roll: 94,  name: 'of Slaying III' },
    { roll: 95,  name: 'of Slaying IV' },
    { roll: 96,  name: 'Snake' },
    { roll: 97,  name: 'of Speaking' },
    { roll: 98,  name: 'Stun Bolt' },
    { roll: 99,  name: 'of Stunning' },
    { roll: 100, name: "Stirge's Bite" },
    { roll: 101, name: 'of Teleporting' },
    { roll: 102, name: 'of Transporting' },
    { roll: 103, name: 'Wooden' },
    { roll: 104, name: 'of Wounding' },
    { rollMin: 105, rollMax: 106, name: 'Arrowhead of Marking' },
  ];
  return raw.map(e => ({
    roll_min:  e.roll ?? e.rollMin,
    roll_max:  e.roll ?? e.rollMax,
    item_name: e.name,
  }));
})();

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

const COMPLEX_TABLES = ['R', 'S'];

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

/** Category row in Pane 3 special view */
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
          {cat.max - cat.min + 1}
        </span>
      )}
      <span className="mi-row-arrow">›</span>
    </div>
  );
}

/** Item row in Pane 4 cat-items view */
function ItemListRow({ item, selected, onClick }) {
  const name = item.item_name ?? item.name ?? '—';
  const rangeStr = item.roll_min != null
    ? (item.roll_min === item.roll_max ? String(item.roll_min) : `${item.roll_min}–${item.roll_max}`)
    : null;
  return (
    <div
      className={`mi-table-row${selected ? ' mi-table-row--selected' : ''}`}
      onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
    >
      {rangeStr && <span className="mi-row-range">{rangeStr}</span>}
      <span className="mi-row-name">{name}</span>
      {!!(item.description || item.fallback_description) && (
        <span className="mi-row-dot" title="Has description">●</span>
      )}
      <span className="mi-row-arrow">›</span>
    </div>
  );
}

/** Full item detail panel */
function DetailPanel({ item, loading, error, compositeName, compositeAtk, compositeDmg, fallback, children }) {
  if (loading) {
    return (
      <div className="mi-pane-loading" style={{ flex: 1, flexDirection: 'column', padding: 24 }}>
        <div className="mi-spinner" />Loading…
      </div>
    );
  }
  if (error) return <div className="mi-pane-empty" style={{ flex: 1 }}>{error}</div>;

  const isCursed    = compositeAtk?.cursed || compositeDmg?.cursed || !!item?.cursed;
  const displayName = compositeName ?? item?.name ?? '—';
  const description = item?.description || item?.fallback_description || null;

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

      {item && (item.charges || item.value_gp || item.alignment || item.intelligence) && (
        <div className="mi-detail-stat-grid">
          {item.charges      && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Charges:</span> <span className="mi-detail-stat-value">{item.charges}</span></div>}
          {item.value_gp     && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Value:</span> <span className="mi-detail-stat-value">{item.value_gp.toLocaleString()} gp</span></div>}
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

      {item?.source_url && (
        <a className="mi-detail-source-link" href={item.source_url} target="_blank" rel="noopener noreferrer">
          📖 View on Fandom Wiki ↗
        </a>
      )}

      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DrillDown() {

  // Pane 1
  const [p1Sel,       setP1Sel]      = useState(null);

  // Pane 2
  const [p2Entries,   setP2Entries]  = useState([]);
  const [p2Loading,   setP2Loading]  = useState(false);
  const [p2Error,     setP2Error]    = useState(null);
  const [p2Sel,       setP2Sel]      = useState(null);

  // Pane 3
  const [p3Mode,      setP3Mode]     = useState(null); // 'detail'|'bonus'|'special'
  // detail mode
  const [p3Item,      setP3Item]     = useState(null);
  const [p3ItemLoad,  setP3ItemLoad] = useState(false);
  const [p3ItemErr,   setP3ItemErr]  = useState(null);
  // special mode
  const [p3SpecCat,   setP3SpecCat]  = useState(null); // selected S3/R3 category
  // bonus mode
  const [p3AtkSel,    setP3AtkSel]   = useState(null);
  const [p3DmgSel,    setP3DmgSel]   = useState(null);
  const [dualRolling, setDualRolling]= useState(false);
  const [dualResult,  setDualResult] = useState(null);

  // Pane 4 — three modes: 'composite' | 'cat-items' | 'item-detail'
  const [p4Mode,       setP4Mode]       = useState(null);
  // composite mode
  const [p4Composite,  setP4Composite]  = useState(null); // { name, atk, dmg }
  const [p4BaseItem,   setP4BaseItem]   = useState(null);
  const [p4BaseLoad,   setP4BaseLoad]   = useState(false);
  const [p4BaseErr,    setP4BaseErr]    = useState(null);
  // cat-items mode
  const [p4CatItems,   setP4CatItems]   = useState([]);
  const [p4CatLoad,    setP4CatLoad]    = useState(false);
  const [p4CatErr,     setP4CatErr]     = useState(null);
  const [p4SelItem,    setP4SelItem]    = useState(null);
  // item-detail mode (drill from list)
  const [p4DetailItem, setP4DetailItem] = useState(null);
  const [p4DetailLoad, setP4DetailLoad] = useState(false);
  const [p4DetailErr,  setP4DetailErr]  = useState(null);

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  const fetchItemByName = useCallback(async (name) => {
    if (!name) return null;
    try {
      const res = await api.searchMagicalItems({ search: name, limit: 1 });
      return res?.items?.[0] ?? null;
    } catch { return null; }
  }, []);

  const fetchEntry = useCallback(async (entry) => {
    if (!entry) return null;
    if (entry.item_id) {
      try { return await api.getMagicalItem(entry.item_id); } catch { /* fall through */ }
    }
    return fetchItemByName(entry.item_name ?? entry.name);
  }, [fetchItemByName]);

  // ── Clear downstream ───────────────────────────────────────────────────────
  function clearFrom(level) {
    if (level <= 2) {
      setP2Entries([]); setP2Sel(null); setP2Error(null);
    }
    if (level <= 3) {
      setP3Mode(null);
      setP3Item(null); setP3ItemLoad(false); setP3ItemErr(null);
      setP3SpecCat(null);
      setP3AtkSel(null); setP3DmgSel(null);
      setDualResult(null);
    }
    if (level <= 4) {
      setP4Mode(null);
      setP4Composite(null); setP4BaseItem(null); setP4BaseLoad(false); setP4BaseErr(null);
      setP4CatItems([]); setP4CatLoad(false); setP4CatErr(null); setP4SelItem(null);
      setP4DetailItem(null); setP4DetailLoad(false); setP4DetailErr(null);
    }
  }

  // ── Pane 1 select ──────────────────────────────────────────────────────────
  async function selectP1(row) {
    clearFrom(2);
    setP1Sel(row);
    if (row.table === 'S') { setP2Entries(S1_WEAPONS); return; }
    if (row.table === 'R') { setP2Entries(R1_ARMOR);   return; }
    setP2Loading(true);
    try {
      const data = await api.getTableEntries(row.table, { limit: 500 });
      setP2Entries(data.entries ?? []);
    } catch (e) {
      setP2Error(e.message ?? 'Failed to load table');
    } finally {
      setP2Loading(false);
    }
  }

  function handleP1Roll(n) {
    const row = TABLE_1.find(r => n >= r.rollMin && n <= r.rollMax);
    if (row) selectP1(row);
  }

  // ── Pane 2 select ──────────────────────────────────────────────────────────
  async function selectP2(entry) {
    clearFrom(3);
    setP2Sel(entry);
    const tbl = p1Sel?.table;

    if (tbl === 'S' || tbl === 'R') {
      if (entry.isSpecialRow) {
        setP3Mode('special');   // show categories, not fetched list
      } else {
        setP3Mode('bonus');     // show bonus columns
      }
      return;
    }

    // Simple category
    setP3Mode('detail');
    setP3ItemLoad(true);
    try {
      const item = await fetchEntry(entry);
      setP3Item(item ?? { name: entry.item_name, description: entry.notes ?? null });
    } catch (e) {
      setP3ItemErr(e.message ?? 'Failed to load item');
    } finally {
      setP3ItemLoad(false);
    }
  }

  function handleP2Roll(n) {
    const entry = findRow(p2Entries.filter(e => !e.isSpecialRow), n)
               ?? (n >= 975 ? p2Entries.find(e => e.isSpecialRow) : null);
    if (entry) selectP2(entry);
  }

  // ── Pane 3 special: select category → load Pane 4 items ───────────────────
  async function selectP3Category(cat) {
    clearFrom(4);
    setP3SpecCat(cat);
    setP4Mode('cat-items');
    setP4CatLoad(true);

    const tbl = p1Sel?.table ?? 'S';

    try {
      // Hardcoded lists — Arrow
      if (tbl === 'S' && cat.data === 'S3_ARROWS') {
        setP4CatItems(S3_ARROWS);
        setP4CatLoad(false);
        return;
      }

      // Hardcoded lists — Axe
      if (tbl === 'S' && cat.data === 'S3_AXE') {
        setP4CatItems(S3_AXE);
        setP4CatLoad(false);
        return;
      }

      // Fetch from DB by name search
      const searchTerm = cat.name.replace(/\*$/, '').trim();
      const res = await api.searchMagicalItems({ search: searchTerm, limit: 200 });
      let items = (res?.items ?? []).map(it => ({
        roll_min:    null,
        roll_max:    null,
        item_name:   it.name,
        description: it.description,
        source_url:  it.source_url,
        _fullItem:   it,
      }));

      // Fallback: if fewer than 5 results, also scan full table entries client-side
      if (items.length < 5) {
        try {
          const tblRes = await api.getTableEntries(tbl, { limit: 500 });
          const keyword = searchTerm.toLowerCase();
          const existing = new Set(items.map(i => i.item_name));
          for (const e of (tblRes?.entries ?? [])) {
            const eName = (e.item_name ?? e.name ?? '').toLowerCase();
            if (eName.includes(keyword) && !existing.has(e.item_name ?? e.name)) {
              existing.add(e.item_name ?? e.name);
              items.push({
                roll_min:    e.roll_min ?? null,
                roll_max:    e.roll_max ?? null,
                item_name:   e.item_name ?? e.name,
                description: e.description ?? null,
                source_url:  null,
                _fullItem:   null,
              });
            }
          }
        } catch { /* ignore fallback errors */ }
      }

      setP4CatItems(items);
    } catch (e) {
      setP4CatErr(e.message ?? 'Failed to load items');
    } finally {
      setP4CatLoad(false);
    }
  }

  function handleP3CatRoll(n) {
    const cats = p1Sel?.table === 'R' ? R3_CATEGORIES : S3_CATEGORIES;
    const cat  = findCat(cats, n);
    if (cat) selectP3Category(cat);
  }

  // ── Pane 4 cat-items: click item → drill to detail ─────────────────────────
  async function selectP4CatItem(item) {
    setP4SelItem(item);
    setP4Mode('item-detail');
    setP4DetailLoad(true);
    setP4DetailItem(null);
    setP4DetailErr(null);
    try {
      let fullItem = item._fullItem ?? null;
      if (!fullItem) {
        fullItem = await fetchItemByName(item.item_name ?? item.name);
      }
      setP4DetailItem(fullItem ?? { name: item.item_name ?? item.name, description: item.description ?? null });
    } catch (e) {
      setP4DetailErr(e.message ?? 'Failed to load item');
    } finally {
      setP4DetailLoad(false);
    }
  }

  function backToCatList() {
    setP4Mode('cat-items');
    setP4SelItem(null);
    setP4DetailItem(null);
    setP4DetailErr(null);
  }

  // ── Bonus column clicks ────────────────────────────────────────────────────
  async function openComposite(baseEntry, atkEntry, dmgEntry) {
    const atkStr  = atkEntry?.item_name ?? '?';
    const dmgStr  = dmgEntry?.item_name ?? null;
    const name    = dmgStr
      ? `${baseEntry?.item_name ?? 'Weapon'} ${atkStr} / ${dmgStr}`
      : `${baseEntry?.item_name ?? 'Armor'} ${atkStr}`;
    setP4Mode('composite');
    setP4Composite({ name, atk: atkEntry, dmg: dmgEntry });
    setP4BaseLoad(true);
    setP4BaseItem(null);
    setP4BaseErr(null);
    try {
      const item = await fetchItemByName(baseEntry?.item_name);
      setP4BaseItem(item ?? null);
    } catch { /* fallback text shown */ }
    finally { setP4BaseLoad(false); }
  }

  function selectAtk(entry) {
    setP3AtkSel(entry);
    if (p1Sel?.table === 'R') {
      openComposite(p2Sel, entry, null);
    } else if (p3DmgSel) {
      openComposite(p2Sel, entry, p3DmgSel);
    }
  }

  function selectDmg(entry) {
    setP3DmgSel(entry);
    if (p3AtkSel) openComposite(p2Sel, p3AtkSel, entry);
  }

  function handleBothRoll() {
    if (dualRolling) return;
    setDualRolling(true);
    setDualResult(null);
    setTimeout(() => {
      const atkN     = rollDie(20);
      const dmgN     = rollDie(20);
      const atkEntry = findRow(S2_ATTACK, atkN);
      const dmgEntry = findRow(S2_DAMAGE, dmgN);
      setP3AtkSel(atkEntry);
      setP3DmgSel(dmgEntry);
      setDualResult([atkN, dmgN]);
      setDualRolling(false);
      if (atkEntry && dmgEntry) openComposite(p2Sel, atkEntry, dmgEntry);
    }, 340);
  }

  // ── Roll Again helpers ─────────────────────────────────────────────────────
  function rollAgain() {
    if (!p1Sel || !p2Entries.length) return;
    const sides = parseSides(p1Sel.dice);
    const n     = rollDie(sides);
    const entry = findRow(p2Entries.filter(e => !e.isSpecialRow), n)
               ?? (n >= 975 ? p2Entries.find(e => e.isSpecialRow) : null);
    if (entry) selectP2(entry);
  }

  function rollNewItem() { rollAgain(); }

  function rollAnotherCat() {
    const cats = p1Sel?.table === 'R' ? R3_CATEGORIES : S3_CATEGORIES;
    const n    = rollDie(1000);
    const cat  = findCat(cats, n) ?? cats[Math.floor(Math.random() * cats.length)];
    if (cat) selectP3Category(cat);
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const tbl       = p1Sel?.table ?? '';
  const isComplex = COMPLEX_TABLES.includes(tbl);
  const isWeapon  = tbl === 'S';
  const isArmor   = tbl === 'R';
  const cats      = isArmor ? R3_CATEGORIES : S3_CATEGORIES;

  const showP2 = !!p1Sel;
  const showP3 = showP2 && (isComplex || p3Mode !== null);
  const showP4 = isComplex && (p3Mode === 'bonus' || p3Mode === 'special');

  const p4HasContent = p4Mode !== null;

  const rightmost = (showP4 && p4HasContent) ? 4
                  : (showP3 && p3Mode)        ? 3
                  : showP2                    ? 2
                  :                             1;

  function paneClass(num) {
    const visible    = num === 1 ? true : num === 2 ? showP2 : num === 3 ? showP3 : num === 4 ? showP4 : false;
    const detailMode = p3Mode === 'detail' && num === 3;
    const isFixed    = visible && num <= 3 && !detailMode;
    const isExpand   = visible && (detailMode || num === 4);
    const mobileVis  = rightmost === num;
    return [
      'mi-pane',
      !visible  ? 'mi-pane--empty'          : '',
      isFixed   ? 'mi-pane--dd-fixed'       : '',
      isExpand  ? 'mi-pane--dd-expand'      : '',
      mobileVis ? 'mi-pane--mobile-visible' : '',
    ].filter(Boolean).join(' ');
  }

  const bonusAtkEntries = isArmor ? R2_BONUS : S2_ATTACK;
  const bonusDmgEntries = S2_DAMAGE;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mi-drilldown mi-drilldown--warm">

      {/* ══ PANE 1 — Table 1 Overview ══════════════════════════════════════ */}
      <div className={paneClass(1)}>
        <PaneHeader
          title="Table 1 — Overview"
          subtitle="Roll d100"
          extra={<DiceRoller sides={100} label="d100" onRoll={handleP1Roll} />}
        />
        <div className="mi-pane-body">
          {TABLE_1.map(row => (
            <div
              key={row.table}
              className={['mi-table-row', p1Sel?.table === row.table ? 'mi-table-row--selected' : ''].filter(Boolean).join(' ')}
              onClick={() => selectP1(row)}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && selectP1(row)}
            >
              <span className="mi-row-range">{row.label}</span>
              <span className="mi-row-name">{row.category}</span>
              <span className="mi-row-arrow" style={{ fontSize: 9 }}>Tbl {row.table}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══ PANE 2 — Category Table ════════════════════════════════════════ */}
      <div className={paneClass(2)}>
        {!showP2 ? (
          <div className="mi-pane-placeholder">
            <div className="mi-pane-placeholder-icon">📜</div>
            <div className="mi-pane-placeholder-text">Select a category<br />from Table 1</div>
          </div>
        ) : (
          <>
            <PaneHeader
              title={isWeapon ? 'Table S1 — Generic Magical Weapons'
                    : isArmor ? 'Table R1 — Generic Magical Armor'
                    : `Table ${tbl} — ${p1Sel?.category}`}
              subtitle={p1Sel?.dice}
              extra={!p2Loading && p2Entries.length > 0 && (
                <DiceRoller sides={parseSides(p1Sel.dice)} label={p1Sel.dice} onRoll={handleP2Roll} />
              )}
            />
            <div className="mi-pane-body">
              {p2Loading ? (
                <div className="mi-pane-loading"><div className="mi-spinner" />Loading…</div>
              ) : p2Error ? (
                <div className="mi-pane-empty">{p2Error}</div>
              ) : p2Entries.length === 0 ? (
                <div className="mi-pane-empty">No entries. Run the import script to populate.</div>
              ) : (
                p2Entries.map((entry, i) => (
                  <div key={`p2-${i}`}>
                    {entry.isSpecialRow && (
                      <div style={{ borderTop: '1px solid rgba(212,168,64,0.25)', margin: '4px 0' }} />
                    )}
                    <TableRow
                      entry={entry}
                      selected={
                        entry.isSpecialRow
                          ? !!p2Sel?.isSpecialRow
                          : p2Sel?.roll_min === entry.roll_min && p2Sel?.item_name === entry.item_name
                      }
                      dice={p1Sel?.dice}
                      onClick={() => selectP2(entry)}
                    />
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ══ PANE 3 ═════════════════════════════════════════════════════════ */}
      <div className={paneClass(3)}>
        {!p3Mode ? (
          <div className="mi-pane-placeholder">
            <div className="mi-pane-placeholder-icon">{isComplex ? '⚔️' : '📖'}</div>
            <div className="mi-pane-placeholder-text">
              {isComplex ? 'Select a weapon or armor\nto continue' : 'Select an item\nto view its description'}
            </div>
          </div>

        ) : p3Mode === 'detail' ? (
          <>
            <PaneHeader
              title={p2Sel?.item_name ?? 'Item Detail'}
              subtitle="Description"
              extra={<button className="mi-dice-btn" onClick={rollAgain}>🎲 Roll Again</button>}
            />
            <DetailPanel item={p3Item} loading={p3ItemLoad} error={p3ItemErr} />
          </>

        ) : p3Mode === 'bonus' ? (
          <>
            <PaneHeader
              title={isWeapon ? 'Table S2 — Attack & Damage Adjustments' : 'Table R2 — Armor Bonus'}
              subtitle={`${isArmor ? 'Armor' : 'Weapon'}: ${p2Sel?.item_name ?? '—'}`}
              extra={isWeapon ? (
                <button
                  className={`mi-dice-btn${dualRolling ? ' mi-dice-btn--rolling' : ''}`}
                  onClick={handleBothRoll}
                  disabled={dualRolling}
                >
                  {dualRolling ? '⏳' : '🎲'} Roll Both
                  {dualResult && !dualRolling && (
                    <span className="mi-roll-result" style={{ fontSize: 11, marginLeft: 4 }}>
                      {dualResult[0]}/{dualResult[1]}
                    </span>
                  )}
                </button>
              ) : null}
            />
            <div className="mi-bonus-cols">
              <div className="mi-bonus-col">
                <div className="mi-bonus-col-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
                  <span>{isArmor ? 'AC Bonus' : 'Attack Bonus'}</span>
                  <DiceRoller sides={20} label="d20" onRoll={n => { const e = findRow(bonusAtkEntries, n); if (e) selectAtk(e); }} />
                </div>
                <div className="mi-bonus-col-body">
                  {bonusAtkEntries.map((entry, i) => (
                    <BonusRow
                      key={`atk-${i}`}
                      entry={entry}
                      selected={p3AtkSel?.roll_min === entry.roll_min && p3AtkSel?.item_name === entry.item_name}
                      onClick={() => selectAtk(entry)}
                    />
                  ))}
                </div>
              </div>
              {isWeapon && (
                <div className="mi-bonus-col">
                  <div className="mi-bonus-col-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
                    <span>Damage Bonus</span>
                    <DiceRoller sides={20} label="d20" onRoll={n => { const e = findRow(bonusDmgEntries, n); if (e) selectDmg(e); }} />
                  </div>
                  <div className="mi-bonus-col-body">
                    {bonusDmgEntries.map((entry, i) => (
                      <BonusRow
                        key={`dmg-${i}`}
                        entry={entry}
                        selected={p3DmgSel?.roll_min === entry.roll_min && p3DmgSel?.item_name === entry.item_name}
                        onClick={() => selectDmg(entry)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>

        ) : p3Mode === 'special' ? (
          <>
            <PaneHeader
              title={isWeapon ? 'Table S3 — Special Weapons' : 'Table R3 — Special Armor'}
              subtitle="Select a weapon type"
              extra={
                <DiceRoller sides={1000} label="d1000" onRoll={handleP3CatRoll} />
              }
            />
            <div className="mi-pane-body">
              {cats.map((cat, i) => {
                const isSpecCat = !!cat.special;
                return (
                  <div key={`cat-${i}`}>
                    {isSpecCat && i > 0 && (
                      <div style={{ borderTop: '1px solid rgba(212,168,64,0.15)', margin: '4px 0' }} />
                    )}
                    <CatRow
                      cat={cat}
                      selected={p3SpecCat?.name === cat.name}
                      onClick={() => selectP3Category(cat)}
                    />
                  </div>
                );
              })}
            </div>
          </>

        ) : null}
      </div>

      {/* ══ PANE 4 — Result (complex R/S only) ════════════════════════════ */}
      <div className={paneClass(4)}>
        {!p4HasContent ? (
          <div className="mi-pane-placeholder">
            <div className="mi-pane-placeholder-icon">⚗️</div>
            <div className="mi-pane-placeholder-text">
              {p3Mode === 'bonus'
                ? (isWeapon
                    ? (!p3AtkSel ? 'Select attack bonus\nto begin' : 'Select damage bonus\nto see result')
                    : 'Select AC bonus\nto see result')
                : 'Select a weapon type\nto browse special items'}
            </div>
          </div>

        ) : p4Mode === 'composite' ? (
          <>
            <PaneHeader title="Result" />
            <DetailPanel
              item={p4BaseItem}
              loading={p4BaseLoad}
              error={p4BaseErr}
              compositeName={p4Composite?.name}
              compositeAtk={p4Composite?.atk}
              compositeDmg={p4Composite?.dmg}
              fallback={
                isWeapon
                  ? `A magically enhanced ${p2Sel?.item_name ?? 'weapon'}. Apply the listed bonuses to attack and damage rolls.`
                  : `A magically enhanced ${p2Sel?.item_name ?? 'armor'}. Apply the listed bonus to armor class.`
              }
            >
              <div className="mi-detail-roll-again">
                <button className="mi-dice-btn" onClick={rollAgain}>🎲 Roll Again</button>
                <button className="mi-dice-btn" onClick={rollNewItem}>🎲 New {isWeapon ? 'Weapon' : 'Armor'}</button>
              </div>
            </DetailPanel>
          </>

        ) : p4Mode === 'cat-items' ? (
          <>
            <PaneHeader
              title={`${p3SpecCat?.name ?? 'Special'} — Items`}
              subtitle={`${p4CatItems.length} item${p4CatItems.length !== 1 ? 's' : ''} found`}
              extra={
                <button className="mi-dice-btn" onClick={rollAnotherCat} style={{ fontSize: 10 }}>
                  🎲 Random Category
                </button>
              }
            />
            {p4CatLoad ? (
              <div className="mi-pane-loading" style={{ flex: 1 }}><div className="mi-spinner" />Loading…</div>
            ) : p4CatErr ? (
              <div className="mi-pane-empty" style={{ flex: 1 }}>{p4CatErr}</div>
            ) : p4CatItems.length === 0 ? (
              <div className="mi-pane-empty" style={{ flex: 1 }}>No items found in the database for this category.</div>
            ) : (
              <div className="mi-pane-body">
                {p4CatItems.map((item, i) => (
                  <ItemListRow
                    key={`cat-item-${i}`}
                    item={item}
                    selected={p4SelItem === item}
                    onClick={() => selectP4CatItem(item)}
                  />
                ))}
              </div>
            )}
          </>

        ) : p4Mode === 'item-detail' ? (
          <>
            <PaneHeader
              title={p4DetailItem?.name ?? p4SelItem?.item_name ?? 'Item Detail'}
              extra={
                <button className="mi-dice-btn" onClick={backToCatList} style={{ fontSize: 10 }}>
                  ← Back to {p3SpecCat?.name}
                </button>
              }
            />
            <DetailPanel
              item={p4DetailItem}
              loading={p4DetailLoad}
              error={p4DetailErr}
              fallback="No description available. See source for details."
            />
          </>

        ) : null}
      </div>

    </div>
  );
}
