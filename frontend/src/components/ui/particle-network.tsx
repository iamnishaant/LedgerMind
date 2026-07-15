"use client";
import { useEffect, useRef } from "react";

interface ParticleNetworkProps {
  className?: string;
  /** rgba() string for particle dots */
  particleColor?: string;
  /** rgba() string for connecting lines away from the cursor */
  lineColor?: string;
  /** rgba() string for connecting lines near the cursor */
  lineColorNearMouse?: string;
  /** lower = denser network (particles per this many px^2) */
  densityDivisor?: number;
  /** cursor influence radius in px */
  mouseRadius?: number;
}

interface Particle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
}

/**
 * Interactive canvas particle network — sized to its parent (must be
 * position: relative), not the viewport, so it can live inside any section.
 * Skips animation for prefers-reduced-motion (renders one static frame).
 */
export default function ParticleNetwork({
  className,
  particleColor = "rgba(191, 128, 255, 0.8)",
  lineColor = "rgba(200, 150, 255, 0.5)",
  lineColorNearMouse = "rgba(255, 255, 255, 0.9)",
  densityDivisor = 9000,
  mouseRadius = 160,
}: ParticleNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let animationFrameId = 0;
    const mouse = { x: null as number | null, y: null as number | null };

    const init = () => {
      particles = [];
      const count = Math.max(12, Math.floor((width * height) / densityDivisor));
      for (let i = 0; i < count; i++) {
        const size = Math.random() * 2 + 1;
        particles.push({
          x: Math.random() * (width - size * 2) + size,
          y: Math.random() * (height - size * 2) + size,
          dx: Math.random() * 0.4 - 0.2,
          dy: Math.random() * 0.4 - 0.2,
          size,
        });
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = canvas.width = rect.width;
      height = canvas.height = rect.height;
      init();
    };

    const updateParticle = (p: Particle) => {
      if (p.x + p.size > width || p.x - p.size < 0) p.dx = -p.dx;
      if (p.y + p.size > height || p.y - p.size < 0) p.dy = -p.dy;

      if (mouse.x !== null && mouse.y !== null) {
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0 && dist < mouseRadius + p.size) {
          const force = (mouseRadius - dist) / mouseRadius;
          p.x -= (dx / dist) * force * 5;
          p.y -= (dy / dist) * force * 5;
        }
      }

      p.x += p.dx;
      p.y += p.dy;
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = particleColor;
        ctx.fill();
      }
      connect();
    };

    const connect = () => {
      const maxDistSq = (width / 7) * (height / 7);
      for (let a = 0; a < particles.length; a++) {
        for (let b = a + 1; b < particles.length; b++) {
          const pa = particles[a];
          const pb = particles[b];
          const distSq = (pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2;
          if (distSq >= maxDistSq) continue;

          const opacity = 1 - distSq / maxDistSq;
          let nearMouse = false;
          if (mouse.x !== null && mouse.y !== null) {
            const dm = Math.hypot(pa.x - mouse.x, pa.y - mouse.y);
            nearMouse = dm < mouseRadius;
          }
          ctx.strokeStyle = withOpacity(nearMouse ? lineColorNearMouse : lineColor, opacity);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.stroke();
        }
      }
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      for (const p of particles) updateParticle(p);
      draw();
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    if (reduceMotion) {
      draw(); // one static frame — no motion, no cursor tracking
    } else {
      animate();
    }

    return () => {
      ro.disconnect();
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [particleColor, lineColor, lineColorNearMouse, densityDivisor, mouseRadius]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "100%", display: "block" }} />;
}

function withOpacity(rgba: string, opacity: number): string {
  // rgba(r,g,b,a) -> rgba(r,g,b, a*opacity)
  const m = rgba.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgba;
  const parts = m[1].split(",").map((s) => s.trim());
  const [r, g, b, a = "1"] = parts;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, parseFloat(a) * opacity))})`;
}
