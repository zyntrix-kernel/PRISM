// Shared plain-data types for the tracking → gesture → interaction pipeline.
// These are intentionally framework-free so gesture logic stays unit-testable.

/** A single normalized hand landmark (image space: x,y in 0..1, z in units of x). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** One detected hand in a video frame. */
export interface TrackedHand {
  /** 21 MediaPipe hand landmarks. */
  landmarks: Landmark[];
  /** 'Left' | 'Right' | 'Unknown' as reported by the tracker. */
  handedness: string;
  /** 0..1 detector confidence. */
  confidence: number;
}

/** Snapshot of all hands detected in one video frame. */
export interface HandFrame {
  hands: TrackedHand[];
  /** performance.now() timestamp (ms) when the frame was produced. */
  timestampMs: number;
}

/** 2D point in normalized image coordinates. */
export interface Point2D {
  x: number;
  y: number;
}
