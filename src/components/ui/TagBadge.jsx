export function TagBadge({ color, children }) {
  return (
    <span style={{ fontSize:10, padding:"1px 6px", borderRadius:4,
      background:`${color}18`, border:`1px solid ${color}44`, color }}>
      {children}
    </span>
  );
}
