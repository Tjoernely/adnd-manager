export function Overlay({ onClick, children }) {
  return (
    <div onClick={onClick} style={{ position:"fixed", inset:0, zIndex:200,
      background:"rgba(0,0,0,.82)", display:"flex",
      alignItems:"center", justifyContent:"center", padding:20 }}>
      {children}
    </div>
  );
}
