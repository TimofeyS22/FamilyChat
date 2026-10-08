export type MatrixSession = {
  accessToken: string;
  userId: string;
  deviceId?: string;
  baseUrl: string;
};

export type MatrixLoginInput = {
  username: string;
  password: string;
};

export type MatrixConnectionStatus =
  | "restoring"
  | "syncing"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type MatrixCryptoStatus = "unknown" | "initializing" | "ready" | "unavailable";

export type MatrixRecoveryStatus = "unknown" | "ready" | "needed";

export type MatrixRoomEncryptionState =
  | "unknown"
  | "encrypted"
  | "not_encrypted"
  | "recovery_needed";

export type MatrixPresenceState = "online" | "offline" | "unavailable";

export type MatrixUserPresence = {
  currentlyActive: boolean;
  lastActiveAt?: number;
  presence: MatrixPresenceState;
  userId: string;
};

export type MatrixRoomSummary = {
  id: string;
  name: string;
  avatarId?: string;
  preview: string;
  unreadCount: number;
  lastTimestamp: number;
  canSendMessages: boolean;
  encryptionState: MatrixRoomEncryptionState;
  memberIds: string[];
  isDirect: boolean;
  peerMatrixUserId?: string;
};

type MatrixCallMode = "audio" | "video";

export type MatrixCallEventType =
  | "com.familychat.call.invite"
  | "com.familychat.call.accept"
  | "com.familychat.call.reject"
  | "com.familychat.call.hangup";

export type MatrixCallEvent = {
  callId: string;
  expiresAt?: number;
  mode?: MatrixCallMode;
  roomId: string;
  sender: string | null;
  timestamp: number;
  type: MatrixCallEventType;
};

export type MatrixCallSignalContent = {
  callId: string;
  expiresAt?: number;
  mode?: MatrixCallMode;
  timestamp: number;
};

type MatrixMessageStatus = "uploading" | "sending" | "sent" | "failed";

export type MatrixMediaKind = "image" | "video" | "audio" | "file";

export type MatrixEncryptedFile = {
  url: string;
  key: {
    alg: string;
    key_ops: string[];
    kty: string;
    k: string;
    ext: boolean;
  };
  iv: string;
  hashes: {
    [algorithm: string]: string;
  };
  v: string;
};

export type MatrixMediaAttachment = {
  albumKey?: string;
  kind: MatrixMediaKind;
  name: string;
  mimetype?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  isVoice?: boolean;
  isVideoNote?: boolean;
  sourceUrl?: string;
  sourceAccessToken?: string;
  encryptedFile?: MatrixEncryptedFile;
  objectUrl?: string;
  encrypted: boolean;
};

export type MatrixMessageReaction = {
  key: "heart" | "laugh" | "ok";
  count: number;
  reactedByMe: boolean;
  ownEventId?: string;
};

export type MatrixMessageReply = {
  eventId: string;
  authorName: string;
  body: string;
};

export type MatrixMessage = {
  id: string;
  roomId: string;
  body: string;
  authorName: string;
  authorMatrixUserId?: string;
  kind?: "message" | "call";
  edited?: boolean;
  encryptedPending?: boolean;
  isOwn: boolean;
  readByPeer?: boolean;
  timestamp: number;
  status: MatrixMessageStatus;
  media?: MatrixMediaAttachment;
  mediaItems?: MatrixMediaAttachment[];
  uploadProgress?: number;
  localFile?: File;
  localFiles?: File[];
  localCaption?: string;
  pinned?: boolean;
  reactions?: MatrixMessageReaction[];
  replyTo?: MatrixMessageReply;
};
