// Shared floating name labels (canvas sprites, scene-level so two-hand
// world scaling never shrinks the text).

import * as THREE from 'three';

export function makeLabel(text: string, scale = 1): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ transparent: true, depthWrite: false }),
  );
  // Headless environments (unit tests) have no DOM: return an empty sprite.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = 'bold 30px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,240,255,0.8)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#d7e6ff';
      ctx.fillText(text, 128, 32);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    (sprite.material as THREE.SpriteMaterial).map = texture;
  }
  sprite.material.userData.ownMap = true;
  sprite.scale.set(1.15 * scale, 0.29 * scale, 1);
  return sprite;
}
