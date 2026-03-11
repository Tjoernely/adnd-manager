import { C } from "../../data/constants.js";

export function QL({ label, children }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
      <span style={{ fontSize:10, color:C.textDim, letterSpacing:2,
        textTransform:"uppercase" }}>{label}</span>
      {children}
    </div>
  );
}
