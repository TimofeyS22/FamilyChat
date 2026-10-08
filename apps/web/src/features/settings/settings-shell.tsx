"use client";

import { useRouter } from "next/navigation";
import type { TouchEvent } from "react";
import { useEffect, useRef } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { AppShell } from "@/components/ui/shell";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { motionPress, motionSurface } from "@/lib/motion/classes";
import { cn } from "@/lib/utils/cn";

import { AccountCard } from "./account-card";
import { E2eeSessionCard } from "./e2ee-session-card";
import { FamilyIdCard } from "./family-id-card";
import { NotificationSettings } from "./notification-settings";
import { ProfileCard } from "./profile-card";
import { useCurrentProfile } from "./use-current-profile";

export function SettingsShell() {
  const { accessToken, isLoading, profile, setProfile, state } = useCurrentProfile();
  const router = useRouter();
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const previousBackground = document.body.style.background;
    document.body.style.background = "#e7f4ff";
    return () => {
      document.body.style.background = previousBackground;
    };
  }, []);

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    if (!touch || touch.clientX > 28) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) {
      return;
    }
    const deltaX = touch.clientX - start.x;
    const deltaY = Math.abs(touch.clientY - start.y);
    if (deltaX > 72 && deltaY < 56) {
      router.replace("/chats");
    }
  }

  return (
    <ProtectedRoute>
      <AppShell
        className="bg-[#e7f4ff] px-4 py-6 motion-safe:motion-fade-in"
        onTouchEnd={onTouchEnd}
        onTouchStart={onTouchStart}
      >
        <div className="mx-auto max-w-3xl space-y-5 motion-safe:motion-slide-up-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-accent-teal">Настройки</p>
              <h1 className="mt-1 text-2xl font-semibold">Параметры FamilyChat</h1>
            </div>
            <button
              className={cn(
                "inline-flex min-h-11 items-center justify-center rounded-lg border border-surface-line bg-surface-muted px-4 py-2 text-sm font-semibold text-ink-primary hover:bg-surface-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal",
                motionSurface,
                motionPress,
              )}
              onClick={() => router.replace("/chats")}
              type="button"
            >
              Вернуться к чатам
            </button>
          </div>

          {state === "error" ? <ErrorState message="Не удалось загрузить профиль настроек." /> : null}

          <ProfileCard
            accessToken={accessToken}
            isLoading={isLoading}
            onProfileUpdated={setProfile}
            profile={profile}
            state={state}
          />

          <FamilyIdCard profile={profile} />

          <NotificationSettings />

          <E2eeSessionCard />

          <AccountCard />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
