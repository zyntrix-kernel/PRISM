"use client";

import type { CSSProperties } from "react";
import type { PresetId } from "@/lib/prism/presets/types";
import { PRESET_CATALOG } from "@/lib/prism/presets/catalog";
import { PRESET_ORDER } from "@/lib/prism/presets/types";

export default function PresetTransitionOverlay({ preset }: { preset: string }) {
  const id = (PRESET_ORDER.includes(preset as PresetId) ? preset : "space") as PresetId;
  const meta = PRESET_CATALOG[id];
  const index = String(PRESET_ORDER.indexOf(id) + 1).padStart(2, "0");

  return (
    <div className="prism-transition" aria-hidden="true" style={{ "--transition-hue": meta.hue } as CSSProperties}>
      <div className="prism-transition-wash" />
      <div className="prism-transition-scan" />
      <div className="prism-transition-core">
        <span className="prism-transition-kicker">WORLD / {index}</span>
        <strong>{meta.label.toUpperCase()}</strong>
        <span className="prism-transition-science">{meta.science.toUpperCase()}</span>
        <i />
      </div>
    </div>
  );
}
