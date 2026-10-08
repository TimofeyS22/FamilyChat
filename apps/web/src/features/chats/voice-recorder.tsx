"use client";

import { Mic, SendHorizontal, Square, X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

type VoiceRecorderProps = {
  expanded?: boolean;
  disabled: boolean;
  onPhaseChange?: (active: boolean) => void;
  onSendVoice: (file: File, durationMs: number) => Promise<boolean>;
  onSwitchToVideo?: () => void;
};

type RecorderPhase = "idle" | "requesting" | "recording" | "locked" | "sending";
type StopAction = "cancel" | "send";
const lockThresholdPx = 58;

const voiceMimeCandidates = [
  "audio/mp4",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function supportedVoiceMimeType() {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return null;
  }

  for (const mimeType of voiceMimeCandidates) {
    if (!window.MediaRecorder.isTypeSupported || window.MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return null;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("mp4")) {
    return "m4a";
  }
  if (mimeType.includes("aac")) {
    return "aac";
  }
  return mimeType.includes("ogg") ? "ogg" : "webm";
}

function safeMicrophoneError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Доступ к микрофону запрещён.";
  }
  if (name === "NotFoundError") {
    return "Микрофон не найден.";
  }
  return "Не удалось начать запись голосового сообщения. Попробуйте ещё раз.";
}

export function VoiceRecorder({
  disabled,
  expanded = false,
  onPhaseChange,
  onSendVoice,
  onSwitchToVideo,
}: VoiceRecorderProps) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finishingRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startTimeRef = useRef(0);
  const stopActionRef = useRef<StopAction>("cancel");
  const streamRef = useRef<MediaStream | null>(null);

  function clearTimer() {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    onPhaseChange?.(phase !== "idle");
  }, [onPhaseChange, phase]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function startRecording() {
    if (disabled || phase !== "idle") {
      return;
    }

    setErrorMessage(null);
    const mimeType = supportedVoiceMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Запись голоса не поддерживается в этом браузере.");
      return;
    }

    setPhase("requesting");
    finishingRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      stopActionRef.current = "cancel";
      startTimeRef.current = window.performance.now();

      const recorder = new window.MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setErrorMessage("Не удалось начать запись голосового сообщения. Попробуйте ещё раз.");
        stopTracks();
        clearTimer();
        setPhase("idle");
      };

      recorder.onstop = () => {
        void finishRecording(mimeType);
      };

      recorder.start();
      setElapsedMs(0);
      setPhase("recording");
      intervalRef.current = window.setInterval(() => {
        setElapsedMs(window.performance.now() - startTimeRef.current);
      }, 250);
    } catch (error) {
      stopTracks();
      clearTimer();
      setPhase("idle");
      setErrorMessage(safeMicrophoneError(error));
    }
  }

  async function finishRecording(mimeType: string) {
    if (finishingRef.current) {
      return;
    }
    finishingRef.current = true;
    clearTimer();
    stopTracks();
    const durationMs = Math.max(1, window.performance.now() - startTimeRef.current);

    if (stopActionRef.current === "cancel") {
      chunksRef.current = [];
      setElapsedMs(0);
      setPhase("idle");
      finishingRef.current = false;
      return;
    }

    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (chunks.length === 0) {
      setErrorMessage("Голосовое сообщение не удалось отправить. Попробуйте ещё раз.");
      setElapsedMs(0);
      setPhase("idle");
      finishingRef.current = false;
      return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    const file = new File([blob], `voice-message.${extensionForMimeType(mimeType)}`, {
      type: mimeType,
    });

    setPhase("sending");
    try {
      const ok = await onSendVoice(file, durationMs);
      if (!ok) {
        setErrorMessage("Голосовое сообщение не удалось отправить. Попробуйте ещё раз.");
      }
    } catch {
      setErrorMessage("Голосовое сообщение не удалось отправить. Попробуйте ещё раз.");
    } finally {
      setPhase("idle");
      setElapsedMs(0);
      finishingRef.current = false;
    }
  }

  function stopRecording(action: StopAction) {
    const recorder = recorderRef.current;
    stopActionRef.current = action;

    if (recorder?.state === "recording") {
      setPhase(action === "send" ? "sending" : "idle");
      recorder.stop();
      return;
    }

    clearTimer();
    stopTracks();
    setPhase("idle");
    finishingRef.current = false;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled || phase !== "idle") {
      return;
    }
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      void startRecording();
    }, 180);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStartRef.current;
    if (!start || phase !== "recording") {
      return;
    }
    if (start.y - event.clientY > lockThresholdPx) {
      setPhase("locked");
      pointerStartRef.current = null;
      window.navigator.vibrate?.(16);
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    pointerIdRef.current = null;
    pointerStartRef.current = null;
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      onSwitchToVideo?.();
      return;
    }
    if (phase === "recording") {
      stopRecording("send");
    }
  }

  function onPointerCancel() {
    pointerIdRef.current = null;
    pointerStartRef.current = null;
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (phase === "recording") {
      stopRecording("cancel");
    }
  }

  const busy = phase === "requesting" || phase === "sending";
  const recording = phase === "recording" || phase === "locked";

  return (
    <>
      {recording ? (
        <>
          <span className="flex min-h-11 flex-1 items-center justify-between gap-4 rounded-full bg-accent-rose/10 px-4 text-sm font-semibold text-accent-rose shadow-inner shadow-rose-200/20 ring-1 ring-accent-rose/20 transition-all">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent-rose shadow-sm shadow-accent-rose/50" />
              {phase === "locked" ? "Запись закреплена" : "Запись"}
            </span>
            <span className="tabular-nums">{formatDuration(elapsedMs)}</span>
          </span>
          <Button
            aria-label="Отменить запись голоса"
            className="min-w-11 rounded-full px-3"
            onClick={() => stopRecording("cancel")}
            title="Отменить запись голоса"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Отправить голосовое сообщение"
            className="min-w-11 rounded-full px-3"
            onClick={() => stopRecording("send")}
            title="Отправить голосовое сообщение"
            type="button"
          >
            <Square className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          {expanded && (phase === "requesting" || phase === "sending") ? (
            <span className="flex min-h-11 flex-1 items-center gap-2 rounded-full bg-sky-50 px-4 text-sm font-semibold text-ink-secondary shadow-inner ring-1 ring-sky-100">
              {phase === "sending" ? "Отправляем голосовое" : "Готовим микрофон"}
            </span>
          ) : null}
          <button
            aria-label="Записать голос: удерживайте для записи, нажмите для кружка"
            className="inline-flex min-h-11 min-w-11 touch-none select-none items-center justify-center rounded-full px-3 text-ink-secondary transition hover:bg-sky-50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled || busy}
            onContextMenu={(event) => event.preventDefault()}
            onPointerCancel={onPointerCancel}
            onPointerDown={onPointerDown}
            onPointerLeave={onPointerCancel}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            title="Записать голосовое сообщение"
            type="button"
          >
            {busy ? <SendHorizontal className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        </>
      )}
      {errorMessage ? <ErrorState className="basis-full" message={errorMessage} /> : null}
    </>
  );
}
