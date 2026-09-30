import type { PresetId } from "./types";

export interface PresetCatalogEntry {
  label: string;
  shortLabel: string;
  description: string;
  science: string;
  hue: string;
}

export const PRESET_CATALOG: Record<PresetId, PresetCatalogEntry> = {
  space: { label: "Space", shortLabel: "Space", description: "Keplerian solar system", science: "mechanics / orbit", hue: "154,220,255" },
  blocks: { label: "Blocks", shortLabel: "Blocks", description: "Voxel stacking rig", science: "geometry / collision", hue: "255,179,217" },
  test: { label: "Test", shortLabel: "Test", description: "Three-body calibration", science: "vectors / balance", hue: "201,184,255" },
  singularity: { label: "Singularity", shortLabel: "Black hole", description: "Accretion disk + jets", science: "gravity / relativity", hue: "255,214,170" },
  drive: { label: "Drive", shortLabel: "Drive", description: "Neon circuit arcade", science: "motion / control", hue: "143,245,180" },
  atom: { label: "Atom", shortLabel: "Atom", description: "Bohr model photon lab", science: "quantum / spectra", hue: "154,220,255" },
  voxel: { label: "Voxel", shortLabel: "Voxel", description: "Place & break blocks", science: "spatial logic", hue: "255,207,92" },
  gun: { label: "Range", shortLabel: "Range", description: "Target shooting range", science: "aim / trajectory", hue: "125,211,252" },
  supernova: { label: "Supernova", shortLabel: "Supernova", description: "Stellar explosion", science: "energy / stellar life", hue: "255,170,68" },
  nebula: { label: "Nebula", shortLabel: "Nebula", description: "Living gas cloud", science: "field / particles", hue: "165,180,252" },
};

export function presetMeta(id: PresetId): PresetCatalogEntry {
  return PRESET_CATALOG[id];
}
