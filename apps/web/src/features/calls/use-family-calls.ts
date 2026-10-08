"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { FamilyUser } from "@/features/family/types";
import type {
  MatrixCallEvent,
  MatrixCallEventType,
  MatrixCallSignalContent,
  MatrixRoomSummary,
} from "@/features/matrix/types";
import { isCommonFamilyRoom } from "@/features/matrix/room-kind";
import { ApiError } from "@/lib/api/errors";

import { startCallRingtone, stopCallRingtone } from "./call-ringtone";
import { requestCallToken } from "./call-api";
import { FamilyLiveKitSession } from "./livekit-session";
import type { AttachTrack, CallMode, CallPhase, DirectCallPeer } from "./types";

const callIdPattern = /^[A-Za-z0-9_-]{12,64}$/;
const inviteTtlMs = 120_000;

type CallState = {
  callId: string | null;
  errorMessage: string | null;
  localVideoTrack: AttachTrack | null;
  microphoneMuted: boolean;
  cameraOff: boolean;
  mode: CallMode | null;
  peer: FamilyUser | null;
  phase: CallPhase;
  remoteAudioTrack: AttachTrack | null;
  remoteVideoTrack: AttachTrack | null;
  room: MatrixRoomSummary | null;
};

type ExternalCallPush = {
  callId: string | null;
  expiresAt?: number | string | null;
  mode?: string | null;
  roomId: string | null;
  sender?: string | null;
};

const idleState: CallState = {
  callId: null,
  cameraOff: false,
  errorMessage: null,
  localVideoTrack: null,
  microphoneMuted: false,
  mode: null,
  peer: null,
  phase: "idle",
  remoteAudioTrack: null,
  remoteVideoTrack: null,
  room: null,
};
const repeatedInviteIntervalMs = 8_500;

function generateCallId() {
  const bytes = new Uint8Array(18);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function browserSupportsCalls() {
  return Boolean(
    typeof window !== "undefined" &&
      "RTCPeerConnection" in window &&
      navigator.mediaDevices?.getUserMedia,
  );
}

function defer(callback: () => void) {
  if (typeof window !== "undefined" && "queueMicrotask" in window) {
    window.queueMicrotask(callback);
    return;
  }
  void Promise.resolve().then(callback);
}

function isPermissionDenied(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "NotAllowedError" || error.name === "SecurityError";
  }
  if (error && typeof error === "object" && "name" in error) {
    const name = String((error as { name?: unknown }).name);
    return name === "NotAllowedError" || name === "SecurityError";
  }
  return false;
}

function permissionDeniedMessage(mode: CallMode) {
  return mode === "video"
    ? "Доступ к камере или микрофону запрещён."
    : "Доступ к микрофону запрещён.";
}

function callSetupErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 503) {
      return "Звонки ещё не настроены на сервере.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Сессия устарела или этот контакт недоступен для звонка.";
    }
    return "Не удалось получить доступ к серверу звонков.";
  }
  return "Звонок не удалось подключить.";
}

function callSignal(
  type: MatrixCallEventType,
  callId: string,
  mode?: CallMode,
): MatrixCallSignalContent {
  const timestamp = Date.now();
  return {
    callId,
    expiresAt: type === "com.familychat.call.invite" ? timestamp + inviteTtlMs : undefined,
    mode,
    timestamp,
  };
}

function isCallInviteExpired(event: MatrixCallEvent, now = Date.now()) {
  if (typeof event.expiresAt === "number" && Number.isFinite(event.expiresAt)) {
    return event.expiresAt < now;
  }
  return event.timestamp + inviteTtlMs < now;
}

function callablePeerForRoom(
  room: MatrixRoomSummary,
  familyUsers: FamilyUser[],
  currentMatrixUserId: string | null,
) {
  if (isCommonFamilyRoom(room)) {
    return null;
  }

  if (room.peerMatrixUserId) {
    return familyUsers.find((candidate) => candidate.matrixUserId === room.peerMatrixUserId) ?? null;
  }

  const familyMembersInRoom = familyUsers.filter(
    (candidate) =>
      candidate.matrixUserId !== currentMatrixUserId &&
      room.memberIds.includes(candidate.matrixUserId),
  );
  if (familyMembersInRoom.length === 1) {
    return familyMembersInRoom[0];
  }

  const normalizedRoomName = room.name.trim().toLowerCase();
  return (
    familyUsers.find(
      (candidate) =>
        candidate.matrixUserId !== currentMatrixUserId &&
        candidate.displayName.trim().toLowerCase() === normalizedRoomName,
    ) ?? null
  );
}

export function useFamilyCalls({
  accessToken,
  callEvents,
  currentMatrixUserId,
  familyUsers,
  rooms,
  sendCallSignal,
}: {
  accessToken: string | null;
  callEvents: MatrixCallEvent[];
  currentMatrixUserId: string | null;
  familyUsers: FamilyUser[];
  rooms: MatrixRoomSummary[];
  sendCallSignal: (
    roomId: string,
    eventType: MatrixCallEventType,
    content: MatrixCallSignalContent,
  ) => Promise<boolean>;
}) {
  const [state, setState] = useState<CallState>(idleState);
  const sessionRef = useRef<FamilyLiveKitSession | null>(null);
  const handledEventsRef = useRef(new Set<string>());
  const repeatedInviteIntervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const callEpochRef = useRef(0);
  const stateRef = useRef(state);

  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const directPeersByRoom = useMemo(() => {
    const pairs = new Map<string, DirectCallPeer>();
    for (const room of rooms) {
      const user = callablePeerForRoom(room, familyUsers, currentMatrixUserId);
      if (!user) {
        continue;
      }
      pairs.set(room.id, { room, user });
    }
    return pairs;
  }, [currentMatrixUserId, familyUsers, rooms]);

  const clearAnswerTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearRepeatedInvite = useCallback(() => {
    if (repeatedInviteIntervalRef.current !== null) {
      window.clearInterval(repeatedInviteIntervalRef.current);
      repeatedInviteIntervalRef.current = null;
    }
  }, []);

  const disconnectSession = useCallback(() => {
    clearAnswerTimeout();
    clearRepeatedInvite();
    sessionRef.current?.disconnect();
    sessionRef.current = null;
  }, [clearAnswerTimeout, clearRepeatedInvite]);

  useEffect(() => {
    return () => disconnectSession();
  }, [disconnectSession]);

  const safeError = useCallback((message = "Call could not be completed.") => {
    disconnectSession();
    setState((current) => ({
      ...current,
      errorMessage: message,
      localVideoTrack: null,
      phase: "error",
      remoteAudioTrack: null,
      remoteVideoTrack: null,
    }));
  }, [disconnectSession]);

  const connectToLiveKit = useCallback(async (options: {
    callId: string;
    mode: CallMode;
    peer: FamilyUser;
    room: MatrixRoomSummary;
  }) => {
    const epoch = callEpochRef.current;
    if (!accessToken) {
      safeError("Call setup is unavailable.");
      return;
    }
    if (!browserSupportsCalls()) {
      safeError("Calls are unavailable in this browser.");
      return;
    }

    setState((current) => {
      if (epoch !== callEpochRef.current) {
        return current;
      }
      return { ...current, errorMessage: null, phase: "connecting" };
    });
    try {
      const token = await requestCallToken(accessToken, {
        callId: options.callId,
        mode: options.mode,
        targetUserId: options.peer.id,
      });
      if (epoch !== callEpochRef.current) {
        return;
      }
      const session = new FamilyLiveKitSession({
        onCameraOff: (cameraOff) => setState((current) => ({ ...current, cameraOff })),
        onConnected: () => {
          if (epoch !== callEpochRef.current) {
            return;
          }
          clearAnswerTimeout();
          clearRepeatedInvite();
          setState((current) => ({ ...current, phase: "connected" }));
        },
        onDisconnected: () => {
          setState((current) =>
            current.phase === "idle" || current.phase === "error" ? current : idleState,
          );
        },
        onError: (message) => {
          if (epoch !== callEpochRef.current) {
            return;
          }
          safeError(message ?? "Не удалось подключиться к серверу звонков.");
        },
        onLocalTrack: (localVideoTrack) =>
          setState((current) => ({ ...current, localVideoTrack })),
        onMicrophoneMuted: (microphoneMuted) =>
          setState((current) => ({ ...current, microphoneMuted })),
        onRemoteAudio: (remoteAudioTrack) =>
          setState((current) => ({ ...current, remoteAudioTrack })),
        onRemoteVideo: (remoteVideoTrack) =>
          setState((current) => ({ ...current, remoteVideoTrack })),
      });
      sessionRef.current = session;
      await session.connect({
        livekitUrl: token.livekitUrl,
        mode: options.mode,
        token: token.token,
      });
      if (epoch !== callEpochRef.current) {
        session.disconnect();
        sessionRef.current = null;
      }
    } catch (error) {
      if (epoch !== callEpochRef.current) {
        return;
      }
      safeError(
        isPermissionDenied(error)
          ? permissionDeniedMessage(options.mode)
          : callSetupErrorMessage(error),
      );
    }
  }, [accessToken, clearAnswerTimeout, clearRepeatedInvite, safeError]);

  const startCall = useCallback(async (peer: DirectCallPeer, mode: CallMode) => {
    if (!accessToken || stateRef.current.phase !== "idle") {
      return;
    }
    callEpochRef.current += 1;
    const epoch = callEpochRef.current;
    const callId = generateCallId();
    setState({
      ...idleState,
      callId,
      mode,
      peer: peer.user,
      phase: "outgoing",
      room: peer.room,
    });
    const sent = await sendCallSignal(
      peer.room.id,
      "com.familychat.call.invite",
      callSignal("com.familychat.call.invite", callId, mode),
    );
    if (epoch !== callEpochRef.current) {
      return;
    }
    if (!sent) {
      safeError("Не удалось отправить приглашение на звонок. Проверьте подключение к чату и шифрование на этом устройстве.");
      return;
    }
    repeatedInviteIntervalRef.current = window.setInterval(() => {
      const current = stateRef.current;
      if (current.callId !== callId || current.phase === "idle" || current.phase === "error") {
        clearRepeatedInvite();
        return;
      }
      void sendCallSignal(
        peer.room.id,
        "com.familychat.call.invite",
        callSignal("com.familychat.call.invite", callId, mode),
      );
    }, repeatedInviteIntervalMs);
    timeoutRef.current = window.setTimeout(() => {
      if (stateRef.current.callId === callId && stateRef.current.phase !== "connected") {
        void sendCallSignal(
          peer.room.id,
          "com.familychat.call.hangup",
          callSignal("com.familychat.call.hangup", callId),
        );
        safeError("Call was not answered.");
      }
    }, inviteTtlMs);
    await connectToLiveKit({ callId, mode, peer: peer.user, room: peer.room });
  }, [accessToken, clearRepeatedInvite, connectToLiveKit, safeError, sendCallSignal]);

  const acceptIncoming = useCallback(async () => {
    const current = stateRef.current;
    if (current.phase !== "incoming" || !current.callId || !current.mode || !current.peer || !current.room) {
      return;
    }
    callEpochRef.current += 1;
    const sent = await sendCallSignal(
      current.room.id,
      "com.familychat.call.accept",
      callSignal("com.familychat.call.accept", current.callId),
    );
    if (!sent) {
      safeError("Call response could not be sent.");
      return;
    }
    await connectToLiveKit({
      callId: current.callId,
      mode: current.mode,
      peer: current.peer,
      room: current.room,
    });
  }, [connectToLiveKit, safeError, sendCallSignal]);

  const rejectIncoming = useCallback(async () => {
    const current = stateRef.current;
    if (current.phase !== "incoming" || !current.callId || !current.room) {
      return;
    }
    callEpochRef.current += 1;
    await sendCallSignal(
      current.room.id,
      "com.familychat.call.reject",
      callSignal("com.familychat.call.reject", current.callId),
    );
    disconnectSession();
    setState(idleState);
  }, [disconnectSession, sendCallSignal]);

  const openIncomingCallFromPush = useCallback((payload: ExternalCallPush) => {
    if (!payload.callId || !payload.roomId || !callIdPattern.test(payload.callId)) {
      return false;
    }
    if (payload.sender && payload.sender === currentMatrixUserId) {
      return false;
    }
    const expiresAt =
      typeof payload.expiresAt === "number"
        ? payload.expiresAt
        : typeof payload.expiresAt === "string"
          ? Number(payload.expiresAt)
          : 0;
    if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now()) {
      return false;
    }
    const mode = payload.mode === "video" || payload.mode === "audio" ? payload.mode : null;
    if (!mode || stateRef.current.phase !== "idle") {
      return false;
    }
    const directPeer = directPeersByRoom.get(payload.roomId);
    if (!directPeer) {
      return false;
    }
    if (payload.sender && directPeer.user.matrixUserId !== payload.sender) {
      return false;
    }
    setState({
      ...idleState,
      callId: payload.callId,
      mode,
      peer: directPeer.user,
      phase: "incoming",
      room: directPeer.room,
    });
    return true;
  }, [currentMatrixUserId, directPeersByRoom]);

  useEffect(() => {
    if (state.phase === "incoming") {
      void startCallRingtone();
      return;
    }
    stopCallRingtone();
  }, [state.phase]);

  useEffect(() => () => stopCallRingtone(), []);

  const endCall = useCallback(async () => {
    callEpochRef.current += 1;
    const current = stateRef.current;
    if (current.callId && current.room) {
      await sendCallSignal(
        current.room.id,
        "com.familychat.call.hangup",
        callSignal("com.familychat.call.hangup", current.callId),
      );
    }
    disconnectSession();
    setState(idleState);
  }, [disconnectSession, sendCallSignal]);

  const toggleMicrophone = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || stateRef.current.phase !== "connected") {
      return;
    }
    await session.setMicrophoneMuted(!stateRef.current.microphoneMuted);
  }, []);

  const toggleCamera = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || stateRef.current.phase !== "connected" || stateRef.current.mode !== "video") {
      return;
    }
    await session.setCameraOff(!stateRef.current.cameraOff);
  }, []);

  const switchCamera = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || stateRef.current.phase !== "connected" || stateRef.current.mode !== "video") {
      return;
    }
    await session.switchCamera();
  }, []);

  useEffect(() => {
    for (const event of callEvents) {
      const eventKey = `${event.roomId}:${event.type}:${event.callId}:${event.timestamp}`;
      if (handledEventsRef.current.has(eventKey)) {
        continue;
      }

      if (!callIdPattern.test(event.callId) || event.sender === currentMatrixUserId) {
        handledEventsRef.current.add(eventKey);
        continue;
      }

      if (event.type === "com.familychat.call.invite") {
        const directPeer = directPeersByRoom.get(event.roomId);
        if (!directPeer) {
          continue;
        }
        if (directPeer.user.matrixUserId !== event.sender) {
          handledEventsRef.current.add(eventKey);
          continue;
        }
        const mode = event.mode;
        if (!mode || isCallInviteExpired(event)) {
          handledEventsRef.current.add(eventKey);
          continue;
        }
        if (stateRef.current.phase !== "idle") {
          handledEventsRef.current.add(eventKey);
          continue;
        }
        handledEventsRef.current.add(eventKey);
        defer(() => {
          if (stateRef.current.phase !== "idle") {
            return;
          }
          setState({
            ...idleState,
            callId: event.callId,
            mode,
            peer: directPeer.user,
            phase: "incoming",
            room: directPeer.room,
          });
        });
        continue;
      }

      handledEventsRef.current.add(eventKey);

      if (stateRef.current.callId !== event.callId) {
        continue;
      }
      if (event.type === "com.familychat.call.reject" || event.type === "com.familychat.call.hangup") {
        defer(() => {
          callEpochRef.current += 1;
          disconnectSession();
          setState(idleState);
        });
        continue;
      }
      if (event.type === "com.familychat.call.accept") {
        clearAnswerTimeout();
        clearRepeatedInvite();
      }
    }
  }, [
    callEvents,
    clearAnswerTimeout,
    clearRepeatedInvite,
    currentMatrixUserId,
    directPeersByRoom,
    disconnectSession,
  ]);

  return {
    acceptIncoming,
    directPeersByRoom,
    endCall,
    openIncomingCallFromPush,
    rejectIncoming,
    startCall,
    state,
    switchCamera,
    toggleCamera,
    toggleMicrophone,
  };
}
