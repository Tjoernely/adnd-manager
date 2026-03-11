// data/constants.js — Shared UI constants: color tokens, tab list, helpers

export const TABS = [
  { id:"scores",  label:"I. Ability Scores",             icon:"🎲" },
  { id:"races",   label:"II. Races",                      icon:"🌍" },
  { id:"classes", label:"III. Classes",                   icon:"⚔️" },
  { id:"kits",    label:"IV. Kits",                       icon:"🎭" },
  { id:"traits",  label:"V. Traits & Disadvantages",      icon:"💀" },
  { id:"profs",   label:"VI. Nonweapon Proficiencies",    icon:"📖" },
  { id:"weapons",  label:"VII. Weapon Proficiencies",      icon:"🗡️" },
  { id:"mastery",  label:"VIII. Specialization & Mastery",  icon:"⭐" },
];

export const C = {
  bg:       "radial-gradient(ellipse at 18% 8%, #140e06 0%, #0d0a06 55%, #0a0808 100%)",
  card:     "linear-gradient(145deg, #1a1408 0%, #130f06 100%)",
  cardSel:  "linear-gradient(145deg, #221a08 0%, #1a1406 100%)",
  border:   "#2a1e0a",
  borderHi: "#7a5a1a",
  gold:     "#d4a035",
  goldDim:  "#8a6425",
  text:     "#d4c5a9",
  textDim:  "#6a5a3a",
  textBri:  "#e8d8bc",
  green:    "#6dbe88",
  red:      "#cc4444",
  redBri:   "#ff5555",
  blue:     "#68a8d0",
  amber:    "#b07830",
  purple:   "#a070c8",
};

export const statColor = v => {
  if (v >= 19) return "#ffd700";
  if (v >= 17) return "#e8c040";
  if (v >= 14) return C.green;
  if (v >= 10) return C.text;
  if (v >=  7) return "#d89050";
  return C.red;
};

export const fmt = n => n >= 0 ? `+${n}` : `${n}`;

export const numInputStyle = {
  width:50, textAlign:"center", background:"#0d0903",
  border:`1px solid #2a1e0a`, borderRadius:4, color:C.text,
  fontSize:13, fontFamily:"inherit", padding:"2px 4px",
};
