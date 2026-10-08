"use client";

import { Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video, VideoOff } from "lucide-react";
import type { ButtonHTMLAttributes, RefObject, TouchEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { transitionPanel } from "@/lib/motion/classes";
import { cn } from "@/lib/utils/cn";

import type { AttachTrack, CallPhase } from "./types";

const CONTROLS_HIDE_MS = 4000;

type CallOverlayProps = {
  cameraOff: boolean;
  errorMessage: string | null;
  localVideoTrack: AttachTrack | null;
  microphoneMuted: boolean;
  mode: "audio" | "video" | null;
  onAccept: () => void;
  onEnd: () => void;
  onReject: () => void;
  onSwitchCamera: () => void;
  onToggleCamera: () => void;
  onToggleMicrophone: () => void;
  peerName: string | null;
  phase: CallPhase;
  remoteAudioTrack: AttachTrack | null;
  remoteVideoTrack: AttachTrack | null;
};

type CallControlButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: "default" | "danger";
};

function useAttachedTrack(
  track: AttachTrack | null,
  ref: RefObject<HTMLMediaElement | null>,
) {
  useEffect(() => {
    const element = ref.current;
    if (!track || !element) {
      return;
    }
    track.attach(element);
    return () => {
      track.detach?.();
    };
  }, [ref, track]);
}

function CallControlButton({
  className,
  label,
  variant = "default",
  type = "button",
  ...props
}: CallControlButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        "inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-lg transition enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "danger"
          ? "border border-red-300/60 bg-red-500 text-white shadow-red-950/30 hover:bg-red-400"
          : "border border-white/70 bg-white/95 text-slate-950 shadow-black/20 hover:bg-white",
        className,
      )}
      title={label}
      type={type}
      {...props}
    />
  );
}

type VideoSlot = "local" | "remote";

function phaseLabel(phase: CallPhase, mode: "audio" | "video" | null) {
  if (phase === "incoming") {
    return mode === "video" ? "Входящий видеозвонок" : "Входящий аудиозвонок";
  }
  if (phase === "outgoing") {
    return "Звоним";
  }
  if (phase === "connecting") {
    return "Подключаемся";
  }
  if (phase === "connected") {
    return "Звонок подключён";
  }
  return "Звонок недоступен";
}

export function CallOverlay({
  cameraOff,
  errorMessage,
  localVideoTrack,
  microphoneMuted,
  mode,
  onAccept,
  onEnd,
  onReject,
  onSwitchCamera,
  onToggleCamera,
  onToggleMicrophone,
  peerName,
  phase,
  remoteAudioTrack,
  remoteVideoTrack,
}: CallOverlayProps) {
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const incomingActionRef = useRef(false);
  const endActionRef = useRef(false);
  const hideControlsTimerRef = useRef<number | null>(null);
  const [primarySlot, setPrimarySlot] = useState<VideoSlot>("remote");
  const [pipPosition, setPipPosition] = useState({ x: 14, y: 92 });
  const [pipScale, setPipScale] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const pipTouchRef = useRef<{
    distance?: number;
    scale: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const visible = phase !== "idle";
  const primaryTrack = primarySlot === "remote" ? remoteVideoTrack : localVideoTrack;
  const pipSlot: VideoSlot = primarySlot === "remote" ? "local" : "remote";
  const pipTrack = pipSlot === "remote" ? remoteVideoTrack : localVideoTrack;
  const pipCameraOff = pipSlot === "local" && cameraOff;
  const primaryCameraOff = primarySlot === "local" && cameraOff;
  const endLabel = phase === "outgoing" || phase === "connecting" ? "Отменить" : "Завершить звонок";
  const micLabel = microphoneMuted ? "Включить микрофон" : "Выключить микрофон";
  const cameraLabel = cameraOff ? "Включить камеру" : "Выключить камеру";
  useAttachedTrack(primaryTrack, mainVideoRef);
  useAttachedTrack(pipTrack, pipVideoRef);
  useAttachedTrack(remoteAudioTrack, remoteAudioRef);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideControlsTimerRef.current !== null) {
      window.clearTimeout(hideControlsTimerRef.current);
    }
    hideControlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      hideControlsTimerRef.current = null;
    }, CONTROLS_HIDE_MS);
  }, []);

  useEffect(() => {
    if (phase === "connected") {
      window.queueMicrotask(() => setPrimarySlot("remote"));
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "idle" || phase === "incoming") {
      return;
    }
    revealControls();
    return () => {
      if (hideControlsTimerRef.current !== null) {
        window.clearTimeout(hideControlsTimerRef.current);
        hideControlsTimerRef.current = null;
      }
    };
  }, [phase, revealControls]);

  function touchDistance(touches: TouchEvent<HTMLDivElement>["touches"]) {
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) {
      return 0;
    }
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  }

  function onPipTouchStart(event: TouchEvent<HTMLDivElement>) {
    event.stopPropagation();
    const first = event.touches[0];
    if (!first) {
      return;
    }
    pipTouchRef.current = {
      distance: event.touches.length > 1 ? touchDistance(event.touches) : undefined,
      scale: pipScale,
      startX: first.clientX,
      startY: first.clientY,
      x: pipPosition.x,
      y: pipPosition.y,
    };
  }

  function onPipTouchMove(event: TouchEvent<HTMLDivElement>) {
    const start = pipTouchRef.current;
    const first = event.touches[0];
    if (!start || !first) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.touches.length > 1 && start.distance) {
      const nextDistance = touchDistance(event.touches);
      if (nextDistance > 0) {
        setPipScale(Math.max(0.82, Math.min(1.75, start.scale * (nextDistance / start.distance))));
      }
      return;
    }
    setPipPosition({
      x: Math.max(8, Math.min(window.innerWidth - 104, start.x + first.clientX - start.startX)),
      y: Math.max(56, Math.min(window.innerHeight - 148, start.y + first.clientY - start.startY)),
    });
  }

  function onPipTouchEnd() {
    pipTouchRef.current = null;
  }

  function runIncomingAction(action: () => void) {
    if (incomingActionRef.current) {
      return;
    }
    incomingActionRef.current = true;
    action();
    window.setTimeout(() => {
      incomingActionRef.current = false;
    }, 700);
  }

  function runEndAction(action: () => void) {
    if (endActionRef.current) {
      return;
    }
    endActionRef.current = true;
    action();
    window.setTimeout(() => {
      endActionRef.current = false;
    }, 700);
  }

  if (!visible) {
    return null;
  }

  if (phase === "incoming") {
    return (
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-[70] flex items-center justify-center bg-[radial-gradient(circle_at_50%_10%,rgba(34,211,238,0.22),transparent_28rem),linear-gradient(160deg,#020617,#082f49_55%,#020617)] p-4 text-white motion-safe:motion-fade-in",
          transitionPanel,
        )}
        style={{ top: "calc(-1 * env(safe-area-inset-top, 0px))" }}
      >
        <section className="relative z-10 flex w-full max-w-md flex-col items-center gap-6 rounded-[2rem] border border-white/12 bg-slate-950/72 px-5 py-8 text-center shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100">
              {phaseLabel(phase, mode)}
            </p>
            <h2 className="mt-2 truncate text-2xl font-semibold text-white">
              {peerName ?? "Участник семьи"}
            </h2>
          </div>
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-cyan-300/20 text-4xl font-bold text-white shadow-xl shadow-black/35 ring-1 ring-white/10">
            {(peerName ?? "F").trim().charAt(0).toUpperCase() || "F"}
          </div>
          <p className="rounded-2xl bg-black/35 px-4 py-3 text-sm font-medium text-sky-50 ring-1 ring-white/10">
            При ответе браузер запросит доступ к микрофону{mode === "video" ? " и камере" : ""}.
          </p>
          <div className="grid w-full grid-cols-2 gap-3">
            <Button
              className="min-h-14 rounded-full bg-emerald-500 px-6 text-base text-white shadow-lg shadow-emerald-950/30 hover:bg-emerald-400"
              onClick={() => runIncomingAction(onAccept)}
              onPointerUp={(event) => {
                event.stopPropagation();
                runIncomingAction(onAccept);
              }}
            >
              <Phone className="h-5 w-5" />
              Ответить
            </Button>
            <Button
              className="min-h-14 rounded-full px-6 text-base shadow-lg shadow-red-950/30"
              onClick={() => runIncomingAction(onReject)}
              onPointerUp={(event) => {
                event.stopPropagation();
                runIncomingAction(onReject);
              }}
              variant="danger"
            >
              <PhoneOff className="h-5 w-5" />
              Отклонить
            </Button>
          </div>
          {errorMessage ? (
            <p className="rounded-xl bg-accent-rose/20 px-3 py-2 text-sm font-medium text-rose-50 ring-1 ring-accent-rose/25">
              {errorMessage}
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-[70] flex items-center justify-center bg-black text-white motion-safe:motion-fade-in",
        transitionPanel,
      )}
      style={{ top: "calc(-1 * env(safe-area-inset-top, 0px))" }}
    >
      <section className="relative flex h-full w-full flex-col overflow-hidden bg-black text-white">
        <div
          className={cn(
            "absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/80 to-transparent px-5 pb-8 pt-[calc(1rem+env(safe-area-inset-top,0px))] transition-opacity duration-300",
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)]">
            {phaseLabel(phase, mode)}
          </p>
          <h2 className="mt-1 truncate text-2xl font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)]">
            {peerName ?? "Участник семьи"}
          </h2>
          {errorMessage ? (
            <p className="mt-2 rounded-xl bg-accent-rose/20 px-3 py-2 text-sm font-medium text-rose-50 ring-1 ring-accent-rose/25">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div
          className="relative min-h-0 flex-1 overflow-hidden bg-black"
          onClick={() => revealControls()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              revealControls();
            }
          }}
          role="presentation"
        >
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black">
            {mode === "video" && primaryTrack && !primaryCameraOff ? (
              <video
                ref={mainVideoRef}
                aria-label={primarySlot === "remote" ? "Видео собеседника" : "Ваше видео"}
                autoPlay
                className="h-full w-full object-cover"
                muted={primarySlot === "local"}
                playsInline
              />
            ) : (
              <div className="rounded-2xl bg-slate-950/75 px-5 py-3 text-center text-sm font-semibold text-sky-50 shadow-lg shadow-black/25 ring-1 ring-white/10">
                {mode === "video"
                  ? primarySlot === "remote"
                    ? "Ждём видео собеседника"
                    : "Камера выключена"
                  : "Аудиозвонок подключён"}
              </div>
            )}
            <audio ref={remoteAudioRef} aria-label="Аудио собеседника" autoPlay />
          </div>
          {mode === "video" ? (
            <div
              className="absolute z-20 flex h-32 w-24 touch-none items-center justify-center overflow-hidden rounded-3xl border border-white/25 bg-slate-950 shadow-2xl shadow-black/50 ring-1 ring-black/30 transition-shadow active:ring-white/40 sm:h-40 sm:w-28"
              onClick={(event) => {
                event.stopPropagation();
                setPrimarySlot((slot) => (slot === "remote" ? "local" : "remote"));
                revealControls();
              }}
              onTouchCancel={onPipTouchEnd}
              onTouchEnd={onPipTouchEnd}
              onTouchMove={onPipTouchMove}
              onTouchStart={onPipTouchStart}
              role="button"
              style={{
                left: pipPosition.x,
                top: pipPosition.y,
                transform: `scale(${pipScale})`,
                transformOrigin: "top left",
              }}
              tabIndex={0}
            >
              {pipTrack && !pipCameraOff ? (
                <video
                  ref={pipVideoRef}
                  aria-label={pipSlot === "remote" ? "Видео собеседника в окне" : "Ваше видео в окне"}
                  autoPlay
                  className="h-full w-full object-cover"
                  muted={pipSlot === "local"}
                  playsInline
                />
              ) : (
                <div className="px-2 text-center text-xs font-semibold text-sky-50">
                  {pipSlot === "remote" ? "Нет видео" : "Камера выключена"}
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            "absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/86 to-transparent px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-8 transition-opacity duration-300",
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <div className="flex items-center justify-center gap-4">
            <CallControlButton
              disabled={phase !== "connected"}
              label={micLabel}
              onClick={() => {
                revealControls();
                onToggleMicrophone();
              }}
            >
              {microphoneMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </CallControlButton>
            {mode === "video" ? (
              <>
                <CallControlButton
                  disabled={phase !== "connected"}
                  label={cameraLabel}
                  onClick={() => {
                    revealControls();
                    onToggleCamera();
                  }}
                >
                  {cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                </CallControlButton>
                <CallControlButton
                  disabled={phase !== "connected"}
                  label="Сменить камеру"
                  onClick={() => {
                    revealControls();
                    onSwitchCamera();
                  }}
                >
                  <SwitchCamera className="h-6 w-6" />
                </CallControlButton>
              </>
            ) : null}
            <CallControlButton
              label={endLabel}
              onClick={() => runEndAction(onEnd)}
              onPointerUp={(event) => {
                event.stopPropagation();
                runEndAction(onEnd);
              }}
              variant="danger"
            >
              <PhoneOff className="h-6 w-6" />
            </CallControlButton>
          </div>
        </div>
      </section>
    </div>
  );
}
