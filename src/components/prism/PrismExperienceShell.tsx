"use client";

import { useCallback, useState } from "react";
import PrismCinematicIntroV2 from "./PrismCinematicIntroV2";

/**
 * Thin orchestration shell: cinematic identity first, live instrument second.
 * Keeping this boundary explicit prevents intro rendering from leaking into the
 * realtime simulation lifecycle.
 */
export default function PrismExperienceShell({ children }: { children: React.ReactNode }) {
  const [intro, setIntro] = useState(true);
  const finish = useCallback(() => setIntro(false), []);

  return (
    <>
      {intro ? <PrismCinematicIntroV2 onComplete={finish} /> : null}
      <div aria-hidden={intro} inert={intro || undefined} className="min-h-dvh">
        {children}
      </div>
    </>
  );
}
