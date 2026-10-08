import type {
  MatrixConnectionStatus,
  MatrixMessage,
  MatrixRoomSummary,
} from "@/features/matrix/types";
import type { DragEvent, ReactNode } from "react";
import { useState } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { validateMatrixMediaFile } from "@/features/matrix/media";
import { isPrivateMatrixRoom } from "@/features/matrix/room-kind";
import { transitionOverlay } from "@/lib/motion/classes";
import { useVisualViewportInset } from "@/lib/motion/use-visual-viewport-inset";
import { cn } from "@/lib/utils/cn";

import { ChatHeader } from "./chat-header";
import { Composer } from "./composer";
import { MessageTimeline } from "./message-timeline";

type ChatPanelProps = {
  activePlaybackId?: string | null;
  activeSearchMessageId?: string | null;
  callControls?: ReactNode;
  connectionMessage?: string | null;
  editingMessage?: MatrixMessage | null;
  isConnected: boolean;
  isOnline: boolean;
  messages: MatrixMessage[];
  onAddMembers?: () => void;
  onBack?: () => void;
  onCancelEditing?: () => void;
  onCancelReply?: () => void;
  onCopyMessage?: (message: MatrixMessage) => void;
  onDeleteAlbumPhotos?: (message: MatrixMessage) => void;
  onDeleteEverywhere?: (message: MatrixMessage) => void;
  onDeleteLocalMessage?: (message: MatrixMessage) => void;
  onDropToast?: (message: string, variant?: "success" | "error" | "info") => void;
  onEditMessage?: (message: MatrixMessage) => void;
  onPlaybackEnd?: (messageId: string) => void;
  onPlaybackStart?: (messageId: string | null) => void;
  onPinMessage?: (message: MatrixMessage, pinned: boolean) => void;
  onReactMessage?: (message: MatrixMessage, key: "heart" | "laugh" | "ok") => void;
  onReplyMessage?: (message: MatrixMessage) => void;
  onRetryMessage?: (message: MatrixMessage) => void;
  onSaveEditedMessage?: (message: MatrixMessage, text: string) => Promise<boolean>;
  onSendAlbum: (files: File[], caption?: string) => Promise<boolean>;
  onSendFile: (file: File, caption?: string) => Promise<boolean>;
  onSendMessage: (text: string) => Promise<boolean>;
  onSendVideoNote: (file: File, durationMs: number) => Promise<boolean>;
  onSendVoice: (file: File, durationMs: number) => Promise<boolean>;
  playbackRate?: number;
  pinnedMessage?: MatrixMessage | null;
  peerPresenceLabel?: string | null;
  replyTo?: MatrixMessage | null;
  searchQuery?: string;
  room: MatrixRoomSummary;
  searchResultLabel?: string | null;
  status: MatrixConnectionStatus;
  onSearchChange?: (query: string) => void;
  onSearchNext?: () => void;
  onSearchPrevious?: () => void;
  onJumpToMessage?: (messageId: string) => void;
};

export function ChatPanel({
  activePlaybackId,
  activeSearchMessageId,
  callControls,
  connectionMessage,
  editingMessage,
  isConnected,
  isOnline,
  messages,
  onAddMembers,
  onBack,
  onCancelEditing,
  onCancelReply,
  onCopyMessage,
  onDeleteAlbumPhotos,
  onDeleteEverywhere,
  onDeleteLocalMessage,
  onDropToast,
  onEditMessage,
  onPlaybackEnd,
  onPlaybackStart,
  onPinMessage,
  onReactMessage,
  onReplyMessage,
  onRetryMessage,
  onSaveEditedMessage,
  onSendAlbum,
  onSendFile,
  onSendMessage,
  onSendVideoNote,
  onSendVoice,
  playbackRate = 1,
  peerPresenceLabel,
  pinnedMessage,
  replyTo,
  searchQuery = "",
  room,
  searchResultLabel,
  status,
  onSearchChange,
  onSearchNext,
  onSearchPrevious,
  onJumpToMessage,
}: ChatPanelProps) {
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isDroppingFile, setIsDroppingFile] = useState(false);
  const composerDisabled = !isOnline || !isConnected || !room.canSendMessages;
  const keyboardInset = useVisualViewportInset();
  const isPrivateRoom = isPrivateMatrixRoom(room);
  const disabledReason =
    !isOnline
      ? "Похоже, вы офлайн. Подключитесь к интернету перед отправкой."
      : !isConnected
      ? "Подключение к чату ещё не готово. Дождитесь синхронизации."
      : !room.canSendMessages
      ? room.encryptionState === "unknown"
        ? "Проверяем шифрование перед отправкой"
        : "Для отправки в этом чате нужна настройка шифрования"
      : undefined;

  function dragHasFiles(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    setIsDraggingFile(true);
    setDropError(null);
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDraggingFile(false);
    }
  }

  async function onDrop(event: DragEvent<HTMLElement>) {
    if (!dragHasFiles(event)) {
      return;
    }
    event.preventDefault();
    setIsDraggingFile(false);
    setDropError(null);

    const file = event.dataTransfer.files.item(0);
    if (!file) {
      return;
    }
    if (event.dataTransfer.files.length > 1) {
      setDropError("Перетащите только один файл за раз.");
      onDropToast?.("Перетащите только один файл за раз.", "error");
      return;
    }
    if (composerDisabled) {
      setDropError(disabledReason ?? "Выберите активный чат перед отправкой файла.");
      return;
    }
    if (isDroppingFile) {
      setDropError("Дождитесь отправки текущего файла перед следующим.");
      return;
    }
    const validation = validateMatrixMediaFile(file);
    if (!validation.ok) {
      setDropError(validation.message);
      return;
    }
    setIsDroppingFile(true);
    try {
      await onSendFile(file);
    } finally {
      setIsDroppingFile(false);
    }
  }

  return (
    <section
      className={cn(
        "relative flex min-h-0 flex-1 flex-col bg-surface-raised/60 max-md:bg-white transition-[background-color,padding-bottom] duration-panel ease-spring motion-reduce:transition-none",
        isDraggingFile && "bg-accent-teal/5",
      )}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={(event) => void onDrop(event)}
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
    >
      <ChatHeader
        callControls={callControls}
        onJumpToPinned={pinnedMessage ? () => onJumpToMessage?.(pinnedMessage.id) : undefined}
        onAddMembers={onAddMembers}
        onBack={onBack}
        onSearchChange={onSearchChange}
        onSearchNext={onSearchNext}
        onSearchPrevious={onSearchPrevious}
        peerPresenceLabel={peerPresenceLabel}
        pinnedMessage={pinnedMessage}
        room={room}
        searchQuery={searchQuery}
        searchResultLabel={searchResultLabel}
        statusLabel={connectionMessage}
      />
      {!isOnline ? (
        <div className="border-b border-accent-amber/30 bg-accent-amber/10 px-4 py-2 text-sm font-medium text-accent-amber">
          Вы офлайн. Сообщения и файлы могут не отправиться, пока браузер не подключится снова.
        </div>
      ) : !isConnected ? (
        <div className="border-b border-white/70 bg-white/70 px-4 py-2 text-sm font-medium text-ink-secondary backdrop-blur">
          Подключение к чату ещё не готово. Отправка включится после синхронизации.
        </div>
      ) : null}
      {dropError ? <ErrorState className="mx-4 mt-3" message={dropError} /> : null}
      <div className="min-h-0 flex-1">
        <MessageTimeline
          activePlaybackId={activePlaybackId}
          activeSearchMessageId={activeSearchMessageId}
          canRetryMessages={!composerDisabled}
          connectionMessage={connectionMessage}
          messages={messages}
          onCopyMessage={onCopyMessage}
          onDeleteAlbumPhotos={onDeleteAlbumPhotos}
          onDeleteEverywhere={onDeleteEverywhere}
          onDeleteLocalMessage={onDeleteLocalMessage}
          onEditMessage={onEditMessage}
          onPlaybackEnd={onPlaybackEnd}
          onPlaybackStart={onPlaybackStart}
          onPinMessage={onPinMessage}
          onReactMessage={onReactMessage}
          onReplyMessage={onReplyMessage}
          onRetryMessage={onRetryMessage}
          playbackRate={playbackRate}
          roomId={room.id}
          scrollToBottomTrigger={replyTo?.id ?? null}
          showAuthors={!isPrivateRoom}
          status={status}
        />
      </div>
      <Composer
        disabled={composerDisabled}
        disabledReason={disabledReason}
        editingMessage={editingMessage}
        keyboardOpen={keyboardInset > 0}
        key={editingMessage?.id ?? "new-message"}
        onCancelEditing={onCancelEditing}
        onCancelReply={onCancelReply}
        onEditMessage={onSaveEditedMessage}
        onSend={onSendMessage}
        onSendAlbum={onSendAlbum}
        onSendFile={onSendFile}
        onSendVideoNote={onSendVideoNote}
        onSendVoice={onSendVoice}
        replyTo={replyTo}
      />
      {isDraggingFile ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-[2rem] border-2 border-dashed border-accent-teal bg-white/88 p-6 text-center text-sm font-semibold text-accent-teal shadow-2xl backdrop-blur motion-safe:motion-fade-in",
            transitionOverlay,
          )}
        >
          Перетащите один файл, чтобы отправить его в чат.
        </div>
      ) : null}
    </section>
  );
}
