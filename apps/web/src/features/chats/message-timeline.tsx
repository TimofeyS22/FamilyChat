import { MessageCircle } from "lucide-react";
import { useEffect, useRef } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import type { MatrixConnectionStatus, MatrixMessage } from "@/features/matrix/types";

import { MessageBubble } from "./message-bubble";
import { useTimelineScroll } from "./use-timeline-scroll";

type MessageTimelineProps = {
  activePlaybackId?: string | null;
  activeSearchMessageId?: string | null;
  canRetryMessages?: boolean;
  messages: MatrixMessage[];
  roomId: string;
  showAuthors?: boolean;
  status: MatrixConnectionStatus;
  connectionMessage?: string | null;
  onCopyMessage?: (message: MatrixMessage) => void;
  onDeleteAlbumPhotos?: (message: MatrixMessage) => void;
  onDeleteEverywhere?: (message: MatrixMessage) => void;
  onDeleteLocalMessage?: (message: MatrixMessage) => void;
  onEditMessage?: (message: MatrixMessage) => void;
  onPlaybackEnd?: (messageId: string) => void;
  onPlaybackStart?: (messageId: string | null) => void;
  onPinMessage?: (message: MatrixMessage, pinned: boolean) => void;
  onReactMessage?: (message: MatrixMessage, key: "heart" | "laugh" | "ok") => void;
  onReplyMessage?: (message: MatrixMessage) => void;
  onRetryMessage?: (message: MatrixMessage) => void;
  playbackRate?: number;
  scrollToBottomTrigger?: string | null;
};

function MessageTimelineSkeleton() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden px-4 py-5" aria-label="Загрузка сообщений">
      {[0, 1, 2, 3].map((item) => (
        <div
          className={item % 2 === 0 ? "flex justify-start" : "flex justify-end"}
          key={item}
        >
          <div className="w-[min(28rem,82%)] rounded-2xl border border-surface-line bg-surface-raised p-3">
            <div className="h-3 w-24 animate-pulse rounded-full bg-surface-line" />
            <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-surface-line" />
            <div className="mt-2 h-3 w-2/3 animate-pulse rounded-full bg-surface-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

function dayKey(timestamp: number) {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp));
}

export function MessageTimeline({
  activePlaybackId,
  canRetryMessages = true,
  connectionMessage,
  messages,
  onCopyMessage,
  onDeleteAlbumPhotos,
  onDeleteEverywhere,
  onDeleteLocalMessage,
  onEditMessage,
  onPlaybackEnd,
  onPlaybackStart,
  onPinMessage,
  onReactMessage,
  onReplyMessage,
  onRetryMessage,
  playbackRate = 1,
  roomId,
  scrollToBottomTrigger,
  showAuthors = true,
  status,
  activeSearchMessageId,
}: MessageTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const latestMessageId = messages.at(-1)?.id;

  useTimelineScroll(containerRef, {
    latestMessageId,
    messageCount: messages.length,
    roomId,
    scrollToBottomTrigger,
    status,
  });

  useEffect(() => {
    if (!activeSearchMessageId) {
      return;
    }
    const element = containerRef.current?.querySelector(`[data-message-id="${CSS.escape(activeSearchMessageId)}"]`);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeSearchMessageId]);

  if (status === "restoring" || status === "syncing") {
    return (
      <div className="h-full overflow-hidden overscroll-none">
        <MessageTimelineSkeleton />
      </div>
    );
  }

  if (status === "error" || status === "disconnected") {
    return (
      <div className="flex h-full items-start justify-center overflow-hidden overscroll-none p-4">
        <ErrorState message={connectionMessage ?? "Чаты временно недоступны."} />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-hidden overscroll-none">
        <div className="mt-auto">
          <EmptyState
            className="min-h-56"
            description="Напишите сообщение, запишите голос или отправьте файл, когда будете готовы."
            icon={<MessageCircle className="h-5 w-5" />}
            title="Сообщений пока нет"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col gap-3 overflow-y-auto overscroll-y-contain bg-[radial-gradient(circle_at_18%_8%,rgba(41,151,242,0.10),transparent_18rem),radial-gradient(circle_at_86%_18%,rgba(255,255,255,0.72),transparent_16rem)] px-4 py-5"
      style={{ touchAction: "pan-y" }}
    >
      <div className="mt-auto" aria-hidden="true" />
      {status === "reconnecting" && connectionMessage ? (
        <div className="self-center rounded-full border border-surface-line bg-surface-raised px-3 py-1 text-xs text-ink-secondary">
          {connectionMessage}
        </div>
      ) : null}
      {messages.map((message, index) => {
        const currentDay = dayKey(message.timestamp);
        const previousDay = index > 0 ? dayKey(messages[index - 1].timestamp) : null;
        return (
          <div className="contents" key={message.id}>
            {currentDay !== previousDay ? (
              <div className="sticky top-2 z-10 self-center rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-ink-secondary shadow-sm backdrop-blur">
                {currentDay}
              </div>
            ) : null}
            <MessageBubble
              activePlaybackId={activePlaybackId}
              animateEnter={index >= messages.length - 3}
              canRetry={canRetryMessages}
              highlight={message.id === activeSearchMessageId}
              message={message}
              onCopy={onCopyMessage}
              onDeleteAlbumPhotos={onDeleteAlbumPhotos}
              onDeleteEverywhere={onDeleteEverywhere}
              onDeleteLocal={onDeleteLocalMessage}
              onEdit={onEditMessage}
              onPlaybackEnd={onPlaybackEnd}
              onPlaybackStart={onPlaybackStart}
              onPin={onPinMessage}
              onReaction={onReactMessage}
              onReply={onReplyMessage}
              onRetry={onRetryMessage}
              playbackRate={playbackRate}
              showAuthor={showAuthors}
            />
          </div>
        );
      })}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
