import { describe, expect, it } from "vitest";

import { shouldTriggerEdgeSwipeBack } from "@/lib/motion/edge-swipe";
import {
  isNearTimelineBottom,
  resolveTimelineScrollMode,
} from "@/features/chats/timeline-scroll";

describe("timeline-scroll", () => {
  it("forces scroll when room changes", () => {
    expect(
      resolveTimelineScrollMode({
        initialScrollActive: false,
        latestMessageChanged: false,
        roomChanged: true,
        userScrolledUp: true,
      }),
    ).toBe("force");
  });

  it("does not follow when user scrolled up", () => {
    expect(
      resolveTimelineScrollMode({
        initialScrollActive: false,
        latestMessageChanged: true,
        roomChanged: false,
        userScrolledUp: true,
      }),
    ).toBe("none");
  });

  it("follows new messages near bottom", () => {
    expect(
      resolveTimelineScrollMode({
        initialScrollActive: false,
        latestMessageChanged: true,
        roomChanged: false,
        userScrolledUp: false,
      }),
    ).toBe("follow");
  });

  it("detects near-bottom state", () => {
    expect(isNearTimelineBottom(1000, 890, 100, 120)).toBe(true);
    expect(isNearTimelineBottom(1000, 700, 100, 120)).toBe(false);
  });
});

describe("edge-swipe", () => {
  it("accepts distance-based back swipe", () => {
    expect(
      shouldTriggerEdgeSwipeBack(
        { time: 0, x: 10, y: 100 },
        { time: 180, x: 100, y: 110 },
      ),
    ).toBe(true);
  });

  it("accepts velocity-based back swipe", () => {
    expect(
      shouldTriggerEdgeSwipeBack(
        { time: 0, x: 8, y: 100 },
        { time: 80, x: 60, y: 108 },
      ),
    ).toBe(true);
  });

  it("rejects swipe that starts away from edge", () => {
    expect(
      shouldTriggerEdgeSwipeBack(
        { time: 0, x: 80, y: 100 },
        { time: 180, x: 180, y: 110 },
      ),
    ).toBe(false);
  });
});
