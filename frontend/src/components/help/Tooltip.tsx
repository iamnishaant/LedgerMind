"use client";
/**
 * Tooltip — a small, accessible label shown on hover and keyboard focus.
 * Reveals on focus-within too, so keyboard users get it; the wrapped control
 * keeps its own accessible name for screen readers.
 */
import { useId, useState, type ReactNode } from "react";

type Placement = "top" | "bottom" | "left" | "right";

const posStyle: Record<Placement, React.CSSProperties> = {
  top: { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  bottom: { top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
  left: { right: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
  right: { left: "calc(100% + 8px)", top: "50%", transform: "translateY(-50%)" },
};

export default function Tooltip({
  label, children, placement = "top", maxWidth = 240,
}: {
  label: string;
  children: ReactNode;
  placement?: Placement;
  maxWidth?: number;
}) {
  const [show, setShow] = useState(false);
  const id = useId();

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <span aria-describedby={show ? id : undefined}>{children}</span>
      <span
        id={id}
        role="tooltip"
        style={{
          position: "absolute", zIndex: 60, ...posStyle[placement],
          maxWidth, width: "max-content",
          // Deliberately inverted against the page: the tooltip paints itself in
          // the text colour and writes in the background colour, so it stays
          // high-contrast in BOTH themes without a per-theme override.
          background: "var(--color-text)", color: "var(--color-bg)",
          fontSize: "0.75rem", lineHeight: 1.4, fontWeight: 500,
          padding: "6px 10px", borderRadius: 8,
          boxShadow: "0 8px 24px -8px rgba(36,28,21,0.5)",
          opacity: show ? 1 : 0, transform: `${posStyle[placement].transform ?? ""} translateY(${show ? 0 : 2}px)`,
          transition: "opacity 0.14s ease, transform 0.14s ease",
          pointerEvents: "none", whiteSpace: "normal",
        }}
      >
        {label}
      </span>
    </span>
  );
}
