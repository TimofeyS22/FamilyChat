import type { MatrixPresenceState, MatrixUserPresence } from "./types";

function resolveLastActiveAt(user: {
  getLastActiveTs?: () => number;
  lastActiveAgo?: number;
  lastPresenceTs?: number;
}): number | undefined {
  if (typeof user.getLastActiveTs === "function") {
    const lastActiveTs = user.getLastActiveTs();
    if (typeof lastActiveTs === "number" && lastActiveTs > 0) {
      return lastActiveTs;
    }
  }

  const lastPresenceTs = typeof user.lastPresenceTs === "number" ? user.lastPresenceTs : 0;
  const lastActiveAgo = typeof user.lastActiveAgo === "number" && user.lastActiveAgo >= 0
    ? user.lastActiveAgo
    : undefined;
  if (lastPresenceTs > 0 && lastActiveAgo !== undefined) {
    return lastPresenceTs - lastActiveAgo;
  }

  return undefined;
}

export function matrixPresenceFromUser(user: unknown, userId: string): MatrixUserPresence | null {
  if (!user || typeof user !== "object") {
    return null;
  }

  const record = user as {
    currentlyActive?: boolean;
    getLastActiveTs?: () => number;
    lastActiveAgo?: number;
    lastPresenceTs?: number;
    presence?: string;
    userId?: string;
  };
  const resolvedUserId = typeof record.userId === "string" && record.userId.trim() ? record.userId : userId;
  const presence: MatrixPresenceState =
    record.presence === "online" || record.presence === "unavailable" ? record.presence : "offline";

  return {
    currentlyActive: Boolean(record.currentlyActive),
    lastActiveAt: resolveLastActiveAt(record),
    presence,
    userId: resolvedUserId,
  };
}

function formatLastSeen(lastActiveMs: number): string {
  const seconds = Math.floor(lastActiveMs / 1000);
  if (seconds < 60) {
    return "был(а) только что";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `был(а) ${minutes} мин назад`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `был(а) ${hours} ч назад`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "был(а) вчера";
  }
  if (days < 7) {
    return `был(а) ${days} дн назад`;
  }
  return "был(а) давно";
}

export function formatPeerPresenceLabel(
  presence: MatrixUserPresence | undefined,
  now = Date.now(),
  activityFallbackAt?: number,
): string | null {
  if (!presence && !activityFallbackAt) {
    return null;
  }

  const lastActiveAt = Math.max(presence?.lastActiveAt ?? 0, activityFallbackAt ?? 0) || undefined;

  if (presence?.presence === "unavailable") {
    return "не беспокоить";
  }

  if (presence?.currentlyActive) {
    return "в сети";
  }

  if (typeof lastActiveAt === "number") {
    const elapsedMs = Math.max(0, now - lastActiveAt);
    if (presence?.presence === "online" && elapsedMs < 120_000) {
      return "в сети";
    }
    return formatLastSeen(elapsedMs);
  }

  if (presence?.presence === "online") {
    return "в сети";
  }

  return "не в сети";
}
