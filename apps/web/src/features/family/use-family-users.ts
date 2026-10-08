"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuthStore } from "@/features/auth/auth-store";

import { listFamilyUsers } from "./api";
import type { FamilyUser, FamilyUsersState } from "./types";

const familyUsersStorageKey = "familychat.web.family-users-cache";

function defer(callback: () => void) {
  if (typeof window !== "undefined" && "queueMicrotask" in window) {
    window.queueMicrotask(callback);
    return;
  }
  void Promise.resolve().then(callback);
}

function readCachedFamilyUsers(): FamilyUser[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(familyUsersStorageKey) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((user): user is FamilyUser => {
      if (!user || typeof user !== "object") {
        return false;
      }
      const candidate = user as Record<string, unknown>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.displayName === "string" &&
        typeof candidate.matrixUserId === "string"
      );
    });
  } catch {
    return [];
  }
}

function writeCachedFamilyUsers(users: FamilyUser[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(familyUsersStorageKey, JSON.stringify(users));
}

export function useFamilyUsers() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [users, setUsers] = useState<FamilyUser[]>(() => readCachedFamilyUsers());
  const [state, setState] = useState<FamilyUsersState>("idle");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const mountedRef = useRef(false);

  const refresh = useCallback(() => {
    setRefreshIndex((current) => current + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!accessToken) {
      defer(() => {
        if (mountedRef.current) {
          setUsers([]);
          setState("idle");
        }
      });
      return () => {
        mountedRef.current = false;
      };
    }

    let cancelled = false;
    defer(() => {
      if (!cancelled && mountedRef.current) {
        setState("loading");
      }
    });

    void listFamilyUsers(accessToken)
      .then((nextUsers) => {
        if (!cancelled && mountedRef.current) {
          setUsers(nextUsers);
          writeCachedFamilyUsers(nextUsers);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) {
          const cachedUsers = readCachedFamilyUsers();
          setUsers((current) => (current.length > 0 ? current : cachedUsers));
          setState(cachedUsers.length > 0 ? "ready" : "error");
        }
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [accessToken, refreshIndex]);

  useEffect(() => {
    function refreshOnResume() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      refresh();
    }

    window.addEventListener("focus", refreshOnResume);
    window.addEventListener("pageshow", refreshOnResume);
    document.addEventListener("visibilitychange", refreshOnResume);
    return () => {
      window.removeEventListener("focus", refreshOnResume);
      window.removeEventListener("pageshow", refreshOnResume);
      document.removeEventListener("visibilitychange", refreshOnResume);
    };
  }, [refresh]);

  return useMemo(
    () => ({
      accessToken,
      isLoading: state === "loading" || state === "idle",
      refresh,
      state,
      users,
    }),
    [accessToken, refresh, state, users],
  );
}
