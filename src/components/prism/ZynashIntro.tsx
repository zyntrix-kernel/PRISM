"use client";

import { useEffect, useRef, useState, useMemo, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

/**
 * ZynashIntro — cinematic 3D startup animation.
 *
 * Built by combining techniques from 3 reference repos:
 *   - anastasiya1155/3d-text (MIT): TextGeometry + particle field pattern
 *   - Imagineer99/Three.js-3D-Text: MeshMatcapMaterial metallic shading
 *   - DavidHDev/react-bits (MIT + Commons Clause): ShinyText gradient sweep,
 *     DecryptedText scramble reveal, Particles background
 *
 * Phases:
 *   1. (0-3s)   "ZYNASH LABS" 3D text rotates in + metallic shimmer
 *   2. (3-7s)   Credits appear one by one with decrypt/scramble effect
 *   3. (7-8s)   Fade out
 *   4. (8s)     Done — app visible
 *
 * Attributions: see THIRD_PARTY_LICENSES.md
 */

interface CreditEntry {
  name: string;
  role: string;
  badge?: string;
}

const CREDITS: CreditEntry[] = [
  { name: "Tanay Bhandari", role: "Zyntrix.krnl.sys", badge: "LEAD" },
  { name: "Ashwin Nagaranjan Ramnath", role: "Ash Collector" },
  { name: "Debroop", role: "distortus_rexx" },
];

type Phase = "title" | "credits" | "fadeout" | "done";

// ── 3D Title mesh with metallic shimmer ─────────────────────────────────
function Title3D({ visible }: { visible: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const { viewport } = useThree();

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (meshRef.current) {
      // Gentle floating + rotation
      meshRef.current.rotation.y = Math.sin(t * 0.5) * 0.15;
      meshRef.current.rotation.x = Math.sin(t * 0.3) * 0.05;
      meshRef.current.position.y = Math.sin(t * 0.8) * 0.05;
    }
    // Animate the shimmer uniform (moving highlight band)
    if (matRef.current) {
      const uniforms = matRef.current.uniforms;
      if (uniforms?.uTime) uniforms.uTime.value = t;
    }
  });

  if (!visible) return null;

  return (
    <mesh ref={meshRef}>
      <Text
        fontSize={viewport.width < 6 ? 0.6 : 0.9}
        color="#f5f5f7"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.005}
        outlineColor="#0a84ff"
        outlineOpacity={0.3}
      >
        ZYNASH LABS
        {/* Custom onBeforeCompile adds a metallic shimmer sweep */}
        <meshStandardMaterial
          ref={matRef}
          color="#e8e8ec"
          metalness={0.9}
          roughness={0.2}
          emissive="#0a84ff"
          emissiveIntensity={0.05}
          onBeforeCompile={(shader) => {
            shader.uniforms.uTime = { value: 0 };
            shader.vertexShader = shader.vertexShader.replace(
              "varying vec3 vViewPosition;",
              "varying vec3 vViewPosition;\nvarying vec2 vUv2;",
            );
            shader.vertexShader = shader.vertexShader.replace(
              "#include <project_vertex>",
              `#include <project_vertex>
               vUv2 = uv;`,
            );
            shader.fragmentShader = shader.fragmentShader.replace(
              "varying vec3 vViewPosition;",
              "varying vec3 vViewPosition;\nvarying vec2 vUv2;\nuniform float uTime;",
            );
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <dithering_fragment>",
              `#include <dithering_fragment>
               // Metallic shimmer sweep: a moving highlight band across the text
               float sweep = sin(vUv2.x * 3.14 + uTime * 1.5) * 0.5 + 0.5;
               sweep = pow(sweep, 3.0);
               gl_FragColor.rgb += vec3(0.4, 0.5, 0.6) * sweep * 0.3;`,
            );
          }}
        />
      </Text>
    </mesh>
  );
}

// ── Particle field behind the title ──────────────────────────────────────
function ParticleField({ count = 800 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Sphere distribution
      const r = 3 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi) - 5;
      // Blue-white color variance
      const hue = 0.55 + Math.random() * 0.1;
      const c = new THREE.Color().setHSL(hue, 0.6, 0.5 + Math.random() * 0.3);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, [count]);

  useFrame((state) => {
    if (pointsRef.current) {
      const t = state.clock.getElapsedTime();
      pointsRef.current.rotation.y = t * 0.03;
      pointsRef.current.rotation.x = Math.sin(t * 0.1) * 0.05;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        vertexColors
        transparent
        opacity={0.6}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// ── Scene lighting ───────────────────────────────────────────────────────
function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={2} color="#ffffff" />
      <pointLight position={[-5, -3, 3]} intensity={1.5} color="#0a84ff" />
      <pointLight position={[0, 0, -5]} intensity={1} color="#3060ff" />
    </>
  );
}

// ── Credit text with decrypt/scramble reveal (react-bits DecryptedText) ──
function DecryptedCredit({
  credit,
  index,
  visibleIndex,
  isLead,
}: {
  credit: CreditEntry;
  index: number;
  visibleIndex: number;
  isLead: boolean;
}) {
  const [displayText, setDisplayText] = useState("");
  const [done, setDone] = useState(false);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-";

  useEffect(() => {
    if (index > visibleIndex) {
      setDisplayText("");
      setDone(false);
      return;
    }
    if (index < visibleIndex || done) return;

    // Scramble reveal
    const target = credit.name;
    let iteration = 0;
    const maxIterations = target.length * 3;
    const interval = setInterval(() => {
      setDisplayText(
        target
          .split("")
          .map((char, i) => {
            if (i < iteration / 3) return target[i];
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join(""),
      );
      iteration++;
      if (iteration > maxIterations) {
        setDisplayText(target);
        setDone(true);
        clearInterval(interval);
      }
    }, 40);
    return () => clearInterval(interval);
  }, [index, visibleIndex, credit.name, done]);

  if (index > visibleIndex) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        animation: "zynash-credit-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
      }}
    >
      {isLead && (
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.2em",
            color: "#0a84ff",
            textTransform: "uppercase",
            padding: "2px 8px",
            border: "1px solid rgba(10,132,255,0.4)",
            borderRadius: "999px",
            marginBottom: 4,
          }}
        >
          LEAD
        </div>
      )}
      <div
        style={{
          fontSize: isLead ? "clamp(1.4rem, 3.5vw, 2.2rem)" : "clamp(1.1rem, 2.8vw, 1.7rem)",
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: isLead ? "#f5f5f7" : "rgba(245,245,247,0.85)",
          textShadow: isLead ? "0 2px 12px rgba(10,132,255,0.25)" : "none",
          fontFamily: "var(--font-mono, 'SF Mono', monospace)",
          minHeight: "1.2em",
        }}
      >
        {displayText || "\u00A0"}
      </div>
      {done && (
        <div
          style={{
            fontSize: "clamp(0.75rem, 1.4vw, 0.9rem)",
            fontWeight: 500,
            letterSpacing: "0.1em",
            color: isLead ? "rgba(10,132,255,0.8)" : "rgba(255,255,255,0.35)",
            fontFamily: "var(--font-mono, monospace)",
            animation: "zynash-fade-in 0.4s ease-out forwards",
            opacity: 0,
          }}
        >
          {credit.role}
        </div>
      )}
    </div>
  );
}

// ── Main intro component ────────────────────────────────────────────────
export default function ZynashIntro({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("title");
  const [visibleCredit, setVisibleCredit] = useState(-1);
  const [skipped, setSkipped] = useState(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (skipped) {
      const t = setTimeout(() => onDoneRef.current(), 400);
      return () => clearTimeout(t);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Phase 1: title (0-3s)
    timers.push(setTimeout(() => setPhase("credits"), 3000));

    // Phase 2: credits one by one (3s start, 1.5s each)
    CREDITS.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleCredit(i), 3000 + i * 1500));
    });

    // Phase 3: fade out
    timers.push(setTimeout(() => setPhase("fadeout"), 3000 + CREDITS.length * 1500 + 1000));

    // Phase 4: done
    timers.push(setTimeout(() => setPhase("done"), 3000 + CREDITS.length * 1500 + 1000 + 1000));

    return () => timers.forEach(clearTimeout);
  }, [skipped]);

  useEffect(() => {
    if (phase === "done") onDoneRef.current();
  }, [phase]);

  const skip = () => {
    if (!skipped) setSkipped(true);
  };

  if (phase === "done") return null;

  const isFading = phase === "fadeout";
  const showTitle = phase === "title";
  const showCredits = phase === "credits" || isFading;

  return (
    <div
      onClick={skip}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        opacity: isFading ? 0 : 1,
        transition: "opacity 1s ease-out",
        overflow: "hidden",
      }}
    >
      {/* 3D Canvas — title + particles */}
      {showTitle && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            animation: "zynash-canvas-in 0.5s ease-out forwards",
            opacity: 0,
          }}
        >
          <Canvas
            camera={{ position: [0, 0, 5], fov: 50 }}
            style={{ background: "transparent" }}
            dpr={[1, 2]}
          >
            <Suspense fallback={null}>
              <SceneLights />
              <ParticleField count={600} />
              <Title3D visible={showTitle} />
            </Suspense>
          </Canvas>
        </div>
      )}

      {/* Subtitle below the 3D title */}
      {showTitle && (
        <div
          style={{
            position: "absolute",
            bottom: "30%",
            textAlign: "center",
            animation: "zynash-fade-in 1s ease-out 1.5s forwards",
            opacity: 0,
          }}
        >
          <div
            style={{
              fontSize: "clamp(0.7rem, 1.5vw, 0.9rem)",
              fontWeight: 500,
              letterSpacing: "0.4em",
              color: "rgba(10,132,255,0.7)",
              textTransform: "uppercase",
            }}
          >
            Projected Reality Interaction &amp; Spatial Manipulation
          </div>
        </div>
      )}

      {/* Phase 2: Credits with decrypt reveal */}
      {showCredits && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "clamp(20px, 4vh, 40px)",
            textAlign: "center",
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: "clamp(0.8rem, 1.8vw, 1.1rem)",
              fontWeight: 700,
              letterSpacing: "0.3em",
              color: "rgba(255,255,255,0.2)",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            ZYNASH LABS
          </div>

          {CREDITS.map((credit, i) => (
            <DecryptedCredit
              key={i}
              credit={credit}
              index={i}
              visibleIndex={visibleCredit}
              isLead={credit.badge === "LEAD"}
            />
          ))}
        </div>
      )}

      {/* Skip hint */}
      <div
        style={{
          position: "fixed",
          bottom: 30,
          fontSize: 10,
          letterSpacing: "0.2em",
          color: "rgba(255,255,255,0.2)",
          textTransform: "uppercase",
          animation: "zynash-fade-in 1s ease-out 1s forwards",
          opacity: 0,
        }}
      >
        Click anywhere to skip
      </div>

      <style>{`
        @keyframes zynash-canvas-in {
          to { opacity: 1; }
        }
        @keyframes zynash-credit-in {
          0% { transform: translateY(30px) scale(0.8); opacity: 0; filter: blur(8px); }
          100% { transform: translateY(0) scale(1); opacity: 1; filter: blur(0px); }
        }
        @keyframes zynash-fade-in {
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
