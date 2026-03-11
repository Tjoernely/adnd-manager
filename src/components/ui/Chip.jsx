import { C } from "../../data/constants.js";

export function Chip({ children, dim }) {
  return (
    <span style={{ fontSize:12, color:dim?C.textDim:C.amber, padding:"2px 8px",
      background:"rgba(0,0,0,.3)", border:`1px solid ${C.border}`, borderRadius:4 }}>
      {children}
    </span>
  );
}
