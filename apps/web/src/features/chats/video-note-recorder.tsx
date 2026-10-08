"use client";

import { Camera, SendHorizontal, Trash2 } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { cn } from "@/lib/utils/cn";

type VideoNoteRecorderProps = {
  disabled: boolean;
  onPhaseChange?: (active: boolean) => void;
  onSendVideoNote: (file: File, durationMs: number) => Promise<boolean>;
  onSwitchToVoice: () => void;
};

type RecorderPhase = "idle" | "requesting" | "recording" | "locked" | "sending";
type StopAction = "cancel" | "send";

const maxDurationMs = 60_000;
const lockThresholdPx = 58;
const videoMimeCandidates = [
  "video/mp4;codecs=h264,aac",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function supportedVideoMimeType() {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    return null;
  }
  for (const mimeType of videoMimeCandidates) {
    if (!window.MediaRecorder.isTypeSupported || window.MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return null;
}

function extensionForMimeType(mimeType: string) {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

function safeVideoNoteError(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Доступ к камере или микрофону запрещён.";
  }
  if (name === "NotFoundError") {
    return "Камера или микрофон не найдены.";
  }
  return "Не удалось начать запись кружка. Попробуйте ещё раз.";
}

export function VideoNoteRecorder({
  disabled,
  onPhaseChange,
  onSendVideoNote,
  onSwitchToVoice,
}: VideoNoteRecorderProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const chunksRef = useRef<Blob[]>([]);
  const finishingRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const maxDurationTimerRef = useRef<number | null>(null);
  const stopFallbackTimerRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startTimeRef = useRef(0);
  const stopActionRef = useRef<StopAction>("cancel");
  const streamRef = useRef<MediaStream | null>(null);

  const active = phase === "requesting" || phase === "recording" || phase === "locked" || phase === "sending";
  const recording = phase === "recording" || phase === "locked";

  function clearTimers() {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (maxDurationTimerRef.current !== null) {
      window.clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (stopFallbackTimerRef.current !== null) {
      window.clearTimeout(stopFallbackTimerRef.current);
      stopFallbackTimerRef.current = null;
    }
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
  }

  useEffect(() => {
    onPhaseChange?.(active);
  }, [active, onPhaseChange]);

  useEffect(() => {
    return () => {
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      stopTracks();
    };
  }, []);

  async function startRecording() {
    if (disabled || phase !== "idle") {
      return;
    }
    setErrorMessage(null);
    const mimeType = supportedVideoMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Запись кружков не поддерживается в этом браузере.");
      return;
    }

    setPhase("requesting");
    finishingRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          aspectRatio: 1,
          facingMode: "user",
          height: { ideal: 400 },
          width: { ideal: 400 },
        },
      });
      streamRef.current = stream;
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        void previewRef.current.play();
      }

      chunksRef.current = [];
      stopActionRef.current = "cancel";
      startTimeRef.current = window.performance.now();
      const recorder = new window.MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 900_000,
      });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setErrorMessage("Кружок не удалось записать. Попробуйте ещё раз.");
        recorderRef.current = null;
        stopTracks();
        clearTimers();
        setPhase("idle");
      };
      recorder.onstop = () => {
        void finishRecording(mimeType);
      };
      recorder.start(500);
      setElapsedMs(0);
      setPhase("recording");
      intervalRef.current = window.setInterval(() => {
        setElapsedMs(Math.min(maxDurationMs, window.performance.now() - startTimeRef.current));
      }, 200);
      maxDurationTimerRef.current = window.setTimeout(() => stopRecording("send"), maxDurationMs);
    } catch (error) {
      stopTracks();
      clearTimers();
      setPhase("idle");
      setErrorMessage(safeVideoNoteError(error));
    }
  }

  async function finishRecording(mimeType: string) {
    if (finishingRef.current) {
      return;
    }
    finishingRef.current = true;
    clearTimers();
    stopTracks();
    recorderRef.current = null;
    const durationMs = Math.max(1, Math.min(maxDurationMs, window.performance.now() - startTimeRef.current));
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
      setErrorMessage("Кружок не удалось отправить. Попробуйте ещё раз.");
      setElapsedMs(0);
      setPhase("idle");
      finishingRef.current = false;
      return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    const file = new File([blob], `video-note.${extensionForMimeType(mimeType)}`, { type: mimeType });
    setElapsedMs(0);
    setPhase("idle");
    try {
      const ok = await onSendVideoNote(file, durationMs);
      if (!ok) {
        setErrorMessage("Кружок не удалось отправить. Попробуйте ещё раз.");
      }
    } catch {
      setErrorMessage("Кружок не удалось отправить. Попробуйте ещё раз.");
    } finally {
      finishingRef.current = false;
    }
  }

  function stopRecording(action: StopAction) {
    stopActionRef.current = action;
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      if (action === "send") {
        setPhase("sending");
        stopFallbackTimerRef.current = window.setTimeout(() => {
          if (!finishingRef.current && recorderRef.current === recorder) {
            recorder.onstop = null;
            recorderRef.current = null;
            clearTimers();
            stopTracks();
            setElapsedMs(0);
            setPhase("idle");
            setErrorMessage("Кружок не удалось завершить. Попробуйте ещё раз.");
          }
        }, 2500);
      } else {
        setPhase("idle");
      }
      recorder.stop();
      return;
    }
    clearTimers();
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
      onSwitchToVoice();
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

  const progress = Math.min(1, elapsedMs / maxDurationMs);

  return (
    <>
      {active ? (
        <>
          <div className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-full bg-sky-50 px-4 text-sm font-semibold text-ink-primary ring-1 ring-sky-100">
            <span>{phase === "sending" ? "Отправляем кружок" : `Кружок ${formatDuration(elapsedMs)}`}</span>
            {phase === "recording" ? <span className="text-xs text-ink-muted">↑ фиксировать</span> : null}
          </div>
          {typeof document !== "undefined"
            ? createPortal(
                <div
                  className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/35 px-5 backdrop-blur-md"
                  onContextMenu={(event) => event.preventDefault()}
                  style={{ WebkitUserSelect: "none", userSelect: "none" }}
                >
                  <div className="relative h-56 w-56 overflow-hidden rounded-full bg-slate-950 shadow-2xl shadow-sky-950/30">
                    <video
                      ref={previewRef}
                      aria-label="Предпросмотр кружка"
                      className="h-full w-full scale-x-[-1] object-cover"
                      muted
                      playsInline
                    />
                    <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" fill="none" r="48" stroke="rgba(255,255,255,0.28)" strokeWidth="3" />
                      <circle
                        cx="50"
                        cy="50"
                        fill="none"
                        r="48"
                        stroke="white"
                        strokeDasharray={`${progress * 302} 302`}
                        strokeLinecap="round"
                        strokeWidth="3"
                      />
                    </svg>
                  </div>
                  <div className="mt-5 rounded-full bg-white/92 px-4 py-2 text-sm font-bold text-ink-primary shadow-lg">
                    {phase === "locked" ? "Запись зафиксирована" : "Удерживайте для записи"} · {formatDuration(elapsedMs)} / 1:00
                  </div>
                  {recording ? (
                    <div className="mt-5 flex gap-3">
                      <Button
                        aria-label="Отменить кружок"
                        className="rounded-full bg-white px-5 text-accent-rose shadow-lg hover:bg-rose-50"
                        onClick={() => stopRecording("cancel")}
                        type="button"
                        variant="secondary"
                      >
                        <Trash2 className="h-4 w-4" />
                        Отмена
                      </Button>
                      <Button
                        aria-label="Отправить кружок"
                        className="rounded-full px-5 shadow-lg"
                        onClick={() => stopRecording("send")}
                        type="button"
                      >
                        <SendHorizontal className="h-4 w-4" />
                        Отправить
                      </Button>
                    </div>
                  ) : null}
                </div>,
                document.body,
              )
            : null}
        </>
      ) : (
          <button
            aria-label="Кружок: удерживайте для записи, нажмите для голосового"
            className={cn(
              "inline-flex min-h-11 min-w-11 touch-none select-none items-center justify-center rounded-full px-3 text-ink-secondary transition hover:bg-sky-50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
              disabled && "cursor-not-allowed opacity-50",
            )}
            disabled={disabled}
            onContextMenu={(event) => event.preventDefault()}
            onPointerCancel={onPointerCancel}
            onPointerDown={onPointerDown}
            onPointerLeave={onPointerCancel}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            title="Удерживайте для записи кружка"
            type="button"
          >
            <Camera className="h-4 w-4" />
          </button>
      )}
      {errorMessage ? <ErrorState className="basis-full" message={errorMessage} /> : null}
    </>
  );
}
