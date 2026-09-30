"use client";

import type { CSSProperties } from "react";

const PRESET_META: Record<string, { hue: string; science: string; index: string }> = {
  space: { hue: "154, 220, 255", science: "MECHANICS / ORBIT", index: "01" },
  blocks: { hue: "255, 179, 217", science: "GEOMETRY / COLLISION", index: "02" },
  test: { hue: "201, 184, 255", science: "VECTORS / BALANCE", index: "03" },
  singularity: { hue: "255, 214, 170", science: "GRAVITY / RELATIVITY", index: "04" },
  drive: { hue: "143, 245, 180", science: "MOTION / CONTROL", index: "05" },
  atom: { hue: "154, 220, 255", science: "QUANTUM / SPECTRA", index: "06" },
  voxel: { hue: "255, 207, 92", science: "SPATIAL LOGIC", index: "07" },
  gun: { hue: "125, 211, 252", science: "AIM / TRAJECTORY", index: "08" },
  supernova: { hue: "255, 170, 68", science: "ENERGY / STELLAR LIFE", index: "09" },
  nebula: { hue: "165, 180, 252", science: "FIELD / PARTICLES", index: "10" },
};

export default function PresetTransitionOverlay({ preset }: { preset: string }) {
  const meta = PRESET_META[preset] ?? PRESET_META.space;
  return (
    <div className="prism-transition" aria-hidden="true" style={{ "--transition-hue": meta.hue } as CSSProperties}>
      <div className="prism-transition-wash" />
      <div className="prism-transition-scan" />
      <div className="prism-transition-core">
        <span className="prism-transition-kicker">WORLD / {meta.index}</span>
        <strong>{preset.toUpperCase()}</strong>
        <span className="prism-transition-science">{meta.science}</span>
        <i />
      </div>
    </div>
  );
}
