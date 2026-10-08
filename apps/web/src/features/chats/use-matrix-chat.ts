"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createFamilyMatrixClient,
  endActiveMatrixSession,
  type FamilyMatrixClient,
  type MatrixFamilyInvitee,
} from "@/features/matrix/matrix-client";
import { isCommonFamilyRoom } from "@/features/matrix/room-kind";
import {
  matrixMediaKindForFile,
  safeMatrixMediaName,
  validateMatrixMediaFile,
} from "@/features/matrix/media";
import { matrixSessionStorage } from "@/features/matrix/session-storage";
import type {
  MatrixCallEvent,
  MatrixCallEventType,
  MatrixCallSignalContent,
  MatrixConnectionStatus,
  MatrixMessage,
  MatrixRoomSummary,
  MatrixUserPresence,
} from "@/features/matrix/types";

type LocalMessages = Record<string, MatrixMessage[]>;
type TimelineMessages = Record<string, MatrixMessage[]>;
type SendMediaMetadata = {
  durationMs?: number;
  isVideoNote?: boolean;
  isVoice?: boolean;
};

function defer(callback: () => void) {
  if (typeof window !== "undefined" && "queueMicrotask" in window) {
    window.queueMicrotask(callback);
    return;
  }
  void Promise.resolve().then(callback);
}

function withSendTimeout<T>(promise: Promise<T>, timeoutMs = 20_000) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error("matrix_send_timeout")), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function appendLocalMessage(messages: LocalMessages, roomId: string, message: MatrixMessage) {
  return {
    ...messages,
    [roomId]: [...(messages[roomId] ?? []), message],
  };
}

function updateLocalMessageStatus(
  messages: LocalMessages,
  roomId: string,
  messageId: string,
  status: MatrixMessage["status"],
) {
  return {
    ...messages,
    [roomId]: (messages[roomId] ?? []).map((message) =>
      message.id === messageId ? { ...message, status } : message,
    ),
  };
}

function retryLocalTextMessage(messages: LocalMessages, roomId: string, messageId: string) {
  return {
    ...messages,
    [roomId]: (messages[roomId] ?? []).map((message) =>
      message.id === messageId
        ? { ...message, status: "sending" as const, timestamp: Date.now() }
        : message,
    ),
  };
}

function updateLocalMessage(
  messages: LocalMessages,
  roomId: string,
  messageId: string,
  updates: Partial<MatrixMessage>,
) {
  return {
    ...messages,
    [roomId]: (messages[roomId] ?? []).map((message) =>
      message.id === messageId ? { ...message, ...updates } : message,
    ),
  };
}

function removeLocalMessage(messages: LocalMessages, roomId: string, messageId: string) {
  return {
    ...messages,
    [roomId]: (messages[roomId] ?? []).filter((message) => message.id !== messageId),
  };
}

function hasMatchingTimelineEcho(localMessage: MatrixMessage, timelineMessages: MatrixMessage[]) {
  if (localMessage.status === "failed") {
    return false;
  }
  return timelineMessages.some((timelineMessage) => {
    if (!timelineMessage.isOwn || timelineMessage.status !== "sent") {
      return false;
    }
    if (localMessage.media) {
      if (localMessage.mediaItems && localMessage.mediaItems.length > 1) {
        return (
          timelineMessage.mediaItems?.length === localMessage.mediaItems.length &&
          timelineMessage.media?.kind === localMessage.media.kind &&
          timelineMessage.media.name === localMessage.media.name
        );
      }
      return (
        timelineMessage.media?.kind === localMessage.media.kind &&
        timelineMessage.media.name === localMessage.media.name &&
        timelineMessage.media.isVoice === localMessage.media.isVoice
      );
    }
    return timelineMessage.body === localMessage.body;
  });
}

export function useMatrixChat() {
  const clientRef = useRef<FamilyMatrixClient | null>(null);
  const mountedRef = useRef(false);
  const localObjectUrlsRef = useRef(new Set<string>());
  const pendingRetryIdsRef = useRef(new Set<string>());
  const [status, setStatus] = useState<MatrixConnectionStatus>("restoring");
  const [rooms, setRooms] = useState<MatrixRoomSummary[]>([]);
  const [timelines, setTimelines] = useState<TimelineMessages>({});
  const [localMessages, setLocalMessages] = useState<LocalMessages>({});
  const [callEvents, setCallEvents] = useState<MatrixCallEvent[]>([]);
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, MatrixUserPresence>>({});
  const [presenceTick, setPresenceTick] = useState(0);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [currentMatrixUserId, setCurrentMatrixUserId] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const session = matrixSessionStorage.read();

    if (!session) {
      defer(() => {
        if (mountedRef.current) {
          setRestoreFailed(true);
          setStatus("error");
        }
      });
      return () => {
        mountedRef.current = false;
      };
    }

    defer(() => {
      if (mountedRef.current) {
        setCurrentMatrixUserId(session.userId);
        setStatus("syncing");
      }
    });
    const client = createFamilyMatrixClient(session);
    clientRef.current = client;
    const localObjectUrls = localObjectUrlsRef.current;

    void client
      .start({
        onCallEvent: (event) => {
          if (mountedRef.current) {
            setCallEvents((current) => [...current.slice(-9), event]);
          }
        },
        onPresence: (presence) => {
          if (mountedRef.current) {
            setPresenceByUserId((current) => ({ ...current, [presence.userId]: presence }));
          }
        },
        onRooms: (nextRooms) => {
          if (mountedRef.current) {
            setRooms(nextRooms);
          }
        },
        onStatus: (nextStatus) => {
          if (mountedRef.current) {
            setStatus(nextStatus);
          }
        },
        onTimeline: (roomId, messages) => {
          if (mountedRef.current) {
            setTimelines((current) => ({ ...current, [roomId]: messages }));
          }
        },
      })
      .catch(() => {
        if (mountedRef.current) {
          setStatus("error");
        }
      });

    return () => {
      mountedRef.current = false;
      client.stop();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
      for (const objectUrl of localObjectUrls) {
        window.URL.revokeObjectURL(objectUrl);
      }
      localObjectUrls.clear();
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPresenceTick((current) => current + 1);
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const messagesForRoom = useCallback(
    (roomId: string) => {
      const timelineMessages = timelines[roomId] ?? [];
      const visibleLocalMessages = (localMessages[roomId] ?? []).filter(
        (message) => !hasMatchingTimelineEcho(message, timelineMessages),
      );
      return [...timelineMessages, ...visibleLocalMessages].sort(
        (a, b) => a.timestamp - b.timestamp,
      );
    },
    [localMessages, timelines],
  );

  const sendTextMessage = useCallback(async (roomId: string, text: string, retryMessageId?: string) => {
    const trimmed = text.trim();
    const client = clientRef.current;

    if (!trimmed || !client) {
      return false;
    }
    if (retryMessageId && pendingRetryIdsRef.current.has(retryMessageId)) {
      return false;
    }

    const localId = retryMessageId ?? `local-${Date.now()}`;
    const startedAt = Date.now();
    if (retryMessageId) {
      pendingRetryIdsRef.current.add(retryMessageId);
      setLocalMessages((current) => retryLocalTextMessage(current, roomId, retryMessageId));
    } else {
      setLocalMessages((current) =>
        appendLocalMessage(current, roomId, {
          authorName: "Вы",
          body: trimmed,
          id: localId,
          isOwn: true,
          roomId,
          status: "sending",
          timestamp: startedAt,
        }),
      );
    }

    try {
      const room = rooms.find((candidate) => candidate.id === roomId);
      if (room && !room.canSendMessages) {
        throw new Error("Encrypted chat is not ready on this browser");
      }
      await withSendTimeout(client.sendTextMessage(roomId, trimmed, `familychat-text-${startedAt}`));
      if (mountedRef.current) {
        setLocalMessages((current) => updateLocalMessageStatus(current, roomId, localId, "sent"));
      }
      if (retryMessageId) {
        pendingRetryIdsRef.current.delete(retryMessageId);
      }
      return true;
    } catch {
      if (!mountedRef.current) {
        return false;
      }
      setLocalMessages((current) => updateLocalMessageStatus(current, roomId, localId, "failed"));
      if (retryMessageId) {
        pendingRetryIdsRef.current.delete(retryMessageId);
      }
      return false;
    }
  }, [rooms]);

  const editTextMessage = useCallback(async (roomId: string, eventId: string, text: string) => {
    const trimmed = text.trim();
    const client = clientRef.current;
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (!trimmed || !client || !room?.canSendMessages) {
      return false;
    }
    try {
      await client.editTextMessage(roomId, eventId, trimmed);
      return true;
    } catch {
      return false;
    }
  }, [rooms]);

  const sendReplyMessage = useCallback(async (roomId: string, text: string, replyTo: MatrixMessage) => {
    const trimmed = text.trim();
    const client = clientRef.current;
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (!trimmed || !client || !room?.canSendMessages || replyTo.id.startsWith("local-") || replyTo.id.startsWith("~")) {
      return false;
    }
    const localId = `local-reply-${Date.now()}`;
    const startedAt = Date.now();
    setLocalMessages((current) =>
      appendLocalMessage(current, roomId, {
        authorName: "Вы",
        body: trimmed,
        id: localId,
        isOwn: true,
        replyTo: {
          authorName: replyTo.authorName,
          body: replyTo.body,
          eventId: replyTo.id,
        },
        roomId,
        status: "sending",
        timestamp: startedAt,
      }),
    );
    try {
      await withSendTimeout(client.sendReplyMessage(roomId, trimmed, replyTo.id, `familychat-reply-${startedAt}`));
      if (mountedRef.current) {
        setLocalMessages((current) => updateLocalMessageStatus(current, roomId, localId, "sent"));
      }
      return true;
    } catch {
      if (mountedRef.current) {
        setLocalMessages((current) => updateLocalMessageStatus(current, roomId, localId, "failed"));
      }
      return false;
    }
  }, [rooms]);

  const editLocalMessage = useCallback((message: MatrixMessage, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }
    setLocalMessages((current) =>
      updateLocalMessage(current, message.roomId, message.id, {
        body: trimmed,
        edited: true,
      }),
    );
    return true;
  }, []);

  const deleteMessageForEveryone = useCallback(async (roomId: string, eventId: string) => {
    const client = clientRef.current;
    if (!client) {
      return false;
    }
    try {
      return await client.redactMessage(roomId, eventId);
    } catch {
      return false;
    }
  }, []);

  const toggleReaction = useCallback(async (message: MatrixMessage, key: "heart" | "laugh" | "ok") => {
    const client = clientRef.current;
    if (!client || message.id.startsWith("local-") || message.id.startsWith("~")) {
      return false;
    }
    try {
      const ownReaction = message.reactions?.find((reaction) => reaction.key === key && reaction.ownEventId);
      if (ownReaction?.ownEventId) {
        return await client.redactReaction(message.roomId, ownReaction.ownEventId);
      }
      return await client.sendReaction(message.roomId, message.id, key);
    } catch {
      return false;
    }
  }, []);

  const setPinnedMessage = useCallback(async (message: MatrixMessage, pinned: boolean) => {
    const client = clientRef.current;
    if (!client || message.id.startsWith("local-") || message.id.startsWith("~")) {
      return false;
    }
    try {
      return await client.setPinnedMessage(message.roomId, message.id, pinned);
    } catch {
      return false;
    }
  }, []);

  const removeAlbumItemsForEveryone = useCallback(async (
    roomId: string,
    eventId: string,
    albumKeys: string[],
  ) => {
    const client = clientRef.current;
    if (!client || albumKeys.length === 0) {
      return false;
    }
    try {
      return await client.removeAlbumItems(roomId, eventId, albumKeys);
    } catch {
      return false;
    }
  }, []);

  const leaveRoom = useCallback(async (roomId: string) => {
    const client = clientRef.current;
    if (!client) {
      return false;
    }
    try {
      const ok = await client.leaveRoom(roomId);
      if (ok && mountedRef.current) {
        setRooms((current) => current.filter((room) => room.id !== roomId));
        setTimelines((current) => {
          const next = { ...current };
          delete next[roomId];
          return next;
        });
        setLocalMessages((current) => {
          const next = { ...current };
          delete next[roomId];
          return next;
        });
      }
      return ok;
    } catch {
      return false;
    }
  }, []);

  const sendCallSignal = useCallback(async (
    roomId: string,
    eventType: MatrixCallEventType,
    content: MatrixCallSignalContent,
  ) => {
    const client = clientRef.current;
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (!client || !room || isCommonFamilyRoom(room)) {
      return false;
    }
    try {
      await client.sendCallSignal(roomId, eventType, content);
      return true;
    } catch {
      return false;
    }
  }, [rooms]);

  const revokeLocalObjectUrl = useCallback((objectUrl?: string) => {
    if (!objectUrl) {
      return;
    }
    window.URL.revokeObjectURL(objectUrl);
    localObjectUrlsRef.current.delete(objectUrl);
  }, []);

  const localPreviewObjectUrl = useCallback((file: File, forceAudioPreview = false) => {
    const kind = matrixMediaKindForFile(file);
    if (kind !== "image" && kind !== "video" && !(forceAudioPreview && kind === "audio")) {
      return undefined;
    }
    const objectUrl = window.URL.createObjectURL(file);
    localObjectUrlsRef.current.add(objectUrl);
    return objectUrl;
  }, []);

  const sendMediaMessage = useCallback(async (
    roomId: string,
    file: File,
    caption?: string,
    retryMessageId?: string,
    metadata: SendMediaMetadata = {},
  ) => {
    const client = clientRef.current;
    const validation = validateMatrixMediaFile(file);

    if (!client || !validation.ok) {
      return false;
    }
    if (retryMessageId && pendingRetryIdsRef.current.has(retryMessageId)) {
      return false;
    }

    const room = rooms.find((candidate) => candidate.id === roomId);
    const name = safeMatrixMediaName(file.name);
    const trimmedCaption = caption?.trim();
    const existingMessage = retryMessageId
      ? localMessages[roomId]?.find((message) => message.id === retryMessageId)
      : undefined;
    const effectiveCaption = trimmedCaption || existingMessage?.localCaption;
    const isVoice = metadata.isVoice ?? existingMessage?.media?.isVoice ?? false;
    const isVideoNote = metadata.isVideoNote ?? existingMessage?.media?.isVideoNote ?? false;
    const durationMs = metadata.durationMs ?? existingMessage?.media?.duration;
    const objectUrl = existingMessage?.media?.objectUrl ?? localPreviewObjectUrl(file, isVoice);
    const localId = retryMessageId ?? `local-media-${Date.now()}`;
    const kind = matrixMediaKindForFile(file);
    const messageBody =
      effectiveCaption ||
      (isVoice && kind === "audio" ? "Голосовое сообщение" : isVideoNote && kind === "video" ? "Кружок" : name);

    if (retryMessageId) {
      pendingRetryIdsRef.current.add(retryMessageId);
      setLocalMessages((current) =>
        updateLocalMessage(current, roomId, localId, {
          status: "uploading",
          uploadProgress: 0,
        }),
      );
    } else {
      setLocalMessages((current) =>
        appendLocalMessage(current, roomId, {
          authorName: "Вы",
          body: messageBody,
          id: localId,
          isOwn: true,
          localCaption: effectiveCaption,
          localFile: file,
          media: {
            duration: durationMs,
            encrypted: room?.encryptionState !== "not_encrypted",
            isVideoNote,
            isVoice,
            kind,
            mimetype: file.type || undefined,
            name,
            objectUrl,
            size: file.size,
          },
          roomId,
          status: "uploading",
          timestamp: Date.now(),
          uploadProgress: 0,
        }),
      );
    }

    try {
      if (room && !room.canSendMessages) {
        throw new Error("Encrypted chat is not ready on this browser");
      }
      await client.sendMediaMessage(roomId, file, {
        caption: effectiveCaption,
        durationMs,
        isVideoNote,
        isVoice,
        onProgress: (uploadProgress) => {
          if (mountedRef.current) {
            setLocalMessages((current) =>
              updateLocalMessage(current, roomId, localId, { uploadProgress }),
            );
          }
        },
        onUploaded: () => {
          if (mountedRef.current) {
            setLocalMessages((current) =>
              updateLocalMessageStatus(current, roomId, localId, "sending"),
            );
          }
        },
      });
      if (!mountedRef.current) {
        revokeLocalObjectUrl(objectUrl);
        return true;
      }
      setLocalMessages((current) => removeLocalMessage(current, roomId, localId));
      revokeLocalObjectUrl(objectUrl);
      return true;
    } catch {
      if (!mountedRef.current) {
        revokeLocalObjectUrl(objectUrl);
        return false;
      }
      setLocalMessages((current) =>
        updateLocalMessageStatus(current, roomId, localId, "failed"),
      );
      return false;
    } finally {
      if (retryMessageId) {
        pendingRetryIdsRef.current.delete(retryMessageId);
      }
    }
  }, [localMessages, localPreviewObjectUrl, revokeLocalObjectUrl, rooms]);

  const sendMediaAlbumMessage = useCallback(async (
    roomId: string,
    files: File[],
    caption?: string,
    retryMessageId?: string,
  ) => {
    const client = clientRef.current;
    const imageFiles = files.filter((file) => matrixMediaKindForFile(file) === "image");
    if (!client || imageFiles.length < 2 || imageFiles.length !== files.length) {
      return false;
    }
    if (retryMessageId && pendingRetryIdsRef.current.has(retryMessageId)) {
      return false;
    }

    for (const file of imageFiles) {
      const validation = validateMatrixMediaFile(file);
      if (!validation.ok) {
        return false;
      }
    }

    const room = rooms.find((candidate) => candidate.id === roomId);
    const trimmedCaption = caption?.trim();
    const existingMessage = retryMessageId
      ? localMessages[roomId]?.find((message) => message.id === retryMessageId)
      : undefined;
    const effectiveCaption = trimmedCaption || existingMessage?.localCaption;
    const localId = retryMessageId ?? `local-album-${Date.now()}`;
    const objectUrls = existingMessage?.mediaItems
      ?.map((media) => media.objectUrl)
      .filter((objectUrl): objectUrl is string => Boolean(objectUrl)) ??
      imageFiles.map((file) => localPreviewObjectUrl(file)).filter((url): url is string => Boolean(url));
    const firstFile = imageFiles[0];
    const firstName = safeMatrixMediaName(firstFile.name);
    const mediaItems = imageFiles.map((file, index) => ({
      encrypted: room?.encryptionState !== "not_encrypted",
      kind: "image" as const,
      mimetype: file.type || undefined,
      name: safeMatrixMediaName(file.name),
      objectUrl: objectUrls[index],
      size: file.size,
    }));
    const messageBody = effectiveCaption || `Фото (${imageFiles.length})`;

    if (retryMessageId) {
      pendingRetryIdsRef.current.add(retryMessageId);
      setLocalMessages((current) =>
        updateLocalMessage(current, roomId, localId, {
          status: "uploading",
          uploadProgress: 0,
        }),
      );
    } else {
      setLocalMessages((current) =>
        appendLocalMessage(current, roomId, {
          authorName: "Вы",
          body: messageBody,
          id: localId,
          isOwn: true,
          localCaption: effectiveCaption,
          localFiles: imageFiles,
          media: mediaItems[0] ?? {
            encrypted: room?.encryptionState !== "not_encrypted",
            kind: "image",
            name: firstName,
          },
          mediaItems,
          roomId,
          status: "uploading",
          timestamp: Date.now(),
          uploadProgress: 0,
        }),
      );
    }

    try {
      if (room && !room.canSendMessages) {
        throw new Error("Encrypted chat is not ready on this browser");
      }
      await client.sendMediaAlbumMessage(roomId, imageFiles, {
        caption: effectiveCaption,
        onProgress: (uploadProgress) => {
          if (mountedRef.current) {
            setLocalMessages((current) =>
              updateLocalMessage(current, roomId, localId, { uploadProgress }),
            );
          }
        },
        onUploaded: () => {
          if (mountedRef.current) {
            setLocalMessages((current) =>
              updateLocalMessageStatus(current, roomId, localId, "sending"),
            );
          }
        },
      });
      if (!mountedRef.current) {
        objectUrls.forEach(revokeLocalObjectUrl);
        return true;
      }
      setLocalMessages((current) => removeLocalMessage(current, roomId, localId));
      objectUrls.forEach(revokeLocalObjectUrl);
      return true;
    } catch {
      if (!mountedRef.current) {
        objectUrls.forEach(revokeLocalObjectUrl);
        return false;
      }
      setLocalMessages((current) =>
        updateLocalMessageStatus(current, roomId, localId, "failed"),
      );
      return false;
    } finally {
      if (retryMessageId) {
        pendingRetryIdsRef.current.delete(retryMessageId);
      }
    }
  }, [localMessages, localPreviewObjectUrl, revokeLocalObjectUrl, rooms]);

  const sendVoiceMessage = useCallback((
    roomId: string,
    file: File,
    durationMs: number,
    retryMessageId?: string,
  ) => {
    return sendMediaMessage(roomId, file, undefined, retryMessageId, {
      durationMs,
      isVoice: true,
    });
  }, [sendMediaMessage]);

  const sendVideoNoteMessage = useCallback((
    roomId: string,
    file: File,
    durationMs: number,
    retryMessageId?: string,
  ) => {
    return sendMediaMessage(roomId, file, undefined, retryMessageId, {
      durationMs,
      isVideoNote: true,
    });
  }, [sendMediaMessage]);

  const stopMatrixSession = useCallback(async () => {
    await endActiveMatrixSession({ logout: true });
    matrixSessionStorage.clear();
  }, []);

  const markRoomRead = useCallback(async (roomId: string) => {
    return clientRef.current?.markRoomRead(roomId) ?? false;
  }, []);

  const createDirectChat = useCallback(async (invitee: MatrixFamilyInvitee) => {
    const client = clientRef.current;
    if (!client) {
      return null;
    }
    try {
      return await client.createDirectRoom(invitee);
    } catch {
      return null;
    }
  }, []);

  const createGroupChat = useCallback(async (invitees: MatrixFamilyInvitee[], name: string) => {
    const client = clientRef.current;
    if (!client) {
      return null;
    }
    try {
      return await client.createGroupRoom(invitees, name);
    } catch {
      return null;
    }
  }, []);

  const addUsersToRoom = useCallback(async (roomId: string, invitees: MatrixFamilyInvitee[]) => {
    const client = clientRef.current;
    if (!client || invitees.length === 0) {
      return false;
    }
    try {
      return await client.inviteUsersToRoom(roomId, invitees);
    } catch {
      return false;
    }
  }, []);

  const openJoinedFamilyChat = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      return null;
    }
    return client.openJoinedFamilyRoom();
  }, []);

  const isConnected = status === "connected";
  const isLoading = status === "restoring" || status === "syncing";
  const connectionMessage = useMemo(() => {
    if (restoreFailed) {
      return "Не удалось восстановить чаты. Войдите снова.";
    }
    if (status === "restoring" || status === "syncing") {
      return "Восстанавливаем защищённое подключение к чатам.";
    }
    if (status === "reconnecting") {
      return "Переподключаемся к чатам.";
    }
    if (status === "disconnected" || status === "error") {
      return "Чаты временно недоступны.";
    }
    return null;
  }, [restoreFailed, status]);

  return {
    connectionMessage,
    callEvents,
    addUsersToRoom,
    createDirectChat,
    createGroupChat,
    currentMatrixUserId,
    editLocalMessage,
    editTextMessage,
    deleteMessageForEveryone,
    leaveRoom,
    isConnected,
    isLoading,
    markRoomRead,
    messagesForRoom,
    removeAlbumItemsForEveryone,
    openJoinedFamilyChat,
    presenceByUserId,
    presenceTick,
    restoreFailed,
    rooms,
    sendCallSignal,
    sendMediaAlbumMessage,
    sendMediaMessage,
    sendReplyMessage,
    sendTextMessage,
    sendVideoNoteMessage,
    sendVoiceMessage,
    setPinnedMessage,
    status,
    stopMatrixSession,
    toggleReaction,
  };
}
