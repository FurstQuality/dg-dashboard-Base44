import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Renders children into the round header's action slot (beside the round menu). */
export function RoundHeaderSlot({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => { setEl(document.getElementById("round-header-actions-slot")); }, []);
  return el ? createPortal(children, el) : null;
}
