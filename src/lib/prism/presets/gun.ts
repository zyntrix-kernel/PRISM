// GUN GAME preset: a target-shooting range controlled by pointing + pinching.
// Point at the screen to aim the crosshair; pinch (or click) to fire.
// Targets pop up at random positions; hit them to score. The gun model
// sits in the foreground and recoils on each shot. Targets shatter with
// a particle burst + score popup.

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

interface Target {
  mesh: THREE.Mesh;
  alive: boolean;
  spawnAt: number;
  lifetime: number; // seconds before despawn
  hit: boolean;
  shatterT: number; // 0 = intact, 1 = fully shattered
}

const TARGET_COUNT = 6;
const RANGE = 9; // distance to target wall
const SPREAD = 6; // horizontal/vertical spread

export function buildGunGame(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex, shakeCamera } = ctx;
  const grabbables: THREE.Object3D[] = [];

  // ── Gun model (foreground, bottom-center) ────────────────────────────
  const gunGroup = new THREE.Group();
  // Barrel
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.14, 1.2, 16),
    new THREE.MeshStandardMaterial({ color: 0x2a2a35, roughness: 0.4, metalness: 0.8 }),
  );
  barrel.rotation.z = Math.PI / 2;
  gunGroup.add(barrel);
  // Sight
  const sight = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.15, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x7dd3fc, emissiveIntensity: 0.3 }),
  );
  sight.position.set(0, 0.15, 0);
  gunGroup.add(sight);
  // Grip
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.5, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.6 }),
  );
  grip.position.set(-0.35, -0.3, 0);
  grip.rotation.z = 0.3;
  gunGroup.add(grip);
  // Position gun in the foreground
  gunGroup.position.set(0.4, -0.8, 4);
  gunGroup.rotation.set(0, 0, -0.05);
  world.add(gunGroup);

  // ── Muzzle flash sprite ─────────────────────────────────────────────
  const muzzle = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xfff2a8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  muzzle.position.set(1.2, -0.6, 3.5);
  muzzle.scale.set(1.5, 1.5, 1);
  world.add(muzzle);

  // Persistent muzzle glow (always slightly visible)
  const muzzleGlow = new THREE.PointLight(0xfff2a8, 0, 5);
  muzzleGlow.position.set(1.0, -0.6, 3.5);
  world.add(muzzleGlow);

  // ── Crosshair (follows pointer) ─────────────────────────────────────
  const crosshair = new THREE.Group();
  const chRing = new THREE.Mesh(
    new THREE.RingGeometry(0.18, 0.22, 32),
    new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.6, depthTest: false }),
  );
  chRing.renderOrder = 10;
  crosshair.add(chRing);
  const chDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.03, 16),
    new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.8, depthTest: false }),
  );
  chDot.renderOrder = 10;
  crosshair.add(chDot);
  // Crosshair lines (4 ticks)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.02, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.5, depthTest: false }),
    );
    tick.position.set(Math.cos(angle) * 0.3, Math.sin(angle) * 0.3, 0);
    tick.rotation.z = angle;
    tick.renderOrder = 10;
    crosshair.add(tick);
  }
  crosshair.position.set(0, 0, -RANGE);
  crosshair.visible = false;
  world.add(crosshair);

  // ── Target wall + targets ───────────────────────────────────────────
  // Backing wall (dark, with grid pattern)
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(SPREAD * 2 + 4, SPREAD * 2 + 4),
    new THREE.MeshStandardMaterial({ color: 0x0d0e14, roughness: 0.9 }),
  );
  wall.position.set(0, 0, -RANGE - 0.5);
  world.add(wall);

  // Grid lines on the wall
  const gridLines: THREE.LineSegments[] = [];
  const gridPts: number[] = [];
  for (let x = -SPREAD; x <= SPREAD; x += 1.5) {
    gridPts.push(x, -SPREAD, 0, x, SPREAD, 0);
  }
  for (let y = -SPREAD; y <= SPREAD; y += 1.5) {
    gridPts.push(-SPREAD, y, 0, SPREAD, y, 0);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(gridPts), 3));
  const grid = new THREE.LineSegments(
    gridGeo,
    new THREE.LineBasicMaterial({ color: 0x1a1d28, transparent: true, opacity: 0.5 }),
  );
  grid.position.set(0, 0, -RANGE - 0.48);
  world.add(grid);

  // Targets
  const targets: Target[] = [];
  const targetGeo = new THREE.SphereGeometry(0.4, 16, 12);
  const targetMat = new THREE.MeshStandardMaterial({
    color: 0xff6b6b,
    emissive: 0xff6b6b,
    emissiveIntensity: 0.3,
    roughness: 0.3,
  });

  function spawnTarget(): void {
    const x = (Math.random() - 0.5) * SPREAD * 1.5;
    const y = (Math.random() - 0.5) * SPREAD * 1.5;
    const mesh = new THREE.Mesh(targetGeo, targetMat.clone());
    mesh.position.set(x, y, -RANGE);
    mesh.scale.setScalar(0.01);
    mesh.name = 'Target';
    mesh.userData.grabbable = false;
    world.add(mesh);
    grabbables.push(mesh);
    targets.push({
      mesh,
      alive: true,
      spawnAt: performance.now() / 1000,
      lifetime: 4 + Math.random() * 3,
      hit: false,
      shatterT: 0,
    });
  }

  // Spawn initial targets
  for (let i = 0; i < 3; i++) spawnTarget();
  let nextSpawn = 1.5;

  // ── Bullet trail (line from gun to crosshair on fire) ───────────────
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(6);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0, depthWrite: false }),
  );
  trail.frustumCulled = false;
  world.add(trail);

  // ── Hit particle burst (reused for each hit) ───────────────────────
  const SHARD_COUNT = 20;
  const shardPos = new Float32Array(SHARD_COUNT * 3);
  const shardVel: THREE.Vector3[] = [];
  for (let i = 0; i < SHARD_COUNT; i++) shardVel.push(new THREE.Vector3());
  const shardGeo = new THREE.BufferGeometry();
  shardGeo.setAttribute('position', new THREE.BufferAttribute(shardPos, 3));
  const shardMat = new THREE.PointsMaterial({
    size: 0.12,
    color: 0xff6b6b,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const shards = new THREE.Points(shardGeo, shardMat);
  shards.visible = false;
  world.add(shards);
  let burstPos = new THREE.Vector3();

  function fireShards(pos: THREE.Vector3): void {
    shards.visible = true;
    shardMat.opacity = 1;
    burstPos.copy(pos);
    for (let i = 0; i < SHARD_COUNT; i++) {
      shardPos[i * 3] = pos.x;
      shardPos[i * 3 + 1] = pos.y;
      shardPos[i * 3 + 2] = pos.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 3 + Math.random() * 5;
      shardVel[i].set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
        Math.cos(phi) * speed,
      );
    }
    shardGeo.attributes.position.needsUpdate = true;
  }

  // ── Score display (3D text sprite) ──────────────────────────────────
  let score = 0;
  let combo = 0;
  let comboTimer = 0;
  const scoreSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  scoreSprite.position.set(0, 0, -RANGE + 1);
  scoreSprite.scale.set(0.5, 0.5, 1);
  world.add(scoreSprite);
  let scorePopupT = 0;
  let scorePopupPos = new THREE.Vector3();

  function showScorePopup(pos: THREE.Vector3, points: number): void {
    scorePopupPos.copy(pos);
    scorePopupPos.y += 0.8;
    scorePopupT = 1;
    (scoreSprite.material as THREE.SpriteMaterial).opacity = 1;
  }

  // ── Pointer + shooting state ────────────────────────────────────────
  const aimPoint = new THREE.Vector3();
  let hasAim = false;
  let lastFireAt = 0;
  const FIRE_COOLDOWN = 0.18; // seconds between shots

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const cameraRef = { cam: null as THREE.PerspectiveCamera | null };

  function fire(): void {
    const now = performance.now() / 1000;
    if (now - lastFireAt < FIRE_COOLDOWN) {
      return;
    }
    lastFireAt = now;

    // Muzzle flash
    (muzzle.material as THREE.SpriteMaterial).opacity = 1;
    muzzle.scale.set(2.0, 2.0, 1);
    muzzleGlow.intensity = 3;

    // Gun recoil
    gunGroup.position.z = 4.3;
    gunGroup.rotation.x = -0.08;

    // Bullet trail from gun muzzle to aim point (or center of target wall)
    const target = hasAim ? aimPoint : new THREE.Vector3(0, 0, -RANGE);
    trailPos[0] = 1.0;
    trailPos[1] = -0.8;
    trailPos[2] = 4;
    trailPos[3] = target.x;
    trailPos[4] = target.y;
    trailPos[5] = target.z;
    (trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (trail.material as THREE.LineBasicMaterial).opacity = 0.8;

    shakeCamera(0.15);

    // Check distance to each target (works even without camera raycast)
    for (const t of targets) {
      if (!t.alive || t.hit) continue;
      const dist = t.mesh.position.distanceTo(target);
      if (dist < 0.6) {
        t.hit = true;
        t.alive = false;
        score++;
        combo++;
        comboTimer = 2;
        fireShards(t.mesh.position);
        showScorePopup(t.mesh.position, combo > 1 ? combo * 10 : 10);
        shakeCamera(0.3);
        break;
      }
    }
  }

  return {
    grabbables,
    background: 0x060810,
    stars: false,
    view: { distance: 7, pitch: 0, yaw: 0 },
    update(dt: number, _elapsed: number): void {
      const now = performance.now() / 1000;
      // Debug: log muzzle opacity
      const mo = (muzzle.material as THREE.SpriteMaterial).opacity;

      // Spawn new targets
      nextSpawn -= dt;
      if (nextSpawn <= 0 && targets.filter((t) => t.alive).length < TARGET_COUNT) {
        spawnTarget();
        nextSpawn = 1 + Math.random() * 2;
      }

      // Update targets (grow-in animation, lifetime, shatter)
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        const age = now - t.spawnAt;

        if (t.hit) {
          // Shatter: scale down + rotate
          t.shatterT += dt * 3;
          const s = Math.max(0, 1 - t.shatterT);
          t.mesh.scale.setScalar(s);
          t.mesh.rotation.x += dt * 8;
          t.mesh.rotation.y += dt * 6;
          if (t.shatterT >= 1) {
            // Remove fully shattered target
            world.remove(t.mesh);
            const idx = grabbables.indexOf(t.mesh);
            if (idx >= 0) grabbables.splice(idx, 1);
            targets.splice(i, 1);
          }
          continue;
        }

        if (t.alive) {
          // Grow-in animation
          const targetScale = 1;
          const cur = t.mesh.scale.x;
          t.mesh.scale.setScalar(cur + (targetScale - cur) * Math.min(1, dt * 5));

          // Gentle floating
          t.mesh.position.y += Math.sin(now * 2 + t.spawnAt) * dt * 0.15;

          // Lifetime expiry
          if (age > t.lifetime) {
            t.alive = false;
            // Fade out
            (t.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
            (t.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x333333);
            setTimeout(() => {
              if (t.mesh.parent) world.remove(t.mesh);
              const idx = grabbables.indexOf(t.mesh);
              if (idx >= 0) grabbables.splice(idx, 1);
              const ti = targets.indexOf(t);
              if (ti >= 0) targets.splice(ti, 1);
            }, 500);
          }
        }
      }

      // Update crosshair position from aim
      if (hasAim) {
        crosshair.visible = true;
        crosshair.position.lerp(aimPoint, Math.min(1, dt * 15));
      } else {
        crosshair.visible = false;
      }

      // Muzzle flash decay
      const muzzleMat = muzzle.material as THREE.SpriteMaterial;
      muzzleMat.opacity *= Math.exp(-dt * 6);
      muzzleGlow.intensity *= Math.exp(-dt * 6);
      const ms = 2.0 - (1 - muzzleMat.opacity) * 1.0;
      muzzle.scale.set(Math.max(0.3, ms), Math.max(0.3, ms), 1);

      // Gun recoil recovery
      gunGroup.position.z += (4 - gunGroup.position.z) * Math.min(1, dt * 10);
      gunGroup.rotation.x += (0 - gunGroup.rotation.x) * Math.min(1, dt * 10);

      // Bullet trail decay
      (trail.material as THREE.LineBasicMaterial).opacity *= Math.exp(-dt * 10);

      // Shard update
      if (shards.visible) {
        let alive = 0;
        for (let i = 0; i < SHARD_COUNT; i++) {
          shardPos[i * 3] += shardVel[i].x * dt;
          shardPos[i * 3 + 1] += shardVel[i].y * dt;
          shardPos[i * 3 + 2] += shardVel[i].z * dt;
          shardVel[i].multiplyScalar(1 - dt * 1.5);
          if (shardPos[i * 3 + 1] > -10) alive++;
        }
        shardGeo.attributes.position.needsUpdate = true;
        shardMat.opacity *= Math.exp(-dt * 2);
        if (shardMat.opacity < 0.02) shards.visible = false;
      }

      // Score popup
      if (scorePopupT > 0) {
        scorePopupT -= dt * 1.2;
        scoreSprite.position.lerp(scorePopupPos, 0.1);
        scoreSprite.position.y += dt * 0.8;
        (scoreSprite.material as THREE.SpriteMaterial).opacity = Math.max(0, scorePopupT);
        const ss = 0.5 + (1 - scorePopupT) * 0.3;
        scoreSprite.scale.set(ss, ss, 1);
      }

      // Combo timer
      if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) combo = 0;
      }
    },
    updatePointer(ndcX: number, ndcY: number, camera: THREE.PerspectiveCamera): void {
      cameraRef.cam = camera;
      ndc.set(ndcX, ndcY);
      raycaster.setFromCamera(ndc, camera);
      // Intersect with the target wall plane (z = -RANGE)
      const planeZ = -RANGE;
      const dir = raycaster.ray.direction;
      const origin = raycaster.ray.origin;
      if (Math.abs(dir.z) > 0.001) {
        const t = (planeZ - origin.z) / dir.z;
        if (t > 0) {
          aimPoint.set(
            origin.x + dir.x * t,
            origin.y + dir.y * t,
            planeZ,
          );
          hasAim = true;
          return;
        }
      }
      hasAim = false;
    },
    capturesPointer(): boolean {
      return true;
    },
    pointerFocus(out: THREE.Vector3): boolean {
      if (!hasAim) return false;
      out.copy(aimPoint);
      return true;
    },
    setPointerAction(pressed: boolean, _held: boolean, _released: boolean): void {
      if (pressed) {
        fire();
      }
    },
    bodyInfo(name: string | null): string | null {
      if (name === 'Target') return `Target · ${score} hits`;
      return null;
    },
    coachHint(): string | null {
      if (score === 0) return 'Point at a target · pinch or click to fire';
      return `${score} hits${combo > 1 ? ` · ${combo}x combo` : ''}`;
    },
    shakeCamera(amount: number): void {
      shakeCamera(amount);
    },
    dispose(): void {
      disposeGroup(world);
    },
  };
}
