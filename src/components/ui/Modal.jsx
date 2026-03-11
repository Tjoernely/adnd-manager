import { C } from "../../data/constants.js";

export function Modal({ onClick, children, borderColor }) {
  return (
    <div onClick={onClick} style={{
      background:"linear-gradient(145deg,#1c1408,#140f05)",
      border:`2px solid ${borderColor??C.borderHi}`,
      borderRadius:12, padding:26, maxWidth:480, width:"100%",
      boxShadow:"0 12px 50px rgba(0,0,0,.9)",
      maxHeight:"85vh", overflowY:"auto",
    }}>
      {children}
    </div>
  );
}
