import { C } from "../../data/constants.js";

export function CpBadge({ children }) {
  return (
    <span style={{ fontSize:10, padding:"1px 7px", borderRadius:4,
      background:"rgba(212,160,53,.1)", border:"1px solid #4a3010",
      color:C.gold, whiteSpace:"nowrap" }}>{children} CP</span>
  );
}
