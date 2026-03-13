// data/proficiencies.js — AD&D 2nd Edition non-weapon proficiencies and class CP pools

// Class group → determines in-class vs cross-class NWP cost (+2 for cross-class)
export const CLASS_GROUP_MAP = {
  fighter:"warrior", ranger:"warrior", paladin:"warrior",
  mage:"wizard", specialist:"wizard", illusionist:"wizard", necromancer:"wizard",
  cleric:"priest", druid:"priest", shaman:"priest",
  thief:"rogue", bard:"rogue",
};

// sub-ability key aliases for Table 45 stat names
// (already defined in SUB_ABILITIES; these match effSub() keys)
// knowledge=Int/Knowledge, willpower=Wis/Willpower, etc.

export const NWP_GROUPS = [
  {
    group: "General", groupTag: "general",
    sub: "Available to all classes at listed cost",
    profs: [
      { id:"ng01", name:"Agriculture",       cp:3, rank:7, stats:["knowledge"],              desc:"Plant, harvest, store crops, tend animals, and manage basic irrigation automatically. Proficiency checks for pest control, irrigation design, and weed control. Animal empathy and climate sense traits each give +2 bonus." },
      { id:"ng02", name:"Animal Handling",   cp:3, rank:7, stats:["willpower"],              desc:"Automatically steer carts and calm domesticated animals. Proficiency check to soothe frightened beasts. Grants +1 to animal-riding checks. Animal empathy trait gives +2 bonus." },
      { id:"ng03", name:"Animal Training",   cp:4, rank:5, stats:["willpower","leadership"], desc:"Train one declared creature type (dogs, falcons, horses, etc.). Basic tasks take weeks with no check. Complex tasks require proficiency checks. Animal empathy trait gives +1 bonus." },
      { id:"ng04", name:"Blacksmithing",     cp:4, rank:6, stats:["muscle","knowledge"],     desc:"Create iron tools, horseshoes, nails, buckles automatically. Proficiency check for intricate items like locks and wire cages. Cannot make weapons or armor." },
      { id:"ng05", name:"Boat Piloting",     cp:2, rank:6, stats:["muscle","knowledge"],     desc:"Navigate rowboats and small vessels. Succeeds automatically on calm waters. Proficiency check for rapids, storms, and rough currents. Each failed check reduces rating by –1." },
      { id:"ng06", name:"Brewing",           cp:3, rank:8, stats:["knowledge"],              desc:"Brew beer, wine, and spirits automatically. Optional check yields fine vintage on success." },
      { id:"ng07", name:"Carpentry",         cp:3, rank:7, stats:["stamina","knowledge"],    desc:"Build small structures, fences, carts, and cabinets automatically. Proficiency check for footbridges, dumbwaiters, and complex joints. Large structures require Engineering." },
      { id:"ng08", name:"Cobbling",          cp:3, rank:7, stats:["aim","knowledge"],        desc:"Make shoes, boots, and sandals automatically. Proficiency check for field repairs or makeshift materials." },
      { id:"ng09", name:"Cooking",           cp:3, rank:7, stats:["knowledge"],              desc:"Prepare meals automatically. Proficiency check for gourmet cooking or making unpalatable ingredients edible." },
      { id:"ng10", name:"Dancing",           cp:2, rank:6, stats:["balance","appearance"],  desc:"Know and perform all common dances automatically. Rare or archaic dances require a check. Spectacular performances combine tumbling and jumping." },
      { id:"ng11", name:"Deep Diving",       cp:2, rank:5, stats:["balance","health"],       desc:"Dive and surface at 30 ft/round (not 20). Hold breath for 2/3 Constitution in rounds instead of 1/3." },
      { id:"ng12", name:"Engineering",       cp:4, rank:5, stats:["knowledge","intuition"],  desc:"Design and supervise construction of houses, bridges, and fortifications. Automatically handles structures up to 30 ft. Checks required for larger bridges, fortresses, and war machines." },
      { id:"ng13", name:"Etiquette",         cp:2, rank:8, stats:["appearance","intuition"], desc:"Automatically handle formal protocol in familiar cultures. Checks required for foreign or unknown cultures. +2 if foreigners are same race. Empathy trait gives +2 bonus." },
      { id:"ng14", name:"Fire-building",     cp:2, rank:8, stats:["intuition","knowledge"],  desc:"Build a fire in 1d20 minutes with dry wood. Add d20 per bad condition (wet wood, rain, wind). Proficiency check required in worst conditions without shelter." },
      { id:"ng15", name:"Fishing",           cp:3, rank:6, stats:["intuition","knowledge"],  desc:"Catch fish with hook, net, or spear. Check required; success yields 1d6 fish/hour. Halved for large quarry." },
      { id:"ng16", name:"Gaming",            cp:2, rank:5, stats:["intuition","knowledge"],  desc:"Win gambling games against NPCs on a successful check (–1 per proficient NPC). Cheating gives +3 but risks detection on a 20." },
      { id:"ng17", name:"Heraldry",          cp:2, rank:8, stats:["knowledge"],              desc:"Identify heraldic symbols of home region automatically. Proficiency check for unusual or rare symbols. Obscure knowledge trait gives +2 bonus." },
      { id:"ng18", name:"Leatherworking",    cp:3, rank:7, stats:["knowledge","aim"],        desc:"Skin, tan, and work leather into clothing, armor, or bags automatically. Proficiency check for unusual items like boat patches or tents from scraps." },
      { id:"ng19", name:"Mining",            cp:5, rank:5, stats:["intuition","stamina"],    desc:"Select mine sites and supervise excavation. DM rolls checks secretly as results take time to manifest." },
      { id:"ng20", name:"Modern Languages",  cp:2, rank:9, stats:["knowledge"],              desc:"Speak one additional modern language. Each additional CP spent adds one more language." },
      { id:"ng21", name:"Musical Instrument",cp:2, rank:7, stats:["leadership"],             desc:"Play a specific instrument very well. Proficiency check for difficult pieces. Music/Instrument trait lets character learn 2 instruments per CP instead of 1." },
      { id:"ng22", name:"Navigation",        cp:3, rank:6, stats:["knowledge","intuition"],  desc:"Fix position at sea by celestial observation. No check with sextant and visible stars. Astrology proficiency adds +2; astronomy adds +3. Bad weather requires secret DM roll." },
      { id:"ng23", name:"Orienteering",      cp:3, rank:7, stats:["knowledge","intuition"],  desc:"Keep bearings in trackless terrain. No check with visible sky or compass. Map plus direction tracking allows arrival at specific points without checks." },
      { id:"ng24", name:"Painting",          cp:2, rank:7, stats:["aim","intuition"],        desc:"Render realistic portraits, landscapes, and monsters. Knowledge of perspective and shading. Artistic ability trait gives +2 and enables masterwork quality." },
      { id:"ng25", name:"Pottery",           cp:3, rank:7, stats:["aim"],                    desc:"Create serviceable ceramic vessels automatically. Proficiency check for fine quality (3 days); failure destroys piece, roll of 1 creates unique work. Artistic ability trait gives +2." },
      { id:"ng26", name:"Riding, Airborne",  cp:4, rank:5, stats:["willpower","balance"],   desc:"Fly and direct aerial mounts. Animal empathy trait adds +2; animal training adds +1." },
      { id:"ng27", name:"Riding, Land",      cp:2, rank:8, stats:["willpower","balance"],   desc:"Ride horses and other land mounts. Detailed maneuvers per Player's Handbook. Animal empathy trait adds +2; animal training adds +1." },
      { id:"ng28", name:"Rope Use",          cp:2, rank:8, stats:["aim","intuition"],        desc:"Tie all knots automatically. Adds +2 to mountaineering checks involving ropes. Adds +10% to climbing chance on rope. Check needed to escape bonds (2d6 minutes on success)." },
      { id:"ng29", name:"Sculpting",         cp:2, rank:5, stats:["aim","intuition"],        desc:"Render objects from stone and clay. High proficiency with artistic ability trait creates works of great beauty and monetary value." },
      { id:"ng30", name:"Seamanship",        cp:3, rank:8, stats:["intuition","balance"],   desc:"Operate galleys and sailing ships: row, rig, steer, patch hull. Does not grant navigation. Captain must check for navigating hazardous coastal waters." },
      { id:"ng31", name:"Singing",           cp:2, rank:5, stats:["leadership"],             desc:"Perform all common songs automatically. Rare songs require a check. Character can compose original songs with a check. Music/Singing trait adds +2." },
      { id:"ng32", name:"Stonemasonry",      cp:4, rank:5, stats:["stamina","intuition"],   desc:"Quarry, cut, and lay stone and brick automatically. Walls taller than 10 ft or structures with arches need checks without Engineering. Dwarves gain +2." },
      { id:"ng33", name:"Swimming",          cp:2, rank:9, stats:["stamina"],               desc:"Swim per AD&D water movement rules. Nonproficient characters can barely float. Each additional CP spent increases water movement rate by 1." },
      { id:"ng34", name:"Tailoring",         cp:3, rank:7, stats:["aim","knowledge"],        desc:"Sew garments from any cloth without checks. Checks required for unique spectacular items and field repairs (failure: patch holds only briefly). Halflings gain +1." },
      { id:"ng35", name:"Weather Knowledge", cp:2, rank:7, stats:["intuition"],             desc:"Predict immediate weather automatically. Check to predict next 12 hours (±6 modifier based on how far ahead)." },
      { id:"ng36", name:"Weaving",           cp:3, rank:6, stats:["knowledge","aim"],       desc:"Weave yarn into cloth, tapestries, and cloaks with loom. Artistic ability trait enables exceptionally beautiful cloth. Halflings gain +1." },
      { id:"ng37", name:"Foraging",          cp:3, rank:7, stats:["knowledge","intuition"],  desc:"Know edible plants, fungi, and insects in one terrain type. Check to find enough food for 1d6 people in 4 hours. Faster and more reliable than survival for food-only foraging tasks." },
    ],
  },
  {
    group: "Priest", groupTag: "priest",
    sub: "Priest-class characters pay listed cost; others pay +2 CP",
    profs: [
      { id:"np01", name:"Ancient History",   cp:3, rank:6, stats:["intuition","knowledge"],  desc:"Identify items, scrolls, and artwork of a specific historical period without check. Recall main figures with no check; lesser figures and legends require check. Obscure knowledge trait gives +3 bonus." },
      { id:"np02", name:"Ancient Languages", cp:4, rank:5, stats:["knowledge"],              desc:"Read at least one ancient language. Each additional CP spent adds one more language. Can decipher a paragraph of related tongue with a check. Precise memory trait gives +2 bonus." },
      { id:"np03", name:"Astrology",         cp:3, rank:5, stats:["intuition","knowledge"],  desc:"Identify constellations and make vague future predictions. Grants +2 to navigation checks when stars are visible. Empathy trait gives +1 bonus." },
      { id:"np04", name:"Healing",           cp:4, rank:5, stats:["intuition","leadership"], desc:"Restore 1d3 damage immediately after wounding (successful check). Heal 1 hp within one hour of wound. Only once per character per day. Also aids long-term healing and poison/disease recovery." },
      { id:"np05", name:"Herbalism",         cp:3, rank:6, stats:["knowledge","intuition"],  desc:"Gather 2d6 doses of herbs with a day of searching and a check. Herbs add +1 to healing checks; heal 1 hp even without healing prof. Two doses make one poison (effects DM-negotiated)." },
      { id:"np06", name:"Local History",     cp:2, rank:8, stats:["knowledge","appearance"], desc:"Know full background of a specific region; +2 reaction bonus from locals. Specific questions (knight's banner, NPC identity) require proficiency check. Obscure knowledge trait gives +3 bonus." },
      { id:"np07", name:"Reading/Writing",   cp:2, rank:8, stats:["knowledge"],              desc:"Literacy in one contemporary language (must be able to speak it). Each additional CP grants literacy in one more language." },
      { id:"np08", name:"Religion",          cp:2, rank:6, stats:["intuition"],              desc:"Know tenets of major and minor faiths. Understand religious significance without checks. Foreign or unique religions require checks. Additional CPs expand or deepen religious knowledge." },
      { id:"np09", name:"Spellcraft",        cp:3, rank:7, stats:["knowledge"],              desc:"Identify spells being cast by observing caster (check, +2 if both see and hear). Detect if an item is enchanted. Wizards gain +2 for their specialty school." },
      { id:"np10", name:"Administration",   cp:3, rank:6, stats:["knowledge","leadership"],  desc:"Manage organizations, temples, or estates. Routine administrative tasks automatic; complex situations (budgets, staff disputes, legal questions) require a check. Essential for running a temple domain." },
      { id:"np11", name:"Ceremony",         cp:2, rank:7, stats:["knowledge","willpower"],   desc:"Perform all religious rites, marriages, funerals, and holy festivals correctly for a familiar faith. Check required for foreign faiths. Essential for clergy maintaining a congregation's confidence." },
      { id:"np12", name:"Debate",           cp:3, rank:6, stats:["knowledge","leadership"],  desc:"Argue and reason effectively in formal discourse. Check to win a formal debate or persuade an audience with logic. Leadership trait adds +2. Also aids in identifying logical fallacies." },
      { id:"np13", name:"Faith",            cp:3, rank:5, stats:["willpower","intuition"],   desc:"Deep spiritual conviction reinforces the mind against supernatural influence. Grants +2 to saving throws against fear, charm, and mind control. DM may call for checks when faith is severely tested." },
      { id:"np14", name:"Omen Reading",     cp:2, rank:6, stats:["intuition","knowledge"],   desc:"Interpret natural omens — bird flights, animal behavior, weather patterns, or entrails — for divine guidance. DM determines accuracy secretly (vague hints, never specific predictions). Mystical trait adds +2." },
      { id:"np15", name:"Oratory",          cp:3, rank:6, stats:["leadership","appearance"],  desc:"Move and persuade crowds with passionate public speaking. Check to inspire allies (+1 morale), calm panicked groups, or sway uncommitted listeners. Leadership trait adds +2. Ineffective in small groups of fewer than 5." },
    ],
  },
  {
    group: "Rogue", groupTag: "rogue",
    sub: "Rogue-class characters pay listed cost; others pay +2 CP",
    profs: [
      { id:"nr01", name:"Ancient History",    cp:3, rank:6, stats:["intuition","knowledge"],  desc:"See Priest group — same proficiency available to rogues at same cost." },
      { id:"nr02", name:"Appraising",         cp:2, rank:8, stats:["knowledge","intuition"],  desc:"Assess value of common objects ±10% automatically. Art and unique items ±25%. Proficiency check to identify forgeries, get ±5% accuracy, or appraise artifacts. DM may roll secretly." },
      { id:"nr03", name:"Blind-fighting",     cp:4, rank:6, stats:["intuition","balance"],   desc:"Fight in darkness at –2 (not –4) to attacks; no AC penalty vs melee. In starlight: –1 to attacks. Movement check each round. Invisible foes: –2 to attack only." },
      { id:"nr04", name:"Cryptography",       cp:3, rank:6, stats:["knowledge","intuition"],  desc:"Decipher codes; check gives general overview. Best used as role-playing puzzle: character may recognize hidden messages in text, tapestry, or heraldry. Second check gives a clue (name/date)." },
      { id:"nr05", name:"Disguise",           cp:3, rank:5, stats:["intuition","leadership"], desc:"Alter appearance without check if not concealing sex/race/size. Check for talking with acquaintances. –2 per category of alteration (sex, race, size). –2 to impersonate specific person. Impersonation trait gives +2." },
      { id:"nr06", name:"Forgery",            cp:3, rank:5, stats:["aim","willpower"],        desc:"Create false documents, mimic handwriting (must see signature). DM rolls secretly. –2 penalty for longer messages. DM also rolls to detect forgeries; roll of 20 means wrong conclusion." },
      { id:"nr07", name:"Gem Cutting",        cp:3, rank:6, stats:["aim"],                    desc:"Cut 1d10 uncut stones per day. Decent work done automatically. Check for exceptional quality: failure destroys stone; success doubles gem value." },
      { id:"nr08", name:"Juggling",           cp:2, rank:7, stats:["aim","muscle"],           desc:"Juggle up to 3 items automatically; each beyond 4th requires check at –1. Can catch thrown small weapons with –2 check (must face attacker). Failure means automatic hit by thrown item." },
      { id:"nr09", name:"Jumping",            cp:2, rank:8, stats:["muscle","balance"],       desc:"Running broad jump 20 ft without check (demi-humans 15 ft). High jump 4 ft, standing jump 8 ft. Each foot/6\" beyond base needs check at –1. Pole vault up to pole height." },
      { id:"nr10", name:"Local History",      cp:2, rank:8, stats:["knowledge","appearance"], desc:"See Priest group — same proficiency." },
      { id:"nr11", name:"Reading Lips",       cp:3, rank:7, stats:["knowledge","appearance"], desc:"Understand speech of those seen but not heard (within 30 ft, well-lit). No check if speaker intends to be understood. Check to overhear unintended speech; success gives gist. Empathy trait adds +2." },
      { id:"nr12", name:"Set Snares",         cp:3, rank:6, stats:["aim","intuition"],        desc:"Set 2 small snares/hour automatically. Check each 8-hour period; success catches small animal. Animal lore adds +2; animal empathy trait adds +2. Pit trap (8 ft deep) requires check and 8+ hours." },
      { id:"nr13", name:"Tightrope Walking",  cp:3, rank:5, stats:["balance"],               desc:"Walk ropes and beams at 60 ft/round. Surfaces 4\"+ wide need no check. Narrower surfaces require check; balance pole adds +2. Attack or damage while on rope requires check or fall." },
      { id:"nr14", name:"Throwing",           cp:2, rank:8, stats:["aim","muscle"],           desc:"Add 10 ft to each thrown weapon range category. +1 to damage or attack roll per throw (declare before rolling). Each additional CP adds 5 ft; every 4 CPs add another +1." },
      { id:"nr15", name:"Tumbling",           cp:3, rank:7, stats:["balance","muscle"],       desc:"Somersault, flip, roll. Improve AC by 4 (win initiative, don't attack, move ≤20 ft). +2 to attack in unarmed combat. Check to dodge through tight spaces. ≤60 ft fall: half damage on check." },
      { id:"nr16", name:"Ventriloquism",      cp:4, rank:5, stats:["knowledge","leadership"], desc:"Make voices seem to come from elsewhere (within 20 ft). Check required; modifiers for audience Intelligence, distance, believability, and duration of display." },
      { id:"nr17", name:"Begging",           cp:2, rank:7, stats:["appearance","leadership"], desc:"Solicit charity from passersby. Check yields 1d6 cp per hour in a populated area. Success on a 1 earns a d6 sp. Empathy trait adds +2. Will not work on adventurers or those already solicited that day." },
      { id:"nr18", name:"Bribery",           cp:3, rank:6, stats:["knowledge","leadership"],  desc:"Know when, how, and how much to offer a bribe without getting arrested. Check determines if target is open to bribery; a second check (using CHA) determines if the bribe is accepted. Empathy trait adds +2." },
      { id:"nr19", name:"Escape Artist",     cp:3, rank:5, stats:["aim","balance"],           desc:"Escape from ropes, manacles, and other restraints. Check to free oneself in 1d6 rounds. Rope Use proficiency grants +3 bonus to escape rope bonds. Repeated attempts allowed at –2 cumulative penalty." },
      { id:"nr20", name:"Fortune Telling",   cp:2, rank:6, stats:["leadership","intuition"],  desc:"Read palms, cards, or tea leaves for credible-seeming predictions. Check to convince a mark; success buys goodwill (+1 reaction). Empathy trait adds +2. Actually accurate results are pure luck (DM's discretion)." },
      { id:"nr21", name:"Looting",           cp:2, rank:7, stats:["knowledge","intuition"],   desc:"Quickly identify and gather the most valuable items from a looted area in 1 round. Check to find a hidden cache or spot something valuable missed by others. Appraising adds +2." },
      { id:"nr22", name:"Observation",       cp:2, rank:8, stats:["intuition","knowledge"],   desc:"Notice and retain small details about people, rooms, and scenes. Check to accurately recall specifics from a previously visited place (1 check per detail). Empathy trait adds +2." },
      { id:"nr23", name:"Sign Language",     cp:2, rank:8, stats:["aim","knowledge"],         desc:"Communicate silently using hand signals. Basic messages (danger, direction, numbers) require no check. Complex or abstract messages require a check. The signing language must be agreed upon in advance." },
      { id:"nr24", name:"Trailing",          cp:2, rank:7, stats:["intuition","balance"],     desc:"Follow a person discreetly through crowds or streets without being spotted. Check each hour of trailing. Failure means the subject notices the character. Disguise proficiency adds +2." },
      { id:"nr25", name:"Acting",            cp:2, rank:7, stats:["leadership","appearance"],  desc:"Portray characters convincingly on stage or in roleplay. Check for demanding performances requiring genuine emotion. Disguise proficiency adds +1. Impersonation trait adds +2. A successful performance grants +1 reaction bonus from audience." },
      { id:"nr26", name:"Artistic Ability",  cp:1, rank:10, stats:["intuition","aim"],        desc:"Natural artistic talent. Grants +2 to all checks involving painting, sculpting, and pottery. Enables masterwork-quality results in any artistic proficiency. Counts as the Artistic Ability trait for kit requirements." },
      { id:"nr27", name:"Poetry",            cp:2, rank:7, stats:["knowledge","leadership"],  desc:"Compose and recite poetry from any literary tradition. Check to craft memorably moving verse; success grants +1 reaction bonus to the audience for one day. Extended compositions of 100+ lines require multiple checks." },
      { id:"nr28", name:"Storytelling",      cp:2, rank:7, stats:["leadership","knowledge"],  desc:"Entertain and inform audiences through oral narrative. Check to hold a crowd's attention for up to one hour. A failed check means the audience loses interest halfway through. Music/Singing trait adds +1." },
    ],
  },
  {
    group: "Warrior", groupTag: "warrior",
    sub: "Warrior-class characters pay listed cost; others pay +2 CP",
    profs: [
      { id:"nw01", name:"Animal Lore",        cp:3, rank:7, stats:["knowledge","intuition"],  desc:"Know feeding and social habits of familiar animals without check. Check to predict attack/flight or imitate animal calls. +2 bonus to set snares checks. Failed call imitation may fool humans but not the animals themselves." },
      { id:"nw02", name:"Armorer",            cp:5, rank:5, stats:["knowledge","muscle"],     desc:"Craft all armor types with proper materials (2 weeks for shield; 20 weeks for plate mail). No check normally. Check required if rushing or using inferior materials. Field repair of damaged armor always requires a check." },
      { id:"nw03", name:"Blind-fighting",     cp:4, rank:6, stats:["intuition","balance"],   desc:"See Rogue group — same proficiency available to warriors at same cost." },
      { id:"nw04", name:"Bowyer/Fletcher",    cp:5, rank:6, stats:["knowledge","aim"],       desc:"Make bows and 2d12 arrows per day (find materials may take days). Weaponsmiths needed for steel arrowheads; fire-hardened tips suffer –1 damage and 50% break chance on miss." },
      { id:"nw05", name:"Charioteering",      cp:4, rank:5, stats:["balance","willpower"],   desc:"Drive chariot at normal speed over roads and open terrain without check. Check to navigate obstacles, fords, or rough ground; also adds 1/3 movement on a charge. Animal empathy trait gives +1 bonus." },
      { id:"nw06", name:"Endurance",          cp:2, rank:3, stats:["fitness"],               desc:"Perform strenuous activity twice as long as normal before exhaustion. Add endurance score to Strength/Stamina or Constitution/Fitness checks when required." },
      { id:"nw07", name:"Hunting",            cp:2, rank:7, stats:["intuition"],             desc:"Locate game; always requires a proficiency check. Success puts hunter within 1d100+100 yards of quarry (2–12 hours). Also includes skinning and butchering animals (no check needed)." },
      { id:"nw08", name:"Mountaineering",     cp:4, rank:7, stats:["stamina","willpower"],   desc:"Use ropes and pitons to secure mountain routes. Non-proficient roped companions can follow. Check if route is very perilous. Catch a falling roped companion with a check (20 = both fall). Adds proficiency rating to thief's climb walls %." },
      { id:"nw09", name:"Running",            cp:2, rank:5, stats:["stamina","fitness"],     desc:"Sprint at +1/3 speed for 1 turn; then rest 1 turn. Jog at 2× speed all day. After rest, check to use running ability next day; failure means ability unavailable that day." },
      { id:"nw10", name:"Set Snares",         cp:4, rank:8, stats:["aim","intuition"],       desc:"See Rogue group — warrior version costs 4 CP." },
      { id:"nw11", name:"Survival",           cp:3, rank:6, stats:["knowledge","willpower"],  desc:"Know one terrain type (arctic, woodland, desert, plains, or tropical). Daily check to find food/water/shelter (1d6 hours for water, 2d6 turns for food). Also detect natural hazards like avalanches and quicksand." },
      { id:"nw12", name:"Tracking",           cp:4, rank:7, stats:["intuition"],             desc:"Follow tracks per Player's Handbook (no –6 integral penalty; already in rating). Rangers gain +5. Animal empathy adds +2 tracking non-domestic animals. Animal lore adds +2 tracking any animal." },
      { id:"nw13", name:"Weaponsmithing",     cp:5, rank:5, stats:["knowledge","aim"],       desc:"Create all metal weapons per PHB time/material requirements. After completion, optional check for exceptional weapon worth 50% more. Failure destroys it. Dwarves gain +1 bonus." },
      { id:"nw14", name:"Display Weaponry",  cp:2, rank:7, stats:["muscle","balance"],       desc:"Perform impressive weapon demonstrations for spectators. Check to deliver a display that inspires allies (+1 morale bonus for 1 turn) or intimidates enemies (–1 morale). Also used in competitions and tournaments." },
      { id:"nw15", name:"Jousting",          cp:4, rank:6, stats:["muscle","balance"],       desc:"Compete effectively in jousting tournaments. On a mounted charge, a hit that deals damage dismounts the opponent on a check. Requires Riding (Land-Based). Tournament rules and heraldic customs are known automatically." },
      { id:"nw16", name:"Siege Engineering", cp:4, rank:5, stats:["knowledge","muscle"],     desc:"Design, build, and operate siege weapons (catapults, ballistas, rams, siege towers). No check for routine crew operation. Check to build siege equipment in the field or fire at long range. Engineering adds +2." },
      { id:"nw17", name:"Camouflage",        cp:3, rank:6, stats:["intuition","aim"],        desc:"Conceal oneself, allies, or equipment in natural terrain using foliage, mud, and netting. Check to remain undetected; +2 bonus in the character's familiar terrain type. Does not stack with racial invisibility." },
      { id:"nw18", name:"Whistling/Mimicry", cp:2, rank:7, stats:["knowledge","leadership"],  desc:"Imitate bird calls, animal sounds, and environmental noises. Check to fool animals or signal allies; a failure means the sound is clearly unnatural. Each additional CP spent adds one creature type to the repertoire." },
    ],
  },
  {
    group: "Wizard", groupTag: "wizard",
    sub: "Wizard-class characters pay listed cost; others pay +2 CP",
    profs: [
      { id:"nz01", name:"Ancient History",   cp:3, rank:6, stats:["intuition","knowledge"],  desc:"See Priest group — same proficiency available to wizards at same cost." },
      { id:"nz02", name:"Ancient Languages", cp:4, rank:5, stats:["knowledge"],              desc:"See Priest group — same proficiency." },
      { id:"nz03", name:"Astrology",         cp:3, rank:5, stats:["intuition","knowledge"],  desc:"See Priest group — same proficiency." },
      { id:"nz04", name:"Astronomy",         cp:2, rank:7, stats:["knowledge"],              desc:"Predict eclipses, comets, and planetary phenomena with complete accuracy. Identify stars and constellations. Grants +3 to all navigation checks when stars are visible." },
      { id:"nz05", name:"Cryptography",      cp:3, rank:6, stats:["knowledge","intuition"],  desc:"See Rogue group — same proficiency available to wizards at same cost." },
      { id:"nz06", name:"Gem Cutting",       cp:3, rank:6, stats:["aim"],                    desc:"See Rogue group — same proficiency." },
      { id:"nz07", name:"Herbalism",         cp:3, rank:6, stats:["knowledge","intuition"],  desc:"See Priest group — same proficiency." },
      { id:"nz08", name:"Reading/Writing",   cp:2, rank:8, stats:["knowledge"],              desc:"See Priest group — same proficiency." },
      { id:"nz09", name:"Religion",          cp:2, rank:6, stats:["intuition"],              desc:"See Priest group — same proficiency." },
      { id:"nz10", name:"Spellcraft",        cp:3, rank:7, stats:["knowledge"],              desc:"See Priest group — same proficiency. Wizards gain +2 for their specialty school." },
      { id:"nz11", name:"Alchemy",          cp:4, rank:5, stats:["knowledge","intuition"],   desc:"Create potions, acids, alchemical compounds, and reagents. A check is required; failure destroys materials (a roll of 1 causes a minor explosion). Requires a lab. Each formula is a separate application of the proficiency." },
      { id:"nz12", name:"Research",         cp:3, rank:7, stats:["knowledge","intuition"],   desc:"Systematically investigate arcane topics in a library. Check to reduce spell research time by 1d6 days or locate obscure magical historical information. Ancient Languages and Spellcraft each add +1." },
    ],
  },
];

export const ALL_NWP = NWP_GROUPS.flatMap(g => g.profs);

// Static lookup: prof id -> its group's groupTag (e.g. "general", "priest", "warrior", etc.)
// Individual prof objects don't carry groupTag — only their parent group does.
export const PROF_GROUPTAG = Object.fromEntries(
  NWP_GROUPS.flatMap(g => g.profs.map(p => [p.id, g.groupTag]))
);

// NWP CP pools awarded at Chapter 6 step
export const NWP_CP_POOL  = { warrior:6, wizard:8, priest:8, rogue:6 };

// ═══════════════════════════════════════════════════════════════════
//  CHAPTER 7 — WEAPON PROFICIENCIES (S&P Table 48–49)
// ═══════════════════════════════════════════════════════════════════

// CP pools awarded at this step (Chapter 7) — separate from NWP pool
// NOTE: WEAP_CP_POOL and everything from line 1984 onward belongs in weapons.js
export const WEAP_CP_POOL = { warrior:8, wizard:3, priest:8, rogue:6 };

export const PROFICIENCY_GROUPS = NWP_GROUPS;
export const ALL_PROFS = ALL_NWP;
