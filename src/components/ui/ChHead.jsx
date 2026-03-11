import { C } from "../../data/constants.js";

export function ChHead({ icon, num, title, sub }) {
  return (
    <div style={{ marginBottom:26 }}>
      <div style={{ fontSize:10, letterSpacing:5, color:C.textDim,
        textTransform:"uppercase", marginBottom:3 }}>{num}</div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:5 }}>
        <span style={{ fontSize:22 }}>{icon}</span>
        <h2 style={{ margin:0, fontSize:24, color:C.gold, letterSpacing:1 }}>{title}</h2>
      </div>
      <p style={{ margin:0, fontSize:12, color:C.textDim, fontStyle:"italic", maxWidth:720 }}>{sub}</p>
      <div style={{ height:1, marginTop:10,
        background:"linear-gradient(90deg,#5c3d1a,transparent)" }} />
    </div>
  );
}
