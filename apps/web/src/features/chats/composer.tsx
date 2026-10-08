"use client";

import { FileIcon, Paperclip, SendHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import {
  formatMatrixMediaSize,
  matrixMediaKindForFile,
  safeMatrixMediaName,
  validateMatrixMediaFile,
} from "@/features/matrix/media";
import type { MatrixMessage } from "@/features/matrix/types";
import { cn } from "@/lib/utils/cn";

import { VoiceRecorder } from "./voice-recorder";
import { VideoNoteRecorder } from "./video-note-recorder";

const attachmentAcceptTypes = [
  "image/*",
  "video/*",
  "audio/*",
  "application/pdf",
  "application/zip",
  "text/plain",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
].join(",");

type ComposerProps = {
  disabled: boolean;
  disabledReason?: string;
  editingMessage?: MatrixMessage | null;
  keyboardOpen?: boolean;
  onCancelEditing?: () => void;
  onCancelReply?: () => void;
  onEditMessage?: (message: MatrixMessage, text: string) => Promise<boolean>;
  onSend: (text: string) => Promise<boolean>;
  onSendAlbum: (files: File[], caption?: string) => Promise<boolean>;
  onSendFile: (file: File, caption?: string) => Promise<boolean>;
  onSendVideoNote: (file: File, durationMs: number) => Promise<boolean>;
  onSendVoice: (file: File, durationMs: number) => Promise<boolean>;
  replyTo?: MatrixMessage | null;
};

type SelectedAttachment = {
  file: File;
  previewUrl?: string;
};

export function Composer({
  disabled,
  disabledReason,
  editingMessage,
  keyboardOpen = false,
  onCancelEditing,
  onCancelReply,
  onEditMessage,
  onSend,
  onSendAlbum,
  onSendFile,
  onSendVideoNote,
  onSendVoice,
  replyTo,
}: ComposerProps) {
  const [value, setValue] = useState(editingMessage?.body ?? "");
  const [selectedAttachments, setSelectedAttachments] = useState<SelectedAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [quickRecordMode, setQuickRecordMode] = useState<"voice" | "video">("voice");
  const [voiceActive, setVoiceActive] = useState(false);
  const [videoNoteActive, setVideoNoteActive] = useState(false);
  const [sending, setSending] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedPreviewUrlsRef = useRef<string[]>([]);
  const selectedFiles = selectedAttachments.map((attachment) => attachment.file);
  const selectedFile = selectedFiles[0] ?? null;
  const isPhotoAlbum = selectedFiles.length > 1;
  const isEditing = Boolean(editingMessage);
  const canSend = !disabled && !sending && (value.trim().length > 0 || (!isEditing && selectedFiles.length > 0));
  const showSendAction = isEditing || value.trim().length > 0 || selectedFiles.length > 0 || sending;

  useEffect(() => {
    return () => {
      selectedPreviewUrlsRef.current.forEach((previewUrl) => window.URL.revokeObjectURL(previewUrl));
      selectedPreviewUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!replyTo || editingMessage) {
      return;
    }
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, [editingMessage, replyTo]);

  function clearSelectedFile() {
    selectedPreviewUrlsRef.current.forEach((previewUrl) => window.URL.revokeObjectURL(previewUrl));
    selectedPreviewUrlsRef.current = [];
    setSelectedAttachments([]);
    setAttachmentError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function chooseFiles(fileList: FileList | null) {
    setFailedMessage(null);
    setAttachmentError(null);
    const files = Array.from(fileList ?? []);

    if (files.length === 0) {
      clearSelectedFile();
      return;
    }

    for (const file of files) {
      const validation = validateMatrixMediaFile(file);
      if (!validation.ok) {
        clearSelectedFile();
        setAttachmentError(validation.message);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }
    }

    if (files.length > 1 && files.some((file) => matrixMediaKindForFile(file) !== "image")) {
      clearSelectedFile();
      setAttachmentError("Несколько файлов можно отправить одним блоком только если это фото.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    selectedPreviewUrlsRef.current.forEach((previewUrl) => window.URL.revokeObjectURL(previewUrl));
    selectedPreviewUrlsRef.current = [];
    const attachments = files.map((file) => {
      const kind = matrixMediaKindForFile(file);
      const previewUrl =
        kind === "image" || kind === "video" ? window.URL.createObjectURL(file) : undefined;
      if (previewUrl) {
        selectedPreviewUrlsRef.current.push(previewUrl);
      }
      return { file, previewUrl };
    });
    setSelectedAttachments(attachments);
  }

  async function submit() {
    const trimmed = value.trim();
    if ((!trimmed && !selectedFile) || disabled || sending) {
      return;
    }

    setSending(true);
    setFailedMessage(null);

    if (editingMessage && onEditMessage) {
      const ok = await onEditMessage(editingMessage, trimmed);
      setSending(false);

      if (ok) {
        setValue("");
        return;
      }

      setFailedMessage("Сообщение не удалось изменить. Попробуйте ещё раз.");
      return;
    }

    if (selectedFiles.length > 0) {
      const files = selectedFiles;
      const caption = trimmed || undefined;
      clearSelectedFile();
      setSending(false);
      setValue("");
      if (isPhotoAlbum) {
        void onSendAlbum(files, caption);
      } else {
        void onSendFile(files[0], caption);
      }
      return;
    }

    const ok = await onSend(trimmed);
    setSending(false);

    if (ok) {
      setValue("");
      return;
    }

    setFailedMessage("Сообщение не удалось отправить. Попробуйте ещё раз.");
  }

  return (
    <div
      className={cn(
        "shrink-0 border-t border-white/70 bg-white/95 px-2.5 pt-1.5 backdrop-blur-xl sm:px-3 sm:pt-2",
        !keyboardOpen && "pb-[env(safe-area-inset-bottom,0px)]",
      )}
    >
      {failedMessage ? (
        <ErrorState className="mb-2" message={failedMessage} />
      ) : null}
      {attachmentError ? (
        <ErrorState className="mb-2" message={attachmentError} />
      ) : null}
      {editingMessage ? (
        <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/90 px-2.5 py-1.5">
          <div className="min-w-0 flex-1 border-l-2 border-sky-400 pl-2">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-sky-600">
              Редактирование
            </p>
            <p className="truncate text-xs text-ink-muted">{editingMessage.body}</p>
          </div>
          <button
            aria-label="Отменить редактирование"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-white"
            onClick={() => {
              setValue("");
              onCancelEditing?.();
            }}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      {replyTo && !editingMessage ? (
        <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/90 px-2.5 py-1.5">
          <div className="min-w-0 flex-1 border-l-2 border-sky-400 pl-2">
            <p className="truncate text-xs font-semibold text-sky-700">{replyTo.authorName}</p>
            <p className="truncate text-xs text-ink-muted">{replyTo.body || "Вложение"}</p>
          </div>
          <button
            aria-label="Отменить ответ"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-secondary hover:bg-white"
            onClick={onCancelReply}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      <div
        className="flex min-w-0 flex-wrap items-end gap-1.5 rounded-[1.75rem] border border-white/80 bg-white p-1.5 shadow-lg shadow-sky-950/5 sm:gap-2 sm:p-2 motion-safe:transition-[box-shadow,transform] motion-safe:duration-micro motion-safe:ease-standard focus-within:shadow-xl focus-within:shadow-sky-950/8"
        onContextMenu={(event) => {
          if (voiceActive || videoNoteActive) {
            event.preventDefault();
          }
        }}
      >
        <input
          ref={fileInputRef}
          accept={attachmentAcceptTypes}
          aria-label="Выбрать файл"
          className="sr-only"
          disabled={disabled || sending}
          multiple
          onChange={(event) => chooseFiles(event.currentTarget.files)}
          type="file"
        />
        <Button
          aria-label="Прикрепить файл"
          className="min-w-11 flex-none rounded-full px-3 transition-all"
          disabled={disabled || sending || voiceActive || videoNoteActive || isEditing}
          onClick={() => fileInputRef.current?.click()}
          title="Прикрепить файл"
          type="button"
          variant="ghost"
        >
          <Paperclip className="h-4 w-4" />
          <span className="sr-only md:not-sr-only">Файл</span>
        </Button>
        {voiceActive || videoNoteActive ? null : (
          <textarea
            ref={textareaRef}
            aria-label="Сообщение"
            autoComplete="off"
            className="max-h-48 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-[0.95rem] leading-6 text-ink-primary outline-none placeholder:text-ink-muted sm:px-2 [user-select:text] motion-safe:transition-[height] motion-safe:duration-micro motion-safe:ease-standard"
            disabled={disabled || sending}
            enterKeyHint="send"
            inputMode="text"
            onChange={(event) => {
              setValue(event.target.value);
              setFailedMessage(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={
              disabled
                ? disabledReason ?? "Подключитесь к чатам, чтобы отправить сообщение"
                : "Сообщение"
            }
            rows={1}
            value={value}
          />
        )}
        {showSendAction ? (
          <Button
            aria-label={isEditing ? "Сохранить изменение" : selectedFile ? "Отправить файл" : "Отправить"}
            className="min-w-11 flex-none rounded-full px-3 transition-all sm:px-4"
            disabled={!canSend}
            onClick={() => void submit()}
            title={isEditing ? "Сохранить изменение" : selectedFile ? "Отправить файл" : "Отправить сообщение"}
            type="button"
          >
            <SendHorizontal className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">
              {sending
                ? isEditing
                  ? "Сохраняем"
                  : selectedFile
                    ? "Загрузка"
                    : "Отправка"
                : isEditing
                  ? "Сохранить"
                  : isPhotoAlbum
                    ? "Фото"
                    : selectedFile
                      ? "Файл"
                      : "Отправить"}
            </span>
          </Button>
        ) : (
          quickRecordMode === "video" ? (
            <VideoNoteRecorder
              disabled={disabled || sending}
              onPhaseChange={setVideoNoteActive}
              onSendVideoNote={onSendVideoNote}
              onSwitchToVoice={() => setQuickRecordMode("voice")}
            />
          ) : (
            <>
              <VoiceRecorder
                disabled={disabled || sending}
                expanded={voiceActive}
                onPhaseChange={setVoiceActive}
                onSendVoice={onSendVoice}
                onSwitchToVideo={() => setQuickRecordMode("video")}
              />
            </>
          )
        )}
      </div>
      {selectedFile ? (
        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/86 p-3 shadow-sm">
          <div className="grid h-16 w-16 flex-none grid-cols-2 gap-0.5 overflow-hidden rounded-2xl border border-surface-line bg-surface-canvas">
            {selectedAttachments.slice(0, 4).map((attachment, index) =>
              attachment.previewUrl && matrixMediaKindForFile(attachment.file) === "image" ? (
                <div className="relative min-h-0 min-w-0" key={`${attachment.file.name}-${index}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    src={attachment.previewUrl}
                  />
                  {index === 3 && selectedAttachments.length > 4 ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-xs font-bold text-white">
                      +{selectedAttachments.length - 4}
                    </span>
                  ) : null}
                </div>
              ) : attachment.previewUrl && matrixMediaKindForFile(attachment.file) === "video" ? (
                <video
                  aria-label="Предпросмотр выбранного видео"
                  className="h-full w-full object-cover"
                  key={`${attachment.file.name}-${index}`}
                  muted
                  src={attachment.previewUrl}
                />
            ) : (
                <div className="flex items-center justify-center" key={`${attachment.file.name}-${index}`}>
                  <FileIcon className="h-6 w-6 text-ink-muted" />
                </div>
              ),
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-primary">
              {isPhotoAlbum ? `${selectedFiles.length} фото` : safeMatrixMediaName(selectedFile.name)}
            </p>
            <p className="text-xs text-ink-muted">
              {isPhotoAlbum
                ? formatMatrixMediaSize(selectedFiles.reduce((total, file) => total + file.size, 0))
                : `${formatMatrixMediaSize(selectedFile.size)}${selectedFile.type ? ` - ${selectedFile.type}` : ""}`}
            </p>
          </div>
          <Button
            aria-label="Убрать выбранный файл"
            className="min-w-11 rounded-full px-3"
            disabled={sending}
            onClick={clearSelectedFile}
            title="Убрать выбранный файл"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
