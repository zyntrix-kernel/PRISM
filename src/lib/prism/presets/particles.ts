// Pooled GPU-cheap particles: one Points draw call, fixed-size buffers,
// dead particles parked far underground. Used for drive skid smoke;
// reusable for any future burst effect.

import * as THREE from 'three';

export class ParticlePool {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private cursor = 0;
  aliveCount = 0;

  constructor(
    private readonly max: number,
    color: number,
    size: number,
    private readonly rise = 1.2,
    private readonly ttl = 0.9,
  ) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -999; // parked
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color,
        size,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
  }

  get capacity(): number {
    return this.max;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (this.life[i] <= 0) this.aliveCount += 1;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = this.ttl;
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -999;
        this.aliveCount -= 1;
        continue;
      }
      this.vel[i * 3 + 1] += this.rise * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
