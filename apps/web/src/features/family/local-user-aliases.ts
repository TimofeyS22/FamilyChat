const storageKey = "familychat.web.local-user-aliases";
const avatarStorageKey = "familychat.web.local-user-avatars";

export type LocalUserAliases = Record<string, string>;
export type LocalUserAvatars = Record<string, string>;

export function readLocalUserAliases(): LocalUserAliases {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => key.trim().length > 0 && typeof value === "string" && value.trim(),
      ),
    );
  } catch {
    return {};
  }
}

export function writeLocalUserAliases(aliases: LocalUserAliases) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(aliases));
}

export function readLocalUserAvatars(): LocalUserAvatars {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(avatarStorageKey) ?? "{}");
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => key.trim().length > 0 && typeof value === "string" && value.trim(),
      ),
    );
  } catch {
    return {};
  }
}

export function writeLocalUserAvatars(avatars: LocalUserAvatars) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(avatarStorageKey, JSON.stringify(avatars));
}
