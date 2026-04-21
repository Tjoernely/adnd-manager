# AD&D 2E Campaign Manager — Status

## Projekt
- **Lokalt:** C:\DnD_manager_app\Version_1\
- **GitHub:** https://github.com/Tjoernely/adnd-manager
- **Server:** ubuntu@158.180.63.20
- **App:** http://158.180.63.20
- **SSH key:** C:\DnD_manager_app\ssh-key-2026-03-11.key

## Server Stack
- Nginx → /api/ → localhost:3001, / → /var/server/public/
- Node.js backend (Express) port 3001 via PM2 (adnd-backend, id:0)
- PostgreSQL 14: adnddb, user: adnduser, password: **se server/.env**
- JWT_SECRET: **se server/.env**
- ecosystem.config.cjs at /var/www/adnd-manager/ (NOT in git)

## Deploy
```bash
# Windows
deploy.bat

# SSH
cd /var/www/adnd-manager && git pull && bash deploy.sh

# Scripts med DB credentials
DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb DB_USER=adnduser DB_PASSWORD=<se server/.env> node scripts/SCRIPT.mjs
```

## Database — Vigtige tabeller
- users, campaigns, campaign_members, characters (character_data JSONB)
- spells (4400), magical_items (~6441)
- monsters (3781 med fuld stats, variants JSONB for drager)
- saved_encounters, encounter_creatures
- party_equipment, character_equipment, character_spells
- weapons_catalog (68 våben), armor_catalog (14 armor + 3 shields)
- magical_items_em_import (staging tabel for EM import)
- maps, map_pois

## Monsters System
- 3781 monstre med fuld stats
- HP formel: baseHp = HD×10 × sizeModifier × typeModifier × roleModifier × randomModifier
- Size parser: "G (54' base)" → gargantuan → ×3.6
- Type detection: Dragon* → ×2.2, Golem* → ×2.0 etc.
- Dragon age variants: 23 drager med variants JSONB (age 1-12)
- Reimport script: server/scripts/reimport-monster-stats.mjs

## Armor Profiles (House Rules)
9 damage types: slashing, piercing, bludgeoning, fire, cold, lightning, magic, acid, poison
11 profiler: feather, none, padded_cloth, leather, chain, plate, dense_flesh, thick_hide, carapace, stone_body, dragon_scales

## Character System
- Builder: Ability Scores → Race → Class → Kits → Traits → NWPs → Weapon Profs → Specialization
- Sub-abilities: Muscle/Stamina, Aim/Balance, Health/Fitness, Reason/Knowledge, Intuition/Willpower, Leadership/Appearance
- Data gemt i characters.character_data JSONB
- Equipment slots: head, neck, shoulders, body, cloak, belt, wrists, ring_l, ring_r, gloves, boots, hand_r, hand_l, ranged, ammo

## Party Knowledge
- Characters tab: Character Sheet (Print view), Equipment & Treasure, Spellbook
- Character Sheet: Combat Stats, Saving Throws, Ability Scores, Weapons tabel (THAC0/damage beregnet fra combatCalc.js)
- Equipment: Paperdoll silhouet med slots, item catalog, party pool
- Spellbook: Spells per level, Special abilities, Add from Spell Library
- Party Loot tab: items ikke givet til characters endnu
- Encounters tab: Combat manager, Smart Loot, Complete encounter → Party Loot

## Combat Beregning (combatCalc.js)
- AC = 10 + armorAC + shieldAC + Balance modifier + magic AC (hvis identified)
- THAC0 = class base - Muscle att.adj - weapon prof - specialization - mastery - WoC - magic bonus - racial bonus - human attack bonus (hu01)
- DR = fra equipped armor (slashing/piercing/bludgeoning)

## Encyclopedia Magica Import
- Script: server/scripts/import-em-items.mjs
- API: MediaWiki API (ikke HTML scraping)
- Staging tabel: magical_items_em_import
- TABLE_MAP: "Table A: Magical Liquids (EM)" etc.
- Table A (544 items) + Table S testet OK
- normalizeItem() tilføjer item_type, equip_slot, weapon_family etc.
- Status: Staging import ikke kørt endnu for alle tabeller

## Spell Library
- 4400 spells, wizard + priest
- Character filter: filtrerer spell_group baseret på class
- Specialist wizard: opposition schools med ⊗ badge
- Generator: niveau-dropdowns per level
- Add to Spellbook / Make Scroll knapper

## Aktuelle Bugs (april 2026)
1. **NWP descriptions** viser "See rulebook for details" for ALLE NWPs
   - Root cause: props.effectiveNWPGroups fra API mangler desc felt
   - Fix: staticDescById lookup fra STATIC_ALL_NWP — committed MEN ikke deployet
   - Bekræftet: bundle mangler staticDescById

2. **Druid spheres** — sphere selection UI forkert
   - Skal bruge SAMME UI som Cleric/Priest
   - Standard pakke (60 CP): Major All/Animal/Elemental/Healing/Plant/Weather + Minor Divination
   - 60 CP betales KUN via sphere-køb, ikke separat skill

## Character Builder — Seneste Ændringer
- ✅ Human Attack Bonus (hu01): våben-vælger dropdown, gemt som { enabled: true, weapon: "ws_..." }
- ✅ Human Attack Bonus: talt med i THAC0 beregning i combatCalc.js
- ✅ Ranger thieving: fixed % per level + Balance modifier + racial bonuses (Elf/Half-elf/Halfling)
- ✅ Bastard sword: 1H og 2H damage vises begge i CharacterPrintView
- ✅ Kit benefits/hindrances vist i CharacterPrintView
- ⚠️ NWP descriptions: Fix committed men IKKE deployet til server

## Vigtige Kildefiler
- src/data/proficiencies.js — NWP data med desc felter
- src/data/kits.js — Kit data
- src/data/classes.js — Klasse data inkl. Druid sphere regler
- src/rules-engine/combatCalc.js — AC/THAC0/damage beregning
- src/components/characters/CharacterPrintView.jsx — Print/Character Sheet
- src/components/builder/ProfsTab.jsx — NWP tab (har staticDescById bug)
- src/components/party/PartyHub.jsx — Party Knowledge hub
- src/components/spells/SpellLibrary.jsx — Spell Library
- server/scripts/import-em-items.mjs — EM importer
- server/routes/magicalItems.js — Magical items API

## Næste Opgaver
1. Deploy NWP desc fix + Druid spheres fix til server (SSH deploy!)
2. Kits komplet implementering (alle kits fra Kits.xlsx i project files)
3. Encyclopedia Magica staging import (alle tabeller A-T)
4. Merge EM staging data til magical_items production tabel
