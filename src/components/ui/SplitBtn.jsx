import { useState } from "react";
import { C } from "../../data/constants.js";

export function SplitBtn({ onClick, disabled, children }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ width:20, height:20, borderRadius:4, cursor:disabled?"not-allowed":"pointer",
        background:disabled?"transparent":h?"rgba(212,160,53,.2)":"rgba(212,160,53,.07)",
        border:`1px solid ${disabled?"#2a1e0a":h?"#8a6425":"#4a3010"}`,
        color:disabled?"#2a1e0a":C.gold, fontSize:14, fontFamily:"inherit",
        display:"flex", alignItems:"center", justifyContent:"center",
        transition:"all .12s", padding:0, lineHeight:1 }}>
      {children}
    </button>
  );
}
