import { C } from "../../data/constants.js";

export function SubStatChip({ label, value, valueColor, desc, onInfo }) {
  const isNeg = String(value).startsWith("-");
  const isPos = String(value).startsWith("+");
  const col   = valueColor ?? (isPos ? C.green : isNeg ? C.red : C.text);
  return (
    <div style={{ display:"flex", alignItems:"center", gap:3,
      padding:"2px 7px 2px 6px", borderRadius:5,
      background:"rgba(0,0,0,.35)",
      border:`1px solid rgba(255,255,255,.05)` }}>
      <span style={{ fontSize:10, color:C.textDim, letterSpacing:.5 }}>{label}:</span>
      <span style={{ fontSize:11, fontWeight:"bold", color:col }}>{value}</span>
      <span onClick={e=>{ e.stopPropagation(); onInfo({ title:label, body:desc }); }}
        style={{ cursor:"pointer", fontSize:11, color:"#3d2a0d", marginLeft:1,
          transition:"color .12s" }}
        onMouseEnter={e=>e.currentTarget.style.color=C.gold}
        onMouseLeave={e=>e.currentTarget.style.color="#3d2a0d"}>ⓘ</span>
    </div>
  );
}
