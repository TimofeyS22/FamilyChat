import {
  edgeSwipeDistancePx,
  edgeSwipeEdgePx,
  edgeSwipeVelocityPxPerMs,
} from "@/lib/motion/tokens";

export type EdgeSwipeSample = {
  time: number;
  x: number;
  y: number;
};

export function shouldTriggerEdgeSwipeBack(
  start: EdgeSwipeSample,
  end: EdgeSwipeSample,
  maxVerticalDrift = 56,
) {
  const deltaX = end.x - start.x;
  const deltaY = Math.abs(end.y - start.y);
  if (start.x > edgeSwipeEdgePx || deltaY > maxVerticalDrift) {
    return false;
  }
  const elapsedMs = Math.max(end.time - start.time, 1);
  const velocityX = deltaX / elapsedMs;
  return deltaX > edgeSwipeDistancePx || (velocityX > edgeSwipeVelocityPxPerMs && deltaX > 40);
}
