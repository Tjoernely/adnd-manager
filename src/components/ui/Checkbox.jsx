import { C } from "../../data/constants.js";

export function Checkbox({ checked, color = C.gold }) {
  return (
    <div style={{ width:17, height:17, borderRadius:4, flexShrink:0,
      border:`2px solid ${checked?color:"#3d2a0d"}`,
      background:checked?color:"transparent",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:10, color:"#0d0903", transition:"all .13s" }}>
      {checked?"✓":""}
    </div>
  );
}
