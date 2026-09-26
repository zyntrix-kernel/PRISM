// Toggleable debug overlay (D key / Debug button / ?debug=0). Shows the
// signals needed to diagnose tracking and interaction issues at the expo:
// frame rates, gesture state, pointer, selection, and renderer load.

import { PrismConfig } from './config';
import type { ObserverSnapshot } from './ai/observer';
import type { InteractionController } from './interaction';
import type { HandTracker } from './tracking';

export interface DebugStats {
  renderFps: number;
  hands: number;
  confidence: number;
  deviceLine: string;
}

/** Escape model/network strings before innerHTML (expo-machine safety). */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** One-line AI observer readout for the overlay (diagnostics only). */
function formatAi(ai: ObserverSnapshot | null): string {
  if (!ai || ai.status === 'off') return 'AI off (AI button or ?ai=1)';
  if (ai.status === 'loading') {
    const pct = ai.progress !== null ? ` ${Math.round(ai.progress * 100)}%` : '';
    return `AI loading model…${pct}`;
  }
  if (ai.status === 'no-camera') return 'AI idle · needs camera';
  if (ai.status === 'no-webgpu' || ai.status === 'error') {
    return `AI fault: ${esc(ai.error ?? ai.status)}`;
  }
  if (!ai.reading) return 'AI ready · awaiting first read';
  const age = ai.ageMs !== null ? ` · ${(ai.ageMs / 1000).toFixed(0)}s ago` : '';
  const target = ai.reading.target ? ` → ${esc(ai.reading.target)}` : '';
  return `AI ${ai.reading.intent}${target} ${ai.reading.confidence.toFixed(2)}${age}`;
}

export class DebugOverlay {
  private visible: boolean;
  private lastPaint = 0;

  constructor(
    private readonly el: HTMLElement,
    defaultVisible: boolean,
  ) {
    this.visible = defaultVisible;
    this.el.classList.toggle('hidden', !defaultVisible);
  }

  toggle(): boolean {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
    return this.visible;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  update(
    now: number,
    stats: DebugStats,
    interaction: InteractionController,
    tracker: HandTracker,
    drawCalls: number,
    triangles: number,
    objectCount: number,
    ai: ObserverSnapshot | null,
  ): void {
    if (!this.visible || now - this.lastPaint < 250) return;
    this.lastPaint = now;
    const px = interaction as unknown as { pointerNdc: { x: number; y: number } };
    const warn = (cond: boolean): string => (cond ? ' class="warn"' : '');
    const g = PrismConfig.gestures;
    this.el.innerHTML =
      `<div>FPS render <b>${stats.renderFps.toFixed(0)}</b> · track <b>${tracker.trackingFps.toFixed(0)}</b> (${tracker.averageInferenceMs.toFixed(1)} ms)</div>` +
      `<div${warn(stats.hands === 0)}>hands <b>${stats.hands}</b> · conf ${stats.confidence.toFixed(2)} · mode ${interaction.mode}</div>` +
      (tracker.pumpErrorCount > 0
        ? `<div class="warn">tracking faults ×${tracker.pumpErrorCount}: ${(tracker.lastPumpError || '').slice(0, 90)}</div>`
        : '') +
      `<div>gesture <b>${interaction.gesture}</b>${interaction.isPinching ? ' (pinch)' : ''}${interaction.twoHandActive ? ' · TWO-HAND' : ''}${interaction.pinchValue !== null ? ` · d=${interaction.pinchValue.toFixed(2)} ≤${g.pinchEnter.toFixed(2)}/${g.pinchExit.toFixed(2)}` : ''}</div>` +
      `<div>pointer (${px.pointerNdc.x.toFixed(2)}, ${px.pointerNdc.y.toFixed(2)})</div>` +
      `<div>hover <b>${interaction.hoveredName ?? '—'}</b> · grab <b>${interaction.grabbedName ?? '—'}</b></div>` +
      `<div>draw calls <b>${drawCalls}</b> · tris ${triangles} · objs ${objectCount}</div>` +
      `<div>${stats.deviceLine}</div>` +
      `<div>model ${tracker.modelOffline ? 'local (offline)' : 'CDN'} · ${tracker.delegateUsed}</div>` +
      `<div>${formatAi(ai)}</div>`;
  }
}
