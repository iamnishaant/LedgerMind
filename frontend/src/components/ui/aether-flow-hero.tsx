"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Zap } from "lucide-react";
import ParticleNetwork from "@/components/ui/particle-network";

interface AetherFlowHeroProps {
  eyebrow?: string;
  EyebrowIcon?: LucideIcon;
  title?: React.ReactNode;
  subtitle?: string;
  ctaLabel?: string;
  /** if provided, the CTA navigates here (Next.js Link); otherwise it's a plain button */
  ctaHref?: string;
  particleColor?: string;
  lineColor?: string;
  lineColorNearMouse?: string;
}

const fadeUpVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.2 + 0.3, duration: 0.8, ease: "easeInOut" as const },
  }),
};

/**
 * Full-bleed animated hero: interactive particle-network canvas background
 * (see particle-network.tsx) with a badge / title / subtitle / CTA overlay.
 * Defaults reproduce the original "Aether Flow" spec; pass props to re-brand.
 */
export default function AetherFlowHero({
  eyebrow = "Dynamic Rendering Engine",
  EyebrowIcon = Zap,
  title = "Aether Flow",
  subtitle = "An intelligent, adaptive framework for creating fluid digital experiences that feel alive and respond to user interaction in real-time.",
  ctaLabel = "Explore the Engine",
  ctaHref,
  particleColor = "rgba(191, 128, 255, 0.8)",
  lineColor = "rgba(200, 150, 255, 0.5)",
  lineColorNearMouse = "rgba(255, 255, 255, 0.9)",
}: AetherFlowHeroProps) {
  const cta = (
    <button className="px-8 py-4 bg-white text-black font-semibold rounded-lg shadow-lg hover:bg-gray-200 transition-colors duration-300 flex items-center gap-2 mx-auto">
      {ctaLabel}
      <ArrowRight className="h-5 w-5" />
    </button>
  );

  return (
    <div className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-black">
      <div className="absolute inset-0">
        <ParticleNetwork
          className="absolute inset-0"
          particleColor={particleColor}
          lineColor={lineColor}
          lineColorNearMouse={lineColorNearMouse}
        />
      </div>

      <div className="relative z-10 text-center p-6">
        <motion.div
          custom={0} variants={fadeUpVariants} initial="hidden" animate="visible"
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 mb-6 backdrop-blur-sm"
        >
          <EyebrowIcon className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-medium text-gray-200">{eyebrow}</span>
        </motion.div>

        <motion.h1
          custom={1} variants={fadeUpVariants} initial="hidden" animate="visible"
          className="text-5xl md:text-8xl font-bold tracking-tighter mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-gray-400"
        >
          {title}
        </motion.h1>

        <motion.p
          custom={2} variants={fadeUpVariants} initial="hidden" animate="visible"
          className="max-w-2xl mx-auto text-lg text-gray-400 mb-10"
        >
          {subtitle}
        </motion.p>

        <motion.div custom={3} variants={fadeUpVariants} initial="hidden" animate="visible">
          {ctaHref ? <Link href={ctaHref}>{cta}</Link> : cta}
        </motion.div>
      </div>
    </div>
  );
}
