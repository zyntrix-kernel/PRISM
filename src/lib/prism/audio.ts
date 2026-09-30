// ─────────────────────────────────────────────────────────────────────────────
// PRISM · "FIRST LIGHT" — procedural film score + instrument SFX.
//
// Zero audio assets: everything is synthesized live with the Web Audio API so
// the film ships self-contained and deterministic. The score is TIME-DRIVEN —
// `update(t)` is called from the film's render hook with the current film
// time, and scheduled one-shot events fire as the timeline crosses them.
// Autoplay-safe: the AudioContext starts on the first user gesture; if the
// visitor never interacts, the film simply plays silent (never blocks).
//
// Signal design: master gain → soft compressor → destination. The bed is a
// slowly breathing sub-drone + glassy pad + airy noise wash. One-shots are
// short synthesized voices (booms, chimes, whooshes, sparkles, risers).
// The app phase reuses the same context for interaction SFX (preset whoosh,
// toast blips, grab ticks, camera arpeggio).
// ─────────────────────────────────────────────────────────────────────────────

type Voice = () => void;

interface ScoreEvent {
  t: number;
  fire: Voice;
}

const STORAGE_KEY = "prism-sfx-muted";

/** Tiny helper: faster exponential ramps sound natural for percussive tails. */
function expDecay(gain: GainNode, ctx: AudioContext, peak: number, attack: number, decay: number, at: number): void {
  const g = gain.gain;
  g.setValueAtTime(0.0001, at);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.exponentialRampToValueAtTime(0.0001, at + attack + decay);
}

export class PrismScore {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private bedStarted = false;
  private noiseBuf: AudioBuffer | null = null;

  private events: ScoreEvent[] = [];
  private pointer = 0;
  private lastT = 0;
  private finished = false;
  private muted = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === "1";
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** True once an AudioContext exists (i.e. the user has interacted). */
  get hasContext(): boolean {
    return this.ctx !== null;
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** First user gesture — create/resume the context and fade the bed in. */
  unlock(): void {
    if (this.muted) return;
    if (!this.ctx) {
      type Win = Window & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? (window as Win).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor({ latencyHint: "interactive" });
      } catch {
        return;
      }
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 24;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.24;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    } catch { /* private mode */ }
    if (muted) {
      if (this.master && this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(this.master.gain.value, now);
        this.master.gain.linearRampToValueAtTime(0.0001, now + 0.25);
      }
      window.setTimeout(() => void this.ctx?.suspend(), 300);
    } else {
      this.unlock();
      if (this.master && this.ctx) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(0.0001, now);
        this.master.gain.linearRampToValueAtTime(0.9, now + 0.6);
      }
    }
  }

  /** Called from the film render hook with current film time (seconds). */
  update(t: number): void {
    if (!this.ctx || !this.master || this.finished) return;

    // Bed enters once the context is live (mid-film unlocks fade in gently).
    if (!this.bedStarted) {
      this.bedStarted = true;
      this.startBed();
    }

    // A large forward jump (skip button) fast-forwards the pointer without
    // machine-gunning every skipped cue; the handoff sequence still plays.
    if (t - this.lastT > 1.2) {
      while (this.pointer < this.events.length && this.events[this.pointer].t < t) this.pointer++;
    } else if (t < this.lastT) {
      this.pointer = 0;
      while (this.pointer < this.events.length && this.events[this.pointer].t < t) this.pointer++;
    } else {
      while (this.pointer < this.events.length && this.events[this.pointer].t <= t) {
        this.events[this.pointer].fire();
        this.pointer++;
      }
    }
    this.lastT = t;
  }

  /** Fade everything out as the film hands off to the app. */
  finish(fade = 1.1): void {
    if (this.finished) return;
    this.finished = true;
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + fade);
  }

  /**
   * App phase: the film's fade-out pulled the master to silence — bring it
   * back up so interaction SFX are audible (respecting the mute preference).
   */
  restoreMaster(gain = 0.9, time = 0.7): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0.0001 : gain, now + time);
  }

  /** Full teardown (unmount). */
  dispose(): void {
    this.finished = true;
    const ctx = this.ctx;
    this.ctx = null;
    window.setTimeout(() => void ctx?.close().catch(() => undefined), 80);
  }

  // ── app-phase one-shots ───────────────────────────────────────────────────

  sfx(name: "boot" | "preset" | "grab" | "release" | "toast-ok" | "toast-warn" | "toast-info" | "camera" | "click"): void {
    if (this.muted) return;
    // Self-heal: interaction SFX are always invoked from a user gesture, so a
    // missing or suspended context can be created/resumed right here. Without
    // this the UI may say "sound on" while the browser never handed us a
    // context — audio would stay dead until the user cycled the toggle.
    if (!this.ctx || this.ctx.state !== "running") this.unlock();
    if (!this.ctx || !this.master) return;
    switch (name) {
      case "boot": this.voiceChord([220, 330, 440, 554.4], 0.028, 1.8, 0.4); this.voiceSparkle(1600, 0.05, 3); break;
      case "preset": this.voiceWhoosh(500, 2400, 0.55, 0.16); this.voicePing(660, 0.014, 0.5); break;
      case "grab": this.voiceThud(0.06); break;
      case "release": this.voicePing(520, 0.02, 0.3); break;
      case "toast-ok": this.voicePing(880, 0.02, 0.22); this.voicePing(1320, 0.016, 0.3, 0.09); break;
      case "toast-warn": this.voicePing(240, 0.03, 0.3); break;
      case "toast-info": this.voicePing(620, 0.018, 0.25); break;
      case "camera": this.voiceChord([440, 554.4, 659.3], 0.02, 0.9, 0.05); this.voicePing(1760, 0.012, 0.4, 0.18); break;
      case "click": this.voicePing(980, 0.008, 0.12); break;
    }
  }

  // ── score construction ────────────────────────────────────────────────────

  /** Build the cue table. Called lazily on first update so `T` stays hot. */
  buildScore(): void {
    // Sub-bass boom — the singularity ignites.
    const boom = (drop: number, peak: number, len: number) => () => this.voiceBoom(drop, peak, len);
    // Filtered-noise whoosh.
    const whoosh = (f0: number, f1: number, dur: number, peak: number) => () => this.voiceWhoosh(f0, f1, dur, peak);
    // Bell/chime cluster.
    const chimes = (base: number, n: number, spread: number, peak: number, gap: number) =>
      () => this.voiceChimeCluster(base, n, spread, peak, gap);
    // Ascending sparkle arpeggio.
    const sparkle = (base: number, n: number, peak: number) => () => this.voiceSparkle(base, peak, n);
    // Reverse riser into an impact.
    const riser = (dur: number, peak: number) => () => this.voiceRiser(dur, peak);
    // Warm pad swell (film chords).
    const pad = (freqs: number[], dur: number, peak: number) => () => this.voiceChord(freqs, peak, dur, dur * 0.35);
    // Soft marimba blip (team credits).
    const blip = (freq: number, peak: number) => () => this.voicePing(freq, peak, 0.5);

    const A = 220; // A3
    const P = (semi: number) => A * Math.pow(2, semi / 12);

    this.events = [
      { t: 0.80, fire: boom(34, 0.5, 1.6) },                       // genesis burst
      { t: 2.60, fire: whoosh(220, 1800, 1.5, 0.05) },             // labs morph begins
      { t: 4.35, fire: whoosh(300, 3200, 0.8, 0.12) },             // labs sweep
      { t: 5.95, fire: chimes(1240, 6, 900, 0.1, 0.055) },         // wordmark shatters
      { t: 6.85, fire: whoosh(400, 5200, 0.9, 0.1) },              // beam ignites
      { t: 7.45, fire: sparkle(980, 7, 0.07) },                    // spectrum blooms
      { t: 9.10, fire: pad([P(-12), P(-5), P(0)], 1.6, 0.045) },   // chemistry enters
      { t: 9.70, fire: chimes(520, 3, 160, 0.07, 0.12) },          // benzene assembles
      { t: 12.50, fire: sparkle(760, 5, 0.05) },                   // mathematics enters
      { t: 13.70, fire: pad([P(0), P(4), P(7), P(11)], 1.7, 0.05) },// phyllotaxis bloom
      { t: 15.05, fire: riser(0.95, 0.16) },                       // implosion
      { t: 16.05, fire: () => { this.voiceBoom(30, 0.65, 2.2); this.voiceNoiseCrash(0.3, 1.4); } }, // FLASH
      { t: 17.10, fire: pad([P(-12), P(0), P(4), P(7)], 2.6, 0.075) }, // PRISM lockup chord
      { t: 19.90, fire: whoosh(900, 220, 1.4, 0.045) },            // galaxy drift opens
      { t: 20.1, fire: blip(P(12), 0.05) },                        // credit 1
      { t: 21.82, fire: blip(P(14), 0.05) },                       // credit 2
      { t: 23.54, fire: blip(P(16), 0.05) },                       // credit 3
      { t: 25.26, fire: blip(P(19), 0.05) },                       // credit 4
      { t: 26.75, fire: riser(0.9, 0.2) },                         // handoff implosion
      { t: 27.65, fire: () => { this.voiceBoom(26, 0.7, 2.4); this.voiceNoiseCrash(0.34, 1.7); this.voiceSparkle(1400, 0.06, 6); } }, // HYPERFLASH
    ];
    this.pointer = 0;
    this.lastT = 0;
  }

  // ── voices ────────────────────────────────────────────────────────────────

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let s = 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s ^ (s >>> 15), 0x85ebca6b) + 0x27d4eb2f) | 0;
      data[i] = ((s >>> 8) & 0xffff) / 0x8000 - 1;
    }
    return buf;
  }

  private startBed(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    if (!this.events.length) this.buildScore();

    const bed = ctx.createGain();
    bed.gain.value = 0.0001;
    bed.connect(master);
    this.bedGain = bed;

    const now = ctx.currentTime;
    bed.gain.setValueAtTime(0.0001, now);
    bed.gain.linearRampToValueAtTime(1, now + 1.4);

    // Sub drone — two barely-detuned sines beat against each other (55Hz).
    const subGain = ctx.createGain();
    subGain.gain.value = 0.055;
    subGain.connect(bed);
    for (const f of [55, 55.6]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      osc.connect(subGain);
      osc.start();
    }

    // Glassy pad — detuned triangles through a slow-breathing lowpass.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 420;
    padFilter.Q.value = 0.4;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.028;
    padFilter.connect(padGain);
    padGain.connect(bed);
    for (const [f, detune] of [[110, -6], [164.8, 5], [220, 3]] as const) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(padFilter);
      osc.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start();

    // Airy wash — looped noise through a wide bandpass.
    if (this.noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900;
      bp.Q.value = 0.5;
      const g = ctx.createGain();
      g.gain.value = 0.014;
      src.connect(bp);
      bp.connect(g);
      g.connect(bed);
      src.start();
    }
  }

  private voiceBoom(dropTo: number, peak: number, tail: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, t0);
    osc.frequency.exponentialRampToValueAtTime(dropTo, t0 + 0.35);
    const g = ctx.createGain();
    expDecay(g, ctx, peak, 0.012, tail, t0);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + tail + 0.3);

    if (this.noiseBuf) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(900, t0);
      lp.frequency.exponentialRampToValueAtTime(90, t0 + tail * 0.7);
      const ng = ctx.createGain();
      expDecay(ng, ctx, peak * 0.55, 0.01, tail * 0.8, t0);
      src.connect(lp);
      lp.connect(ng);
      ng.connect(master);
      src.start(t0);
      src.stop(t0 + tail + 0.2);
    }
  }

  private voiceWhoosh(f0: number, f1: number, dur: number, peak: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuf) return;
    const t0 = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(f0, t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + dur * 0.42);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.1);
  }

  private voicePing(freq: number, peak: number, dur: number, delay = 0): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + 0.01 + delay;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    expDecay(g, ctx, peak, 0.008, dur, t0);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.15);
  }

  private voiceChimeCluster(base: number, n: number, spread: number, peak: number, gap: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    let s = 0x51ed270b;
    const rnd = () => {
      s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d);
      return ((s >>> 8) & 0xffff) / 0xffff;
    };
    for (let i = 0; i < n; i++) {
      const f = base + rnd() * spread;
      this.voicePing(f, peak * (0.6 + rnd() * 0.4), 0.7 + rnd() * 0.9, i * gap);
    }
  }

  private voiceSparkle(base: number, peak: number, n: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const steps = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
    for (let i = 0; i < n; i++) {
      const f = base * Math.pow(2, steps[i % steps.length] / 12) * (i >= steps.length ? 2 : 1);
      this.voicePing(f, peak * (1 - i / (n * 1.6)), 0.5, i * 0.07);
    }
  }

  private voiceRiser(dur: number, peak: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuf) return;
    const t0 = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(160, t0);
    bp.frequency.exponentialRampToValueAtTime(7200, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + dur * 0.92);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.08);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.2);
  }

  private voiceNoiseCrash(peak: number, dur: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuf) return;
    const t0 = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 500;
    const g = ctx.createGain();
    expDecay(g, ctx, peak, 0.006, dur, t0);
    src.connect(hp);
    hp.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.2);
  }

  /** Warm additive pad chord with slow attack — the film's harmonic bed. */
  private voiceChord(freqs: number[], peak: number, dur: number, attack: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + 0.02;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    g.connect(lp);
    lp.connect(master);
    for (const f of freqs) {
      for (const det of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        osc.detune.value = det;
        osc.connect(g);
        osc.start(t0);
        osc.stop(t0 + dur + 0.2);
      }
    }
  }

  private voiceThud(peak: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(70, t0 + 0.12);
    const g = ctx.createGain();
    expDecay(g, ctx, peak, 0.006, 0.22, t0);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + 0.4);
  }
}

/** Module-level singleton — the film, the stage and the HUD share one ctx. */
let scoreSingleton: PrismScore | null = null;
export function prismScore(): PrismScore {
  if (!scoreSingleton) scoreSingleton = new PrismScore();
  return scoreSingleton;
}
