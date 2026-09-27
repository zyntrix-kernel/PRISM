// GUN GAME preset: a target-shooting range controlled by pointing + pinching.
// First-person weapon model: slide, barrel, frame, grip, trigger guard, sight.
// Targets pop at random; pinch/click to fire. Hits shatter with particle burst.

import * as THREE from 'three';
import { disposeGroup, type BuilderCtx, type WorldAPI } from './types';

interface Target {
  mesh: THREE.Mesh;
  alive: boolean;
  spawnAt: number;
  lifetime: number;
  hit: boolean;
  shatterT: number;
}

const TARGET_COUNT = 6;
const RANGE = 9;
const SPREAD = 6;

export function buildGunGame(ctx: BuilderCtx): WorldAPI {
  const { world, glowTex, shakeCamera } = ctx;
  const grabbables: THREE.Object3D[] = [];

  // ── First-person weapon model (proper 3D, viewed from behind) ──────
  const gunGroup = new THREE.Group();
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x2c2c38, roughness: 0.3, metalness: 0.92 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.55, metalness: 0.7 });
  const matAccent = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x7dd3fc, emissiveIntensity: 0.5, roughness: 0.25 });

  // Slide (top rail — the main body of a semi-auto pistol)
  const slide = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.24), matMetal);
  slide.position.set(0, 0.06, 0);
  gunGroup.add(slide);

  // Slide serrations (visual detail on the rear of the slide)
  for (let i = 0; i < 5; i++) {
    const serr = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.26), matDark);
    serr.position.set(-0.55 + i * 0.04, 0.06, 0);
    gunGroup.add(serr);
  }

  // Barrel (protrudes from front of slide)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.4, 20), matMetal);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.7, 0.06, 0);
  gunGroup.add(barrel);

  // Muzzle crown
  const muzzleCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.06, 20), matDark);
  muzzleCrown.rotation.z = Math.PI / 2;
  muzzleCrown.position.set(0.9, 0.06, 0);
  gunGroup.add(muzzleCrown);

  // Frame (lower receiver)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.22), matDark);
  frame.position.set(-0.05, -0.06, 0);
  gunGroup.add(frame);

  // Trigger guard (half-torus)
  const guard = new THREE.Mesh(
    new THREE.TorusGeometry(0.09, 0.022, 8, 16, Math.PI),
    matMetal,
  );
  guard.position.set(-0.1, -0.18, 0);
  guard.rotation.set(Math.PI / 2, 0, 0);
  gunGroup.add(guard);

  // Trigger
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.04), matDark);
  trigger.position.set(-0.1, -0.14, 0);
  gunGroup.add(trigger);

  // Grip (angled down and back — ergonomic)
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.24), matDark);
  grip.position.set(-0.32, -0.42, 0);
  grip.rotation.z = -0.18;
  gunGroup.add(grip);

  // Grip texture lines
  for (let i = 0; i < 6; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.015, 0.25), matMetal);
    line.position.set(-0.32 + Math.sin(i * 0.3) * 0.02, -0.2 - i * 0.07, 0);
    line.rotation.z = -0.18;
    gunGroup.add(line);
  }

  // Front sight (glowing accent — futuristic)
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), matAccent);
  frontSight.position.set(0.55, 0.18, 0);
  gunGroup.add(frontSight);

  // Rear sight (notched)
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.12), matMetal);
  rearSight.position.set(-0.48, 0.17, 0);
  gunGroup.add(rearSight);

  // Position: first-person view. Rotate the gun so the barrel points INTO
  // the screen (toward targets at -Z), grip toward camera. The gun model
  // was built with barrel along +X; rotating -90° on Y makes it point -Z.
  gunGroup.position.set(0.5, -0.8, 5.8);
  gunGroup.rotation.set(-0.15, -Math.PI / 2 - 0.08, 0.03);
  gunGroup.scale.setScalar(1.1);
  world.add(gunGroup);

  // Dedicated light for the gun model (so it's visible against dark bg)
  const gunLight = new THREE.DirectionalLight(0x88aacc, 0.6);
  gunLight.position.set(0, 2, 6);
  gunLight.target = gunGroup;
  world.add(gunLight);
  world.add(gunLight.target);

  // ── Muzzle flash sprite (at barrel tip) ─────────────────────────────
  const muzzle = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0xfff2a8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  muzzle.position.set(1.0, -0.45, 3.5);
  muzzle.scale.set(1.8, 1.8, 1);
  world.add(muzzle);

  // Muzzle point light (dynamic lighting on fire)
  const muzzleGlow = new THREE.PointLight(0xfff2a8, 0, 6);
  muzzleGlow.position.set(0.95, -0.4, 3.5);
  world.add(muzzleGlow);

  // ── Crosshair (follows pointer) ─────────────────────────────────────
  const crosshair = new THREE.Group();
  const chRing = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.2, 32),
    new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.5, depthTest: false }),
  );
  chRing.renderOrder = 10;
  crosshair.add(chRing);
  const chDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.025, 16),
    new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.8, depthTest: false }),
  );
  chDot.renderOrder = 10;
  crosshair.add(chDot);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.015, 0.015),
      new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.4, depthTest: false }),
    );
    tick.position.set(Math.cos(angle) * 0.28, Math.sin(angle) * 0.28, 0);
    tick.rotation.z = angle;
    tick.renderOrder = 10;
    crosshair.add(tick);
  }
  crosshair.position.set(0, 0, -RANGE);
  crosshair.visible = false;
  world.add(crosshair);

  // ── Target wall + grid ──────────────────────────────────────────────
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(SPREAD * 2 + 4, SPREAD * 2 + 4),
    new THREE.MeshStandardMaterial({ color: 0x0d0e14, roughness: 0.9 }),
  );
  wall.position.set(0, 0, -RANGE - 0.5);
  world.add(wall);

  const gridPts: number[] = [];
  for (let x = -SPREAD; x <= SPREAD; x += 1.5) gridPts.push(x, -SPREAD, 0, x, SPREAD, 0);
  for (let y = -SPREAD; y <= SPREAD; y += 1.5) gridPts.push(-SPREAD, y, 0, SPREAD, y, 0);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(gridPts), 3));
  const grid = new THREE.LineSegments(
    gridGeo,
    new THREE.LineBasicMaterial({ color: 0x1a1d28, transparent: true, opacity: 0.5 }),
  );
  grid.position.set(0, 0, -RANGE - 0.48);
  world.add(grid);

  // ── Targets ─────────────────────────────────────────────────────────
  const targets: Target[] = [];
  const targetGeo = new THREE.SphereGeometry(0.35, 16, 12);

  function spawnTarget(): void {
    const colors = [0xff6b6b, 0x7dd3fc, 0xfbbf24, 0x34d399];
    const c = colors[Math.floor(Math.random() * colors.length)];
    const mesh = new THREE.Mesh(
      targetGeo,
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3, roughness: 0.3 }),
    );
    mesh.position.set(
      (Math.random() - 0.5) * SPREAD * 1.5,
      (Math.random() - 0.5) * SPREAD * 1.5,
      -RANGE,
    );
    mesh.scale.setScalar(0.01);
    mesh.name = 'Target';
    mesh.userData.grabbable = false;
    world.add(mesh);
    grabbables.push(mesh);
    targets.push({ mesh, alive: true, spawnAt: performance.now() / 1000, lifetime: 4 + Math.random() * 3, hit: false, shatterT: 0 });
  }

  for (let i = 0; i < 3; i++) spawnTarget();
  let nextSpawn = 1.5;

  // ── Bullet trail ────────────────────────────────────────────────────
  const trailGeo = new THREE.BufferGeometry();
  const trailPos = new Float32Array(6);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Line(
    trailGeo,
    new THREE.LineBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0, depthWrite: false }),
  );
  trail.frustumCulled = false;
  world.add(trail);

  // ── Hit particle burst ──────────────────────────────────────────────
  const SHARD_COUNT = 24;
  const shardPos = new Float32Array(SHARD_COUNT * 3);
  const shardVel: THREE.Vector3[] = [];
  for (let i = 0; i < SHARD_COUNT; i++) shardVel.push(new THREE.Vector3());
  const shardGeo = new THREE.BufferGeometry();
  shardGeo.setAttribute('position', new THREE.BufferAttribute(shardPos, 3));
  const shardMat = new THREE.PointsMaterial({
    size: 0.14, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const shardCol = new Float32Array(SHARD_COUNT * 3);
  shardGeo.setAttribute('color', new THREE.BufferAttribute(shardCol, 3));
  const shards = new THREE.Points(shardGeo, shardMat);
  shards.visible = false;
  world.add(shards);

  function fireShards(pos: THREE.Vector3, color: number): void {
    shards.visible = true;
    shardMat.opacity = 1;
    const c = new THREE.Color(color);
    for (let i = 0; i < SHARD_COUNT; i++) {
      shardPos[i * 3] = pos.x; shardPos[i * 3 + 1] = pos.y; shardPos[i * 3 + 2] = pos.z;
      shardCol[i * 3] = c.r; shardCol[i * 3 + 1] = c.g; shardCol[i * 3 + 2] = c.b;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 3 + Math.random() * 6;
      shardVel[i].set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.sin(phi) * Math.sin(theta) * speed,
        Math.cos(phi) * speed,
      );
    }
    shardGeo.attributes.position.needsUpdate = true;
    shardGeo.attributes.color.needsUpdate = true;
  }

  // ── Score popup ─────────────────────────────────────────────────────
  let score = 0, combo = 0, comboTimer = 0;
  const scoreSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex, color: 0x7dd3fc, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  scoreSprite.position.set(0, 0, -RANGE + 1);
  scoreSprite.scale.set(0.5, 0.5, 1);
  world.add(scoreSprite);
  let scorePopupT = 0;
  const scorePopupPos = new THREE.Vector3();

  // ── Pointer + shooting ──────────────────────────────────────────────
  const aimPoint = new THREE.Vector3();
  let hasAim = false;
  let lastFireAt = 0;
  const FIRE_COOLDOWN = 0.18;

  function fire(): void {
    const now = performance.now() / 1000;
    if (now - lastFireAt < FIRE_COOLDOWN) return;
    lastFireAt = now;

    (muzzle.material as THREE.SpriteMaterial).opacity = 1;
    muzzle.scale.set(2.0, 2.0, 1);
    muzzleGlow.intensity = 3;
    gunGroup.position.z = 4.8;
    gunGroup.rotation.x = -0.16;

    const target = hasAim ? aimPoint : new THREE.Vector3(0, 0, -RANGE);
    trailPos[0] = 0.95; trailPos[1] = -0.4; trailPos[2] = 3.5;
    trailPos[3] = target.x; trailPos[4] = target.y; trailPos[5] = target.z;
    (trail.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (trail.material as THREE.LineBasicMaterial).opacity = 0.8;

    shakeCamera(0.15);

    for (const t of targets) {
      if (!t.alive || t.hit) continue;
      if (t.mesh.position.distanceTo(target) < 0.6) {
        t.hit = true; t.alive = false;
        score++; combo++; comboTimer = 2;
        const tc = (t.mesh.material as THREE.MeshStandardMaterial).color.getHex();
        fireShards(t.mesh.position, tc);
        scorePopupPos.copy(t.mesh.position); scorePopupPos.y += 0.8;
        scorePopupT = 1;
        (scoreSprite.material as THREE.SpriteMaterial).opacity = 1;
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
    update(dt: number): void {
      const now = performance.now() / 1000;

      // Spawn targets
      nextSpawn -= dt;
      if (nextSpawn <= 0 && targets.filter((t) => t.alive).length < TARGET_COUNT) {
        spawnTarget();
        nextSpawn = 1 + Math.random() * 2;
      }

      // Update targets
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        const age = now - t.spawnAt;
        if (t.hit) {
          t.shatterT += dt * 3;
          t.mesh.scale.setScalar(Math.max(0, 1 - t.shatterT));
          t.mesh.rotation.x += dt * 8;
          t.mesh.rotation.y += dt * 6;
          if (t.shatterT >= 1) {
            world.remove(t.mesh);
            const idx = grabbables.indexOf(t.mesh);
            if (idx >= 0) grabbables.splice(idx, 1);
            targets.splice(i, 1);
          }
          continue;
        }
        if (t.alive) {
          t.mesh.scale.setScalar(t.mesh.scale.x + (1 - t.mesh.scale.x) * Math.min(1, dt * 5));
          t.mesh.position.y += Math.sin(now * 2 + t.spawnAt) * dt * 0.15;
          if (age > t.lifetime) {
            t.alive = false;
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

      // Crosshair
      if (hasAim) { crosshair.visible = true; crosshair.position.lerp(aimPoint, Math.min(1, dt * 15)); }
      else crosshair.visible = false;

      // Muzzle decay
      const mm = muzzle.material as THREE.SpriteMaterial;
      mm.opacity *= Math.exp(-dt * 6);
      muzzleGlow.intensity *= Math.exp(-dt * 6);
      const ms = Math.max(0.3, 2.0 - (1 - mm.opacity));
      muzzle.scale.set(ms, ms, 1);

      // Gun recoil recovery
      gunGroup.position.z += (4.5 - gunGroup.position.z) * Math.min(1, dt * 10);
      gunGroup.rotation.x += (-0.12 - gunGroup.rotation.x) * Math.min(1, dt * 10);

      // Trail decay
      (trail.material as THREE.LineBasicMaterial).opacity *= Math.exp(-dt * 10);

      // Shards
      if (shards.visible) {
        for (let i = 0; i < SHARD_COUNT; i++) {
          shardPos[i * 3] += shardVel[i].x * dt;
          shardPos[i * 3 + 1] += shardVel[i].y * dt;
          shardPos[i * 3 + 2] += shardVel[i].z * dt;
          shardVel[i].multiplyScalar(1 - dt * 1.5);
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

      if (comboTimer > 0) { comboTimer -= dt; if (comboTimer <= 0) combo = 0; }
    },
    updatePointer(ndcX: number, ndcY: number, camera: THREE.PerspectiveCamera): void {
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2(ndcX, ndcY);
      ray.setFromCamera(ndc, camera);
      const planeZ = -RANGE;
      const dir = ray.ray.direction;
      const origin = ray.ray.origin;
      if (Math.abs(dir.z) > 0.001) {
        const t = (planeZ - origin.z) / dir.z;
        if (t > 0) {
          aimPoint.set(origin.x + dir.x * t, origin.y + dir.y * t, planeZ);
          hasAim = true;
          return;
        }
      }
      hasAim = false;
    },
    capturesPointer: () => true,
    pointerFocus(out: THREE.Vector3) { if (!hasAim) return false; out.copy(aimPoint); return true; },
    setPointerAction(pressed: boolean) { if (pressed) fire(); },
    bodyInfo(name: string | null) { return name === 'Target' ? `Target · ${score} hits` : null; },
    coachHint() { return score === 0 ? 'Point at a target · pinch or click to fire' : `${score} hits${combo > 1 ? ` · ${combo}x combo` : ''}`; },
    shakeCamera(amount: number) { shakeCamera(amount); },
    dispose() { disposeGroup(world); },
  };
}
