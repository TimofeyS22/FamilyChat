import { scrollStickThresholdPx } from "@/lib/motion/tokens";

export type TimelineScrollMode = "force" | "follow" | "none";

export function distanceFromBottom(scrollHeight: number, scrollTop: number, clientHeight: number) {
  return scrollHeight - scrollTop - clientHeight;
}

export function isNearTimelineBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold = scrollStickThresholdPx,
) {
  return distanceFromBottom(scrollHeight, scrollTop, clientHeight) <= threshold;
}

export function resolveTimelineScrollMode(input: {
  initialScrollActive: boolean;
  latestMessageChanged: boolean;
  roomChanged: boolean;
  userScrolledUp: boolean;
}): TimelineScrollMode {
  if (input.roomChanged || input.initialScrollActive) {
    return "force";
  }
  if (input.latestMessageChanged && !input.userScrolledUp) {
    return "follow";
  }
  return "none";
}

export function scrollTimelineToBottom(element: HTMLElement) {
  element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
}
