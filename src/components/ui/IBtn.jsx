import { useState } from "react";
import { C } from "../../data/constants.js";

export function IBtn({ onClick }) {
  const [h, setH] = useState(false);
  return (
    <span onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      style={{ cursor:"pointer", fontSize:13, userSelect:"none",
        color:h?C.gold:"#3d2a0d", transition:"color .13s" }}>ⓘ</span>
  );
}
