import type { AuthRole, StoredSession } from "./types";

const storageKey = "familychat.web.session";

function readJwtRole(token: string): AuthRole {
  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return "unknown";
    }
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      role?: string;
    };
    return decoded.role === "admin" || decoded.role === "member" ? decoded.role : "unknown";
  } catch {
    return "unknown";
  }
}

export const tokenStorage = {
  read(): StoredSession | null {
    if (typeof window === "undefined") {
      return null;
    }
    const accessToken = window.localStorage.getItem(storageKey);
    if (!accessToken) {
      return null;
    }
    return { accessToken, role: readJwtRole(accessToken) };
  },
  write(accessToken: string): StoredSession {
    const session = { accessToken, role: readJwtRole(accessToken) };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, accessToken);
    }
    return session;
  },
  clear() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
    }
  },
};
