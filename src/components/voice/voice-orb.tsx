"use client";

import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

/** Reads the live accent colors (they change with the theme switcher). */
function palette() {
  const cs = getComputedStyle(document.documentElement);
  const get = (v: string, fb: string) => cs.getPropertyValue(v).trim() || fb;
  return [get("--accent", "#c6ff3d"), get("--accent-2", "#3dffb0"), get("--accent-3", "#7ad7ff")];
}

/**
 * Living orb: layered, noise-deformed blobs drawn on canvas.
 * `level` (0..1) is read every frame, so the parent can feed mic / speaker loudness without re-rendering.
 */
export function VoiceOrb({ state, level, size = 320 }: { state: OrbState; level: React.RefObject<number>; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr;
    c.height = size * dpr;
    ctx.scale(dpr, dpr);
    let colors = palette();
    const recolor = new MutationObserver(() => (colors = palette()));
    recolor.observe(document.documentElement, { attributes: true, attributeFilter: ["data-accent", "data-theme", "class"] });

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;
    let smooth = 0;
    let energy = 0;
    const cx = size / 2;
    const cy = size / 2;
    const base = size * 0.3;

    const blob = (radius: number, wobble: number, phase: number, speed: number, lobes: number[]) => {
      ctx.beginPath();
      const N = 96;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        let r = radius;
        lobes.forEach((k, j) => {
          r += Math.sin(a * k + t * speed * (1 + j * 0.37) + phase * (j + 1)) * wobble * (1 / (j + 1));
        });
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const frame = () => {
      const s = stateRef.current;
      const target = s === "listening" || s === "speaking" ? Math.min(1, (level.current ?? 0) * 1.6) : 0;
      smooth += (target - smooth) * (target > smooth ? 0.35 : 0.08);
      const want = s === "thinking" ? 0.55 : s === "idle" ? 0.12 : s === "error" ? 0.05 : 0.3 + smooth * 0.7;
      energy += (want - energy) * 0.05;
      t += reduce ? 0.004 : 0.012 + energy * 0.03 + (s === "thinking" ? 0.025 : 0);

      ctx.clearRect(0, 0, size, size);
      const breathe = 1 + Math.sin(t * 1.3) * 0.025 + smooth * 0.14;
      const R = base * breathe;

      // glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.9);
      glow.addColorStop(0, colors[0]);
      glow.addColorStop(1, "transparent");
      ctx.globalAlpha = 0.16 + energy * 0.22;
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      // body blobs, blended so overlaps glow
      ctx.globalCompositeOperation = "lighter";
      const layers: [number, number, number[], number][] = [
        [0, 0.9, [3, 5, 2], 0],
        [2.1, 1.2, [2, 4, 7], 1],
        [4.2, 0.7, [4, 3, 6], 2],
      ];
      for (const [phase, speed, lobes, ci] of layers) {
        const wob = R * (0.035 + energy * 0.16 + (s === "thinking" ? 0.05 : 0));
        blob(R * (0.92 + ci * 0.04), wob, phase, speed, lobes);
        const g = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.25);
        g.addColorStop(0, colors[(ci + 1) % 3]);
        g.addColorStop(0.55, colors[ci]);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = s === "error" ? 0.25 : 0.5;
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // core + specular highlight
      ctx.globalAlpha = 0.9;
      const core = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, 0, cx - R * 0.3, cy - R * 0.35, R * 0.75);
      core.addColorStop(0, "rgba(255,255,255,0.55)");
      core.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.95, 0, Math.PI * 2);
      ctx.fill();

      // thinking ring
      if (s === "thinking") {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = colors[1];
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.28, t * 3, t * 3 + Math.PI * 0.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.28, t * 3 + Math.PI, t * 3 + Math.PI * 1.35);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      recolor.disconnect();
    };
  }, [size, level]);

  return <canvas ref={canvas} style={{ width: size, height: size }} className="pointer-events-none select-none" aria-hidden />;
}
