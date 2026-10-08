import {
  Room,
  RoomEvent,
  Track,
  createLocalTracks,
  type LocalTrack,
  type LocalVideoTrack,
  type RemoteTrack,
  VideoPreset,
  VideoPresets,
} from "livekit-client";

import type { AttachTrack, CallMode } from "./types";

type LiveKitSessionHandlers = {
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (message?: string) => void;
  onLocalTrack: (track: AttachTrack | null) => void;
  onMicrophoneMuted: (muted: boolean) => void;
  onCameraOff: (off: boolean) => void;
  onRemoteAudio: (track: AttachTrack | null) => void;
  onRemoteVideo: (track: AttachTrack | null) => void;
};

function trackKind(track: LocalTrack | RemoteTrack | AttachTrack) {
  return "kind" in track ? String(track.kind) : "";
}

function asAttachTrack(track: LocalTrack | RemoteTrack): AttachTrack {
  return track as unknown as AttachTrack;
}

function videoCaptureOptions(facingMode: "user" | "environment") {
  return {
    degradationPreference: "maintain-resolution" as const,
    facingMode,
    frameRate: 24,
    resolution: VideoPresets.h720.resolution,
  };
}

const videoPublishDefaults = {
  degradationPreference: "maintain-resolution" as const,
  simulcast: true,
  videoEncoding: { maxBitrate: 2_800_000, maxFramerate: 24 },
  videoSimulcastLayers: [
    new VideoPreset(320, 180, 350_000, 15),
    new VideoPreset(640, 360, 900_000, 24),
  ],
};

export class FamilyLiveKitSession {
  private readonly room = new Room({
    adaptiveStream: {
      pauseVideoInBackground: true,
      pixelDensity: typeof window === "undefined" ? 1 : window.devicePixelRatio,
    },
    dynacast: true,
    publishDefaults: videoPublishDefaults,
    videoCaptureDefaults: videoCaptureOptions("user"),
  });
  private readonly handlers: LiveKitSessionHandlers;
  private localAudioTrack: AttachTrack | null = null;
  private localVideoTrack: LocalVideoTrack | null = null;
  private cameraFacingMode: "user" | "environment" = "user";
  private disconnected = false;

  constructor(handlers: LiveKitSessionHandlers) {
    this.handlers = handlers;
    this.room.on(RoomEvent.Connected, this.handleConnected);
    this.room.on(RoomEvent.Disconnected, this.handleDisconnected);
    this.room.on(RoomEvent.ConnectionStateChanged, this.handleConnectionState);
    this.room.on(RoomEvent.TrackSubscribed, this.handleTrackSubscribed);
    this.room.on(RoomEvent.TrackUnsubscribed, this.handleTrackUnsubscribed);
  }

  async connect(options: { livekitUrl: string; mode: CallMode; token: string }) {
    const tracks = await createLocalTracks({
      audio: true,
      video: options.mode === "video" ? videoCaptureOptions(this.cameraFacingMode) : false,
    });
    if (this.disconnected) {
      for (const track of tracks) {
        track.stop();
      }
      return;
    }
    for (const track of tracks) {
      if (trackKind(track) === Track.Kind.Audio || trackKind(track) === "audio") {
        this.localAudioTrack = asAttachTrack(track);
      }
      if (trackKind(track) === Track.Kind.Video || trackKind(track) === "video") {
        this.localVideoTrack = track as LocalVideoTrack;
        this.handlers.onLocalTrack(asAttachTrack(this.localVideoTrack));
      }
    }

    await this.room.connect(options.livekitUrl, options.token);
    for (const track of tracks) {
      await this.room.localParticipant.publishTrack(track);
    }
    this.handlers.onConnected();
  }

  async setMicrophoneMuted(muted: boolean) {
    if (muted) {
      await this.localAudioTrack?.mute?.();
    } else {
      await this.localAudioTrack?.unmute?.();
    }
    this.handlers.onMicrophoneMuted(muted);
  }

  async setCameraOff(off: boolean) {
    if (off) {
      await this.room.localParticipant.setCameraEnabled(false);
      this.localVideoTrack?.detach?.();
      this.localVideoTrack = null;
      this.handlers.onLocalTrack(null);
    } else {
      const publication = await this.room.localParticipant.setCameraEnabled(true, {
        ...videoCaptureOptions(this.cameraFacingMode),
      });
      const track = publication?.track;
      this.localVideoTrack = track && trackKind(track) === Track.Kind.Video
        ? (track as LocalVideoTrack)
        : this.localVideoTrack;
      if (this.localVideoTrack) {
        this.handlers.onLocalTrack(asAttachTrack(this.localVideoTrack));
      }
    }
    this.handlers.onCameraOff(off);
  }

  async switchCamera() {
    this.cameraFacingMode = this.cameraFacingMode === "user" ? "environment" : "user";
    if (!this.localVideoTrack) {
      return;
    }
    try {
      await this.localVideoTrack.restartTrack(videoCaptureOptions(this.cameraFacingMode));
      this.handlers.onLocalTrack(asAttachTrack(this.localVideoTrack));
    } catch {
      await this.setCameraOff(true);
      await this.setCameraOff(false);
    }
  }

  disconnect() {
    if (this.disconnected) {
      return;
    }
    this.disconnected = true;
    this.localAudioTrack?.stop?.();
    this.localVideoTrack?.stop?.();
    this.localAudioTrack?.detach?.();
    this.localVideoTrack?.detach?.();
    this.handlers.onLocalTrack(null);
    this.handlers.onRemoteAudio(null);
    this.handlers.onRemoteVideo(null);
    this.room.disconnect();
  }

  private readonly handleConnected = () => {
    this.handlers.onConnected();
  };

  private readonly handleDisconnected = () => {
    this.handlers.onDisconnected();
  };

  private readonly handleConnectionState = (state: unknown) => {
    if (String(state).toLowerCase() === "failed") {
      this.handlers.onError("Не удалось подключиться к серверу звонков.");
    }
  };

  private readonly handleTrackSubscribed = (track: RemoteTrack) => {
    if (trackKind(track) === Track.Kind.Video || trackKind(track) === "video") {
      this.handlers.onRemoteVideo(asAttachTrack(track));
    }
    if (trackKind(track) === Track.Kind.Audio || trackKind(track) === "audio") {
      this.handlers.onRemoteAudio(asAttachTrack(track));
    }
  };

  private readonly handleTrackUnsubscribed = (track: RemoteTrack) => {
    if (trackKind(track) === Track.Kind.Video || trackKind(track) === "video") {
      this.handlers.onRemoteVideo(null);
    }
    if (trackKind(track) === Track.Kind.Audio || trackKind(track) === "audio") {
      this.handlers.onRemoteAudio(null);
    }
    asAttachTrack(track).detach?.();
  };
}
