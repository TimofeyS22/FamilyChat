/** Unified motion durations (ms). */
export const motionDurations = {
  micro: 140,
  ui: 200,
  overlay: 240,
  panel: 280,
  screen: 320,
} as const;

/** Unified easing curves. */
export const motionEasings = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
  spring: "cubic-bezier(0.34, 1.18, 0.64, 1)",
} as const;

export const scrollStickThresholdPx = 120;

export const edgeSwipeEdgePx = 32;
export const edgeSwipeDistancePx = 72;
export const edgeSwipeVelocityPxPerMs = 0.45;
