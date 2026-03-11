export function StatPill({ label, val, color }) {
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ fontSize:20, fontWeight:"bold", color, lineHeight:1 }}>{val}</div>
      <div style={{ fontSize:9, letterSpacing:2, color:"#4a3010",
        textTransform:"uppercase", marginTop:2 }}>{label}</div>
    </div>
  );
}
