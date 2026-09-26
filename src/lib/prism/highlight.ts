// Group-safe emissive highlight. Some grabbables are Meshes, others (the
// drive preset's car) are Groups with no .material of their own — touching
// .material on those threw `Cannot use 'in' operator … in undefined` and
// tripped the frame fault. This helper traverses instead, captures each
// material's base intensity on first boost, and restores it afterwards
// (previous code reset everything to a hardcoded 0.25, dimming bodies
// whose natural glow was higher).

import * as THREE from 'three';

interface EmissiveLike {
  emissiveIntensity: number;
  userData: Record<string, unknown>;
}

function eachEmissive(root: THREE.Object3D, fn: (m: EmissiveLike) => void): void {
  root.traverse((child) => {
    const material = (child as THREE.Mesh).material as unknown;
    const mats = Array.isArray(material) ? material : [material];
    for (const mat of mats) {
      if (mat && typeof mat === 'object' && 'emissiveIntensity' in mat) {
        fn(mat as EmissiveLike);
      }
    }
  });
}

/**
 * Boost every emissive material under `root` (Mesh or Group).
 * Pass null to restore each material's own base intensity.
 * Never throws on material-less objects.
 */
export function setEmissiveBoost(root: THREE.Object3D | null, boost: number | null): void {
  if (!root) return;
  eachEmissive(root, (m) => {
    if (typeof m.userData.baseEmissive !== 'number') {
      m.userData.baseEmissive = m.emissiveIntensity;
    }
    m.emissiveIntensity = boost ?? (m.userData.baseEmissive as number);
  });
}

/**
 * Pinch progress ring scale: wide and faint when open, cinching onto the
 * cursor as the pinch closes (1 = full touch). Pure math, unit-tested.
 */
export function pinchRingScale(closeness: number): number {
  const c = Math.min(1, Math.max(0, closeness));
  return 1 + (1 - c) * 1.6;
}
