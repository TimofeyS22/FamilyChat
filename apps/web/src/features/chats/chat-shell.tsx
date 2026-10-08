"use client";

import { Phone, Settings, Video, X } from "lucide-react";
import Link from "next/link";
import type { FormEvent, TouchEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnimatedToastStack, useAnimatedToasts } from "@/components/ui/animated-toast-stack";
import { avatarOptions } from "@/components/ui/avatar-options";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FamilyChatLogo } from "@/components/ui/familychat-logo";
import { IconButton } from "@/components/ui/icon-button";
import { MotionModal } from "@/components/ui/motion-modal";
import { useAuthStore } from "@/features/auth/auth-store";
import { CallOverlay } from "@/features/calls/call-overlay";
import { useFamilyCalls } from "@/features/calls/use-family-calls";
import { FamilyPanel } from "@/features/family/family-panel";
import {
  readLocalUserAliases,
  readLocalUserAvatars,
  type LocalUserAliases,
  type LocalUserAvatars,
  writeLocalUserAliases,
  writeLocalUserAvatars,
} from "@/features/family/local-user-aliases";
import type { FamilyUser } from "@/features/family/types";
import { useFamilyUsers } from "@/features/family/use-family-users";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { registerMatrixWebPusher } from "@/features/matrix/matrix-client";
import { formatPeerPresenceLabel } from "@/features/matrix/presence";
import { isPrivateMatrixRoom } from "@/features/matrix/room-kind";
import { matrixSessionStorage } from "@/features/matrix/session-storage";
import type { MatrixMessage, MatrixRoomSummary } from "@/features/matrix/types";
import { getPushSettings } from "@/features/settings/notifications-api";
import { useOnlineStatus } from "@/lib/network/use-online-status";
import { transitionPanel, motionPress, motionPressSubtle, motionSurface } from "@/lib/motion/classes";
import { shouldTriggerEdgeSwipeBack } from "@/lib/motion/edge-swipe";
import { edgeSwipeEdgePx, motionDurations, motionEasings } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils/cn";

import { ChatList } from "./chat-list";
import { ChatPanel } from "./chat-panel";
import { useMatrixChat } from "./use-matrix-chat";

type SidebarView = "chats" | "family";
type RenameUserDraft = {
  avatar: string | null;
  name: string;
  user: FamilyUser;
};
type DeleteRoomDraft = {
  room: MatrixRoomSummary;
};
type AlbumDeleteDraft = {
  message: MatrixMessage;
  selectedKeys: Set<string>;
};
type AddMembersDraft = {
  room: MatrixRoomSummary;
  selectedUserIds: Set<string>;
};

const hiddenRoomsStorageKey = "familychat.web.hidden-room-ids";
const hiddenMessagesStorageKey = "familychat.web.hidden-message-ids";

function readHiddenRoomIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(hiddenRoomsStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }
    return new Set(
      parsed.filter((roomId): roomId is string => typeof roomId === "string" && roomId.length > 0),
    );
  } catch {
    return new Set<string>();
  }
}

function writeHiddenRoomIds(roomIds: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(hiddenRoomsStorageKey, JSON.stringify([...roomIds]));
}

function readHiddenMessageIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(hiddenMessagesStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }
    return new Set(
      parsed.filter((messageKey): messageKey is string => typeof messageKey === "string" && messageKey.length > 0),
    );
  } catch {
    return new Set<string>();
  }
}

function writeHiddenMessageIds(messageKeys: Set<string>) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(hiddenMessagesStorageKey, JSON.stringify([...messageKeys]));
}

function hiddenMessageKey(message: MatrixMessage) {
  return `${message.roomId}:${message.id}`;
}

function isFamilyRoom(room: MatrixRoomSummary) {
  return ["Family Chat", "Семейный чат"].includes(room.name);
}

function toMatrixInvitee(user: FamilyUser) {
  return {
    displayName: user.displayName,
    matrixUserId: user.matrixUserId,
  };
}

function roomIdFromLocation() {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("room");
}

function callActionFromLocation() {
  if (typeof window === "undefined") {
    return null;
  }
  const action = new URLSearchParams(window.location.search).get("callAction");
  return action === "accept" || action === "reject" ? action : null;
}

function callIdFromLocation() {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("callId");
}

export function ChatShell() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(() => roomIdFromLocation());
  const [hiddenRoomIds, setHiddenRoomIds] = useState<Set<string>>(() => readHiddenRoomIds());
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(() => readHiddenMessageIds());
  const [mobilePanelOpen, setMobilePanelOpen] = useState(() => Boolean(roomIdFromLocation()));
  const [sidebarView, setSidebarView] = useState<SidebarView>("chats");
  const [userAliases, setUserAliases] = useState<LocalUserAliases>(() => readLocalUserAliases());
  const [userAvatars, setUserAvatars] = useState<LocalUserAvatars>(() => readLocalUserAvatars());
  const [editingMessage, setEditingMessage] = useState<MatrixMessage | null>(null);
  const [replyDraft, setReplyDraft] = useState<MatrixMessage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [addMembersDraft, setAddMembersDraft] = useState<AddMembersDraft | null>(null);
  const [albumDeleteDraft, setAlbumDeleteDraft] = useState<AlbumDeleteDraft | null>(null);
  const [deleteRoomDraft, setDeleteRoomDraft] = useState<DeleteRoomDraft | null>(null);
  const [renameDraft, setRenameDraft] = useState<RenameUserDraft | null>(null);
  const [activePlaybackId, setActivePlaybackId] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const { showToast, toasts } = useAnimatedToasts();
  const touchStartRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const panelDragPxRef = useRef(0);
  const [panelDragPx, setPanelDragPx] = useState(0);
  const [panelDragging, setPanelDragging] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const pusherRepairAttemptedRef = useRef(false);
  const onlineInitializedRef = useRef(false);
  const isConnectedRef = useRef(false);
  const readMarkedMessageIdsRef = useRef(new Map<string, string>());
  const isOnline = useOnlineStatus();
  const accessToken = useAuthStore((state) => state.accessToken);
  const family = useFamilyUsers();
  const {
    callEvents,
    connectionMessage,
    createDirectChat,
    createGroupChat,
    currentMatrixUserId,
    deleteMessageForEveryone,
    editLocalMessage,
    editTextMessage,
    isConnected,
    isLoading,
    leaveRoom,
    markRoomRead,
    messagesForRoom,
    openJoinedFamilyChat,
    presenceByUserId,
    presenceTick,
    removeAlbumItemsForEveryone,
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
    addUsersToRoom,
    status,
    toggleReaction,
  } = useMatrixChat();
  const calls = useFamilyCalls({
    accessToken: family.accessToken,
    callEvents,
    currentMatrixUserId,
    familyUsers: family.users,
    rooms,
    sendCallSignal,
  });

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    function onServiceWorkerMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object" || data.type !== "familychat.call.push") {
        return;
      }
      const payload = data.payload && typeof data.payload === "object" ? data.payload : null;
      if (!payload) {
        return;
      }
      const roomId = typeof payload.roomId === "string" ? payload.roomId : null;
      if (roomId) {
        setActivePlaybackId(null);
        setSelectedRoomId(roomId);
        setMobilePanelOpen(true);
        window.history.replaceState({}, "", `/chats?room=${encodeURIComponent(roomId)}`);
      }
      calls.openIncomingCallFromPush({
        callId: typeof payload.callId === "string" ? payload.callId : null,
        expiresAt:
          typeof payload.expiresAt === "string" || typeof payload.expiresAt === "number"
            ? payload.expiresAt
            : null,
        mode: typeof payload.mode === "string" ? payload.mode : null,
        roomId,
        sender: typeof payload.sender === "string" ? payload.sender : null,
      });
    }
    navigator.serviceWorker.addEventListener("message", onServiceWorkerMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onServiceWorkerMessage);
  }, [calls]);

  useEffect(() => {
    const action = callActionFromLocation();
    const callId = callIdFromLocation();
    if (!action || !callId || calls.state.callId !== callId || calls.state.phase !== "incoming") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.delete("callAction");
    const nextSearch = params.toString();
    window.history.replaceState({}, "", nextSearch ? `/chats?${nextSearch}` : "/chats");
    if (action === "accept") {
      void calls.acceptIncoming();
      return;
    }
    void calls.rejectIncoming();
  }, [calls]);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    if (!accessToken || !isConnected || pusherRepairAttemptedRef.current) {
      return;
    }
    pusherRepairAttemptedRef.current = true;
    void getPushSettings(accessToken)
      .then(async (settings) => {
        const session = matrixSessionStorage.read();
        if (!settings.enabled || !settings.matrixPusher || !session) {
          return;
        }
        await registerMatrixWebPusher(session, {
          appId: settings.matrixPusher.appId,
          gatewayUrl: settings.matrixPusher.gatewayUrl,
          pushKey: settings.matrixPusher.pushKey,
        });
      })
      .catch(() => {
        pusherRepairAttemptedRef.current = false;
      });
  }, [accessToken, isConnected]);

  useEffect(() => {
    function onPopState() {
      if (window.location.pathname !== "/chats") {
        window.history.replaceState({}, "", "/chats");
        setEditingMessage(null);
        setActivePlaybackId(null);
        setSelectedRoomId(null);
        setMobilePanelOpen(false);
        return;
      }
      const roomId = roomIdFromLocation();
      setEditingMessage(null);
      setActivePlaybackId(null);
      setSelectedRoomId(roomId);
      setMobilePanelOpen(Boolean(roomId));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const displayRoom = useCallback(
    (room: MatrixRoomSummary): MatrixRoomSummary => {
      const alias = room.peerMatrixUserId ? userAliases[room.peerMatrixUserId] : undefined;
      const avatarId = isFamilyRoom(room)
        ? "family"
        : room.peerMatrixUserId
          ? userAvatars[room.peerMatrixUserId]
          : undefined;
      if (!alias && !avatarId) {
        return room;
      }
      return { ...room, avatarId, name: alias ?? room.name };
    },
    [userAliases, userAvatars],
  );
  const displayedRooms = useMemo(
    () => rooms.filter((room) => !hiddenRoomIds.has(room.id)).map(displayRoom),
    [displayRoom, hiddenRoomIds, rooms],
  );
  const selectedRoom = useMemo(
    () =>
      displayedRooms.find((room) => room.id === selectedRoomId) ??
      (selectedRoomId ? null : displayedRooms[0] ?? null),
    [displayedRooms, selectedRoomId],
  );
  const selectedMessages = useMemo(
    () => {
      if (!selectedRoom) {
        return [];
      }
      return messagesForRoom(selectedRoom.id)
        .filter((message) => !hiddenMessageIds.has(hiddenMessageKey(message)))
        .map((message) =>
          !message.isOwn && message.authorMatrixUserId && userAliases[message.authorMatrixUserId]
            ? { ...message, authorName: userAliases[message.authorMatrixUserId] }
            : message,
        );
    },
    [hiddenMessageIds, messagesForRoom, selectedRoom, userAliases],
  );
  const peerPresenceLabel = useMemo(() => {
    if (!selectedRoom?.peerMatrixUserId) {
      return null;
    }
    const lastPeerActivityAt = selectedMessages.reduce<number>(
      (latest, message) => (!message.isOwn ? Math.max(latest, message.timestamp) : latest),
      0,
    );
    return formatPeerPresenceLabel(
      presenceByUserId[selectedRoom.peerMatrixUserId],
      Date.now(),
      lastPeerActivityAt || undefined,
    );
  }, [presenceByUserId, presenceTick, selectedMessages, selectedRoom?.peerMatrixUserId]);
  const roomsForList = displayedRooms;
  const pinnedMessage = [...selectedMessages].reverse().find((message) => message.pinned) ?? null;
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase("ru");
  const searchResults = normalizedSearchQuery
    ? selectedMessages.filter((message) =>
        [message.body, message.replyTo?.body, message.replyTo?.authorName]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase("ru").includes(normalizedSearchQuery)),
      )
    : [];
  const activeSearchMessageId = searchResults[activeSearchIndex]?.id ?? null;
  const searchResultLabel = normalizedSearchQuery
    ? searchResults.length
      ? `${activeSearchIndex + 1}/${searchResults.length}`
      : "0/0"
    : null;
  const selectedRoomReadId = selectedRoom?.id ?? null;
  const latestSelectedMessageId =
    [...selectedMessages]
      .reverse()
      .find((message) => !message.id.startsWith("~") && !message.id.startsWith("local-"))?.id ?? null;
  const activeEditingMessage =
    editingMessage && selectedRoom?.id === editingMessage.roomId ? editingMessage : null;

  function isSequentialPlayable(message: MatrixMessage) {
    return Boolean(message.media?.isVoice || message.media?.isVideoNote);
  }

  function handlePlaybackEnd(messageId: string) {
    const currentIndex = selectedMessages.findIndex((message) => message.id === messageId);
    const nextMessage = currentIndex >= 0 ? selectedMessages[currentIndex + 1] : null;
    if (nextMessage && isSequentialPlayable(nextMessage)) {
      setActivePlaybackId(nextMessage.id);
      return;
    }
    setActivePlaybackId(null);
  }

  function handleSearchChange(query: string) {
    setSearchQuery(query);
    setActiveSearchIndex(0);
  }

  function handleSearchNext() {
    setActiveSearchIndex((current) => (searchResults.length ? (current + 1) % searchResults.length : 0));
  }

  function handleSearchPrevious() {
    setActiveSearchIndex((current) =>
      searchResults.length ? (current - 1 + searchResults.length) % searchResults.length : 0,
    );
  }

  function handleJumpToMessage(messageId: string) {
    const index = searchResults.findIndex((message) => message.id === messageId);
    if (index >= 0) {
      setActiveSearchIndex(index);
      return;
    }
    setSearchQuery("");
    window.setTimeout(() => {
      document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 0);
  }

  useEffect(() => {
    const chatVisibleForRead =
      Boolean(selectedRoomId && mobilePanelOpen) ||
      (typeof window !== "undefined" && window.innerWidth >= 768);
    if (!chatVisibleForRead || !selectedRoomReadId || !latestSelectedMessageId || !isConnected) {
      return;
    }
    if (readMarkedMessageIdsRef.current.get(selectedRoomReadId) === latestSelectedMessageId) {
      return;
    }
    readMarkedMessageIdsRef.current.set(selectedRoomReadId, latestSelectedMessageId);
    void markRoomRead(selectedRoomReadId).then((ok) => {
      if (!ok) {
        readMarkedMessageIdsRef.current.delete(selectedRoomReadId);
      }
    });
  }, [isConnected, latestSelectedMessageId, markRoomRead, mobilePanelOpen, selectedRoomId, selectedRoomReadId]);

  useEffect(() => {
    if (!onlineInitializedRef.current) {
      onlineInitializedRef.current = true;
      return;
    }
    showToast(
      isOnline
        ? isConnectedRef.current
          ? "Снова онлайн. Неотправленные сообщения можно повторить."
          : "Браузер онлайн. Ждём подключение к чату."
        : "Вы офлайн. Отправка временно приостановлена.",
      isOnline ? "success" : "error",
    );
  }, [isOnline, showToast]);

  const selectRoom = (room: MatrixRoomSummary) => {
    setEditingMessage(null);
    setActivePlaybackId(null);
    setReplyDraft(null);
    setSearchQuery("");
    setActiveSearchIndex(0);
    setSelectedRoomId(room.id);
    setMobilePanelOpen(true);
    setPanelClosing(false);
    setPanelDragPx(0);
    panelDragPxRef.current = 0;
    setPanelDragging(false);
    const nextUrl = `/chats?room=${encodeURIComponent(room.id)}`;
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.replaceState({ roomId: room.id }, "", nextUrl);
    }
  };

  const closeMobileChat = useCallback(() => {
    setEditingMessage(null);
    setActivePlaybackId(null);
    setReplyDraft(null);
    setSearchQuery("");
    setActiveSearchIndex(0);
    setMobilePanelOpen(false);
    setPanelDragPx(0);
    panelDragPxRef.current = 0;
    setPanelDragging(false);
    setPanelClosing(false);
    setSelectedRoomId(null);
    if (window.location.pathname === "/chats" && window.location.search) {
      window.history.replaceState({}, "", "/chats");
    }
  }, []);

  const handleSendMessage = async (text: string) => {
    if (!selectedRoom) {
      return false;
    }
    const activeReply = replyDraft && replyDraft.roomId === selectedRoom.id ? replyDraft : null;
    const ok = activeReply
      ? await sendReplyMessage(selectedRoom.id, text, activeReply)
      : await sendTextMessage(selectedRoom.id, text);
    if (!ok) {
      showToast("Не удалось отправить сообщение.", "error");
    }
    if (ok && activeReply) {
      setReplyDraft(null);
    }
    return ok;
  };

  const handleReactMessage = async (message: MatrixMessage, key: "heart" | "laugh" | "ok") => {
    const ok = await toggleReaction(message, key);
    if (!ok) {
      showToast("Не удалось обновить реакцию.", "error");
    }
  };

  const handlePinMessage = async (message: MatrixMessage, pinned: boolean) => {
    const ok = await setPinnedMessage(message, pinned);
    if (!ok) {
      showToast("Не удалось обновить закрепление.", "error");
    }
  };

  const handleSendFile = async (file: File, caption?: string) => {
    if (!selectedRoom) {
      return false;
    }
    const ok = await sendMediaMessage(selectedRoom.id, file, caption);
    if (!ok) {
      showToast("Не удалось отправить файл.", "error");
    }
    return ok;
  };

  const handleSendPhotoAlbum = async (files: File[], caption?: string) => {
    if (!selectedRoom) {
      return false;
    }
    const ok = await sendMediaAlbumMessage(selectedRoom.id, files, caption);
    if (!ok) {
      showToast("Не удалось отправить фото.", "error");
    }
    return ok;
  };

  const handleSendVoice = (file: File, durationMs: number) => {
    if (!selectedRoom) {
      return Promise.resolve(false);
    }
    return sendVoiceMessage(selectedRoom.id, file, durationMs);
  };

  const handleSendVideoNote = (file: File, durationMs: number) => {
    if (!selectedRoom) {
      return Promise.resolve(false);
    }
    return sendVideoNoteMessage(selectedRoom.id, file, durationMs);
  };

  const handleRetryMessage = async (message: MatrixMessage) => {
    if (message.status !== "failed") {
      return;
    }
    const room = rooms.find((candidate) => candidate.id === message.roomId);
    if (!isOnline || !isConnected || !room?.canSendMessages) {
      showToast("Подключитесь к чату перед повторной отправкой.", "error");
      return;
    }
    if (message.localFiles && message.localFiles.length > 1) {
      const ok = await sendMediaAlbumMessage(
        message.roomId,
        message.localFiles,
        message.localCaption,
        message.id,
      );
      if (!ok) {
        showToast("Повторная отправка не удалась.", "error");
      }
      return;
    }
    if (message.localFile) {
      if (message.media?.isVideoNote) {
        const ok = await sendVideoNoteMessage(
          message.roomId,
          message.localFile,
          message.media.duration ?? 1,
          message.id,
        );
        if (!ok) {
          showToast("Повторная отправка не удалась.", "error");
        }
        return;
      }
      if (message.media?.isVoice) {
        const ok = await sendVoiceMessage(
          message.roomId,
          message.localFile,
          message.media.duration ?? 1,
          message.id,
        );
        if (!ok) {
          showToast("Повторная отправка не удалась.", "error");
        }
        return;
      }
      const ok = await sendMediaMessage(
        message.roomId,
        message.localFile,
        message.localCaption,
        message.id,
      );
      if (!ok) {
        showToast("Повторная отправка не удалась.", "error");
      }
      return;
    }
    const ok = await sendTextMessage(message.roomId, message.body, message.id);
    if (!ok) {
      showToast("Повторная отправка не удалась.", "error");
    }
  };

  const handleCopyMessage = async (message: MatrixMessage) => {
    if (message.media || !message.body.trim()) {
      showToast("Скопировать можно только текстовое сообщение.", "error");
      return;
    }
    try {
      if (!window.navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await window.navigator.clipboard.writeText(message.body);
      showToast("Текст сообщения скопирован.", "success");
    } catch {
      showToast("Копирование недоступно в этом браузере.", "error");
    }
  };

  const handleDeleteLocalMessage = (message: MatrixMessage) => {
    setHiddenMessageIds((current) => {
      const next = new Set(current);
      next.add(hiddenMessageKey(message));
      writeHiddenMessageIds(next);
      return next;
    });
    showToast("Сообщение удалено у вас.", "success");
  };

  const handleDeleteMessageEverywhere = async (message: MatrixMessage) => {
    const ok = await deleteMessageForEveryone(message.roomId, message.id);
    if (!ok) {
      showToast("Не удалось удалить сообщение у всех.", "error");
      return;
    }
    showToast("Сообщение удалено у всех.", "success");
  };

  const handleRequestDeleteAlbumPhotos = (message: MatrixMessage) => {
    const keys = (message.mediaItems ?? [])
      .map((media) => media.albumKey)
      .filter((key): key is string => Boolean(key));
    if (keys.length === 0) {
      showToast("Для этого альбома нельзя выбрать отдельные фото.", "error");
      return;
    }
    setAlbumDeleteDraft({ message, selectedKeys: new Set(keys) });
  };

  const handleConfirmDeleteAlbumPhotos = async () => {
    const draft = albumDeleteDraft;
    if (!draft) {
      return;
    }
    const mediaItems = draft.message.mediaItems ?? [];
    const selectedKeys = [...draft.selectedKeys];
    if (selectedKeys.length === 0) {
      showToast("Выберите хотя бы одно фото.", "error");
      return;
    }
    setAlbumDeleteDraft(null);
    const ok = selectedKeys.length >= mediaItems.length
      ? await deleteMessageForEveryone(draft.message.roomId, draft.message.id)
      : await removeAlbumItemsForEveryone(draft.message.roomId, draft.message.id, selectedKeys);
    showToast(ok ? "Фото удалены у всех." : "Не удалось удалить фото.", ok ? "success" : "error");
  };

  const persistHiddenRoom = useCallback((roomId: string) => {
    setHiddenRoomIds((current) => {
      const next = new Set(current);
      next.add(roomId);
      writeHiddenRoomIds(next);
      return next;
    });
  }, []);

  const handleRequestDeleteRoom = (room: MatrixRoomSummary) => {
    setDeleteRoomDraft({ room });
  };

  const handleDeleteRoomForMe = async () => {
    const room = deleteRoomDraft?.room;
    if (!room) {
      return;
    }
    setDeleteRoomDraft(null);
    const ok = await leaveRoom(room.id);
    persistHiddenRoom(room.id);
    if (selectedRoomId === room.id) {
      closeMobileChat();
    }
    showToast(ok ? "Чат удалён у вас." : "Чат скрыт у вас. Matrix leave не выполнился.", ok ? "success" : "info");
  };

  const handleEditMessage = async (message: MatrixMessage) => {
    if (!message.isOwn || message.media || message.status !== "sent") {
      showToast("Редактировать можно только свои текстовые сообщения.", "error");
      return;
    }
    setEditingMessage(message);
  };

  const handleSaveEditedMessage = async (message: MatrixMessage, nextText: string) => {
    const trimmed = nextText.trim();
    if (!trimmed || trimmed === message.body.trim()) {
      setEditingMessage(null);
      return true;
    }
    const ok = message.id.startsWith("local-")
      ? editLocalMessage(message, trimmed)
      : await editTextMessage(message.roomId, message.id, trimmed);
    if (ok) {
      setEditingMessage(null);
    }
    if (!ok) {
      showToast("Не удалось изменить сообщение.", "error");
    }
    return ok;
  };

  const openCreatedRoom = (roomId: string | null) => {
    if (!roomId) {
      return false;
    }

    setActivePlaybackId(null);
    setSelectedRoomId(roomId);
    setSidebarView("chats");
    setMobilePanelOpen(true);
    return true;
  };

  const handleCreateDirectChat = async (user: FamilyUser) => {
    const existingRoom = rooms.find(
      (room) =>
        isPrivateMatrixRoom(room) &&
        (room.peerMatrixUserId === user.matrixUserId || room.memberIds.includes(user.matrixUserId)),
    );
    if (existingRoom) {
      showToast("Открываем существующий чат.", "info");
      return openCreatedRoom(existingRoom.id);
    }

    const roomId = await createDirectChat({
      ...toMatrixInvitee(user),
      displayName: userAliases[user.matrixUserId] ?? user.displayName,
    });
    return openCreatedRoom(roomId);
  };

  const handleCreateGroupChat = async (users: FamilyUser[], name: string) => {
    const roomId = await createGroupChat(
      users.map((user) => ({
        ...toMatrixInvitee(user),
        displayName: userAliases[user.matrixUserId] ?? user.displayName,
      })),
      name,
    );
    return openCreatedRoom(roomId);
  };

  const handleRenameUser = (user: FamilyUser) => {
    const currentName = userAliases[user.matrixUserId] ?? user.displayName;
    setRenameDraft({
      avatar: userAvatars[user.matrixUserId] ?? null,
      name: currentName,
      user,
    });
  };

  const handleSubmitRenameUser = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renameDraft) {
      return;
    }

    const { avatar, name, user } = renameDraft;
    const trimmed = name.trim();
    setUserAliases((current) => {
      const next = { ...current };
      if (!trimmed || trimmed === user.displayName) {
        delete next[user.matrixUserId];
      } else {
        next[user.matrixUserId] = trimmed.slice(0, 80);
      }
      writeLocalUserAliases(next);
      return next;
    });
    setUserAvatars((current) => {
      const next = { ...current };
      if (avatar) {
        next[user.matrixUserId] = avatar;
      } else {
        delete next[user.matrixUserId];
      }
      writeLocalUserAvatars(next);
      return next;
    });
    setRenameDraft(null);
    showToast("Отображение участника обновлено.", "success");
  };

  const handleOpenFamilyChat = async () => {
    const roomId = await openJoinedFamilyChat();
    return openCreatedRoom(roomId);
  };

  const selectedCallPeer = selectedRoom ? calls.directPeersByRoom.get(selectedRoom.id) : undefined;
  const selectedCallPeerWithAlias = selectedCallPeer
    ? {
        ...selectedCallPeer,
        user: {
          ...selectedCallPeer.user,
          displayName:
            userAliases[selectedCallPeer.user.matrixUserId] ?? selectedCallPeer.user.displayName,
        },
      }
    : undefined;
  const callPeerName =
    calls.state.peer?.matrixUserId
      ? userAliases[calls.state.peer.matrixUserId] ?? calls.state.peer.displayName
      : null;
  const addMemberCandidates = addMembersDraft
    ? family.users.filter(
        (user) =>
          user.matrixUserId !== currentMatrixUserId &&
          !addMembersDraft.room.memberIds.includes(user.matrixUserId),
      )
    : [];
  const playbackControls = activePlaybackId ? (
    <div className="flex min-w-[8.5rem] items-center gap-2 rounded-full bg-sky-50 px-3 py-2 shadow-sm ring-1 ring-sky-100">
      <span className="text-xs font-bold text-sky-700">{playbackRate.toFixed(1)}x</span>
      <input
        aria-label="Скорость воспроизведения"
        className="h-2 w-20 accent-sky-600"
        max={2}
        min={1}
        onChange={(event) => setPlaybackRate(Number(event.currentTarget.value))}
        step={0.25}
        type="range"
        value={playbackRate}
      />
    </div>
  ) : null;
  const callControls = playbackControls ?? (selectedCallPeerWithAlias ? (
    <div className="flex items-center gap-1">
      <IconButton
        disabled={calls.state.phase !== "idle"}
        label={`Начать аудиозвонок с ${selectedCallPeerWithAlias.user.displayName}`}
        onClick={() => void calls.startCall(selectedCallPeerWithAlias, "audio")}
      >
        <Phone className="h-5 w-5" />
      </IconButton>
      <IconButton
        disabled={calls.state.phase !== "idle"}
        label={`Начать видеозвонок с ${selectedCallPeerWithAlias.user.displayName}`}
        onClick={() => void calls.startCall(selectedCallPeerWithAlias, "video")}
      >
        <Video className="h-5 w-5" />
      </IconButton>
    </div>
  ) : null);

  const handleConfirmAddMembers = async () => {
    const draft = addMembersDraft;
    if (!draft) {
      return;
    }
    const selectedUsers = family.users.filter((user) => draft.selectedUserIds.has(user.id));
    if (selectedUsers.length === 0) {
      showToast("Выберите хотя бы одного участника.", "error");
      return;
    }
    setAddMembersDraft(null);
    const ok = await addUsersToRoom(
      draft.room.id,
      selectedUsers.map((user) => ({
        ...toMatrixInvitee(user),
        displayName: userAliases[user.matrixUserId] ?? user.displayName,
      })),
    );
    showToast(ok ? "Участники приглашены в чат." : "Не удалось добавить участников.", ok ? "success" : "error");
  };

  const appStatusLabel = restoreFailed
    ? "Нужно войти снова"
    : isLoading
      ? "Обновляем чаты"
      : isConnected
        ? "Подключено к чату"
        : "Подключаемся к чату";

  function onChatTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (!touch || touch.clientX > edgeSwipeEdgePx || !mobilePanelOpen) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = { time: Date.now(), x: touch.clientX, y: touch.clientY };
    setPanelDragging(true);
  }

  function onChatTouchMove(event: TouchEvent<HTMLElement>) {
    const start = touchStartRef.current;
    const touch = event.touches[0];
    if (!start || !touch || !mobilePanelOpen) {
      return;
    }
    const deltaX = touch.clientX - start.x;
    const deltaY = Math.abs(touch.clientY - start.y);
    if (deltaY > 28 && deltaX < 20) {
      touchStartRef.current = null;
      setPanelDragging(false);
      setPanelDragPx(0);
      panelDragPxRef.current = 0;
      return;
    }
    if (deltaX > 0) {
      const next = Math.min(deltaX, window.innerWidth);
      panelDragPxRef.current = next;
      setPanelDragPx(next);
    }
  }

  function onChatTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    const dragPx = panelDragPxRef.current;
    if (!start || !touch) {
      setPanelDragging(false);
      setPanelDragPx(0);
      panelDragPxRef.current = 0;
      return;
    }
    const shouldClose =
      shouldTriggerEdgeSwipeBack(start, { time: Date.now(), x: touch.clientX, y: touch.clientY }) ||
      dragPx > window.innerWidth * 0.28;
    setPanelDragging(false);
    if (shouldClose) {
      const width = window.innerWidth;
      setPanelClosing(true);
      panelDragPxRef.current = width;
      setPanelDragPx(width);
      window.setTimeout(() => {
        closeMobileChat();
      }, motionDurations.panel + 30);
      return;
    }
    panelDragPxRef.current = 0;
    setPanelDragPx(0);
  }

  const mobilePanelTransformActive = mobilePanelOpen && (panelDragging || panelDragPx > 0 || panelClosing);
  const mobilePanelTranslateClass = mobilePanelOpen ? "max-md:translate-x-0" : "max-md:translate-x-full";
  const mobilePanelTransition = `transform ${motionDurations.panel}ms ${motionEasings.spring}`;

  return (
    <ProtectedRoute>
      <main className="relative h-dvh overflow-hidden bg-white text-ink-primary">
        <div className="relative mx-auto flex h-full max-w-7xl overflow-hidden border-x border-white/60 bg-white shadow-2xl shadow-sky-950/10">
          <aside
            className={cn(
              "flex h-full w-full flex-col border-r border-white/70 p-3 md:w-[22rem] md:flex-none",
              "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-10 max-md:w-full max-md:bg-white max-md:shadow-none",
              "md:relative md:z-auto md:bg-white/82 md:shadow-xl md:shadow-sky-950/5 md:backdrop-blur-xl",
              mobilePanelOpen && "max-md:pointer-events-none",
              "md:pointer-events-auto",
            )}
          >
            <div className="mb-4 grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-2 px-1">
              <span aria-hidden="true" />
              <div className="min-w-0 text-center">
                <FamilyChatLogo compact className="mx-auto" />
                <p className="truncate text-xs text-ink-muted">{appStatusLabel}</p>
              </div>
              <Link
                aria-label="Открыть настройки"
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-surface-line bg-surface-panel text-ink-secondary hover:bg-surface-canvas hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
                  motionSurface,
                  motionPress,
                )}
                href="/settings"
                title="Открыть настройки"
              >
                <Settings className="h-5 w-5" />
              </Link>
            </div>

            {connectionMessage ? (
              <div className="mb-3 rounded-lg border border-surface-line bg-surface-raised px-3 py-2 text-sm text-ink-secondary">
                {connectionMessage}
              </div>
            ) : null}

            <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl border border-white/70 bg-surface-raised/80 p-1 shadow-inner shadow-white">
              <button
                aria-pressed={sidebarView === "chats"}
                className={cn(
                  "min-h-10 rounded-xl px-3 text-sm font-semibold text-ink-secondary hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
                  motionSurface,
                  motionPressSubtle,
                  sidebarView === "chats" && "bg-white text-ink-primary shadow-sm",
                )}
                onClick={() => setSidebarView("chats")}
                type="button"
              >
                Чаты
              </button>
              <button
                aria-pressed={sidebarView === "family"}
                className={cn(
                  "min-h-10 rounded-xl px-3 text-sm font-semibold text-ink-secondary hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
                  motionSurface,
                  motionPressSubtle,
                  sidebarView === "family" && "bg-white text-ink-primary shadow-sm",
                )}
                onClick={() => setSidebarView("family")}
                type="button"
              >
                Семья
              </button>
            </div>

            {sidebarView === "chats" ? (
              <ChatList
                isLoading={isLoading}
                onHideRoom={handleRequestDeleteRoom}
                rooms={roomsForList}
                onSelect={selectRoom}
                selectedId={selectedRoomId ?? ""}
              />
            ) : (
              <FamilyPanel
                accessToken={family.accessToken}
                currentMatrixUserId={currentMatrixUserId}
                isMatrixConnected={isConnected}
                onCreateDirectChat={handleCreateDirectChat}
                onCreateGroupChat={handleCreateGroupChat}
                onOpenFamilyChat={handleOpenFamilyChat}
                onRenameUser={handleRenameUser}
                onRefresh={family.refresh}
                state={family.state}
                userAliases={userAliases}
                userAvatars={userAvatars}
                users={family.users}
              />
            )}
          </aside>

          <section
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col md:flex",
              "max-md:absolute max-md:inset-0 max-md:z-20 max-md:flex max-md:bg-white",
              !mobilePanelTransformActive && !panelDragging && transitionPanel,
              !mobilePanelTransformActive && mobilePanelTranslateClass,
              !mobilePanelOpen && "max-md:pointer-events-none",
              "md:relative md:z-auto md:translate-x-0 md:pointer-events-auto md:bg-transparent",
            )}
            onTouchEnd={onChatTouchEnd}
            onTouchMove={onChatTouchMove}
            onTouchStart={onChatTouchStart}
            style={
              mobilePanelTransformActive
                ? {
                    transform: `translateX(${panelDragPx}px)`,
                    transition: panelDragging ? "none" : mobilePanelTransition,
                  }
                : undefined
            }
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {selectedRoom ? (
                <ChatPanel
                  activePlaybackId={activePlaybackId}
                  activeSearchMessageId={activeSearchMessageId}
                  callControls={callControls}
                  connectionMessage={connectionMessage}
                  editingMessage={activeEditingMessage}
                  isConnected={isConnected}
                  isOnline={isOnline}
                  messages={selectedMessages}
                  onAddMembers={
                    isPrivateMatrixRoom(selectedRoom)
                      ? undefined
                      : () => setAddMembersDraft({ room: selectedRoom, selectedUserIds: new Set() })
                  }
                  onBack={closeMobileChat}
                  onCancelEditing={() => setEditingMessage(null)}
                  onCancelReply={() => setReplyDraft(null)}
                  onCopyMessage={(message) => void handleCopyMessage(message)}
                  onDeleteAlbumPhotos={handleRequestDeleteAlbumPhotos}
                  onDeleteEverywhere={(message) => void handleDeleteMessageEverywhere(message)}
                  onDeleteLocalMessage={handleDeleteLocalMessage}
                  onDropToast={showToast}
                  onEditMessage={(message) => void handleEditMessage(message)}
                  onJumpToMessage={handleJumpToMessage}
                  onPlaybackEnd={handlePlaybackEnd}
                  onPlaybackStart={setActivePlaybackId}
                  onPinMessage={(message, pinned) => void handlePinMessage(message, pinned)}
                  onReactMessage={(message, key) => void handleReactMessage(message, key)}
                  onReplyMessage={(message) => setReplyDraft(message)}
                  onRetryMessage={(message) => void handleRetryMessage(message)}
                  onSaveEditedMessage={handleSaveEditedMessage}
                  onSearchChange={handleSearchChange}
                  onSearchNext={handleSearchNext}
                  onSearchPrevious={handleSearchPrevious}
                  onSendAlbum={handleSendPhotoAlbum}
                  onSendFile={handleSendFile}
                  onSendMessage={handleSendMessage}
                  onSendVideoNote={handleSendVideoNote}
                  onSendVoice={handleSendVoice}
                  playbackRate={playbackRate}
                  peerPresenceLabel={peerPresenceLabel}
                  pinnedMessage={pinnedMessage}
                  replyTo={replyDraft?.roomId === selectedRoom.id ? replyDraft : null}
                  room={selectedRoom}
                  searchQuery={searchQuery}
                  searchResultLabel={searchResultLabel}
                  status={status}
                />
              ) : selectedRoomId ? (
                <EmptyState
                  className="h-full"
                  description="Чат появится сразу после синхронизации."
                  title="Открываем чат"
                />
              ) : restoreFailed ? (
                <EmptyState
                  className="h-full"
                  description="Войдите снова, чтобы восстановить доступ к Matrix-чату."
                  title="Сессия чата недоступна"
                />
              ) : isLoading ? (
                <EmptyState className="h-full" title="Загружаем чаты" />
              ) : (
                <EmptyState
                  className="h-full"
                  description="Создайте семейный чат или выберите существующий."
                  title="Чат не выбран"
                />
              )}
            </div>
          </section>
        </div>
        <CallOverlay
          cameraOff={calls.state.cameraOff}
          errorMessage={calls.state.errorMessage}
          localVideoTrack={calls.state.localVideoTrack}
          microphoneMuted={calls.state.microphoneMuted}
          mode={calls.state.mode}
          onAccept={() => void calls.acceptIncoming()}
          onEnd={() => void calls.endCall()}
          onReject={() => void calls.rejectIncoming()}
          onSwitchCamera={() => void calls.switchCamera()}
          onToggleCamera={() => void calls.toggleCamera()}
          onToggleMicrophone={() => void calls.toggleMicrophone()}
          peerName={callPeerName}
          phase={calls.state.phase}
          remoteAudioTrack={calls.state.remoteAudioTrack}
          remoteVideoTrack={calls.state.remoteVideoTrack}
        />
        {addMembersDraft ? (
          <MotionModal onClose={() => setAddMembersDraft(null)} open>
            <div className="rounded-[2rem] border border-white bg-white p-4 shadow-2xl shadow-sky-950/24">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-500">
                    Добавить участников
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-ink-primary">
                    {addMembersDraft.room.name}
                  </h2>
                  <p className="mt-2 text-sm leading-5 text-ink-muted">
                    Выберите участников семьи, которых ещё нет в этом чате.
                  </p>
                </div>
                <button
                  aria-label="Закрыть добавление участников"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-ink-secondary transition hover:bg-sky-100 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal"
                  onClick={() => setAddMembersDraft(null)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto">
                {addMemberCandidates.map((user) => {
                  const selected = addMembersDraft.selectedUserIds.has(user.id);
                  return (
                    <button
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
                        selected ? "border-sky-300 bg-sky-50" : "border-surface-line bg-white",
                      )}
                      key={user.id}
                      onClick={() =>
                        setAddMembersDraft((current) => {
                          if (!current) {
                            return current;
                          }
                          const next = new Set(current.selectedUserIds);
                          if (next.has(user.id)) {
                            next.delete(user.id);
                          } else {
                            next.add(user.id);
                          }
                          return { ...current, selectedUserIds: next };
                        })
                      }
                      type="button"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-md border border-sky-200 bg-white text-xs font-bold text-sky-600">
                        {selected ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-primary">
                          {userAliases[user.matrixUserId] ?? user.displayName}
                        </span>
                        <span className="block truncate text-xs text-ink-muted">@{user.username}</span>
                      </span>
                    </button>
                  );
                })}
                {addMemberCandidates.length === 0 ? (
                  <EmptyState className="min-h-32" title="Некого добавить" />
                ) : null}
              </div>
              <div className="mt-5 grid gap-2">
                <Button
                  className="rounded-2xl"
                  disabled={addMembersDraft.selectedUserIds.size === 0}
                  onClick={() => void handleConfirmAddMembers()}
                >
                  Добавить выбранных
                </Button>
                <Button className="rounded-2xl" onClick={() => setAddMembersDraft(null)} variant="secondary">
                  Отмена
                </Button>
              </div>
            </div>
          </MotionModal>
        ) : null}
        {albumDeleteDraft ? (
          <MotionModal onClose={() => setAlbumDeleteDraft(null)} open>
            <div className="rounded-[2rem] border border-white bg-white p-4 shadow-2xl shadow-sky-950/24">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-500">
                    Удалить фото
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-ink-primary">
                    Выберите фото из альбома
                  </h2>
                  <p className="mt-2 text-sm leading-5 text-ink-muted">
                    Выбранные фото исчезнут у участников FamilyChat. Если выбрать все, удалится весь альбом.
                  </p>
                </div>
                <button
                  aria-label="Закрыть выбор фото"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-ink-secondary transition hover:bg-sky-100 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal"
                  onClick={() => setAlbumDeleteDraft(null)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 grid max-h-[45vh] grid-cols-3 gap-2 overflow-y-auto">
                {(albumDeleteDraft.message.mediaItems ?? []).map((media, index) => {
                  const key = media.albumKey ?? "";
                  const selected = albumDeleteDraft.selectedKeys.has(key);
                  return (
                    <button
                      aria-pressed={selected}
                      className={cn(
                        "relative aspect-square overflow-hidden rounded-2xl border-2 bg-slate-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
                        selected ? "border-rose-400" : "border-white",
                      )}
                      key={`${key}-${index}`}
                      onClick={() =>
                        setAlbumDeleteDraft((current) => {
                          if (!current || !key) {
                            return current;
                          }
                          const next = new Set(current.selectedKeys);
                          if (next.has(key)) {
                            next.delete(key);
                          } else {
                            next.add(key);
                          }
                          return { ...current, selectedKeys: next };
                        })
                      }
                      type="button"
                    >
                      {media.objectUrl || media.sourceUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt=""
                          className="h-full w-full object-cover"
                          src={media.objectUrl ?? media.sourceUrl}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "absolute inset-0 flex items-center justify-center text-sm font-bold text-white transition",
                          selected ? "bg-rose-600/36" : "bg-black/0",
                        )}
                      >
                        {selected ? "Удалить" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 grid gap-2">
                <Button className="rounded-2xl" onClick={() => void handleConfirmDeleteAlbumPhotos()} variant="danger">
                  Удалить выбранные
                </Button>
                <Button className="rounded-2xl" onClick={() => setAlbumDeleteDraft(null)} variant="secondary">
                  Отмена
                </Button>
              </div>
            </div>
          </MotionModal>
        ) : null}
        {deleteRoomDraft ? (
          <MotionModal onClose={() => setDeleteRoomDraft(null)} open>
            <div className="rounded-[2rem] border border-white bg-white p-4 shadow-2xl shadow-sky-950/24">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-500">
                    Удаление чата
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-ink-primary">
                    {deleteRoomDraft.room.name}
                  </h2>
                  <p className="mt-2 text-sm leading-5 text-ink-muted">
                    «У себя» полноценно покидает Matrix-комнату и убирает чат из списка.
                    Удаление «у всех» требует отдельной серверной функции с правами и аудитом.
                  </p>
                </div>
                <button
                  aria-label="Закрыть удаление чата"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-ink-secondary transition hover:bg-sky-100 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal"
                  onClick={() => setDeleteRoomDraft(null)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 grid gap-2">
                <Button className="rounded-2xl" onClick={() => void handleDeleteRoomForMe()} variant="danger">
                  Удалить у себя
                </Button>
                <Button
                  className="rounded-2xl opacity-70"
                  disabled
                  title="Нужен серверный endpoint для удаления у всех"
                  variant="secondary"
                >
                  Удалить у всех
                </Button>
                <Button
                  className="rounded-2xl"
                  onClick={() => setDeleteRoomDraft(null)}
                  variant="secondary"
                >
                  Отмена
                </Button>
              </div>
            </div>
          </MotionModal>
        ) : null}
        {renameDraft ? (
          <MotionModal onClose={() => setRenameDraft(null)} open panelClassName="max-w-md">
            <form
              className="rounded-[2rem] border border-white/80 bg-white/94 p-4 shadow-2xl shadow-sky-950/18 backdrop-blur-xl sm:p-5"
              onSubmit={handleSubmitRenameUser}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-500">
                    Переименовать
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-ink-primary">
                    Как показывать участника
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    Это видно только вам на этом устройстве.
                  </p>
                </div>
                <button
                  aria-label="Закрыть переименование"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-ink-secondary transition hover:bg-sky-100 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal"
                  onClick={() => setRenameDraft(null)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label className="mt-5 block text-sm font-semibold text-ink-primary">
                Имя в чатах
                <input
                  autoFocus
                  className="mt-2 min-h-12 w-full rounded-2xl border border-surface-line bg-sky-50/70 px-4 text-base text-ink-primary outline-none transition placeholder:text-ink-muted focus:border-sky-300 focus:bg-white focus:shadow-focus"
                  maxLength={80}
                  onChange={(event) =>
                    setRenameDraft((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  placeholder={renameDraft.user.displayName}
                  value={renameDraft.name}
                />
              </label>

              <div className="mt-5">
                <p className="text-sm font-semibold text-ink-primary">Аватар</p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {avatarOptions.map((avatar) => (
                    <button
                      aria-label={`Выбрать аватар: ${avatar.label}`}
                      aria-pressed={renameDraft.avatar === avatar.id}
                      className={cn(
                        "flex h-16 items-center justify-center overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
                        renameDraft.avatar === avatar.id
                          ? "border-sky-300 bg-sky-50 shadow-sky-300/20"
                          : "border-surface-line",
                      )}
                      key={avatar.id}
                      onClick={() =>
                        setRenameDraft((current) =>
                          current ? { ...current, avatar: avatar.id } : current,
                        )
                      }
                      type="button"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt="" className="h-full w-full object-cover" src={avatar.src} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button
                  className="rounded-2xl"
                  onClick={() => setRenameDraft(null)}
                  type="button"
                  variant="secondary"
                >
                  Отмена
                </Button>
                <Button className="rounded-2xl" type="submit">
                  Сохранить
                </Button>
              </div>
            </form>
          </MotionModal>
        ) : null}
        <AnimatedToastStack toasts={toasts} />
      </main>
    </ProtectedRoute>
  );
}
