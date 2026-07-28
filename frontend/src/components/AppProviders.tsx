"use client";
/**
 * App-wide client providers mounted once at the root: theme (light/dark) and a
 * global MotionConfig that makes every `motion` animation honor the user's OS
 * "reduce motion" preference — not just the ones that opt in manually.
 */
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "@/lib/theme";
import type { ReactNode } from "react";

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeProvider>
  );
}
