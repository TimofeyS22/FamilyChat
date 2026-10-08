import type { FamilyUser } from "@/features/family/types";
import type { MatrixRoomSummary } from "@/features/matrix/types";

export type CallMode = "audio" | "video";
export type CallPhase =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "connected"
  | "error";

export type DirectCallPeer = {
  room: MatrixRoomSummary;
  user: FamilyUser;
};

export type CallTokenResponse = {
  livekitUrl: string;
  token: string;
  expiresAt: string;
  callId: string;
  peerDisplayName: string;
};

export type AttachTrack = {
  attach: (element?: HTMLMediaElement) => HTMLMediaElement;
  detach?: () => HTMLMediaElement[];
  mute?: () => Promise<void> | void;
  restartTrack?: (options?: unknown) => Promise<void> | void;
  unmute?: () => Promise<void> | void;
  stop?: () => void;
};
