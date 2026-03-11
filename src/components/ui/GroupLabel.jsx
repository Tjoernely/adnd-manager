import { C } from "../../data/constants.js";

export function GroupLabel({ children }) {
  return (
    <div style={{ fontSize:10, letterSpacing:4, color:C.textDim,
      textTransform:"uppercase", marginBottom:9, paddingBottom:5,
      borderBottom:"1px solid #1e1810" }}>{children}</div>
  );
}
