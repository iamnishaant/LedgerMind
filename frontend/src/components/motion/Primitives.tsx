"use client";
/**
 * Reusable Framer Motion primitives for the whole app.
 * All respect prefers-reduced-motion (fall back to instant, no transform).
 */
import { motion, useReducedMotion, useInView, useMotionValue, animate, type Variants } from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

const EASE = [0.22, 1, 0.36, 1] as const;

// ── Reveal: fade + slide-in when scrolled into view ──────────
export function Reveal({
  children,
  delay = 0,
  y = 22,
  once = true,
  style,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  once?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

// ── Stagger container + item ─────────────────────────────────
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

export function Stagger({
  children,
  style,
  className,
  amount = 0.2,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  style,
  className,
  y = 20,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  y?: number;
}) {
  const reduce = useReducedMotion();
  const item: Variants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y },
    show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
  };
  return (
    <motion.div className={className} style={style} variants={item}>
      {children}
    </motion.div>
  );
}

// ── AnimatedNumber: counts up when in view ───────────────────
export function AnimatedNumber({
  value,
  duration = 1.6,
  prefix = "",
  suffix = "",
  format = true,
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  format?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(format ? Math.round(value).toLocaleString("en-IN") : String(value));
      return;
    }
    const controls = animate(mv, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => {
        const n = Math.round(v);
        setDisplay(format ? n.toLocaleString("en-IN") : String(n));
      },
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce, mv, format]);

  return (
    <span ref={ref}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

// ── Re-export motion for pages that want it directly ─────────
export { motion, useReducedMotion };
