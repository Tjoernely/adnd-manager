// data/socialStatus.js — Per-kit social status rank tables
// Each entry: { min, max, tier, label, color }
// Roll 2d6 → matched rank. 7 tiers follow the 2d6 probability distribution.

const G = "#d4a035"; // gold for top rank
const T = "#60b090"; // teal for upper-middle
const G2 = "#60a080"; // green for middle-upper
const M = "#909050"; // muted olive for middle
const L = "#8a7840"; // low-mid
const R = "#886040"; // lower
const D = "#805050"; // dim red for bottom

// ── Generic fallback ─────────────────────────────────────────────────────────
export const SOCIAL_RANKS_DEFAULT = [
  { min: 2,  max: 2,  tier: "Lower",        label: "Slave / Destitute",          color: D },
  { min: 3,  max: 4,  tier: "Lower",        label: "Serf / Peasant",             color: R },
  { min: 5,  max: 6,  tier: "Lower Middle", label: "Freeman / Laborer",          color: L },
  { min: 7,  max: 8,  tier: "Middle",       label: "Artisan / Tradesman",        color: M },
  { min: 9,  max: 10, tier: "Upper Middle", label: "Merchant / Minor Landowner", color: G2 },
  { min: 11, max: 11, tier: "Upper",        label: "Gentry / Wealthy Merchant",  color: T },
  { min: 12, max: 12, tier: "Upper",        label: "Nobility / Minor Lord",      color: G },
];

// ── Kit-specific rank tables ─────────────────────────────────────────────────
const KIT_SOCIAL_RANKS = {

  acrobat: [
    { min:2,  max:2,  tier:"Outcast",     label:"Street beggar, despised clown",    color:D },
    { min:3,  max:4,  tier:"Vagrant",     label:"Wandering street performer",       color:R },
    { min:5,  max:6,  tier:"Apprentice",  label:"Circus troupe member",             color:L },
    { min:7,  max:8,  tier:"Journeyman",  label:"Skilled acrobat, local renown",    color:M },
    { min:9,  max:10, tier:"Celebrated",  label:"Famous performer, court welcome",  color:G2 },
    { min:11, max:11, tier:"Master",      label:"Master acrobat, troupe leader",    color:T },
    { min:12, max:12, tier:"Legend",      label:"Greatest entertainer of the age",  color:G },
  ],

  assassin: [
    { min:2,  max:2,  tier:"Hunted",      label:"Wanted criminal, no guild",        color:D },
    { min:3,  max:4,  tier:"Street Thug", label:"Low-level enforcer / cutthroat",   color:R },
    { min:5,  max:6,  tier:"Operative",   label:"Guild initiate, minor contracts",  color:L },
    { min:7,  max:8,  tier:"Agent",       label:"Recognized guild member",          color:M },
    { min:9,  max:10, tier:"Veteran",     label:"Senior assassin, lucrative work",  color:G2 },
    { min:11, max:11, tier:"Guildmaster", label:"High-ranking guild officer",       color:T },
    { min:12, max:12, tier:"Spymaster",   label:"Master assassin, shadow lord",     color:G },
  ],

  barbarian: [
    { min:2,  max:2,  tier:"Exile",       label:"Cast out, dishonored",             color:D },
    { min:3,  max:4,  tier:"Thrall",      label:"Bondsman, lowest caste",           color:R },
    { min:5,  max:6,  tier:"Warrior",     label:"Proven fighter, free tribesman",   color:L },
    { min:7,  max:8,  tier:"Champion",    label:"Battle-tested warrior, respected", color:M },
    { min:9,  max:10, tier:"Warlord",     label:"Chieftain's champion or sub-chief",color:G2 },
    { min:11, max:11, tier:"Chieftain",   label:"Chief of a large clan/tribe",      color:T },
    { min:12, max:12, tier:"High Chief",  label:"Paramount chief, legendary hero",  color:G },
  ],

  beggar: [
    { min:2,  max:2,  tier:"Wretched",    label:"Pariah, untouchable outcast",      color:D },
    { min:3,  max:4,  tier:"Destitute",   label:"Homeless, dependent on charity",   color:R },
    { min:5,  max:6,  tier:"Known Mendicant", label:"Regular fixture, known route", color:L },
    { min:7,  max:8,  tier:"Organized",   label:"Member of beggars' brotherhood",   color:M },
    { min:9,  max:10, tier:"Leader",      label:"Corner lord, manages territory",   color:G2 },
    { min:11, max:11, tier:"Guild Head",  label:"Thieves' guild affiliate, informer",color:T },
    { min:12, max:12, tier:"Beggar King", label:"Underworld legend, feared patron", color:G },
  ],

  cavalier: [
    { min:2,  max:2,  tier:"Disgraced",   label:"Stripped of rank, dishonored",     color:D },
    { min:3,  max:4,  tier:"Squire",      label:"Household squire, unproven",       color:R },
    { min:5,  max:6,  tier:"Knight",      label:"Landed knight, minor estate",      color:L },
    { min:7,  max:8,  tier:"Lord",        label:"Minor lord, sworn retinue",        color:M },
    { min:9,  max:10, tier:"Baron",       label:"Baron or baronet, notable fiefdom",color:G2 },
    { min:11, max:11, tier:"Count",       label:"Count / earl, significant domain", color:T },
    { min:12, max:12, tier:"High Lord",   label:"Duke or palatine, near-royal rank",color:G },
  ],

  diplomat: [
    { min:2,  max:2,  tier:"Fallen",      label:"Disgraced envoy, persona non grata",color:D },
    { min:3,  max:4,  tier:"Clerk",       label:"Minor palace clerk, no standing",  color:R },
    { min:5,  max:6,  tier:"Attaché",     label:"Diplomatic staff, junior rank",    color:L },
    { min:7,  max:8,  tier:"Envoy",       label:"Recognized envoy, safe passage",   color:M },
    { min:9,  max:10, tier:"Ambassador",  label:"Full ambassador, respected speaker",color:G2 },
    { min:11, max:11, tier:"Plenipotentiary", label:"Plenipotentiary, treaty power",  color:T },
    { min:12, max:12, tier:"High Consul", label:"High consul, near-sovereign voice", color:G },
  ],

  explorer: [
    { min:2,  max:2,  tier:"Lost",        label:"Abandoned, no sponsor",            color:D },
    { min:3,  max:4,  tier:"Wanderer",    label:"Aimless traveler, no backing",     color:R },
    { min:5,  max:6,  tier:"Scout",       label:"Known guide, trade route mapper",  color:L },
    { min:7,  max:8,  tier:"Surveyor",    label:"Guild cartographer, sponsored",    color:M },
    { min:9,  max:10, tier:"Pathfinder",  label:"Renowned explorer, medal recipient",color:G2 },
    { min:11, max:11, tier:"Discoverer",  label:"Named a new territory, famous",    color:T },
    { min:12, max:12, tier:"Legend",      label:"Greatest explorer of the age",     color:G },
  ],

  gladiator: [
    { min:2,  max:2,  tier:"Slave",       label:"Arena slave, no rights",           color:D },
    { min:3,  max:4,  tier:"Novice",      label:"New to the sands, unproven",       color:R },
    { min:5,  max:6,  tier:"Fighter",     label:"Known fighter, modest wins",       color:L },
    { min:7,  max:8,  tier:"Champion",    label:"Arena champion, crowd favorite",   color:M },
    { min:9,  max:10, tier:"Star",        label:"Star gladiator, sponsor income",   color:G2 },
    { min:11, max:11, tier:"Hero",        label:"Freedman hero, city celebration",  color:T },
    { min:12, max:12, tier:"Legend",      label:"Undefeated legend, near-noble rank",color:G },
  ],

  jester: [
    { min:2,  max:2,  tier:"Reject",      label:"Mocked and driven away",           color:D },
    { min:3,  max:4,  tier:"Buffoon",     label:"Street fool, no patron",           color:R },
    { min:5,  max:6,  tier:"Entertainer", label:"Inn performer, minor wages",       color:L },
    { min:7,  max:8,  tier:"Fool",        label:"Kept fool of minor lord",          color:M },
    { min:9,  max:10, tier:"Court Jester","label":"Royal court jester, privileged", color:G2 },
    { min:11, max:11, tier:"Wit",         label:"Renowned wit, near-confidant",     color:T },
    { min:12, max:12, tier:"King's Fool", label:"Speaks truth to kings, untouchable",color:G },
  ],

  mariner: [
    { min:2,  max:2,  tier:"Castaway",    label:"Stranded, no ship, no credit",     color:D },
    { min:3,  max:4,  tier:"Deckhand",    label:"Lowly deckhand, common sailor",    color:R },
    { min:5,  max:6,  tier:"Bosun",       label:"Bosun or mate, small crew",        color:L },
    { min:7,  max:8,  tier:"Captain",     label:"Captain of trading vessel",        color:M },
    { min:9,  max:10, tier:"Commodore",   label:"Commodore, small fleet",           color:G2 },
    { min:11, max:11, tier:"Admiral",     label:"Fleet admiral, port authority",    color:T },
    { min:12, max:12, tier:"Sea Lord",    label:"Master of seas, legendary captain", color:G },
  ],

  merchant: [
    { min:2,  max:2,  tier:"Bankrupt",    label:"Ruined trader, heavy debts",       color:D },
    { min:3,  max:4,  tier:"Peddler",     label:"Itinerant peddler, no fixed base", color:R },
    { min:5,  max:6,  tier:"Shopkeeper",  label:"Small shop, local reputation",     color:L },
    { min:7,  max:8,  tier:"Merchant",    label:"Established merchant, trade routes",color:M },
    { min:9,  max:10, tier:"Magnate",     label:"Wealthy merchant, guild officer",  color:G2 },
    { min:11, max:11, tier:"Guildmaster", label:"Guildmaster, city council seat",   color:T },
    { min:12, max:12, tier:"Merchant Prince", label:"Merchant prince, noble-equal", color:G },
  ],

  mystic: [
    { min:2,  max:2,  tier:"Heretic",     label:"Expelled from order, shunned",     color:D },
    { min:3,  max:4,  tier:"Novice",      label:"Junior initiate, humble novice",   color:R },
    { min:5,  max:6,  tier:"Acolyte",     label:"Acolyte, monastery duties",        color:L },
    { min:7,  max:8,  tier:"Brother/Sister","label":"Full monk, respected in order", color:M },
    { min:9,  max:10, tier:"Elder",       label:"Elder of the order, advisor",      color:G2 },
    { min:11, max:11, tier:"Prior",       label:"Prior/Abbot, heads a monastery",   color:T },
    { min:12, max:12, tier:"Grand Master","label":"Grand master, order patriarch",   color:G },
  ],

  noble: [
    { min:2,  max:2,  tier:"Disinherited","label":"Disinherited, stripped of title", color:D },
    { min:3,  max:4,  tier:"Cadet Branch","label":"Distant cadet branch, no estate", color:R },
    { min:5,  max:6,  tier:"Knight",      label:"Knight banneret, minor fief",      color:L },
    { min:7,  max:8,  tier:"Lord",        label:"Lord of a manor, sworn vassal",    color:M },
    { min:9,  max:10, tier:"Baron",       label:"Baron, regional authority",        color:G2 },
    { min:11, max:11, tier:"Viscount/Earl","label":"Viscount or earl, high peerage", color:T },
    { min:12, max:12, tier:"Duke/Prince", label:"Duke or prince of the realm",      color:G },
  ],

  outlaw: [
    { min:2,  max:2,  tier:"Fugitive",    label:"Wanted, hunted by all factions",   color:D },
    { min:3,  max:4,  tier:"Bandit",      label:"Common bandit, loose band",        color:R },
    { min:5,  max:6,  tier:"Road Captain","label":"Leads a small outlaw gang",       color:L },
    { min:7,  max:8,  tier:"Outlaw Lord", label:"Controls territory, feared",       color:M },
    { min:9,  max:10, tier:"Folk Hero",   label:"Beloved by peasants, feared by nobles",color:G2 },
    { min:11, max:11, tier:"Legend",      label:"Songs sung about your deeds",      color:T },
    { min:12, max:12, tier:"Myth",        label:"Half-myth, entire region claims kin",color:G },
  ],

  peasanthero: [
    { min:2,  max:2,  tier:"Serf",        label:"Bound serf, no freedom",           color:D },
    { min:3,  max:4,  tier:"Freeman",     label:"Free peasant, small plot",         color:R },
    { min:5,  max:6,  tier:"Yeoman",      label:"Yeoman farmer, local respect",     color:L },
    { min:7,  max:8,  tier:"Village Hero","label":"Local champion, elected speaker", color:M },
    { min:9,  max:10, tier:"Champion",    label:"Regional hero, lord's attention",  color:G2 },
    { min:11, max:11, tier:"Celebrated",  label:"Knighted or given a grant",        color:T },
    { min:12, max:12, tier:"Legend",      label:"Common-born legend, ballads sung", color:G },
  ],

  pirate: [
    { min:2,  max:2,  tier:"Press-ganged","label":"Shanghaied crew, no free will",   color:D },
    { min:3,  max:4,  tier:"Deckhand",    label:"Ordinary sea rat, minimum share",  color:R },
    { min:5,  max:6,  tier:"Crewman",     label:"Trusted crewman, full share",      color:L },
    { min:7,  max:8,  tier:"Quartermaster","label":"Quartermaster, elected officer",  color:M },
    { min:9,  max:10, tier:"Captain",     label:"Captain of a pirate vessel",       color:G2 },
    { min:11, max:11, tier:"Corsair Lord","label":"Commands a fleet, feared coast",  color:T },
    { min:12, max:12, tier:"Pirate King", label:"Uncrowned king of the free seas",  color:G },
  ],

  pugilist: [
    { min:2,  max:2,  tier:"Brawler",     label:"Street brawler, no reputation",    color:D },
    { min:3,  max:4,  tier:"Pit Fighter", label:"Basement pit fighter, low purse",  color:R },
    { min:5,  max:6,  tier:"Prizefighter","label":"Known prizefighter, steady bouts",color:L },
    { min:7,  max:8,  tier:"Champion",    label:"Regional champion, large purse",   color:M },
    { min:9,  max:10, tier:"Star",        label:"Famous fighter, large following",  color:G2 },
    { min:11, max:11, tier:"Grand Champ","label":"Grand champion, patron-sponsored", color:T },
    { min:12, max:12, tier:"Legend",      label:"Undefeated champion of the realm", color:G },
  ],

  rider: [
    { min:2,  max:2,  tier:"Stablehand",  label:"Mucking stalls, no rank",          color:D },
    { min:3,  max:4,  tier:"Groom",       label:"Horse groom, minor household",     color:R },
    { min:5,  max:6,  tier:"Cavalryman",  label:"Light cavalry trooper",            color:L },
    { min:7,  max:8,  tier:"Scout",       label:"Cavalry scout, trusted position",  color:M },
    { min:9,  max:10, tier:"Sergeant",    label:"Cavalry sergeant, small unit",     color:G2 },
    { min:11, max:11, tier:"Knight",      label:"Knighted for valor on horseback",  color:T },
    { min:12, max:12, tier:"Master of Horse","label":"Master of horse, noble stables",color:G },
  ],

  savage: [
    { min:2,  max:2,  tier:"Outcast",     label:"Banished, spirit-cursed",          color:D },
    { min:3,  max:4,  tier:"Thrall",      label:"Lowest caste, does menial work",   color:R },
    { min:5,  max:6,  tier:"Warrior",     label:"Proven warrior, respected",        color:L },
    { min:7,  max:8,  tier:"Elder",       label:"Elder warrior, council voice",     color:M },
    { min:9,  max:10, tier:"Champion",    label:"Battle champion, spiritual guide", color:G2 },
    { min:11, max:11, tier:"Chief",       label:"Chief of the clan/tribe",          color:T },
    { min:12, max:12, tier:"High Shaman", label:"Spirit-chosen champion, prophet",  color:G },
  ],

  scholar: [
    { min:2,  max:2,  tier:"Expelled",    label:"Expelled from academy",            color:D },
    { min:3,  max:4,  tier:"Student",     label:"Student with no credentials",      color:R },
    { min:5,  max:6,  tier:"Teacher",     label:"Minor tutor, village school",      color:L },
    { min:7,  max:8,  tier:"Professor",   label:"Professor at a minor institution", color:M },
    { min:9,  max:10, tier:"Sage",        label:"Sage of note, consulted by lords", color:G2 },
    { min:11, max:11, tier:"Arch-Scholar","label":"Head of a major academy",         color:T },
    { min:12, max:12, tier:"Grand Sage",  label:"Greatest mind of the age",         color:G },
  ],

  scout: [
    { min:2,  max:2,  tier:"Lost",        label:"Directionally hopeless, unreliable",color:D },
    { min:3,  max:4,  tier:"Tracker",     label:"Tracker hired for odd jobs",       color:R },
    { min:5,  max:6,  tier:"Ranger",      label:"Recognized ranger, patrol work",   color:L },
    { min:7,  max:8,  tier:"Pathfinder",  label:"Trusted army scout, permanent post",color:M },
    { min:9,  max:10, tier:"Master Scout","label":"Chief scout, commands others",    color:G2 },
    { min:11, max:11, tier:"Warden",      label:"Regional warden, large territory", color:T },
    { min:12, max:12, tier:"Ranger Lord", label:"Lord of the wilds, legend",        color:G },
  ],

  sharpshooter: [
    { min:2,  max:2,  tier:"Recruit",     label:"Cannot hit a barn door",           color:D },
    { min:3,  max:4,  tier:"Marksman",    label:"Competent marksman, basic rank",   color:R },
    { min:5,  max:6,  tier:"Sharpshooter","label":"Notable shot, competition wins",  color:L },
    { min:7,  max:8,  tier:"Champion",    label:"Regional champion archer/gunner",  color:M },
    { min:9,  max:10, tier:"Expert",      label:"Renowned expert, noble sponsor",   color:G2 },
    { min:11, max:11, tier:"Master",      label:"Master of the range, title holder",color:T },
    { min:12, max:12, tier:"Legend",      label:"Never misses, songs tell of it",   color:G },
  ],

  smuggler: [
    { min:2,  max:2,  tier:"Wanted",      label:"Arrested or hunted, no contacts",  color:D },
    { min:3,  max:4,  tier:"Runner",      label:"Low-level contraband runner",      color:R },
    { min:5,  max:6,  tier:"Handler",     label:"Reliable handler with a network",  color:L },
    { min:7,  max:8,  tier:"Trafficker",  label:"Known trafficker, protected route",color:M },
    { min:9,  max:10, tier:"Network Chief","label":"Controls regional smuggling ring", color:G2 },
    { min:11, max:11, tier:"Crime Lord",  label:"Feared crime lord, guild backing", color:T },
    { min:12, max:12, tier:"Shadow King", label:"Untouchable shadow king of crime", color:G },
  ],

  soldier: [
    { min:2,  max:2,  tier:"Deserter",    label:"Deserter, dishonorably discharged",color:D },
    { min:3,  max:4,  tier:"Conscript",   label:"Raw conscript, cannon fodder",     color:R },
    { min:5,  max:6,  tier:"Corporal",    label:"Corporal, small squad",            color:L },
    { min:7,  max:8,  tier:"Sergeant",    label:"Sergeant, experienced veteran",    color:M },
    { min:9,  max:10, tier:"Lieutenant",  label:"Lieutenant, company command",      color:G2 },
    { min:11, max:11, tier:"Colonel",     label:"Colonel, regiment command",        color:T },
    { min:12, max:12, tier:"General",     label:"General, commands armies",         color:G },
  ],

  spy: [
    { min:2,  max:2,  tier:"Burned",      label:"Identity exposed, fled in disgrace",color:D },
    { min:3,  max:4,  tier:"Informant",   label:"Low-level informant, petty intel", color:R },
    { min:5,  max:6,  tier:"Operative",   label:"Field operative, reliable source", color:L },
    { min:7,  max:8,  tier:"Agent",       label:"Trusted agent, deep cover",        color:M },
    { min:9,  max:10, tier:"Handler",     label:"Handler running a network",        color:G2 },
    { min:11, max:11, tier:"Spymaster",   label:"Regional spymaster, feared shadow",color:T },
    { min:12, max:12, tier:"Shadow Lord", label:"Spymaster of empires, untouchable",color:G },
  ],

  swashbuckler: [
    { min:2,  max:2,  tier:"Fool",        label:"Laughed out of dueling clubs",     color:D },
    { min:3,  max:4,  tier:"Student",     label:"Fencing student, minor bouts",     color:R },
    { min:5,  max:6,  tier:"Duelist",     label:"Known duelist, minor victories",   color:L },
    { min:7,  max:8,  tier:"Champion",    label:"Regional champion, noble escort",  color:M },
    { min:9,  max:10, tier:"Swordmaster", label:"Swordmaster with a school",        color:G2 },
    { min:11, max:11, tier:"Court Blade", label:"Feared court swordsman, royal apt.",color:T },
    { min:12, max:12, tier:"Blade Legend","label":"Greatest blade in living memory", color:G },
  ],

  thug: [
    { min:2,  max:2,  tier:"Target",      label:"Marked for death by rivals",       color:D },
    { min:3,  max:4,  tier:"Muscle",      label:"Hired muscle, no loyalty",         color:R },
    { min:5,  max:6,  tier:"Enforcer",    label:"Neighborhood enforcer, feared",    color:L },
    { min:7,  max:8,  tier:"Gang Leader", label:"Leads a small criminal gang",      color:M },
    { min:9,  max:10, tier:"Crime Boss",  label:"Controls a district, tribute paid",color:G2 },
    { min:11, max:11, tier:"Overlord",    label:"City-wide crime syndicate head",   color:T },
    { min:12, max:12, tier:"Crime King",  label:"Unquestioned lord of the underworld",color:G },
  ],

  weaponmaster: [
    { min:2,  max:2,  tier:"Student",     label:"Clumsy student, no technique",     color:D },
    { min:3,  max:4,  tier:"Apprentice",  label:"Apprentice weaponsmith / trainer", color:R },
    { min:5,  max:6,  tier:"Adept",       label:"Adept, trained in multiple styles",color:L },
    { min:7,  max:8,  tier:"Master",      label:"Master weaponist, runs a school",  color:M },
    { min:9,  max:10, tier:"Grand Master","label":"Grand Master, chosen by order",   color:G2 },
    { min:11, max:11, tier:"Champion",    label:"National champion, noble accolade",color:T },
    { min:12, max:12, tier:"Living Legend","label":"Unmatched, legend in their time", color:G },
  ],
};

// ── Public API ────────────────────────────────────────────────────────────────
// Get rank table for a given kit (by name fuzzy-match or ID), fallback to default
export function getRankTable(kitNameOrId) {
  if (!kitNameOrId) return SOCIAL_RANKS_DEFAULT;
  const normalized = kitNameOrId.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z]/g, "");
  // Direct match
  if (KIT_SOCIAL_RANKS[normalized]) return KIT_SOCIAL_RANKS[normalized];
  // Partial match
  const key = Object.keys(KIT_SOCIAL_RANKS).find(k =>
    normalized.includes(k) || k.includes(normalized)
  );
  return key ? KIT_SOCIAL_RANKS[key] : SOCIAL_RANKS_DEFAULT;
}

export function getSocialRank(roll, rankTable) {
  const table = rankTable ?? SOCIAL_RANKS_DEFAULT;
  return table.find(r => roll >= r.min && roll <= r.max) ?? null;
}
