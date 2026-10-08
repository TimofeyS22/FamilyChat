import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

import {
  isNearTimelineBottom,
  resolveTimelineScrollMode,
  scrollTimelineToBottom,
} from "./timeline-scroll";

type UseTimelineScrollArgs = {
  latestMessageId?: string;
  messageCount: number;
  roomId: string;
  scrollToBottomTrigger?: string | null;
  status: string;
};

export function useTimelineScroll(
  containerRef: RefObject<HTMLDivElement | null>,
  { latestMessageId, messageCount, roomId, scrollToBottomTrigger, status }: UseTimelineScrollArgs,
) {
  const userScrolledUpRef = useRef(false);
  const initialScrollUntilRef = useRef(0);
  const previousRoomIdRef = useRef<string | null>(null);
  const previousLatestMessageIdRef = useRef<string | undefined>(undefined);
  const previousScrollTriggerRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    function syncUserScrollIntent() {
      if (!container) {
        return;
      }
      userScrolledUpRef.current = !isNearTimelineBottom(
        container.scrollHeight,
        container.scrollTop,
        container.clientHeight,
      );
    }

    syncUserScrollIntent();
    container.addEventListener("scroll", syncUserScrollIntent, { passive: true });

    const roomChanged = previousRoomIdRef.current !== roomId;
    previousRoomIdRef.current = roomId;
    if (roomChanged) {
      userScrolledUpRef.current = false;
      initialScrollUntilRef.current = Date.now() + 1200;
    }

    const latestMessageChanged = previousLatestMessageIdRef.current !== latestMessageId;
    previousLatestMessageIdRef.current = latestMessageId;

    const scrollTriggerChanged =
      scrollToBottomTrigger !== undefined &&
      scrollToBottomTrigger !== null &&
      scrollToBottomTrigger !== previousScrollTriggerRef.current;
    previousScrollTriggerRef.current = scrollToBottomTrigger ?? undefined;

    const mode = resolveTimelineScrollMode({
      initialScrollActive: Date.now() < initialScrollUntilRef.current,
      latestMessageChanged,
      roomChanged,
      userScrolledUp: scrollTriggerChanged ? false : userScrolledUpRef.current,
    });

    let frame = 0;
    let settleTimeout: number | undefined;

    if (mode !== "none" || scrollTriggerChanged) {
      const force = mode === "force" || scrollTriggerChanged;
      const scroll = () => {
        if (!force && document.activeElement instanceof HTMLTextAreaElement) {
          return;
        }
        scrollTimelineToBottom(container);
      };

      scroll();
      frame = window.requestAnimationFrame(scroll);
      if (force) {
        settleTimeout = window.setTimeout(scroll, 360);
      }
    }

    return () => {
      container.removeEventListener("scroll", syncUserScrollIntent);
      window.cancelAnimationFrame(frame);
      if (settleTimeout !== undefined) {
        window.clearTimeout(settleTimeout);
      }
    };
  }, [containerRef, latestMessageId, messageCount, roomId, scrollToBottomTrigger, status]);
}
