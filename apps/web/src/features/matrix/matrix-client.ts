import { createClient } from "matrix-js-sdk";

import { matrixBaseUrl } from "@/lib/config/env";

import {
  buildMatrixMediaEventContent,
  encryptMatrixAttachment,
  matrixMediaKindForFile,
  matrixMsgtypeForMediaKind,
  safeMatrixMediaName,
  validateMatrixMediaFile,
  type MatrixMediaEventContent,
} from "./media";
import { matrixPresenceFromUser } from "./presence";
import type {
  MatrixCallEvent,
  MatrixCallEventType,
  MatrixCallSignalContent,
  MatrixEncryptedFile,
  MatrixConnectionStatus,
  MatrixCryptoStatus,
  MatrixLoginInput,
  MatrixMediaAttachment,
  MatrixMessage,
  MatrixRecoveryStatus,
  MatrixRoomEncryptionState,
  MatrixRoomSummary,
  MatrixSession,
  MatrixUserPresence,
} from "./types";

const matrixPasswordLoginType = "m.login.password";
const matrixTextEventType = "m.room.message";
const matrixEncryptedEventType = "m.room.encrypted";
const matrixReactionEventType = "m.reaction";
const matrixTextMessageType = "m.text";
const familychatAlbumUpdateEventType = "org.familychat.album.update";
const familychatPinEventType = "org.familychat.pin";
const matrixCallEventTypes = new Set<MatrixCallEventType>([
  "com.familychat.call.invite",
  "com.familychat.call.accept",
  "com.familychat.call.reject",
  "com.familychat.call.hangup",
]);
const matrixCryptoDatabasePrefix = "familychat-web-matrix-crypto";
const initialSyncLimit = 50;
const matrixMediaMessageTypes = new Set(["m.image", "m.video", "m.audio", "m.file"]);

type MatrixLoginResponse = {
  access_token?: string;
  user_id?: string;
  device_id?: string;
};

type MatrixEventContent = {
  msgtype?: unknown;
  body?: unknown;
  filename?: unknown;
  file?: unknown;
  info?: unknown;
  "m.new_content"?: unknown;
  "m.relates_to"?: unknown;
  url?: unknown;
  "org.familychat.voice"?: unknown;
  "org.familychat.video_note"?: unknown;
  "org.familychat.call.invite"?: unknown;
  "org.familychat.album"?: unknown;
  pinned?: unknown;
  targetEventId?: unknown;
  removeAlbumKeys?: unknown;
};

type MatrixRelationContent = {
  event_id?: unknown;
  key?: unknown;
  rel_type?: unknown;
  "m.in_reply_to"?: {
    event_id?: unknown;
  };
};

type MatrixUploadProgress = {
  loaded: number;
  total: number;
};

type MatrixUploadOptions = {
  abortController?: AbortController;
  includeFilename?: boolean;
  name?: string;
  progressHandler?: (progress: MatrixUploadProgress) => void;
  type?: string;
};

type MatrixUploadResponse = {
  content_uri: string;
};

type MatrixSdkEvent = {
  getType: () => string;
  getContent: () => unknown;
  getSender?: () => string | null;
  getTs: () => number;
  getId?: () => string | undefined;
};

type MatrixSdkTimeline = {
  getEvents: () => MatrixSdkEvent[];
};

type MatrixSdkRoom = {
  roomId: string;
  name?: string;
  getReceiptsForEvent?: (event: MatrixSdkEvent) => MatrixSdkReceipt[];
  getUsersReadUpTo?: (event: MatrixSdkEvent) => string[];
  getMember?: (userId: string) => MatrixSdkRoomMember | null;
  getMembersWithMembership?: (membership: string) => MatrixSdkRoomMember[];
  getLiveTimeline: () => MatrixSdkTimeline;
  hasEncryptionStateEvent?: () => boolean;
  getMyMembership?: () => string;
  getUnreadNotificationCount?: (type?: string) => number;
  getEventReadUpTo?: (userId: string, ignoreSynthesized?: boolean) => string | null;
};

type MatrixSdkReceipt = {
  type?: string;
  userId?: string;
};

type MatrixSdkRoomMember = {
  name?: string;
  rawDisplayName?: string;
  userId?: string;
  user?: {
    displayName?: string;
    userId?: string;
  };
};

type MatrixCreateRoomResponse = {
  room_id?: string;
  roomId?: string;
};

type MatrixCryptoInitOptions = {
  useIndexedDB?: boolean;
  cryptoDatabasePrefix?: string;
};

type MatrixSdkCryptoApi = {
  getOwnDeviceKeys: () => Promise<unknown>;
  isCrossSigningReady: () => Promise<boolean>;
  isSecretStorageReady: () => Promise<boolean>;
};

type MatrixSdkUser = {
  currentlyActive?: boolean;
  getLastActiveTs?: () => number;
  lastActiveAgo?: number;
  lastPresenceTs?: number;
  presence?: string;
  userId: string;
};

type MatrixSdkClient = {
  createRoom: (options: {
    invite: string[];
    is_direct?: boolean;
    name: string;
    preset: "private_chat";
    visibility: "private";
  }) => Promise<MatrixCreateRoomResponse>;
  initRustCrypto?: (options?: MatrixCryptoInitOptions) => Promise<void>;
  getCrypto?: () => MatrixSdkCryptoApi | undefined;
  login: (
    loginType: string,
    payload: {
      user: string;
      password: string;
      initial_device_display_name?: string;
    },
  ) => Promise<MatrixLoginResponse>;
  logout: () => Promise<unknown>;
  retryImmediately?: () => boolean;
  startClient: (options?: { initialSyncLimit?: number }) => unknown;
  stopClient: () => void;
  on: (eventName: string, listener: (...args: unknown[]) => void) => void;
  off: (eventName: string, listener: (...args: unknown[]) => void) => void;
  getAccountData?: (eventType: string) => MatrixSdkEvent | undefined;
  getRooms: () => MatrixSdkRoom[];
  getUser?: (userId: string) => MatrixSdkUser | null;
  getUserId: () => string | null;
  getDeviceId?: () => string | undefined;
  leave?: (roomId: string) => Promise<unknown>;
  forget?: (roomId: string, deleteRoom?: boolean) => Promise<unknown>;
  joinRoom?: (roomId: string) => Promise<unknown>;
  invite?: (roomId: string, userId: string, opts?: unknown) => Promise<unknown>;
  redactEvent?: (roomId: string, eventId: string, txnId?: string, opts?: { reason?: string }) => Promise<unknown>;
  sendReadReceipt?: (event: MatrixSdkEvent) => Promise<unknown>;
  setRoomReadMarkers?: (
    roomId: string,
    readEventId: string,
    receiptEvent?: MatrixSdkEvent,
  ) => Promise<unknown>;
  mxcUrlToHttp?: (
    mxcUrl: string,
    width?: number,
    height?: number,
    resizeMethod?: string,
    allowDirectLinks?: boolean,
    allowRedirects?: boolean,
    useAuthentication?: boolean,
  ) => string | null;
  sendEvent: (
    roomId: string,
    eventType: string,
    content: Record<string, unknown>,
    txnId?: string,
  ) => Promise<unknown>;
  sendTextMessage: (roomId: string, text: string, txnId?: string) => Promise<unknown>;
  setPresence?: (opts: { presence: string; status_msg?: string }) => Promise<unknown>;
  setPusher?: (pusher: {
    app_display_name: string;
    app_id: string;
    append?: boolean;
    data: {
      brand?: string;
      format?: string;
      url: string;
    };
    device_display_name: string;
    kind: "http";
    lang: string;
    pushkey: string;
  }) => Promise<unknown>;
  removePusher?: (pushKey: string, appId: string) => Promise<unknown>;
  uploadContent: (
    file: XMLHttpRequestBodyInit,
    options?: MatrixUploadOptions,
  ) => Promise<MatrixUploadResponse>;
};

export type MatrixFamilyInvitee = {
  displayName: string;
  matrixUserId: string;
};

type MatrixHandlers = {
  onCallEvent?: (event: MatrixCallEvent) => void;
  onPresence?: (presence: MatrixUserPresence) => void;
  onStatus: (status: MatrixConnectionStatus) => void;
  onRooms: (rooms: MatrixRoomSummary[]) => void;
  onTimeline: (roomId: string, messages: MatrixMessage[]) => void;
};

type MatrixEncryptionContext = {
  cryptoStatus: MatrixCryptoStatus;
  recoveryStatus: MatrixRecoveryStatus;
};

function asMatrixClient(value: unknown): MatrixSdkClient {
  return value as MatrixSdkClient;
}

function safeCryptoDatabasePart(value: string | undefined): string {
  return (value ?? "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

export function matrixCryptoDatabasePrefixForSession(session: MatrixSession): string {
  return [
    matrixCryptoDatabasePrefix,
    safeCryptoDatabasePart(session.userId),
    safeCryptoDatabasePart(session.deviceId),
  ].join("-");
}

function deleteIndexedDb(databaseName: string): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.deleteDatabase(databaseName);
    request.onerror = () => resolve();
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
  });
}

function isCryptoStoreAccountMismatch(error: unknown): boolean {
  return error instanceof Error && error.message.includes("account in the store doesn't match");
}

function isTextContent(content: unknown): content is MatrixEventContent {
  return typeof content === "object" && content !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMatrixCallEventType(value: string): value is MatrixCallEventType {
  return matrixCallEventTypes.has(value as MatrixCallEventType);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function replacementTarget(content: MatrixEventContent): string | null {
  const relatesTo = isRecord(content["m.relates_to"]) ? content["m.relates_to"] : null;
  if (
    relatesTo?.rel_type === "m.replace" &&
    typeof relatesTo.event_id === "string" &&
    relatesTo.event_id.trim()
  ) {
    return relatesTo.event_id;
  }
  return null;
}

function relationContent(content: MatrixEventContent): MatrixRelationContent | null {
  return isRecord(content["m.relates_to"]) ? (content["m.relates_to"] as MatrixRelationContent) : null;
}

function replyTarget(content: MatrixEventContent): string | null {
  const relatesTo = relationContent(content);
  const eventId = relatesTo?.["m.in_reply_to"]?.event_id;
  return typeof eventId === "string" && eventId.trim() ? eventId : null;
}

function reactionTarget(content: MatrixEventContent): { eventId: string; key: "heart" | "laugh" | "ok" } | null {
  const relatesTo = relationContent(content);
  if (relatesTo?.rel_type !== "m.annotation" || typeof relatesTo.event_id !== "string") {
    return null;
  }
  const key = relatesTo.key;
  if (key === "heart" || key === "laugh" || key === "ok") {
    return { eventId: relatesTo.event_id, key };
  }
  return null;
}

function replacementBody(content: MatrixEventContent): string | null {
  const nextContent = isRecord(content["m.new_content"]) ? content["m.new_content"] : content;
  if (nextContent.msgtype === matrixTextMessageType && typeof nextContent.body === "string") {
    return nextContent.body.trim() || null;
  }
  return null;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function isEncryptedFile(value: unknown): value is MatrixEncryptedFile {
  if (!isRecord(value)) {
    return false;
  }

  const key = value.key;
  const hashes = value.hashes;
  return (
    typeof value.url === "string" &&
    typeof value.iv === "string" &&
    typeof value.v === "string" &&
    isRecord(key) &&
    typeof key.alg === "string" &&
    Array.isArray(key.key_ops) &&
    typeof key.kty === "string" &&
    typeof key.k === "string" &&
    typeof key.ext === "boolean" &&
    isRecord(hashes) &&
    typeof hashes.sha256 === "string"
  );
}

function mediaKindForMsgtype(msgtype: string): MatrixMediaAttachment["kind"] | null {
  if (msgtype === matrixMsgtypeForMediaKind("image")) {
    return "image";
  }
  if (msgtype === matrixMsgtypeForMediaKind("video")) {
    return "video";
  }
  if (msgtype === matrixMsgtypeForMediaKind("audio")) {
    return "audio";
  }
  if (msgtype === matrixMsgtypeForMediaKind("file")) {
    return "file";
  }
  return null;
}

function mediaAttachmentFromContent(
  content: MatrixEventContent,
  resolveMxcUrl?: (mxcUrl: string, useAuthentication?: boolean) => string | undefined,
  sourceAccessToken?: string,
  albumKey?: string,
): MatrixMediaAttachment | null {
  if (typeof content.msgtype !== "string" || !matrixMediaMessageTypes.has(content.msgtype)) {
    return null;
  }

  const kind = mediaKindForMsgtype(content.msgtype);
  if (!kind) {
    return null;
  }

  const encryptedFile = isEncryptedFile(content.file) ? content.file : undefined;
  const mxcUrl = encryptedFile?.url ?? optionalString(content.url);
  const sourceUrl = mxcUrl ? resolveMxcUrl?.(mxcUrl, Boolean(encryptedFile || sourceAccessToken)) : undefined;
  if (!sourceUrl) {
    return null;
  }

  const info = isRecord(content.info) ? content.info : {};
  const fallbackName = kind === "image" ? "Изображение" : kind === "video" ? "Видео" : "Вложение";
  const name = optionalString(content.filename) ?? optionalString(content.body) ?? fallbackName;
  const isVoice = kind === "audio" && content["org.familychat.voice"] === true;
  const isVideoNote = kind === "video" && content["org.familychat.video_note"] === true;

  return {
    albumKey,
    duration: optionalNumber(info.duration),
    encrypted: Boolean(encryptedFile),
    encryptedFile,
    height: optionalNumber(info.h),
    isVoice,
    isVideoNote,
    kind,
    mimetype: optionalString(info.mimetype),
    name,
    size: optionalNumber(info.size),
    sourceAccessToken,
    sourceUrl,
    width: optionalNumber(info.w),
  };
}

function albumItemKey(content: MatrixEventContent, index: number) {
  const encryptedFile = isEncryptedFile(content.file) ? content.file : undefined;
  const info = isRecord(content.info) ? content.info : {};
  return [
    index,
    optionalString(encryptedFile?.url) ?? optionalString(content.url) ?? "",
    optionalString(content.filename) ?? optionalString(content.body) ?? "",
    optionalNumber(info.size) ?? "",
  ].join(":");
}

function mediaAlbumFromContent(
  content: MatrixEventContent,
  resolveMxcUrl?: (mxcUrl: string, useAuthentication?: boolean) => string | undefined,
  sourceAccessToken?: string,
  removedKeys: Set<string> = new Set(),
): MatrixMediaAttachment[] {
  const album = isRecord(content["org.familychat.album"]) ? content["org.familychat.album"] : null;
  const items = Array.isArray(album?.items) ? album.items : [];

  return items
    .map((item, index) => {
      if (!isTextContent(item)) {
        return null;
      }
      const key = albumItemKey(item, index);
      if (removedKeys.has(key)) {
        return null;
      }
      return mediaAttachmentFromContent(item, resolveMxcUrl, sourceAccessToken, key);
    })
    .filter((media): media is MatrixMediaAttachment => Boolean(media));
}

function mediaPreviewLabel(media: MatrixMediaAttachment): string {
  if (media.kind === "image") {
    return `Изображение: ${media.name}`;
  }
  if (media.kind === "video") {
    return media.isVideoNote ? "Кружок" : `Видео: ${media.name}`;
  }
  if (media.kind === "audio") {
    if (media.isVoice) {
      return "Голосовое сообщение";
    }
    return `Аудиофайл: ${media.name}`;
  }
  return `Файл: ${media.name}`;
}

function messagePreview(message: MatrixMessage) {
  if (message.encryptedPending) {
    return "Зашифрованное сообщение";
  }
  if (message.mediaItems && message.mediaItems.length > 1) {
    return `Фото: ${message.mediaItems.length}`;
  }
  if (message.media) {
    return mediaPreviewLabel(message.media);
  }
  return message.body;
}

function timelineEvents(room: MatrixSdkRoom): MatrixSdkEvent[] {
  try {
    return room.getLiveTimeline().getEvents();
  } catch {
    return [];
  }
}

function roomHasEncryptionState(room: MatrixSdkRoom): boolean {
  try {
    return Boolean(room.hasEncryptionStateEvent?.());
  } catch {
    return false;
  }
}

function roomEncryptionState(
  room: MatrixSdkRoom,
  context: MatrixEncryptionContext,
): MatrixRoomEncryptionState {
  if (!roomHasEncryptionState(room)) {
    return "not_encrypted";
  }

  if (context.cryptoStatus === "ready" && context.recoveryStatus === "ready") {
    return "encrypted";
  }

  if (context.cryptoStatus === "ready" && context.recoveryStatus === "needed") {
    return "recovery_needed";
  }

  if (context.cryptoStatus === "initializing" || context.cryptoStatus === "unknown") {
    return "unknown";
  }

  return "recovery_needed";
}

function canSendToRoom(room: MatrixSdkRoom, context: MatrixEncryptionContext): boolean {
  if (!roomHasEncryptionState(room)) {
    return true;
  }
  return context.cryptoStatus === "ready";
}

function safeRoomName(room: MatrixSdkRoom): string {
  const name = room.name?.trim();
  return name || "Семейный чат";
}

function timelineUnreadCount(room: MatrixSdkRoom, currentUserId: string | null) {
  if (!currentUserId || !room.getEventReadUpTo) {
    return 0;
  }
  const readUpTo = room.getEventReadUpTo(currentUserId, true);
  const events = timelineEvents(room);
  const readIndex = readUpTo ? events.findIndex((event) => event.getId?.() === readUpTo) : -1;
  return events.slice(readIndex + 1).filter((event) => {
    const sender = event.getSender?.() ?? null;
    return sender !== currentUserId && isReadableTimelineEvent(event);
  }).length;
}

function safeUnreadCount(room: MatrixSdkRoom, currentUserId: string | null): number {
  try {
    const counts = [
      room.getUnreadNotificationCount?.("total"),
      room.getUnreadNotificationCount?.(),
      timelineUnreadCount(room, currentUserId),
    ].filter((count): count is number => typeof count === "number" && Number.isFinite(count));
    return Math.max(0, ...counts);
  } catch {
    try {
      return timelineUnreadCount(room, currentUserId);
    } catch {
      return 0;
    }
  }
}

function syncStatusFromMatrix(value: unknown): MatrixConnectionStatus {
  const state = String(value ?? "").toUpperCase();
  if (state === "PREPARED" || state === "SYNCING") {
    return "connected";
  }
  if (state === "RECONNECTING") {
    return "reconnecting";
  }
  if (state === "ERROR" || state === "STOPPED") {
    return "disconnected";
  }
  return "syncing";
}

function createdRoomId(response: MatrixCreateRoomResponse): string {
  const roomId = response.room_id ?? response.roomId;
  if (!roomId) {
    throw new Error("Не удалось создать чат");
  }
  return roomId;
}

function memberUserId(member: MatrixSdkRoomMember): string | null {
  return member.userId ?? member.user?.userId ?? null;
}

function safeMemberDisplayName(room: MatrixSdkRoom, userId: string | null): string | null {
  if (!userId) {
    return null;
  }
  try {
    const member = room.getMember?.(userId);
    const displayName = member?.rawDisplayName ?? member?.name ?? member?.user?.displayName;
    const trimmed = displayName?.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

function joinedMemberIds(room: MatrixSdkRoom): string[] {
  return memberIdsWithMembership(room, ["join"]);
}

function memberIdsWithMembership(room: MatrixSdkRoom, memberships: string[]): string[] {
  try {
    const ids = new Set<string>();
    for (const membership of memberships) {
      for (const member of room.getMembersWithMembership?.(membership) ?? []) {
        const userId = memberUserId(member);
        if (userId) {
          ids.add(userId);
        }
      }
    }
    return [...ids];
  } catch {
    return [];
  }
}

function directPeerMatrixUserId(
  room: MatrixSdkRoom,
  currentUserId: string | null,
  directPeerIds: readonly string[] = [],
): string | undefined {
  if (!currentUserId || ["Family Chat", "Семейный чат"].includes(safeRoomName(room))) {
    return undefined;
  }
  const accountDataPeer = directPeerIds.find((userId) => userId !== currentUserId);
  if (accountDataPeer) {
    return accountDataPeer;
  }

  const roomMemberIds = memberIdsWithMembership(room, ["join", "invite"]);
  if (roomMemberIds.length !== 2 || !roomMemberIds.includes(currentUserId)) {
    return undefined;
  }
  return roomMemberIds.find((userId) => userId !== currentUserId);
}

function directPeerIdsByRoom(client: MatrixSdkClient) {
  const event = client.getAccountData?.("m.direct");
  const content = event?.getContent();
  const peers = new Map<string, string[]>();
  if (!isRecord(content)) {
    return peers;
  }

  for (const [userId, roomIds] of Object.entries(content)) {
    if (typeof userId !== "string" || !Array.isArray(roomIds)) {
      continue;
    }
    for (const roomId of roomIds) {
      if (typeof roomId !== "string") {
        continue;
      }
      peers.set(roomId, [...(peers.get(roomId) ?? []), userId]);
    }
  }
  return peers;
}

function roomLooksLikeDirectChat(
  room: MatrixSdkRoom,
  currentUserId: string | null,
  inviteeUserId: string,
): boolean {
  const joinedIds = joinedMemberIds(room);
  if (!joinedIds.includes(inviteeUserId)) {
    return false;
  }
  if (currentUserId && !joinedIds.includes(currentUserId)) {
    return false;
  }
  return joinedIds.length > 0 && joinedIds.length <= 2;
}

function normalizeMatrixRoomsWithEncryption(
  rooms: MatrixSdkRoom[],
  encryptionContext: MatrixEncryptionContext,
  resolveMxcUrl?: (mxcUrl: string) => string | undefined,
  currentUserId?: string | null,
  directPeerIds?: ReadonlyMap<string, readonly string[]>,
): MatrixRoomSummary[] {
  return rooms
    .filter((room) => {
      const membership = room.getMyMembership?.();
      return !membership || membership === "join";
    })
    .map((room) => {
      const timelineMessages = normalizeMatrixTimeline(
        room,
        currentUserId ?? null,
        resolveMxcUrl,
      );
      const lastMessage = timelineMessages.at(-1);
      const encryptionState = roomEncryptionState(room, encryptionContext);
      const memberIds = memberIdsWithMembership(room, ["join", "invite"]);
      const peerMatrixUserId = directPeerMatrixUserId(
        room,
        currentUserId ?? null,
        directPeerIds?.get(room.roomId) ?? [],
      );
      const directDisplayName = peerMatrixUserId
        ? safeMemberDisplayName(room, peerMatrixUserId)
        : null;

      return {
        canSendMessages: canSendToRoom(room, encryptionContext),
        encryptionState,
        id: room.roomId,
        isDirect: Boolean(peerMatrixUserId),
        lastTimestamp: lastMessage?.timestamp ?? 0,
        memberIds,
        name: directDisplayName ?? safeRoomName(room),
        peerMatrixUserId,
        preview: lastMessage ? messagePreview(lastMessage) : "Сообщений пока нет",
        unreadCount: safeUnreadCount(room, currentUserId ?? null),
      };
    })
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp || a.name.localeCompare(b.name));
}

function callEventFromMatrixEvent(roomId: string, event: MatrixSdkEvent): MatrixCallEvent | null {
  const type = event.getType();
  if (!isMatrixCallEventType(type)) {
    return null;
  }
  const content = event.getContent();
  if (!isRecord(content) || typeof content.callId !== "string") {
    return null;
  }
  const mode = content.mode === "audio" || content.mode === "video" ? content.mode : undefined;
  const expiresAt = optionalNumber(content.expiresAt);
  const timestamp = optionalNumber(content.timestamp) ?? event.getTs();
  return {
    callId: content.callId,
    expiresAt,
    mode,
    roomId,
    sender: event.getSender?.() ?? null,
    timestamp,
    type,
  };
}

type MatrixCallThread = {
  authorName: string;
  eventId: string;
  isOwn: boolean;
  latestType: MatrixCallEventType;
  mode?: MatrixCallEvent["mode"];
  timestamp: number;
};

function callModeLabel(mode: MatrixCallEvent["mode"]) {
  if (mode === "audio") {
    return "Аудиозвонок";
  }
  if (mode === "video") {
    return "Видеозвонок";
  }
  return "Звонок";
}

function callMessageBody(call: MatrixCallThread) {
  const label = callModeLabel(call.mode);
  if (call.latestType === "com.familychat.call.reject") {
    return `${label} отклонён`;
  }
  if (call.latestType === "com.familychat.call.hangup") {
    return `${label} завершён`;
  }
  if (call.latestType === "com.familychat.call.accept") {
    return `${label} принят`;
  }
  return call.isOwn ? `Исходящий ${label.toLowerCase()}` : `Входящий ${label.toLowerCase()}`;
}

function callThreadsFromEvents(
  room: MatrixSdkRoom,
  events: MatrixSdkEvent[],
  currentUserId: string | null,
) {
  const threads = new Map<string, MatrixCallThread>();

  events.forEach((event, index) => {
    const callEvent = callEventFromMatrixEvent(room.roomId, event);
    if (!callEvent) {
      return;
    }

    const eventAuthor = event.getSender?.() ?? null;
    const isOwn = Boolean(currentUserId && eventAuthor === currentUserId);
    const authorName = isOwn
      ? "Вы"
      : safeMemberDisplayName(room, eventAuthor) ?? "Участник семьи";
    const previous = threads.get(callEvent.callId);
    threads.set(callEvent.callId, {
      authorName,
      eventId: event.getId?.() ?? `${room.roomId}-${event.getTs()}-${index}`,
      isOwn,
      latestType: callEvent.type,
      mode: callEvent.mode ?? previous?.mode,
      timestamp: event.getTs(),
    });
  });

  return threads;
}

function isReadableTimelineEvent(event: MatrixSdkEvent) {
  return (
    event.getType() === matrixTextEventType ||
    event.getType() === matrixEncryptedEventType ||
    isMatrixCallEventType(event.getType())
  );
}

function eventReadByPeer(
  room: MatrixSdkRoom,
  event: MatrixSdkEvent,
  currentUserId: string | null,
) {
  if (!currentUserId) {
    return false;
  }
  const eventId = event.getId?.();
  const events = eventId ? timelineEvents(room) : [];
  const eventIndex = eventId ? events.findIndex((candidate) => candidate.getId?.() === eventId) : -1;
  try {
    const readUsers = room.getUsersReadUpTo?.(event);
    if (readUsers?.some((userId) => userId !== currentUserId)) {
      return true;
    }
  } catch {
    // Ignore SDK receipt cache edge cases; the UI can still show a sent state.
  }
  try {
    const receipts = room.getReceiptsForEvent?.(event) ?? [];
    if (receipts.some((receipt) => receipt.userId !== currentUserId && receipt.type === "m.read")) {
      return true;
    }
  } catch {
    // Fall through to event-read-up-to checks below.
  }
  if (!eventId || eventIndex < 0 || !room.getEventReadUpTo) {
    return false;
  }
  try {
    return memberIdsWithMembership(room, ["join"])
      .filter((userId) => userId !== currentUserId)
      .some((userId) => {
        const readUpTo = room.getEventReadUpTo?.(userId, true);
        if (!readUpTo) {
          return false;
        }
        const readIndex = events.findIndex((candidate) => candidate.getId?.() === readUpTo);
        return readIndex >= eventIndex;
      });
  } catch {
    return false;
  }
}

function normalizeMatrixTimeline(
  room: MatrixSdkRoom,
  currentUserId: string | null,
  resolveMxcUrl?: (mxcUrl: string, useAuthentication?: boolean) => string | undefined,
  sourceAccessToken?: string,
): MatrixMessage[] {
  const events = timelineEvents(room);
  const callThreads = callThreadsFromEvents(room, events, currentUserId);
  const replacements = new Map<string, string>();
  const reactionsByEvent = new Map<
    string,
    Map<"heart" | "laugh" | "ok", { count: number; ownEventId?: string; senders: Set<string> }>
  >();
  const messageSummaries = new Map<string, { authorName: string; body: string }>();
  const pinnedEventIds = new Set<string>();
  const removedAlbumKeysByEvent = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.getType() === familychatPinEventType) {
      const content = event.getContent();
      if (isTextContent(content) && typeof content.targetEventId === "string") {
        if (content.pinned === false) {
          pinnedEventIds.delete(content.targetEventId);
        } else {
          pinnedEventIds.add(content.targetEventId);
        }
      }
      continue;
    }
    if (event.getType() === familychatAlbumUpdateEventType) {
      const content = event.getContent();
      if (isTextContent(content) && typeof content.targetEventId === "string" && Array.isArray(content.removeAlbumKeys)) {
        const existing = removedAlbumKeysByEvent.get(content.targetEventId) ?? new Set<string>();
        for (const key of content.removeAlbumKeys) {
          if (typeof key === "string" && key) {
            existing.add(key);
          }
        }
        removedAlbumKeysByEvent.set(content.targetEventId, existing);
      }
      continue;
    }
    if (event.getType() === matrixReactionEventType) {
      const content = event.getContent();
      if (!isTextContent(content)) {
        continue;
      }
      const target = reactionTarget(content);
      const sender = event.getSender?.() ?? event.getId?.() ?? `${event.getTs()}`;
      const reactionEventId = event.getId?.();
      if (target) {
        const reactions = reactionsByEvent.get(target.eventId) ?? new Map();
        const aggregate = reactions.get(target.key) ?? { count: 0, senders: new Set<string>() };
        if (!aggregate.senders.has(sender)) {
          aggregate.senders.add(sender);
          aggregate.count += 1;
        }
        if (sender === currentUserId && reactionEventId) {
          aggregate.ownEventId = reactionEventId;
        }
        reactions.set(target.key, aggregate);
        reactionsByEvent.set(target.eventId, reactions);
      }
      continue;
    }
    if (event.getType() !== matrixTextEventType) {
      continue;
    }
    const content = event.getContent();
    if (!isTextContent(content)) {
      continue;
    }
    const targetId = replacementTarget(content);
    const body = replacementBody(content);
    if (targetId && body) {
      replacements.set(targetId, body);
    }
  }

  return events
    .map((event, index): MatrixMessage | null => {
      const callEvent = callEventFromMatrixEvent(room.roomId, event);
      if (callEvent) {
        const call = callThreads.get(callEvent.callId);
        if (!call || call.eventId !== (event.getId?.() ?? `${room.roomId}-${event.getTs()}-${index}`)) {
          return null;
        }
        return {
          authorName: call.authorName,
          body: callMessageBody(call),
          id: call.eventId,
          isOwn: call.isOwn,
          kind: "call",
          readByPeer: call.isOwn ? eventReadByPeer(room, event, currentUserId) : undefined,
          roomId: room.roomId,
          status: "sent",
          timestamp: call.timestamp,
        };
      }

      if (event.getType() === matrixEncryptedEventType) {
        const eventAuthor = event.getSender?.() ?? null;
        const isOwn = Boolean(currentUserId && eventAuthor === currentUserId);
        return {
          authorName: isOwn
            ? "Вы"
            : safeMemberDisplayName(room, eventAuthor) ?? "Участник семьи",
          authorMatrixUserId: eventAuthor ?? undefined,
          body: "Сообщение получено, ждём ключи шифрования.",
          encryptedPending: true,
          id: event.getId?.() ?? `${room.roomId}-${event.getTs()}-${index}`,
          isOwn,
          readByPeer: isOwn ? eventReadByPeer(room, event, currentUserId) : undefined,
          roomId: room.roomId,
          status: "sent",
          timestamp: event.getTs(),
        };
      }

      if (event.getType() !== matrixTextEventType) {
        return null;
      }

      const content = event.getContent();
      if (!isTextContent(content)) {
        return null;
      }
      if (content["org.familychat.call.invite"] === true) {
        return null;
      }
      if (reactionTarget(content)) {
        return null;
      }
      if (replacementTarget(content)) {
        return null;
      }

      const textBody =
        content.msgtype === matrixTextMessageType && typeof content.body === "string"
          ? content.body.trim()
          : null;
      const eventId = event.getId?.() ?? `${room.roomId}-${event.getTs()}-${index}`;
      const mediaItems = mediaAlbumFromContent(
        content,
        resolveMxcUrl,
        sourceAccessToken,
        removedAlbumKeysByEvent.get(eventId),
      );
      const media = mediaItems[0] ?? mediaAttachmentFromContent(content, resolveMxcUrl, sourceAccessToken);
      const replacement = replacements.get(eventId);
      const body = media?.isVoice
        ? "Голосовое сообщение"
        : media?.isVideoNote
          ? "Кружок"
          : replacement || textBody || optionalString(content.body) || media?.name;
      if (!body || (!textBody && !media && mediaItems.length === 0)) {
        return null;
      }

      const eventAuthor = event.getSender?.() ?? null;
      const isOwn = Boolean(currentUserId && eventAuthor === currentUserId);
      const authorName = isOwn
        ? "Вы"
        : safeMemberDisplayName(room, eventAuthor) ?? "Участник семьи";
      const replyEventId = replyTarget(content);
      const replySummary = replyEventId ? messageSummaries.get(replyEventId) : undefined;
      const reactionMap = reactionsByEvent.get(eventId);
      messageSummaries.set(eventId, { authorName, body });

      return {
        authorName,
        authorMatrixUserId: eventAuthor ?? undefined,
        body,
        edited: Boolean(replacement),
        id: eventId,
        isOwn,
        media: media ?? undefined,
        mediaItems: mediaItems.length > 1 ? mediaItems : undefined,
        pinned: pinnedEventIds.has(eventId),
        readByPeer: isOwn ? eventReadByPeer(room, event, currentUserId) : undefined,
        reactions: reactionMap
          ? Array.from(reactionMap.entries()).map(([key, value]) => ({
              count: value.count,
              key,
              ownEventId: value.ownEventId,
              reactedByMe: Boolean(value.ownEventId),
            }))
          : undefined,
        replyTo:
          replyEventId && replySummary
            ? {
                authorName: replySummary.authorName,
                body: replySummary.body,
                eventId: replyEventId,
              }
            : undefined,
        roomId: room.roomId,
        status: "sent",
        timestamp: event.getTs(),
      };
    })
    .filter((message): message is MatrixMessage => Boolean(message));
}

export async function loginToMatrix({ password, username }: MatrixLoginInput): Promise<MatrixSession> {
  const client = asMatrixClient(createClient({ baseUrl: matrixBaseUrl }));
  const response = await client.login(matrixPasswordLoginType, {
    initial_device_display_name: "FamilyChat Web",
    password,
    user: username.trim().toLowerCase(),
  });

  if (!response.access_token || !response.user_id) {
    throw new Error("Matrix sign in failed");
  }

  return {
    accessToken: response.access_token,
    baseUrl: matrixBaseUrl,
    deviceId: response.device_id,
    userId: response.user_id,
  };
}

export class FamilyMatrixClient {
  private readonly client: MatrixSdkClient;
  private readonly session: MatrixSession;
  private cryptoStatus: MatrixCryptoStatus = "unknown";
  private recoveryStatus: MatrixRecoveryStatus = "unknown";
  private handlers: MatrixHandlers | null = null;
  private readonly emittedCallEventKeys = new Set<string>();
  private readonly joiningInviteRoomIds = new Set<string>();
  private started = false;
  private syncStarted = false;
  private lastSyncAt = 0;
  private lastSyncRestartAt = 0;
  private syncWatchdogId: number | null = null;
  private readonly handleSync = (state: unknown) => {
    this.lastSyncAt = Date.now();
    this.handlers?.onStatus(syncStatusFromMatrix(state));
    this.emitRooms();
    this.emitTimelines();
    this.emitPeerPresences();
    void this.joinInvitedRooms();
  };
  private readonly handleRoomUpdate = () => {
    this.emitRooms();
    this.emitTimelines();
  };
  private readonly handleTimeline = (event: unknown, room: unknown, toStartOfTimeline: unknown) => {
    if (toStartOfTimeline) {
      return;
    }
    this.emitRooms();
    if (room && typeof room === "object" && "roomId" in room) {
      const typedRoom = room as MatrixSdkRoom;
      this.emitCallEvent(typedRoom.roomId, event as MatrixSdkEvent);
      this.handlers?.onTimeline(
        typedRoom.roomId,
        normalizeMatrixTimeline(
          typedRoom,
          this.client.getUserId(),
          this.mediaHttpUrl,
          this.session.accessToken,
        ),
      );
    }
  };
  private readonly handleDecryptedEvent = () => {
    this.emitRooms();
    this.emitTimelines();
  };
  private readonly handleAppResume = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    this.setOnlinePresence();
    this.refreshSyncAfterResume();
    this.emitRooms();
    this.emitTimelines();
    this.emitPeerPresences();
  };
  private readonly handleUserPresence = (_event: unknown, user: unknown) => {
    const snapshot = matrixPresenceFromUser(user, "");
    if (snapshot) {
      this.handlers?.onPresence?.(snapshot);
    }
  };

  constructor(session: MatrixSession) {
    this.session = session;
    this.client = asMatrixClient(
      createClient({
        accessToken: session.accessToken,
        baseUrl: session.baseUrl || matrixBaseUrl,
        deviceId: session.deviceId,
        userId: session.userId,
      }),
    );
  }

  async start(handlers: MatrixHandlers) {
    if (this.started) {
      return;
    }

    this.handlers = handlers;
    this.started = true;
    await this.initializeCrypto();
    if (!this.started) {
      return;
    }

    this.client.on("Event.decrypted", this.handleDecryptedEvent);
    this.client.on("Room.name", this.handleRoomUpdate);
    this.client.on("Room.receipt", this.handleRoomUpdate);
    this.client.on("Room.timeline", this.handleTimeline);
    this.client.on("Room.timelineReset", this.handleRoomUpdate);
    this.client.on("User.currentlyActive", this.handleUserPresence);
    this.client.on("User.lastPresenceTs", this.handleUserPresence);
    this.client.on("User.presence", this.handleUserPresence);
    this.client.on("sync", this.handleSync);
    this.lastSyncAt = Date.now();
    this.client.startClient({ initialSyncLimit });
    this.syncStarted = true;
    this.setOnlinePresence();
    if (typeof window !== "undefined") {
      window.addEventListener("focus", this.handleAppResume);
      window.addEventListener("pageshow", this.handleAppResume);
      document.addEventListener("visibilitychange", this.handleAppResume);
      this.syncWatchdogId = window.setInterval(() => this.refreshSyncIfStale(), 15000);
    }
    this.emitRooms();
    this.emitTimelines();
    this.emitPeerPresences();
    void this.joinInvitedRooms();
  }

  stop() {
    if (!this.started) {
      return;
    }

    this.client.off("sync", this.handleSync);
    this.client.off("Room.timeline", this.handleTimeline);
    this.client.off("Room.timelineReset", this.handleRoomUpdate);
    this.client.off("Room.name", this.handleRoomUpdate);
    this.client.off("Room.receipt", this.handleRoomUpdate);
    this.client.off("Event.decrypted", this.handleDecryptedEvent);
    this.client.off("User.presence", this.handleUserPresence);
    this.client.off("User.currentlyActive", this.handleUserPresence);
    this.client.off("User.lastPresenceTs", this.handleUserPresence);
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", this.handleAppResume);
      window.removeEventListener("pageshow", this.handleAppResume);
      document.removeEventListener("visibilitychange", this.handleAppResume);
      if (this.syncWatchdogId !== null) {
        window.clearInterval(this.syncWatchdogId);
        this.syncWatchdogId = null;
      }
    }
    if (this.syncStarted) {
      this.client.stopClient();
    }
    this.handlers = null;
    this.started = false;
    this.syncStarted = false;
  }

  async logout() {
    this.stop();
    await this.client.logout();
  }

  rooms(): MatrixRoomSummary[] {
    return normalizeMatrixRoomsWithEncryption(this.client.getRooms(), {
      cryptoStatus: this.cryptoStatus,
      recoveryStatus: this.recoveryStatus,
    }, this.mediaHttpUrl, this.client.getUserId(), directPeerIdsByRoom(this.client));
  }

  timeline(roomId: string): MatrixMessage[] {
    const room = this.client.getRooms().find((candidate) => candidate.roomId === roomId);
    return room
      ? normalizeMatrixTimeline(
          room,
          this.client.getUserId(),
          this.mediaHttpUrl,
          this.session.accessToken,
        )
      : [];
  }

  async sendTextMessage(roomId: string, text: string, txnId?: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const room = this.roomById(roomId);
    if (room && !canSendToRoom(room, {
      cryptoStatus: this.cryptoStatus,
      recoveryStatus: this.recoveryStatus,
    })) {
      throw new Error("Шифрование в этом браузере ещё не готово");
    }
    await this.client.sendTextMessage(roomId, trimmed, txnId);
    this.emitTimelines();
    this.emitRooms();
  }

  async sendReplyMessage(roomId: string, text: string, replyToEventId: string, txnId?: string) {
    const trimmed = text.trim();
    if (!trimmed || !replyToEventId) {
      return;
    }
    const room = this.roomById(roomId);
    if (room && !canSendToRoom(room, {
      cryptoStatus: this.cryptoStatus,
      recoveryStatus: this.recoveryStatus,
    })) {
      throw new Error("Шифрование в этом браузере ещё не готово");
    }
    await this.client.sendEvent(
      roomId,
      matrixTextEventType,
      {
        body: trimmed,
        msgtype: matrixTextMessageType,
        "m.relates_to": {
          "m.in_reply_to": {
            event_id: replyToEventId,
          },
        },
      },
      txnId,
    );
    this.emitTimelines();
    this.emitRooms();
  }

  async sendReaction(roomId: string, eventId: string, key: "heart" | "laugh" | "ok") {
    if (!roomId || !eventId || eventId.startsWith("local-") || eventId.startsWith("~")) {
      return false;
    }
    await this.client.sendEvent(roomId, matrixReactionEventType, {
      "m.relates_to": {
        event_id: eventId,
        key,
        rel_type: "m.annotation",
      },
    });
    this.emitTimelines();
    return true;
  }

  async redactReaction(roomId: string, eventId: string) {
    return this.redactMessage(roomId, eventId);
  }

  async setPinnedMessage(roomId: string, eventId: string, pinned: boolean) {
    if (!roomId || !eventId || eventId.startsWith("local-") || eventId.startsWith("~")) {
      return false;
    }
    await this.client.sendEvent(roomId, familychatPinEventType, {
      pinned,
      targetEventId: eventId,
    });
    this.emitTimelines();
    return true;
  }

  async editTextMessage(roomId: string, eventId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed || !eventId) {
      return;
    }
    const room = this.roomById(roomId);
    if (room && !canSendToRoom(room, {
      cryptoStatus: this.cryptoStatus,
      recoveryStatus: this.recoveryStatus,
    })) {
      throw new Error("Шифрование в этом браузере ещё не готово");
    }
    await this.client.sendEvent(
      roomId,
      matrixTextEventType,
      {
        body: `* ${trimmed}`,
        msgtype: matrixTextMessageType,
        "m.new_content": {
          body: trimmed,
          msgtype: matrixTextMessageType,
        },
        "m.relates_to": {
          event_id: eventId,
          rel_type: "m.replace",
        },
      },
      `familychat-edit-${Date.now()}`,
    );
  }

  async redactMessage(roomId: string, eventId: string) {
    if (!roomId || !eventId || eventId.startsWith("local-") || eventId.startsWith("~")) {
      return false;
    }
    if (!this.client.redactEvent) {
      throw new Error("Matrix redaction is not available");
    }
    await this.client.redactEvent(
      roomId,
      eventId,
      `familychat-redact-${Date.now()}`,
      { reason: "Deleted from FamilyChat" },
    );
    this.emitRooms();
    this.emitTimelines();
    return true;
  }

  async removeAlbumItems(roomId: string, eventId: string, albumKeys: string[]) {
    const keys = albumKeys.filter((key) => key.trim().length > 0);
    if (!roomId || !eventId || keys.length === 0) {
      return false;
    }
    await this.client.sendEvent(
      roomId,
      familychatAlbumUpdateEventType,
      {
        removeAlbumKeys: keys,
        targetEventId: eventId,
      },
      `familychat-album-update-${Date.now()}`,
    );
    this.emitTimelines();
    return true;
  }

  async markRoomRead(roomId: string) {
    const room = this.roomById(roomId);
    if (!room) {
      return false;
    }
    const latestMessageEvent = [...timelineEvents(room)]
      .reverse()
      .find(isReadableTimelineEvent);
    const eventId = latestMessageEvent?.getId?.();
    if (!latestMessageEvent || !eventId || eventId.startsWith("~") || eventId.startsWith("local-")) {
      return false;
    }
    try {
      if (this.client.setRoomReadMarkers) {
        await this.client.setRoomReadMarkers(roomId, eventId, latestMessageEvent);
      } else {
        await this.client.sendReadReceipt?.(latestMessageEvent);
      }
      this.emitRooms();
      this.emitTimelines();
      return true;
    } catch {
      return false;
    }
  }

  async leaveRoom(roomId: string) {
    if (!roomId || !this.client.leave) {
      return false;
    }
    await this.client.leave(roomId);
    await this.client.forget?.(roomId, true).catch(() => undefined);
    this.emitRooms();
    return true;
  }

  async sendCallSignal(
    roomId: string,
    eventType: MatrixCallEventType,
    content: MatrixCallSignalContent,
  ) {
    if (!matrixCallEventTypes.has(eventType)) {
      throw new Error("Unsupported call signal");
    }
    await this.client.sendEvent(roomId, eventType, content as unknown as Record<string, unknown>);
    if (eventType === "com.familychat.call.invite") {
      await this.client.sendEvent(
        roomId,
        matrixTextEventType,
        {
          body: content.mode === "video" ? "Входящий видеозвонок" : "Входящий аудиозвонок",
          msgtype: matrixTextMessageType,
          "org.familychat.call.invite": true,
          "org.matrix.msc1767.text": content.mode === "video" ? "Входящий видеозвонок" : "Входящий аудиозвонок",
          callId: content.callId,
          expiresAt: content.expiresAt,
          highlight: true,
          mode: content.mode,
          timestamp: content.timestamp,
        },
        `familychat-call-push-${Date.now()}`,
      );
    }
    this.emitTimelines();
  }

  private async uploadMediaEventContent(
    file: File,
    encryptedRoom: boolean,
    options: {
      caption?: string;
      durationMs?: number;
      isVideoNote?: boolean;
      isVoice?: boolean;
      onProgress?: (progress: number) => void;
    } = {},
  ): Promise<MatrixMediaEventContent> {
    const progressHandler = (progress: MatrixUploadProgress) => {
      if (progress.total > 0) {
        options.onProgress?.(Math.min(100, Math.round((progress.loaded / progress.total) * 100)));
      }
    };

    if (encryptedRoom) {
      const encryptedAttachment = await encryptMatrixAttachment(file);
      const encryptedArrayBuffer = new ArrayBuffer(encryptedAttachment.encryptedBytes.byteLength);
      new Uint8Array(encryptedArrayBuffer).set(encryptedAttachment.encryptedBytes);
      const encryptedUploadBody = new Blob([encryptedArrayBuffer], {
        type: "application/octet-stream",
      });
      const upload = await this.client.uploadContent(encryptedUploadBody, {
        includeFilename: false,
        progressHandler,
        type: "application/octet-stream",
      });
      return buildMatrixMediaEventContent({
        caption: options.caption,
        durationMs: options.durationMs,
        encryptedFile: {
          ...encryptedAttachment.encryptedFile,
          url: upload.content_uri,
        },
        file,
        isVideoNote: options.isVideoNote,
        isVoice: options.isVoice,
      });
    }

    const upload = await this.client.uploadContent(file, {
      name: safeMatrixMediaName(file.name),
      progressHandler,
      type: file.type || "application/octet-stream",
    });
    return buildMatrixMediaEventContent({
      caption: options.caption,
      durationMs: options.durationMs,
      file,
      isVideoNote: options.isVideoNote,
      isVoice: options.isVoice,
      url: upload.content_uri,
    });
  }

  async sendMediaMessage(
    roomId: string,
    file: File,
    options: {
      caption?: string;
      durationMs?: number;
      isVideoNote?: boolean;
      isVoice?: boolean;
      onUploaded?: () => void;
      onProgress?: (progress: number) => void;
    } = {},
  ) {
    const validation = validateMatrixMediaFile(file);
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const room = this.roomById(roomId);
    const encryptedRoom = Boolean(room && roomHasEncryptionState(room));
    if (room && !canSendToRoom(room, {
      cryptoStatus: this.cryptoStatus,
      recoveryStatus: this.recoveryStatus,
    })) {
      throw new Error("Шифрование в этом браузере ещё не готово");
    }

    const content = await this.uploadMediaEventContent(file, encryptedRoom, {
      caption: options.caption,
      durationMs: options.durationMs,
      isVideoNote: options.isVideoNote,
      isVoice: options.isVoice,
      onProgress: options.onProgress,
    });
    options.onUploaded?.();
    await this.client.sendEvent(roomId, matrixTextEventType, content, `familychat-media-${Date.now()}`);
  }

  async sendMediaAlbumMessage(
    roomId: string,
    files: File[],
    options: {
      caption?: string;
      onUploaded?: () => void;
      onProgress?: (progress: number) => void;
    } = {},
  ) {
    if (files.length < 2) {
      throw new Error("Album requires at least two images");
    }
    for (const file of files) {
      const validation = validateMatrixMediaFile(file);
      if (!validation.ok) {
        throw new Error(validation.message);
      }
      if (matrixMediaKindForFile(file) !== "image") {
        throw new Error("Альбом можно отправить только из фотографий.");
      }
    }

    const room = this.roomById(roomId);
    const encryptedRoom = Boolean(room && roomHasEncryptionState(room));
    if (room && !canSendToRoom(room, {
      cryptoStatus: this.cryptoStatus,
      recoveryStatus: this.recoveryStatus,
    })) {
      throw new Error("Шифрование в этом браузере ещё не готово");
    }

    const items: MatrixMediaEventContent[] = [];
    for (const [index, file] of files.entries()) {
      const item = await this.uploadMediaEventContent(file, encryptedRoom, {
        onProgress: (progress) => {
          options.onProgress?.(Math.round(((index + progress / 100) / files.length) * 100));
        },
      });
      items.push(item);
    }

    const first = items[0];
    const content: MatrixMediaEventContent = {
      ...first,
      body: options.caption?.trim() || `Фото (${items.length})`,
      "org.familychat.album": { items },
    };
    options.onUploaded?.();
    await this.client.sendEvent(roomId, matrixTextEventType, content, `familychat-album-${Date.now()}`);
  }

  async createDirectRoom(invitee: MatrixFamilyInvitee): Promise<string> {
    const existingRoom = this.client
      .getRooms()
      .find((room) =>
        roomLooksLikeDirectChat(room, this.client.getUserId(), invitee.matrixUserId) &&
        !roomHasEncryptionState(room),
      );
    if (existingRoom) {
      return existingRoom.roomId;
    }

    const response = await this.client.createRoom({
      invite: [invitee.matrixUserId],
      is_direct: true,
      name: invitee.displayName.trim() || "Семейный чат",
      preset: "private_chat",
      visibility: "private",
    });
    this.emitRooms();
    return createdRoomId(response);
  }

  async createGroupRoom(invitees: MatrixFamilyInvitee[], name: string): Promise<string> {
    const uniqueInvitees = uniqueMatrixInvitees(invitees);
    if (uniqueInvitees.length < 2) {
      throw new Error("Нужно выбрать минимум двух участников семьи");
    }

    const response = await this.client.createRoom({
      invite: uniqueInvitees.map((invitee) => invitee.matrixUserId),
      name: safeCreatedRoomName(name),
      preset: "private_chat",
      visibility: "private",
    });
    this.emitRooms();
    return createdRoomId(response);
  }

  async inviteUsersToRoom(roomId: string, invitees: MatrixFamilyInvitee[]) {
    if (!roomId || !this.client.invite) {
      return false;
    }
    const uniqueInvitees = uniqueMatrixInvitees(invitees);
    if (uniqueInvitees.length === 0) {
      return false;
    }
    await Promise.all(uniqueInvitees.map((invitee) => this.client.invite?.(roomId, invitee.matrixUserId)));
    this.emitRooms();
    return true;
  }

  openJoinedFamilyRoom(): string | null {
    const existingRoom = this.client
      .getRooms()
      .find((room) => ["Family Chat", "Семейный чат"].includes(safeRoomName(room)));
    if (existingRoom) {
      return existingRoom.roomId;
    }
    return null;
  }

  private emitRooms() {
    this.handlers?.onRooms(this.rooms());
  }

  private emitPeerPresences() {
    if (!this.client.getUser) {
      return;
    }
    for (const room of this.rooms()) {
      if (!room.peerMatrixUserId) {
        continue;
      }
      const snapshot = this.presenceSnapshotForUser(room.peerMatrixUserId);
      if (snapshot) {
        this.handlers?.onPresence?.(snapshot);
      }
    }
  }

  private presenceSnapshotForUser(userId: string) {
    const user = this.client.getUser?.(userId);
    return matrixPresenceFromUser(user, userId);
  }

  private setOnlinePresence() {
    void this.client.setPresence?.({ presence: "online" }).catch(() => undefined);
  }

  private emitTimelines() {
    for (const room of this.client.getRooms()) {
      const membership = room.getMyMembership?.();
      if (membership && membership !== "join") {
        continue;
      }
      this.emitCallEvents(room);
      this.handlers?.onTimeline(
        room.roomId,
        normalizeMatrixTimeline(
          room,
          this.client.getUserId(),
          this.mediaHttpUrl,
          this.session.accessToken,
        ),
      );
    }
  }

  private emitCallEvents(room: MatrixSdkRoom) {
    for (const event of timelineEvents(room)) {
      this.emitCallEvent(room.roomId, event);
    }
  }

  private emitCallEvent(roomId: string, event: MatrixSdkEvent) {
    const callEvent = callEventFromMatrixEvent(roomId, event);
    if (!callEvent) {
      return;
    }
    const key = `${callEvent.roomId}:${callEvent.type}:${callEvent.callId}:${callEvent.timestamp}`;
    if (this.emittedCallEventKeys.has(key)) {
      return;
    }
    this.emittedCallEventKeys.add(key);
    this.handlers?.onCallEvent?.(callEvent);
  }

  private async joinInvitedRooms() {
    if (!this.started || !this.client.joinRoom) {
      return;
    }

    const invitedRooms = this.client
      .getRooms()
      .filter((room) => room.getMyMembership?.() === "invite");

    await Promise.all(
      invitedRooms.map(async (room) => {
        if (this.joiningInviteRoomIds.has(room.roomId)) {
          return;
        }
        this.joiningInviteRoomIds.add(room.roomId);
        try {
          await this.client.joinRoom?.(room.roomId);
          this.emitRooms();
          this.emitTimelines();
        } catch {
          // Keep invite failures local and generic; the UI should not expose Matrix internals.
        } finally {
          this.joiningInviteRoomIds.delete(room.roomId);
        }
      }),
    );
  }

  private refreshSyncAfterResume() {
    this.client.retryImmediately?.();
    window.setTimeout(() => {
      if (!this.started) {
        return;
      }
      this.emitRooms();
      this.emitTimelines();
    }, 1200);
    this.refreshSyncIfStale(30000);
  }

  private refreshSyncIfStale(staleAfterMs = 60000) {
    if (!this.started || typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    const now = Date.now();
    if (now - this.lastSyncAt < staleAfterMs) {
      return;
    }
    this.handlers?.onStatus("reconnecting");
    this.client.retryImmediately?.();
    if (!this.syncStarted || now - this.lastSyncRestartAt < 60000) {
      return;
    }
    this.lastSyncRestartAt = now;
    try {
      this.client.stopClient();
      this.client.startClient({ initialSyncLimit });
      this.lastSyncAt = now;
    } catch {
      this.handlers?.onStatus("disconnected");
    }
  }

  private readonly mediaHttpUrl = (
    mxcUrl: string,
    useAuthentication = false,
  ): string | undefined => {
    const httpUrl =
      this.client.mxcUrlToHttp?.(
        mxcUrl,
        undefined,
        undefined,
        undefined,
        false,
        true,
        useAuthentication,
      ) ?? null;
    return httpUrl || undefined;
  };

  private async initializeCrypto() {
    this.cryptoStatus = "initializing";
    this.recoveryStatus = "unknown";
    this.emitRooms();

    if (typeof window === "undefined" || !this.session.deviceId || !this.client.initRustCrypto) {
      this.cryptoStatus = "unavailable";
      this.recoveryStatus = "needed";
      this.emitRooms();
      return;
    }

    const cryptoDatabasePrefix = matrixCryptoDatabasePrefixForSession(this.session);

    try {
      const crypto = await this.initializeCryptoStore(cryptoDatabasePrefix);
      await this.markCryptoReady(crypto);
    } catch (error) {
      if (isCryptoStoreAccountMismatch(error)) {
        try {
          await deleteIndexedDb(cryptoDatabasePrefix);
          const crypto = await this.initializeCryptoStore(cryptoDatabasePrefix);
          await this.markCryptoReady(crypto);
          return;
        } catch {
          // Fall through to the generic unavailable state below.
        }
      }
      this.cryptoStatus = "unavailable";
      this.recoveryStatus = "needed";
      this.emitRooms();
    }
  }

  private async initializeCryptoStore(cryptoDatabasePrefix: string): Promise<MatrixSdkCryptoApi> {
    await this.client.initRustCrypto?.({
      cryptoDatabasePrefix,
      useIndexedDB: true,
    });
    const crypto = this.client.getCrypto?.();
    if (!crypto) {
      throw new Error("Matrix crypto API unavailable after initialization");
    }
    await crypto.getOwnDeviceKeys();
    return crypto;
  }

  private async markCryptoReady(crypto: MatrixSdkCryptoApi) {
    this.cryptoStatus = "ready";
    this.recoveryStatus = await this.detectRecoveryStatus(crypto);
    this.emitRooms();
  }

  private async detectRecoveryStatus(crypto: MatrixSdkCryptoApi): Promise<MatrixRecoveryStatus> {
    try {
      const [crossSigningReady, secretStorageReady] = await Promise.all([
        crypto.isCrossSigningReady(),
        crypto.isSecretStorageReady(),
      ]);
      return crossSigningReady && secretStorageReady ? "ready" : "needed";
    } catch {
      return "needed";
    }
  }

  private roomById(roomId: string): MatrixSdkRoom | null {
    return this.client.getRooms().find((candidate) => candidate.roomId === roomId) ?? null;
  }
}

function uniqueMatrixInvitees(invitees: MatrixFamilyInvitee[]): MatrixFamilyInvitee[] {
  const seen = new Set<string>();
  return invitees.filter((invitee) => {
    const matrixUserId = invitee.matrixUserId.trim();
    if (!matrixUserId || seen.has(matrixUserId)) {
      return false;
    }
    seen.add(matrixUserId);
    return true;
  });
}

function safeCreatedRoomName(name: string): string {
  const trimmed = name.trim().slice(0, 80);
  return trimmed || "Семейная группа";
}

let activeMatrixClient: FamilyMatrixClient | null = null;

export function createFamilyMatrixClient(session: MatrixSession) {
  activeMatrixClient?.stop();
  activeMatrixClient = new FamilyMatrixClient(session);
  return activeMatrixClient;
}

export async function endActiveMatrixSession(options: { logout?: boolean } = {}) {
  const client = activeMatrixClient;
  activeMatrixClient = null;

  if (!client) {
    return;
  }

  try {
    if (options.logout) {
      await client.logout();
    } else {
      client.stop();
    }
  } catch {
    client.stop();
  }
}

export type MatrixPusherRegistration = {
  appId: string;
  gatewayUrl: string;
  pushKey: string;
};

export async function registerMatrixWebPusher(
  session: MatrixSession,
  pusher: MatrixPusherRegistration,
) {
  const client = asMatrixClient(
    createClient({
      accessToken: session.accessToken,
      baseUrl: session.baseUrl || matrixBaseUrl,
      deviceId: session.deviceId,
      userId: session.userId,
    }),
  );
  if (!client.setPusher) {
    throw new Error("Matrix pusher registration is unavailable");
  }
  await client.setPusher({
    app_display_name: "FamilyChat",
    app_id: pusher.appId,
    append: false,
    data: {
      brand: "FamilyChat",
      url: pusher.gatewayUrl,
    },
    device_display_name: "FamilyChat Web",
    kind: "http",
    lang: "ru",
    pushkey: pusher.pushKey,
  });
}

export async function removeMatrixWebPusher(
  session: MatrixSession,
  pusher: MatrixPusherRegistration,
) {
  const client = asMatrixClient(
    createClient({
      accessToken: session.accessToken,
      baseUrl: session.baseUrl || matrixBaseUrl,
      deviceId: session.deviceId,
      userId: session.userId,
    }),
  );
  if (!client.removePusher) {
    return;
  }
  await client.removePusher(pusher.pushKey, pusher.appId);
}
