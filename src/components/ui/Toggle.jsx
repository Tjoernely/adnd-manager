export function Toggle({ on, onToggle }) {
  return (
    <div onClick={onToggle} style={{ width:42, height:22, borderRadius:11,
      cursor:"pointer", background:on?"#6e1818":"#1a1208",
      border:`2px solid ${on?"#993333":"#2a1e0a"}`,
      position:"relative", transition:"all .2s" }}>
      <div style={{ width:14, height:14, borderRadius:"50%",
        background:on?"#ff5555":"#4a3010",
        position:"absolute", top:2, left:on?22:2,
        transition:"left .2s" }} />
    </div>
  );
}
