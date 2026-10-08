"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuthStore } from "@/features/auth/auth-store";

import { getCurrentUserProfile, type CurrentUserProfile } from "./profile-api";

type ProfileState = "idle" | "loading" | "ready" | "error";

export function useCurrentProfile() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [state, setState] = useState<ProfileState>("idle");

  const loadProfile = useCallback(async () => {
    if (!accessToken) {
      setProfile(null);
      setState("idle");
      return;
    }

    setState("loading");
    try {
      const nextProfile = await getCurrentUserProfile(accessToken);
      setProfile(nextProfile);
      setState("ready");
    } catch {
      setProfile(null);
      setState("error");
    }
  }, [accessToken]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadProfile(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadProfile]);

  return useMemo(
    () => ({
      accessToken,
      isLoading: state === "idle" || state === "loading",
      loadProfile,
      profile,
      setProfile,
      state,
    }),
    [accessToken, loadProfile, profile, state],
  );
}
