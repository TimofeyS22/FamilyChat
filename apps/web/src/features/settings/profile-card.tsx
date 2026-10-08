"use client";

import { Loader2, Save, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";

import { updateCurrentUserProfile, type CurrentUserProfile } from "./profile-api";

type ProfileCardProps = {
  accessToken: string | null;
  isLoading: boolean;
  onProfileUpdated: (profile: CurrentUserProfile) => void;
  profile: CurrentUserProfile | null;
  state: "idle" | "loading" | "ready" | "error";
};

function defer(callback: () => void) {
  if (typeof window !== "undefined" && "queueMicrotask" in window) {
    window.queueMicrotask(callback);
    return;
  }
  void Promise.resolve().then(callback);
}

export function ProfileCard({
  accessToken,
  isLoading,
  onProfileUpdated,
  profile,
  state,
}: ProfileCardProps) {
  const [displayName, setDisplayName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    defer(() => {
      if (!mounted) {
        return;
      }
      setDisplayName(profile?.displayName ?? "");
    });
    return () => {
      mounted = false;
    };
  }, [profile]);

  const trimmedDisplayName = displayName.trim();
  const displayNameError = useMemo(() => {
    if (!trimmedDisplayName) {
      return "Введите имя.";
    }
    if (trimmedDisplayName.length > 120) {
      return "Имя должно быть не длиннее 120 символов.";
    }
    return null;
  }, [trimmedDisplayName]);

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken || !profile || displayNameError || saving) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const updatedProfile = await updateCurrentUserProfile(accessToken, {
        displayName: trimmedDisplayName,
      });
      onProfileUpdated(updatedProfile);
      setSuccessMessage("Имя сохранено.");
    } catch {
      setErrorMessage("Не удалось сохранить имя. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-4">
        <UserRound className="mt-1 h-5 w-5 text-accent-teal" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Профиль</h2>
            <Badge>Семейный профиль</Badge>
          </div>

          {isLoading ? (
            <p className="mt-2 text-sm leading-6 text-ink-secondary">Загружаем данные аккаунта.</p>
          ) : null}
          {state === "error" ? (
            <p className="mt-2 text-sm leading-6 text-ink-secondary">
              Не удалось загрузить данные аккаунта.
            </p>
          ) : null}
          {state === "ready" && profile ? (
            <p className="mt-2 text-sm text-ink-secondary">@{profile.username}</p>
          ) : null}
          {state === "ready" && !profile ? (
            <p className="mt-2 text-sm leading-6 text-ink-secondary">
              Профиль Family API недоступен в этой сессии.
            </p>
          ) : null}
        </div>
      </div>

      {profile ? (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div>
            <Avatar className="h-16 w-16 text-lg" name={profile.displayName} />
          </div>
          <div className="space-y-3">
            <form className="space-y-3" onSubmit={(event) => void saveDisplayName(event)}>
              <Input
                error={displayNameError ?? undefined}
                label="Имя"
                maxLength={120}
                name="displayName"
                onChange={(event) => {
                  setDisplayName(event.currentTarget.value);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                value={displayName}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={
                    saving ||
                    Boolean(displayNameError) ||
                    trimmedDisplayName === profile.displayName
                  }
                  type="submit"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Сохранить имя
                </Button>
                {successMessage ? (
                  <span className="text-sm font-medium text-accent-teal">{successMessage}</span>
                ) : null}
              </div>
            </form>
            {errorMessage ? <ErrorState message={errorMessage} /> : null}
            <p className="text-sm leading-6 text-ink-secondary">
              Изменение аватара на этой странице пока недоступно. FamilyChat не проксирует файлы
              аватаров через Family API.
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
