import { Trash2 } from "lucide-react";
import type { PointerEvent } from "react";
import { useRef, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { motionPress, motionPressSubtle, motionSurface, transitionPanel } from "@/lib/motion/classes";
import { cn } from "@/lib/utils/cn";

import type { MatrixRoomSummary } from "@/features/matrix/types";

type ChatListItemProps = {
  room: MatrixRoomSummary;
  selected: boolean;
  separated?: boolean;
  onHide?: () => void;
  onSelect: () => void;
};

const ACTION_WIDTH_PX = 74;
const SNAP_OPEN_OFFSET_PX = -ACTION_WIDTH_PX;
const SNAP_THRESHOLD_PX = ACTION_WIDTH_PX * 0.55;

export function ChatListItem({
  onHide,
  onSelect,
  room,
  selected,
  separated = false,
}: ChatListItemProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartOffsetRef = useRef(0);
  const offsetXRef = useRef(0);
  const draggingRef = useRef(false);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    dragStartOffsetRef.current = offsetXRef.current;
    draggingRef.current = false;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current;
    if (!start) {
      return;
    }
    const deltaX = event.clientX - start.x;
    const deltaY = Math.abs(event.clientY - start.y);
    if (deltaY > 22 && Math.abs(deltaX) < 28) {
      return;
    }
    const nextX = Math.max(SNAP_OPEN_OFFSET_PX, Math.min(0, dragStartOffsetRef.current + deltaX));
    if (Math.abs(nextX - dragStartOffsetRef.current) > 4) {
      draggingRef.current = true;
    }
    offsetXRef.current = nextX;
    setOffsetX(nextX);
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerStartRef.current = null;
    setDragging(false);
    const snapTarget = offsetXRef.current <= -SNAP_THRESHOLD_PX ? SNAP_OPEN_OFFSET_PX : 0;
    offsetXRef.current = snapTarget;
    setOffsetX(snapTarget);
    window.setTimeout(() => {
      draggingRef.current = false;
    }, 0);
  }

  return (
    <div
      className="relative mb-1.5 overflow-hidden rounded-[1.65rem]"
      onPointerCancel={onPointerEnd}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      style={{ touchAction: "pan-y" }}
    >
      <button
        aria-label="Скрыть чат"
        className={cn(
          "absolute inset-y-0 right-0 flex w-[4.625rem] items-center justify-center rounded-[1.65rem] bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-inner transition-opacity duration-panel ease-spring",
          motionPress,
          offsetX < -18 ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => {
          offsetXRef.current = 0;
          setOffsetX(0);
          onHide?.();
        }}
        tabIndex={offsetX <= -SNAP_THRESHOLD_PX ? 0 : -1}
        type="button"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <button
        className={cn(
          "group relative flex min-h-16 w-full items-center gap-3 rounded-[1.65rem] px-3 py-2.5 text-left focus:outline-none focus-visible:shadow-focus",
          dragging ? "" : transitionPanel,
          motionSurface,
          motionPressSubtle,
          separated &&
            "after:absolute after:bottom-0 after:left-[4.25rem] after:right-6 after:h-px after:rounded-full after:bg-sky-200/80 after:content-['']",
          selected ? "bg-white shadow-sm" : "bg-white/58 hover:bg-white/82 hover:shadow-sm",
        )}
        onClick={() => {
          if (draggingRef.current) {
            return;
          }
          if (offsetXRef.current <= -SNAP_THRESHOLD_PX) {
            offsetXRef.current = 0;
            setOffsetX(0);
            return;
          }
          onSelect();
        }}
        style={{ transform: `translateX(${offsetX}px)` }}
        type="button"
      >
        <Avatar avatarId={room.avatarId} name={room.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink-primary">{room.name}</span>
          <span className="mt-0.5 block truncate text-sm text-ink-muted">{room.preview}</span>
        </span>
        {room.unreadCount > 0 ? (
          <span className="inline-flex min-w-7 justify-center rounded-full bg-accent-teal px-2 py-1 text-xs font-bold text-white shadow-sm shadow-sky-400/30 motion-safe:motion-fade-in">
            {room.unreadCount > 99 ? "99+" : room.unreadCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
