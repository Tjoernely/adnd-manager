import { C } from "../../data/constants.js";

export function CloseBtn({ onClick, label="Close", style:s={} }) {
  return (
    <button onClick={onClick} style={{ background:"#1a1208",
      border:`1px solid ${C.border}`, borderRadius:6,
      padding:"6px 18px", color:C.textDim, cursor:"pointer",
      fontFamily:"inherit", fontSize:12, ...s }}>
      {label}
    </button>
  );
}
