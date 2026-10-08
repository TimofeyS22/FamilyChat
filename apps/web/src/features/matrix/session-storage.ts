import { matrixBaseUrl } from "@/lib/config/env";

import type { MatrixSession } from "./types";

const storageKey = "familychat.web.matrix-session";
let inMemorySession: MatrixSession | null = null;

function isMatrixSession(value: unknown): value is MatrixSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.trim().length > 0 &&
    typeof candidate.userId === "string" &&
    candidate.userId.trim().length > 0 &&
    (candidate.deviceId === undefined || typeof candidate.deviceId === "string") &&
    typeof candidate.baseUrl === "string" &&
    candidate.baseUrl === matrixBaseUrl
  );
}

function parseStoredSession(raw: string | null): MatrixSession | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isMatrixSession(parsed) ? { ...parsed } : null;
  } catch {
    return null;
  }
}

export const matrixSessionStorage = {
  read(): MatrixSession | null {
    if (typeof window === "undefined") {
      return null;
    }
    if (inMemorySession) {
      return { ...inMemorySession };
    }

    const stored = parseStoredSession(window.localStorage.getItem(storageKey));
    if (stored) {
      inMemorySession = { ...stored };
      window.sessionStorage.removeItem(storageKey);
      return { ...stored };
    }

    const legacySession = parseStoredSession(window.sessionStorage.getItem(storageKey));
    if (legacySession) {
      this.write(legacySession);
      return { ...legacySession };
    }

    if (!window.localStorage.getItem(storageKey) && !window.sessionStorage.getItem(storageKey)) {
      return null;
    }

    this.clear();
    return null;
  },

  write(session: MatrixSession): MatrixSession {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(session));
      window.sessionStorage.removeItem(storageKey);
    }
    inMemorySession = { ...session };
    return { ...session };
  },

  clear() {
    inMemorySession = null;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
      window.sessionStorage.removeItem(storageKey);
    }
  },
};
