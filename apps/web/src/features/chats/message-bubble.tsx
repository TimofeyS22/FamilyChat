import { Check, CheckCheck, Copy, Edit3, Heart, Pin, Reply, RotateCcw, Smile, ThumbsUp, Trash2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { MatrixMessage } from "@/features/matrix/types";
import { motionPressSubtle, motionSurface, transitionMicro, transitionOverlay, transitionPanel } from "@/lib/motion/classes";
import { cn } from "@/lib/utils/cn";

import { MessageMedia } from "./message-media";

type MessageBubbleProps = {
  activePlaybackId?: string | null;
  animateEnter?: boolean;
  canRetry?: boolean;
  highlight?: boolean;
  message: MatrixMessage;
  onCopy?: (message: MatrixMessage) => void;
  onDeleteAlbumPhotos?: (message: MatrixMessage) => void;
  onDeleteEverywhere?: (message: MatrixMessage) => void;
  onDeleteLocal?: (message: MatrixMessage) => void;
  onEdit?: (message: MatrixMessage) => void;
  onPlaybackEnd?: (messageId: string) => void;
  onPlaybackStart?: (messageId: string | null) => void;
  onPin?: (message: MatrixMessage, pinned: boolean) => void;
  onReaction?: (message: MatrixMessage, key: "heart" | "laugh" | "ok") => void;
  onReply?: (message: MatrixMessage) => void;
  onRetry?: (message: MatrixMessage) => void;
  playbackRate?: number;
  showAuthor?: boolean;
};

function timeLabel(timestamp: number) {
  if (!timestamp) {
    return "";
  }
  return new Intl.DateTimeFormat("ru", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function statusLabel(message: MatrixMessage) {
  if (message.status === "uploading") {
    return typeof message.uploadProgress === "number"
      ? `загрузка ${message.uploadProgress}%`
      : message.media || message.mediaItems?.length ? "загружаем файл" : "загрузка";
  }
  if (message.status === "sending") {
    return message.media || message.mediaItems?.length ? "отправляем в чат" : "отправка";
  }
  if (message.status === "sent") {
    return message.readByPeer ? "прочитано" : "отправлено";
  }
  return "не доставлено";
}

type ActionLayout = {
  bubbleWidth: number;
  left: number;
  previewTop: number;
  sheetHeight: number;
  width: number;
};

const PREVIEW_ACTIONS_GAP_PX = 8;
const VIEWPORT_EDGE_PX = 12;
const PREVIEW_MAX_HEIGHT_PX = 180;
const ACTION_ROW_HEIGHT_PX = 48;
const ACTION_SHEET_CHROME_PX = 28;

function computeActionSheetHeight(showDeletePhotos: boolean, showRetry: boolean) {
  let rowCount = 6;
  if (showDeletePhotos) {
    rowCount += 1;
  }
  if (showRetry) {
    rowCount += 1;
  }
  return ACTION_SHEET_CHROME_PX + rowCount * ACTION_ROW_HEIGHT_PX;
}

function readViewportBounds() {
  const visualViewport = window.visualViewport;
  const top = visualViewport?.offsetTop ?? 0;
  const left = visualViewport?.offsetLeft ?? 0;
  const width = visualViewport?.width ?? window.innerWidth;
  const height = visualViewport?.height ?? window.innerHeight;
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button,a,input,textarea,select,video,audio"));
}

export function MessageBubble({
  activePlaybackId,
  animateEnter = false,
  canRetry = true,
  highlight = false,
  message,
  onCopy,
  onDeleteAlbumPhotos,
  onDeleteEverywhere,
  onDeleteLocal,
  onEdit,
  onPlaybackEnd,
  onPlaybackStart,
  onPin,
  onReaction,
  onReply,
  onRetry,
  playbackRate,
  showAuthor = true,
}: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionLayout, setActionLayout] = useState<ActionLayout | null>(null);
  const [pressing, setPressing] = useState(false);
  const [replyDragX, setReplyDragX] = useState(0);
  const [replyDragging, setReplyDragging] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const swipeTrackRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const replyDragXRef = useRef(0);
  const onReplyRef = useRef(onReply);
  const isCallMessage = message.kind === "call";
  const isVideoNoteMessage = message.media?.isVideoNote === true;
  const canCopy = !message.media && message.body.trim().length > 0;
  const canEdit = message.isOwn && message.status === "sent" && !message.media && Boolean(onEdit);
  const canDeleteEverywhere = message.isOwn && message.status === "sent" && !message.id.startsWith("local-");
  const canDeleteAlbumPhotos = canDeleteEverywhere && (message.mediaItems?.length ?? 0) > 1;
  const canRetryMessage = canRetry && message.isOwn && message.status === "failed" && Boolean(onRetry);
  const canInteractWithSent = message.status === "sent" && !message.id.startsWith("local-") && !message.id.startsWith("~");
  const canSwipeReply = canInteractWithSent && Boolean(onReply);

  function copyMessage() {
    setMenuOpen(false);
    onCopy?.(message);
  }

  const actionSheetHeight = computeActionSheetHeight(canDeleteAlbumPhotos, canRetryMessage);

  const measureActionLayout = useCallback((): ActionLayout => {
    const rect = bubbleRef.current?.getBoundingClientRect();
    const viewport = readViewportBounds();
    const width = Math.min(Math.max(320, rect?.width ?? 320), viewport.width - VIEWPORT_EDGE_PX * 2, 420);
    const bubbleWidth = Math.min(rect?.width ?? width, width);
    const left = rect
      ? message.isOwn
        ? Math.max(
            viewport.left + VIEWPORT_EDGE_PX,
            Math.min(viewport.right - width - VIEWPORT_EDGE_PX, rect.right - width),
          )
        : Math.max(
            viewport.left + VIEWPORT_EDGE_PX,
            Math.min(viewport.right - width - VIEWPORT_EDGE_PX, rect.left),
          )
      : Math.max(viewport.left + VIEWPORT_EDGE_PX, viewport.left + (viewport.width - width) / 2);
    const previewHeight = Math.min(rect?.height ?? 64, PREVIEW_MAX_HEIGHT_PX);
    const sheetHeight = actionSheetHeight;
    const stackHeight = previewHeight + PREVIEW_ACTIONS_GAP_PX + sheetHeight;
    const minTop = viewport.top + VIEWPORT_EDGE_PX;
    const maxBottom = viewport.bottom - VIEWPORT_EDGE_PX;
    const availableHeight = maxBottom - minTop;

    let previewTop = rect?.top ?? minTop;
    if (stackHeight > availableHeight) {
      previewTop = minTop;
    } else {
      const overflow = previewTop + stackHeight - maxBottom;
      if (overflow > 0) {
        previewTop -= overflow;
      }
      previewTop = Math.max(minTop, previewTop);
    }

    return {
      bubbleWidth,
      left,
      previewTop,
      sheetHeight: stackHeight > availableHeight ? availableHeight - previewHeight - PREVIEW_ACTIONS_GAP_PX : sheetHeight,
      width,
    };
  }, [actionSheetHeight, message.isOwn]);

  const refreshActionLayout = useCallback(() => {
    setActionLayout(measureActionLayout());
  }, [measureActionLayout]);

  function clearLongPressTimer() {
    setPressing(false);
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  const openMenuWithFeedback = useCallback(() => {
    longPressTimerRef.current = null;
    setPressing(false);
    setActionLayout(measureActionLayout());
    setMenuOpen(true);
    window.navigator.vibrate?.(12);
  }, [measureActionLayout]);

  useEffect(() => {
    onReplyRef.current = onReply;
  }, [onReply]);

  useEffect(() => {
    const el = swipeTrackRef.current;
    if (!el) {
      return;
    }

    let touchStart: { x: number; y: number } | null = null;
    let swiping = false;
    let longPressActive = false;

    function clearTouchLongPress() {
      longPressActive = false;
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      setPressing(false);
    }

    function onTouchStart(event: TouchEvent) {
      if (menuOpen || isInteractiveTarget(event.target)) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      touchStart = { x: touch.clientX, y: touch.clientY };
      swiping = false;
      clearTouchLongPress();
      longPressActive = true;
      setPressing(true);
      longPressTimerRef.current = window.setTimeout(() => {
        if (longPressActive && !swiping) {
          openMenuWithFeedback();
        }
      }, 430);
    }

    function onTouchMove(event: TouchEvent) {
      if (!touchStart) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;

      if (!swiping && canSwipeReply) {
        if (Math.abs(deltaY) > 18 && Math.abs(deltaX) < 24) {
          touchStart = null;
          clearTouchLongPress();
          return;
        }
        if (deltaX < -6 && Math.abs(deltaX) > Math.abs(deltaY) * 0.85) {
          swiping = true;
          clearTouchLongPress();
        }
      }

      if (swiping) {
        event.preventDefault();
        const nextX = Math.max(-72, Math.min(0, deltaX));
        replyDragXRef.current = nextX;
        setReplyDragX(nextX);
        setReplyDragging(true);
      }
    }

    function onTouchEnd() {
      if (swiping && replyDragXRef.current < -48) {
        onReplyRef.current?.(message);
        window.navigator.vibrate?.(8);
      }
      touchStart = null;
      swiping = false;
      longPressActive = false;
      clearTouchLongPress();
      setReplyDragging(false);
      setReplyDragX(0);
      replyDragXRef.current = 0;
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [canSwipeReply, menuOpen, message, openMenuWithFeedback]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const previousUserSelect = document.documentElement.style.userSelect;
    const previousWebkitUserSelect = document.documentElement.style.webkitUserSelect;
    document.documentElement.style.userSelect = "none";
    document.documentElement.style.webkitUserSelect = "none";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node | null)) {
        setMenuOpen(false);
      }
    }
    function onResize() {
      refreshActionLayout();
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
      document.documentElement.style.userSelect = previousUserSelect;
      document.documentElement.style.webkitUserSelect = previousWebkitUserSelect;
    };
  }, [menuOpen, refreshActionLayout]);

  useEffect(() => clearLongPressTimer, []);

  function onBubblePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || isInteractiveTarget(event.target)) {
      return;
    }
    clearLongPressTimer();
    setPressing(true);
    longPressTimerRef.current = window.setTimeout(openMenuWithFeedback, 430);
  }

  function onBubblePointerEnd() {
    clearLongPressTimer();
  }

  function renderMessagePreview() {
    return (
      <>
        {!message.isOwn && showAuthor ? (
          <p className="mb-1 truncate text-xs font-semibold text-ink-secondary">{message.authorName}</p>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-sm leading-6">
          {message.media ? message.body || "Вложение" : message.body}
        </p>
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-2 text-[0.7rem]",
            message.isOwn ? "text-white/80" : "text-ink-muted",
          )}
        >
          <span>{timeLabel(message.timestamp)}</span>
          {message.edited ? <span>изменено</span> : null}
        </div>
      </>
    );
  }

  function renderActionMenuItems() {
    return (
      <>
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-sky-200/80" />
        <button
          className={cn(
            "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-bold text-ink-primary hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal disabled:cursor-not-allowed disabled:text-ink-muted",
            motionSurface,
            motionPressSubtle,
          )}
          disabled={!canEdit}
          onClick={() => {
            setMenuOpen(false);
            onEdit?.(message);
          }}
          role="menuitem"
          type="button"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-700">
            <Edit3 className="h-4 w-4" />
          </span>
          Редактировать
        </button>
        <button
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-bold text-ink-primary transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal disabled:cursor-not-allowed disabled:text-ink-muted"
          disabled={!canCopy}
          onClick={copyMessage}
          role="menuitem"
          type="button"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <Copy className="h-4 w-4" />
          </span>
          Копировать текст
        </button>
        <div className="my-1 flex gap-1 rounded-2xl bg-sky-50 p-1">
          {[
            ["heart", Heart, "❤️"],
            ["laugh", Smile, "😂"],
            ["ok", ThumbsUp, "👌"],
          ].map(([key, Icon, label]) => (
            <button
              className="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl text-sm font-bold text-ink-primary transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canInteractWithSent}
              key={key as string}
              onClick={() => {
                setMenuOpen(false);
                onReaction?.(message, key as "heart" | "laugh" | "ok");
              }}
              role="menuitem"
              type="button"
            >
              <Icon className="h-3.5 w-3.5" />
              {label as string}
            </button>
          ))}
        </div>
        <button
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-bold text-ink-primary transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal disabled:cursor-not-allowed disabled:text-ink-muted"
          disabled={!canInteractWithSent || !onPin}
          onClick={() => {
            setMenuOpen(false);
            onPin?.(message, !message.pinned);
          }}
          role="menuitem"
          type="button"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Pin className="h-4 w-4" />
          </span>
          {message.pinned ? "Открепить" : "Закрепить"}
        </button>
        <button
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-bold text-accent-rose transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-rose"
          onClick={() => {
            setMenuOpen(false);
            onDeleteLocal?.(message);
          }}
          role="menuitem"
          type="button"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-accent-rose">
            <Trash2 className="h-4 w-4" />
          </span>
          Удалить у меня
        </button>
        <button
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-bold text-accent-rose transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-rose disabled:cursor-not-allowed disabled:text-ink-muted"
          disabled={!canDeleteEverywhere}
          onClick={() => {
            setMenuOpen(false);
            onDeleteEverywhere?.(message);
          }}
          role="menuitem"
          type="button"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-accent-rose">
            <Trash2 className="h-4 w-4" />
          </span>
          Удалить у всех
        </button>
        {canDeleteAlbumPhotos ? (
          <button
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-bold text-ink-primary transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal"
            onClick={() => {
              setMenuOpen(false);
              onDeleteAlbumPhotos?.(message);
            }}
            role="menuitem"
            type="button"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-700">
              <Edit3 className="h-4 w-4" />
            </span>
            Удалить фото
          </button>
        ) : null}
        {canRetryMessage ? (
          <button
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-bold text-ink-primary transition hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal"
            onClick={() => {
              setMenuOpen(false);
              onRetry?.(message);
            }}
            role="menuitem"
            type="button"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <RotateCcw className="h-4 w-4" />
            </span>
            Повторить отправку
          </button>
        ) : null}
      </>
    );
  }

  if (isCallMessage) {
    return (
      <div className="flex w-full justify-center">
        <div className="max-w-[min(32rem,92%)] rounded-full border border-white/70 bg-white/78 px-4 py-2 text-center text-sm font-medium text-ink-secondary shadow-sm backdrop-blur">
          <span>{message.body}</span>
          <span className="ml-2 text-xs text-ink-muted">{timeLabel(message.timestamp)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full rounded-3xl transition-[background-color] duration-overlay ease-out-soft",
        message.isOwn ? "justify-end" : "justify-start",
        highlight && "bg-amber-200/35",
      )}
      data-message-id={message.id}
    >
      <div
        ref={swipeTrackRef}
        className="relative w-fit max-w-[min(40rem,88%)]"
        onPointerCancel={onBubblePointerEnd}
        onPointerDown={onBubblePointerDown}
        onPointerLeave={onBubblePointerEnd}
        onPointerUp={onBubblePointerEnd}
      >
        <div
          ref={bubbleRef}
          onContextMenu={(event) => {
            event.preventDefault();
            setActionLayout(measureActionLayout());
            setMenuOpen(true);
          }}
          className={cn(
            "group relative w-full select-none rounded-[1.35rem] px-3.5 py-2.5 shadow-sm hover:shadow-md",
            !replyDragging && transitionPanel,
            transitionMicro,
            animateEnter && "motion-safe:motion-message-in",
            isVideoNoteMessage && "bg-transparent px-0 py-0 shadow-none hover:shadow-none",
            pressing && !replyDragging && "scale-[0.97] brightness-95 shadow-inner ring-2 ring-sky-200/70 motion-safe:transition-transform motion-safe:duration-micro motion-safe:ease-standard",
            menuOpen && "opacity-0",
            isVideoNoteMessage
              ? "text-ink-primary"
              : message.isOwn
              ? "rounded-br-md bg-gradient-to-br from-accent-teal to-sky-600 text-white shadow-sky-500/20"
              : "rounded-bl-md border border-white/70 bg-white text-ink-primary",
            message.encryptedPending &&
              "border-accent-amber/50 bg-accent-amber/10 text-accent-amber",
            message.status === "failed" && "border-accent-rose/60 bg-accent-rose/10 text-ink-primary",
          )}
          style={replyDragX ? { transform: `translateX(${replyDragX}px)` } : undefined}
        >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {!message.isOwn && showAuthor ? (
              <p className="mb-1 truncate text-xs font-semibold text-ink-secondary">
                {message.authorName}
              </p>
            ) : null}
            {message.replyTo ? (
              <div
                className={cn(
                  "mb-2 rounded-xl border-l-2 px-3 py-2 text-xs",
                  message.isOwn && !isVideoNoteMessage
                    ? "border-white/70 bg-white/12 text-white/86"
                    : "border-sky-400 bg-sky-50 text-ink-secondary",
                )}
              >
                <p className="font-semibold">{message.replyTo.authorName}</p>
                <p className="line-clamp-2">{message.replyTo.body}</p>
              </div>
            ) : null}
        {message.media ? (
          <MessageMedia
            activePlaybackId={activePlaybackId}
            caption={message.body}
            isOwn={message.isOwn}
            media={message.media}
            mediaItems={message.mediaItems}
            messageId={message.id}
            onPlaybackEnd={onPlaybackEnd}
            onPlaybackStart={onPlaybackStart}
            playbackRate={playbackRate}
          />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {message.body}
          </p>
        )}
          </div>
          <div className="relative flex-none" />
        </div>
        {message.status === "uploading" && typeof message.uploadProgress === "number" ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/15">
            <div
              className="h-full rounded-full bg-white/75 transition-[width]"
              style={{ width: `${Math.max(0, Math.min(100, message.uploadProgress))}%` }}
            />
          </div>
        ) : null}
        {message.reactions?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.reactions.map((reaction) => (
              <button
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-bold shadow-sm",
                  reaction.reactedByMe ? "bg-white text-sky-700" : "bg-white/65 text-ink-secondary",
                )}
                key={reaction.key}
                onClick={() => onReaction?.(message, reaction.key)}
                type="button"
              >
                {reaction.key === "heart" ? "❤️" : reaction.key === "laugh" ? "😂" : "👌"} {reaction.count}
              </button>
            ))}
          </div>
        ) : null}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-2 text-[0.7rem]",
            message.isOwn && !isVideoNoteMessage ? "text-white/80" : "text-ink-muted",
          )}
        >
          <span>{timeLabel(message.timestamp)}</span>
          {message.edited ? <span>изменено</span> : null}
          {message.isOwn ? (
            <span className="inline-flex items-center gap-1">
              {message.status === "sent" && message.readByPeer ? (
                <CheckCheck aria-label="Прочитано" className="h-3.5 w-3.5" />
              ) : null}
              {message.status === "sent" && !message.readByPeer ? (
                <Check aria-label="Отправлено" className="h-3.5 w-3.5" />
              ) : null}
              {statusLabel(message)}
            </span>
          ) : null}
        </div>
        {message.status === "failed" && onRetry ? (
          <button
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-rose underline-offset-4 hover:underline disabled:cursor-not-allowed"
            disabled={!canRetryMessage}
            onClick={() => onRetry(message)}
            type="button"
          >
            <RotateCcw className="h-3 w-3" />
            Повторить
          </button>
        ) : null}
        </div>
        {canSwipeReply && replyDragX < -8 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 flex w-10 items-center justify-center text-sky-500"
            style={{ left: "100%", marginLeft: 4 }}
          >
            <Reply className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      {menuOpen && actionLayout && typeof document !== "undefined"
        ? createPortal(
            <div
              className={cn("fixed z-40 bg-slate-950/34 backdrop-blur-md motion-safe:motion-fade-in", transitionOverlay)}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setMenuOpen(false);
                }
              }}
              style={{
                bottom: 0,
                left: 0,
                right: 0,
                top: "calc(-1 * env(safe-area-inset-top, 0px))",
              }}
            >
              <div
                className="fixed"
                ref={menuRef}
                style={{
                  left: actionLayout.left,
                  top: actionLayout.previewTop,
                  width: actionLayout.width,
                }}
              >
                <div
                  className={cn(
                    "max-h-44 overflow-hidden rounded-[1.35rem] px-3.5 py-2.5 shadow-2xl",
                    message.isOwn
                      ? "ml-auto rounded-br-md bg-gradient-to-br from-accent-teal to-sky-600 text-white"
                      : "rounded-bl-md border border-white bg-white text-ink-primary",
                  )}
                  style={{ width: actionLayout.bubbleWidth }}
                >
                  {renderMessagePreview()}
                </div>
                <div
                  className={cn(
                    "mt-2 overflow-y-auto overscroll-contain rounded-[1.75rem] border border-sky-100 bg-white p-2 text-sm text-ink-primary shadow-2xl shadow-sky-950/24 motion-safe:motion-slide-up-in",
                    transitionPanel,
                  )}
                  role="menu"
                  style={{ height: actionLayout.sheetHeight }}
                >
                  {renderActionMenuItems()}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
