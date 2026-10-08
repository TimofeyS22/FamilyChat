"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  FileIcon,
  ImageOff,
  Loader2,
  Pause,
  Play,
  X,
} from "lucide-react";
import type {
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  decryptMatrixAttachment,
  formatMatrixMediaSize,
} from "@/features/matrix/media";
import type { MatrixMediaAttachment } from "@/features/matrix/types";
import { cn } from "@/lib/utils/cn";

type MessageMediaProps = {
  media: MatrixMediaAttachment;
  mediaItems?: MatrixMediaAttachment[];
  caption?: string;
  activePlaybackId?: string | null;
  isOwn?: boolean;
  messageId?: string;
  onPlaybackEnd?: (messageId: string) => void;
  onPlaybackStart?: (messageId: string | null) => void;
  playbackRate?: number;
};

function blobFromBytes(bytes: Uint8Array, mimetype?: string) {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return new Blob([arrayBuffer], { type: mimetype || "application/octet-stream" });
}

async function decryptedBlobUrl(media: MatrixMediaAttachment): Promise<string> {
  if (!media.sourceUrl || !media.encryptedFile) {
    throw new Error("У зашифрованного файла нет данных для скачивания");
  }

  const response = await fetch(media.sourceUrl, {
    headers: media.sourceAccessToken
      ? { Authorization: `Bearer ${media.sourceAccessToken}` }
      : undefined,
  });
  if (!response.ok) {
    throw new Error("Не удалось скачать зашифрованный файл");
  }

  const bytes = await decryptMatrixAttachment(await response.arrayBuffer(), media.encryptedFile);
  return window.URL.createObjectURL(blobFromBytes(bytes, media.mimetype));
}

async function remoteMediaBlobUrl(media: MatrixMediaAttachment): Promise<string> {
  if (!media.sourceUrl) {
    throw new Error("У файла нет данных для скачивания");
  }

  const response = await fetch(media.sourceUrl, {
    headers: media.sourceAccessToken
      ? { Authorization: `Bearer ${media.sourceAccessToken}` }
      : undefined,
  });
  if (!response.ok) {
    throw new Error("Не удалось скачать файл");
  }

  if (media.encryptedFile) {
    const bytes = await decryptMatrixAttachment(await response.arrayBuffer(), media.encryptedFile);
    return window.URL.createObjectURL(blobFromBytes(bytes, media.mimetype));
  }

  return window.URL.createObjectURL(await response.blob());
}

function formatVoiceDuration(durationMs?: number) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function voiceWaveformHeights(media: MatrixMediaAttachment) {
  const seed = `${media.name}:${media.size ?? 0}:${media.duration ?? 0}`;
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  }
  return Array.from({ length: 34 }, (_, index) => {
    const value = Math.sin((index + 1) * 1.7 + hash) * 0.5 + 0.5;
    const accent = index % 5 === 0 ? 18 : 0;
    return Math.round(24 + value * 46 + accent);
  });
}

function likelyUnsupportedVoiceFormat(media: MatrixMediaAttachment) {
  const mimetype = media.mimetype?.toLowerCase() ?? "";
  const name = media.name.toLowerCase();
  return mimetype.includes("webm") || mimetype.includes("ogg") || name.endsWith(".webm") || name.endsWith(".ogg");
}

function seekAudioElement(audio: HTMLAudioElement, timeMs: number) {
  audio.currentTime = timeMs / 1000;
}

function VoiceMessagePlayer({
  activePlaybackId,
  caption,
  isOwn = false,
  media,
  messageId,
  onPlaybackEnd,
  onPlaybackStart,
  playbackRate = 1,
}: MessageMediaProps) {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(media.duration ?? 0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(media.objectUrl ?? media.sourceUrl ?? null);
  const [failed, setFailed] = useState(false);
  const [failureMessage, setFailureMessage] = useState("Голосовое сообщение не удалось воспроизвести.");
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const decryptedUrlRef = useRef<string | null>(null);
  const pendingSeekMsRef = useRef<number | null>(null);
  const waveformHeights = voiceWaveformHeights(media);

  function disposeAudio() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.src = "";
    audioRef.current = null;
  }

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.src = "";
        audioRef.current = null;
      }
      if (decryptedUrlRef.current) {
        window.URL.revokeObjectURL(decryptedUrlRef.current);
        decryptedUrlRef.current = null;
      }
    };
  }, []);

  function createAudio(url: string) {
    disposeAudio();
    setDownloadUrl(url);
    const audio = new Audio(url);
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationMs(Math.round(audio.duration * 1000));
      }
    });
    audio.addEventListener("timeupdate", () => {
      setCurrentTimeMs(Math.round(audio.currentTime * 1000));
    });
    audio.addEventListener("ended", () => {
      pendingSeekMsRef.current = null;
      setCurrentTimeMs(0);
      setIsPlaying(false);
      if (messageId) {
        onPlaybackEnd?.(messageId);
      }
    });
    audio.addEventListener("error", () => {
      setFailureMessage(
        likelyUnsupportedVoiceFormat(media)
          ? "Старый формат голосового не поддерживается этим устройством."
          : "Голосовое сообщение не удалось воспроизвести.",
      );
      setFailed(true);
      setIsPlaying(false);
    });
    audioRef.current = audio;
    audio.playbackRate = playbackRate;
    return audio;
  }

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!messageId) {
      return;
    }
    if (activePlaybackId === messageId && !isPlaying) {
      window.queueMicrotask(() => {
        void togglePlayback();
      });
      return;
    }
    if (activePlaybackId && activePlaybackId !== messageId && isPlaying) {
      window.queueMicrotask(() => {
        audioRef.current?.pause();
        setIsPlaying(false);
      });
    }
  // togglePlayback intentionally owns async media setup; including it would restart playback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaybackId, messageId]);

  async function audioForPlayback() {
    if (audioRef.current) {
      return audioRef.current;
    }

    if (media.objectUrl) {
      return createAudio(media.objectUrl);
    }

    if (media.encrypted || media.sourceAccessToken) {
      setLoading(true);
      try {
        const nextUrl = await remoteMediaBlobUrl(media);
        decryptedUrlRef.current = nextUrl;
        return createAudio(nextUrl);
      } finally {
        setLoading(false);
      }
    }

    if (media.sourceUrl) {
      return createAudio(media.sourceUrl);
    }

    setLoading(true);
    try {
      const nextUrl = await decryptedBlobUrl(media);
      decryptedUrlRef.current = nextUrl;
      return createAudio(nextUrl);
    } finally {
      setLoading(false);
    }
  }

  async function togglePlayback() {
    setFailed(false);

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      if (messageId) {
        onPlaybackStart?.(null);
      }
      return;
    }

    try {
      const audio = await audioForPlayback();
      audio.playbackRate = playbackRate;
      if (pendingSeekMsRef.current !== null) {
        seekAudioElement(audio, pendingSeekMsRef.current);
      }
      await audio.play();
      setIsPlaying(true);
      if (messageId) {
        onPlaybackStart?.(messageId);
      }
    } catch {
      setFailureMessage(
        likelyUnsupportedVoiceFormat(media)
          ? "Старый формат голосового не поддерживается этим устройством."
          : "Голосовое сообщение не удалось воспроизвести.",
      );
      setFailed(true);
      setIsPlaying(false);
    }
  }

  function seekVoice(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const nextTimeMs = Math.round(ratio * progressMax);
    pendingSeekMsRef.current = nextTimeMs;
    setCurrentTimeMs(nextTimeMs);
    setFailed(false);

    const audio = audioRef.current;
    if (audio) {
      seekAudioElement(audio, nextTimeMs);
    }
  }

  const progressMax = Math.max(1, durationMs);
  const showCaption =
    caption &&
    caption !== media.name &&
    caption !== "Голосовое сообщение" &&
    caption !== "Voice message";
  const progress = Math.min(currentTimeMs, progressMax) / progressMax;

  return (
    <div className="min-w-[13.5rem] max-w-[22rem] text-current">
      <div className="flex items-center gap-2.5">
        <button
          aria-label={isPlaying ? "Поставить голосовое сообщение на паузу" : "Воспроизвести голосовое сообщение"}
          className={cn(
            "inline-flex h-11 w-11 flex-none items-center justify-center rounded-full shadow-sm transition focus:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-70",
            isOwn
              ? "bg-white/22 text-white hover:bg-white/30"
              : "bg-sky-100 text-sky-700 hover:bg-sky-200",
          )}
          disabled={loading}
          onClick={() => void togglePlayback()}
          title={isPlaying ? "Поставить голосовое сообщение на паузу" : "Воспроизвести голосовое сообщение"}
          type="button"
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 translate-x-0.5" />
          )}
        </button>
        <button
          aria-label="Перемотать голосовое сообщение"
          aria-valuemax={progressMax}
          aria-valuemin={0}
          aria-valuenow={Math.min(currentTimeMs, progressMax)}
          className="group relative min-w-0 flex-1 touch-none cursor-pointer rounded-xl px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal"
          onDragStart={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
              return;
            }
            event.preventDefault();
            const step = event.key === "ArrowRight" ? 5000 : -5000;
            const nextTimeMs = Math.max(0, Math.min(progressMax, currentTimeMs + step));
            pendingSeekMsRef.current = nextTimeMs;
            setCurrentTimeMs(nextTimeMs);
            if (audioRef.current) {
              seekAudioElement(audioRef.current, nextTimeMs);
            }
          }}
          onPointerCancel={() => setSeeking(false)}
          onPointerDown={(event) => {
            event.preventDefault();
            setSeeking(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            seekVoice(event);
          }}
          onPointerMove={(event) => {
            if (seeking) {
              event.preventDefault();
              seekVoice(event);
            }
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            setSeeking(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            seekVoice(event);
          }}
          role="slider"
          title="Перемотать голосовое"
          type="button"
        >
          <span className="flex h-9 items-center gap-0.5 overflow-hidden">
            {waveformHeights.map((height, index) => {
              const active = index / waveformHeights.length <= progress;
              return (
                <span
                  className={cn(
                    "w-1 flex-none rounded-full transition-colors",
                    active
                      ? isOwn
                        ? "bg-white"
                        : "bg-accent-teal"
                      : isOwn
                        ? "bg-white/40"
                        : "bg-sky-200",
                  )}
                  key={index}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 opacity-0 shadow-md transition group-focus-visible:opacity-100 group-hover:opacity-100",
              seeking && "opacity-100",
              isOwn ? "border-white bg-white/90" : "border-white bg-accent-teal",
            )}
            style={{ left: `${progress * 100}%` }}
          />
        </button>
        <span
          className={cn(
            "w-10 flex-none text-right text-xs font-semibold tabular-nums",
            isOwn ? "text-white/85" : "text-ink-muted",
          )}
        >
          {formatVoiceDuration(currentTimeMs || durationMs)}
        </span>
      </div>
      {showCaption ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{caption}</p>
      ) : null}
      {failed ? (
        <div className="mt-2 space-y-1.5">
          <p className={cn("text-xs font-semibold", isOwn ? "text-white" : "text-accent-rose")}>
            {failureMessage}
          </p>
          {downloadUrl ? (
            <a
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold underline-offset-4 hover:underline",
                isOwn ? "bg-white/18 text-white" : "bg-rose-50 text-accent-rose",
              )}
              download={media.name}
              href={downloadUrl}
            >
              Скачать файл
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function initialVideoNoteDisplayUrl(media: MatrixMediaAttachment) {
  if (media.objectUrl) {
    return media.objectUrl;
  }
  if (media.sourceUrl && !media.encrypted && !media.sourceAccessToken) {
    return media.sourceUrl;
  }
  return null;
}

function VideoNotePlayer({
  activePlaybackId,
  caption,
  media,
  messageId,
  onPlaybackEnd,
  onPlaybackStart,
  playbackRate = 1,
}: MessageMediaProps) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(() => initialVideoNoteDisplayUrl(media));
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasTriedPlayback, setHasTriedPlayback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const durationMs = media.duration ?? 0;

  useEffect(() => {
    let revoked = false;
    async function load() {
      if (media.objectUrl) {
        setDisplayUrl(media.objectUrl);
        return;
      }
      if (!media.sourceUrl) {
        return;
      }
      if (!media.encrypted && !media.sourceAccessToken) {
        setDisplayUrl(media.sourceUrl);
        return;
      }
      try {
        const nextUrl = await remoteMediaBlobUrl(media);
        if (revoked) {
          window.URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrlRef.current = nextUrl;
        setDisplayUrl(nextUrl);
      } catch {
        setFailed(false);
      }
    }
    void load();
    return () => {
      revoked = true;
      if (objectUrlRef.current) {
        window.URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  // Keep dependencies stable across timeline re-normalization of the same Matrix event.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.encrypted, media.objectUrl, media.sourceAccessToken, media.sourceUrl]);

  function updateProgress() {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }
    setProgress(video.currentTime / video.duration);
  }

  function seekVideoByPointer(event: ReactPointerEvent<SVGElement>) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
      return;
    }
    const svg = event.currentTarget.ownerSVGElement ?? event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) + Math.PI / 2;
    const ratio = ((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
    video.currentTime = ratio * video.duration;
    setProgress(ratio);
  }

  async function ensureDisplayUrl() {
    if (displayUrl) {
      return displayUrl;
    }
    if (media.objectUrl) {
      setDisplayUrl(media.objectUrl);
      return media.objectUrl;
    }
    if (media.sourceUrl && !media.encrypted && !media.sourceAccessToken) {
      setDisplayUrl(media.sourceUrl);
      return media.sourceUrl;
    }
    if (!media.sourceUrl) {
      return null;
    }
    setLoading(true);
    try {
      const nextUrl = await remoteMediaBlobUrl(media);
      if (objectUrlRef.current) {
        window.URL.revokeObjectURL(objectUrlRef.current);
      }
      objectUrlRef.current = nextUrl;
      setDisplayUrl(nextUrl);
      setFailed(false);
      return nextUrl;
    } catch {
      setFailed(true);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpandedPlayback() {
    setHasTriedPlayback(true);
    const nextUrl = await ensureDisplayUrl();
    if (!nextUrl) {
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (expanded && playing) {
      video.pause();
      setPlaying(false);
      if (messageId) {
        onPlaybackStart?.(null);
      }
      return;
    }

    if (!expanded) {
      setExpanded(true);
    }

    if (!playing) {
      try {
        video.muted = false;
        video.playbackRate = playbackRate;
        await video.play();
        setPlaying(true);
        if (messageId) {
          onPlaybackStart?.(messageId);
        }
      } catch {
        try {
          video.muted = true;
          video.playbackRate = playbackRate;
          await video.play();
          setPlaying(true);
          if (messageId) {
            onPlaybackStart?.(messageId);
          }
        } catch {
          setFailed(true);
        }
      }
      return;
    }
  }

  useLayoutEffect(() => {
    if (!expanded) {
      return;
    }
    const scrollIntoView = () => {
      containerRef.current?.scrollIntoView({ block: "nearest" });
    };
    const frame = window.requestAnimationFrame(scrollIntoView);
    const timeout = window.setTimeout(scrollIntoView, 180);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [expanded]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!messageId) {
      return;
    }
    if (activePlaybackId === messageId && !playing) {
      window.queueMicrotask(() => {
        void toggleExpandedPlayback();
      });
      return;
    }
    if (activePlaybackId && activePlaybackId !== messageId && playing) {
      window.queueMicrotask(() => {
        videoRef.current?.pause();
        setPlaying(false);
        setExpanded(false);
      });
    }
  // toggleExpandedPlayback intentionally owns async media setup; including it would restart playback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaybackId, messageId]);

  const content = (
    <div className="space-y-2" ref={containerRef}>
      <button
        aria-label={expanded ? "Свернуть кружок" : "Посмотреть кружок"}
        className={cn(
          "group relative z-0 block overflow-hidden rounded-full bg-slate-950 shadow-lg shadow-sky-950/20 transition-[height,width,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
          expanded ? "h-[min(60vw,15rem)] w-[min(60vw,15rem)] shadow-2xl" : "h-40 w-40",
        )}
        onClick={() => void toggleExpandedPlayback()}
        type="button"
      >
        {displayUrl && !(failed && hasTriedPlayback) ? (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            onEnded={() => {
              setPlaying(false);
              setExpanded(false);
              setProgress(0);
              if (messageId) {
                onPlaybackEnd?.(messageId);
              }
            }}
            onError={() => setFailed(true)}
            onTimeUpdate={updateProgress}
            playsInline
            preload="metadata"
            src={displayUrl}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-sky-50">
            {loading ? "Загружаем" : failed && hasTriedPlayback ? "Не удалось открыть" : "Кружок"}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white transition group-hover:bg-black/20">
          {playing ? <Pause className="h-8 w-8 drop-shadow" /> : <Play className="h-8 w-8 drop-shadow" />}
        </span>
        <svg
          aria-label="Перемотать кружок"
          className={cn(
            "absolute inset-0 -rotate-90 touch-none",
            expanded ? "pointer-events-auto" : "pointer-events-none",
          )}
          role="slider"
          viewBox="0 0 100 100"
        >
          <circle cx="50" cy="50" fill="none" r="48" stroke="rgba(255,255,255,0.32)" strokeWidth="3" />
          <circle
            cx="50"
            cy="50"
            fill="none"
            r="48"
            stroke="rgba(255,255,255,0.86)"
            strokeDasharray={`${progress * 302} 302`}
            strokeLinecap="round"
            strokeWidth="3"
          />
          {expanded ? (
            <circle
              cx={50 + 48 * Math.cos(progress * Math.PI * 2)}
              cy={50 + 48 * Math.sin(progress * Math.PI * 2)}
              fill="white"
              r="3.6"
              stroke="rgba(14,165,233,0.95)"
              strokeWidth="1.5"
            />
          ) : null}
          {expanded ? (
            <circle
              cx="50"
              cy="50"
              fill="none"
              onClick={(event) => event.stopPropagation()}
              onPointerCancel={() => setSeeking(false)}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSeeking(true);
                event.currentTarget.setPointerCapture?.(event.pointerId);
                seekVideoByPointer(event);
              }}
              onPointerMove={(event) => {
                if (seeking) {
                  event.preventDefault();
                  event.stopPropagation();
                  seekVideoByPointer(event);
                }
              }}
              onPointerUp={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setSeeking(false);
                if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
                seekVideoByPointer(event);
              }}
              r="48"
              stroke="transparent"
              strokeWidth="16"
              style={{ pointerEvents: "stroke" }}
            />
          ) : null}
        </svg>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[0.68rem] font-bold text-white">
          {formatVoiceDuration(durationMs)}
        </span>
      </button>
      {caption && caption !== "Кружок" ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{caption}</p>
      ) : null}
    </div>
  );

  return (
    <>
      {content}
    </>
  );
}

function AlbumImageTile({
  className,
  index,
  media,
  onOpen,
}: {
  className?: string;
  index: number;
  media: MatrixMediaAttachment;
  onOpen: () => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(media.objectUrl ?? null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(!media.objectUrl && (media.encrypted || media.sourceAccessToken)));
  const displayUrl = objectUrl ?? (!(media.encrypted || media.sourceAccessToken) ? media.sourceUrl : null);

  useEffect(() => {
    if (media.objectUrl || !(media.encrypted || media.sourceAccessToken)) {
      return;
    }

    let revoked = false;
    let nextObjectUrl: string | null = null;
    window.queueMicrotask(() => {
      if (revoked) {
        return;
      }
      setLoading(true);
      setFailed(false);
      void remoteMediaBlobUrl(media)
        .then((url) => {
          if (revoked) {
            window.URL.revokeObjectURL(url);
            return;
          }
          nextObjectUrl = url;
          setObjectUrl(url);
        })
        .catch(() => {
          if (!revoked) {
            setFailed(true);
          }
        })
        .finally(() => {
          if (!revoked) {
            setLoading(false);
          }
        });
    });

    return () => {
      revoked = true;
      if (nextObjectUrl) {
        window.URL.revokeObjectURL(nextObjectUrl);
      }
    };
  // Keep this tied to stable media fields; depending on the whole media object can cancel
  // an in-flight blob preview when the timeline re-normalizes the same Matrix event.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    media.encrypted,
    media.encryptedFile,
    media.mimetype,
    media.objectUrl,
    media.sourceAccessToken,
    media.sourceUrl,
  ]);

  return (
    <button
      aria-label={`Открыть фото ${index + 1}`}
      className={cn(
        "group relative min-h-[7.5rem] overflow-hidden bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
        className,
      )}
      onClick={onOpen}
      type="button"
    >
      {displayUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={media.name}
          className="h-full w-full object-cover transition duration-200 group-active:scale-[0.985]"
          onError={() => setFailed(true)}
          src={displayUrl}
        />
      ) : (
        <span className="flex h-full min-h-[7.5rem] items-center justify-center gap-2 text-xs font-semibold text-ink-muted">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageOff className="h-4 w-4" />}
          {loading ? "Загружаем" : "Нет превью"}
        </span>
      )}
    </button>
  );
}

function FullscreenImage({
  className,
  media,
  scale = 1,
}: {
  className?: string;
  media: MatrixMediaAttachment;
  scale?: number;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(media.objectUrl ?? null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(!media.objectUrl && (media.encrypted || media.sourceAccessToken)));
  const displayUrl = objectUrl ?? (!(media.encrypted || media.sourceAccessToken) ? media.sourceUrl : null);

  useEffect(() => {
    if (media.objectUrl || !(media.encrypted || media.sourceAccessToken)) {
      return;
    }

    let revoked = false;
    let nextObjectUrl: string | null = null;
    window.queueMicrotask(() => {
      if (revoked) {
        return;
      }
      setLoading(true);
      setFailed(false);
      void remoteMediaBlobUrl(media)
        .then((url) => {
          if (revoked) {
            window.URL.revokeObjectURL(url);
            return;
          }
          nextObjectUrl = url;
          setObjectUrl(url);
        })
        .catch(() => {
          if (!revoked) {
            setFailed(true);
          }
        })
        .finally(() => {
          if (!revoked) {
            setLoading(false);
          }
        });
    });

    return () => {
      revoked = true;
      if (nextObjectUrl) {
        window.URL.revokeObjectURL(nextObjectUrl);
      }
    };
  // Keep this tied to stable media fields; depending on the whole media object can cancel
  // an in-flight blob preview when the timeline re-normalizes the same Matrix event.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    media.encrypted,
    media.encryptedFile,
    media.mimetype,
    media.objectUrl,
    media.sourceAccessToken,
    media.sourceUrl,
  ]);

  if (!displayUrl || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 text-sm font-semibold text-white/80">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageOff className="h-5 w-5" />}
        {loading ? "Загружаем фото" : "Фото не удалось открыть"}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={media.name}
      className={cn("max-h-[82dvh] max-w-full object-contain", className)}
      onError={() => setFailed(true)}
      src={displayUrl}
      style={{ transform: `scale(${scale})` }}
    />
  );
}

function albumGridClass(count: number) {
  if (count === 2) {
    return "grid-cols-2";
  }
  if (count === 3) {
    return "grid-cols-2 grid-rows-2";
  }
  if (count === 4) {
    return "grid-cols-2";
  }
  return "grid-cols-3";
}

function albumTileClass(index: number, count: number) {
  if (count === 3 && index === 0) {
    return "row-span-2";
  }
  if (count >= 5 && index < 2) {
    return "col-span-3 min-h-[8.25rem] sm:col-span-1";
  }
  return undefined;
}

function AlbumLightbox({
  initialIndex,
  items,
  onClose,
}: {
  initialIndex: number;
  items: MatrixMediaAttachment[];
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);
  const activeMedia = items[activeIndex];
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex < items.length - 1;

  function goPrevious() {
    setScale(1);
    setActiveIndex((current) => Math.max(0, current - 1));
  }

  function goNext() {
    setScale(1);
    setActiveIndex((current) => Math.min(items.length - 1, current + 1));
  }

  function touchDistance(touches: ReactTouchEvent<HTMLDivElement>["touches"]) {
    const first = touches[0];
    const second = touches[1];
    if (!first || !second) {
      return 0;
    }
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.touches.length >= 2) {
      pinchStartRef.current = {
        distance: touchDistance(event.touches),
        scale,
      };
      touchStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    pinchStartRef.current = null;
  }

  function handleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.touches.length >= 2 && pinchStartRef.current) {
      const nextDistance = touchDistance(event.touches);
      if (pinchStartRef.current.distance > 0 && nextDistance > 0) {
        const nextScale = pinchStartRef.current.scale * (nextDistance / pinchStartRef.current.distance);
        setScale(Math.max(1, Math.min(4, nextScale)));
      }
    }
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (pinchStartRef.current) {
      if (event.touches.length < 2) {
        pinchStartRef.current = null;
      }
      return;
    }

    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (scale > 1.04) {
      return;
    }
    if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx) * 1.15 && dy < 0) {
      onClose();
      return;
    }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        goNext();
      } else {
        goPrevious();
      }
    }
  }

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlBackground = document.documentElement.style.background;
    const previousBodyBackground = document.body.style.background;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    const previousThemeColor = themeMeta?.getAttribute("content") ?? null;
    const statusBarMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    const previousStatusBarStyle = statusBarMeta?.getAttribute("content") ?? null;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.background = "#000";
    document.body.style.background = "#000";
    themeMeta?.setAttribute("content", "#000000");
    statusBarMeta?.setAttribute("content", "black-translucent");

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.background = previousHtmlBackground;
      document.body.style.background = previousBodyBackground;
      if (previousThemeColor !== null) {
        themeMeta?.setAttribute("content", previousThemeColor);
      }
      if (previousStatusBarStyle !== null) {
        statusBarMeta?.setAttribute("content", previousStatusBarStyle);
      }
    };
  }, []);

  if (!activeMedia) {
    return null;
  }

  const content = (
    <div
      aria-modal="true"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center overflow-hidden bg-black"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
      }}
      onTouchCancel={(event) => {
        event.stopPropagation();
        touchStartRef.current = null;
        pinchStartRef.current = null;
      }}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
      role="dialog"
      style={{
        paddingTop: "128px",
        top: "-128px",
        touchAction: "none",
      }}
    >
      <Button
        aria-label="Закрыть изображение"
        className="absolute right-4 top-[calc(1rem+env(safe-area-inset-top,0px))] z-10 min-w-11 px-3"
        onClick={onClose}
        title="Закрыть изображение"
        type="button"
        variant="secondary"
      >
        <X className="h-4 w-4" />
      </Button>
      {items.length > 1 ? (
        <div className="absolute left-1/2 top-[calc(1rem+env(safe-area-inset-top,0px))] z-10 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">
          {activeIndex + 1} / {items.length}
        </div>
      ) : null}
      {items.length > 1 ? (
        <>
          <button
            aria-label="Предыдущее фото"
            className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/65 disabled:opacity-30"
            disabled={!canGoPrevious}
            onClick={goPrevious}
            type="button"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            aria-label="Следующее фото"
            className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/65 disabled:opacity-30"
            disabled={!canGoNext}
            onClick={goNext}
            type="button"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}
      <FullscreenImage
        className="select-none transition-transform duration-100"
        key={`${activeMedia.sourceUrl ?? activeMedia.objectUrl ?? activeMedia.name}-${activeIndex}`}
        media={activeMedia}
        scale={scale}
      />
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(content, document.body);
}

export function MessageMedia({
  activePlaybackId,
  caption,
  isOwn = false,
  media,
  mediaItems,
  messageId,
  onPlaybackEnd,
  onPlaybackStart,
  playbackRate = 1,
}: MessageMediaProps) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [albumLightboxIndex, setAlbumLightboxIndex] = useState<number | null>(null);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const shouldInlinePreview = media.kind === "image" || media.kind === "video";
  const previewNeedsBlob = Boolean(media.encrypted || media.sourceAccessToken);
  const displayUrl = media.objectUrl ?? decryptedUrl ?? (!previewNeedsBlob ? media.sourceUrl : null);
  const albumItems = mediaItems?.filter((item) => item.kind === "image") ?? [];

  async function loadBlobPreview() {
    if (!shouldInlinePreview || media.objectUrl || previewLoading) {
      return;
    }
    setPreviewLoading(true);
    setPreviewFailed(false);
    try {
      const nextObjectUrl = await remoteMediaBlobUrl(media);
      setDecryptedUrl((current) => {
        if (current) {
          window.URL.revokeObjectURL(current);
        }
        return nextObjectUrl;
      });
    } catch {
      setPreviewFailed(true);
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (!previewNeedsBlob || !shouldInlinePreview || media.objectUrl) {
      return;
    }

    let revoked = false;
    let objectUrl: string | null = null;

    window.queueMicrotask(() => {
      if (revoked) {
        return;
      }
      setPreviewLoading(true);
      setPreviewFailed(false);
      setDecryptedUrl(null);

      void remoteMediaBlobUrl(media)
        .then((nextObjectUrl) => {
          if (revoked) {
            window.URL.revokeObjectURL(nextObjectUrl);
            return;
          }
          objectUrl = nextObjectUrl;
          setDecryptedUrl(nextObjectUrl);
        })
        .catch(() => {
          if (!revoked) {
            setPreviewFailed(true);
          }
        })
        .finally(() => {
          if (!revoked) {
            setPreviewLoading(false);
          }
        });
    });

    return () => {
      revoked = true;
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  // Keep this tied to stable media fields; depending on the whole media object can cancel
  // an in-flight blob preview when the timeline re-normalizes the same Matrix event.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    media.encrypted,
    media.encryptedFile,
    media.mimetype,
    media.objectUrl,
    media.sourceAccessToken,
    media.sourceUrl,
    previewNeedsBlob,
    shouldInlinePreview,
  ]);

  if (media.kind === "audio" && media.isVoice) {
    return (
      <VoiceMessagePlayer
        activePlaybackId={activePlaybackId}
        caption={caption}
        isOwn={isOwn}
        media={media}
        messageId={messageId}
        onPlaybackEnd={onPlaybackEnd}
        onPlaybackStart={onPlaybackStart}
        playbackRate={playbackRate}
      />
    );
  }

  if (media.kind === "video" && media.isVideoNote) {
    return (
      <VideoNotePlayer
        activePlaybackId={activePlaybackId}
        caption={caption}
        media={media}
        messageId={messageId}
        onPlaybackEnd={onPlaybackEnd}
        onPlaybackStart={onPlaybackStart}
        playbackRate={playbackRate}
      />
    );
  }

  async function downloadEncryptedMedia() {
    setDownloadFailed(false);
    setDownloadLoading(true);
    try {
      const objectUrl = await decryptedBlobUrl(media);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = media.name;
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownloadLoading(false);
    }
  }

  if (media.kind === "image") {
    if (albumItems.length > 1) {
      return (
        <div className="space-y-2">
          <div
            className={cn(
              "grid max-w-[23rem] gap-1 overflow-hidden rounded-2xl bg-white/70 p-1 shadow-sm",
              albumGridClass(albumItems.length),
            )}
          >
            {albumItems.map((item, index) => (
              <AlbumImageTile
                className={albumTileClass(index, albumItems.length)}
                index={index}
                key={`${item.sourceUrl ?? item.objectUrl ?? item.name}-${index}`}
                media={item}
                onOpen={() => setAlbumLightboxIndex(index)}
              />
            ))}
          </div>
          {caption && !/^Фото \(\d+\)$/.test(caption) ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{caption}</p>
          ) : null}
          {albumLightboxIndex !== null ? (
            <AlbumLightbox
              initialIndex={albumLightboxIndex}
              items={albumItems}
              onClose={() => setAlbumLightboxIndex(null)}
            />
          ) : null}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <div className="relative overflow-hidden rounded-2xl border border-white/70 bg-white shadow-sm">
          {displayUrl && !previewFailed ? (
            <button
              aria-label={`Открыть изображение ${media.name}`}
              className="group block max-h-[24rem] w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal"
              onClick={() => setLightboxOpen(true)}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={media.name}
                className="max-h-[24rem] w-full object-cover"
                onError={() => {
                  if (media.sourceAccessToken && !decryptedUrl) {
                    void loadBlobPreview();
                    return;
                  }
                  setPreviewFailed(true);
                }}
                src={displayUrl}
              />
              <span className="absolute right-2 top-2 rounded-md bg-black/60 p-2 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <Expand className="h-4 w-4" />
              </span>
            </button>
          ) : (
            <div className="flex min-h-36 items-center justify-center gap-2 px-4 py-8 text-sm text-ink-muted">
              {previewLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImageOff className="h-4 w-4" />
              )}
              <span>{previewLoading ? "Загружаем изображение" : "Предпросмотр изображения недоступен"}</span>
            </div>
          )}
        </div>
        {caption && caption !== media.name ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{caption}</p>
        ) : null}
        {lightboxOpen && displayUrl ? (
          <AlbumLightbox
            initialIndex={0}
            items={[media]}
            onClose={() => setLightboxOpen(false)}
          />
        ) : null}
      </div>
    );
  }

  if (media.kind === "video") {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-2xl border border-white/70 bg-black shadow-sm">
          {displayUrl && !previewFailed ? (
            <video
              className="max-h-[24rem] w-full"
              controls
              onError={() => {
                if (media.sourceAccessToken && !decryptedUrl) {
                  void loadBlobPreview();
                  return;
                }
                setPreviewFailed(true);
              }}
              preload="metadata"
              src={displayUrl}
            />
          ) : (
            <div className="flex min-h-36 items-center justify-center gap-2 px-4 py-8 text-sm text-ink-muted">
              {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>{previewLoading ? "Загружаем видео" : "Предпросмотр видео недоступен"}</span>
            </div>
          )}
        </div>
        {caption && caption !== media.name ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{caption}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/70 bg-white/92 p-3 text-ink-primary shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-surface-line bg-surface-raised">
          <FileIcon className="h-5 w-5 text-accent-teal" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-primary">{media.name}</p>
          <p className="text-xs text-ink-muted">
            {formatMatrixMediaSize(media.size)}
            {media.mimetype ? ` - ${media.mimetype}` : ""}
          </p>
        </div>
        {media.encrypted ? (
          <Button
            className="flex-none px-3"
            disabled={downloadLoading}
            onClick={() => void downloadEncryptedMedia()}
            type="button"
            variant="secondary"
          >
            {downloadLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Скачать
          </Button>
        ) : media.sourceUrl ? (
          <a
            className={cn(
              "inline-flex min-h-11 flex-none items-center justify-center gap-2 rounded-lg border border-surface-line bg-surface-raised px-3 py-2 text-sm font-semibold text-ink-primary transition hover:bg-surface-line/45 focus:outline-none focus-visible:shadow-focus",
            )}
            download={media.name}
            href={media.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            <Download className="h-4 w-4" />
            Скачать
          </a>
        ) : null}
      </div>
      {caption && caption !== media.name ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{caption}</p>
      ) : null}
      {downloadFailed ? (
        <p className="mt-2 text-xs font-semibold text-accent-rose">
          Файл не удалось расшифровать или скачать.
        </p>
      ) : null}
    </div>
  );
}
