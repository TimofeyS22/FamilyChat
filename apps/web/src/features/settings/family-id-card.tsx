"use client";

import { Check, Copy, Home } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import type { CurrentUserProfile } from "./profile-api";

type FamilyIdCardProps = {
  profile: CurrentUserProfile | null;
};

export function FamilyIdCard({ profile }: FamilyIdCardProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const familyCode = profile?.familyCode ?? "";
  const canCopy =
    Boolean(familyCode) &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.clipboard?.writeText);

  async function copyFamilyCode() {
    if (!canCopy) {
      setCopyState("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(familyCode);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <Card className="flex items-start gap-4">
      <Home className="mt-1 h-5 w-5 text-accent-amber" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Семейный ID</h2>
          <Badge>Только FamilyChat</Badge>
        </div>
        <p className="text-sm leading-6 text-ink-secondary">
          Делитесь этим семейным кодом только с родственниками, которые должны найти вас внутри
          FamilyChat. Это не внешний Matrix ID для поиска.
        </p>
        {profile ? (
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-lg border border-surface-line bg-surface-canvas px-3 py-2 text-base font-semibold text-accent-amber">
              {familyCode}
            </code>
            <Button disabled={!canCopy} onClick={() => void copyFamilyCode()} variant="secondary">
              {copyState === "copied" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Скопировать
            </Button>
            {copyState === "copied" ? (
              <span className="text-sm font-medium text-accent-teal">Скопировано.</span>
            ) : null}
            {copyState === "failed" ? (
              <span className="text-sm text-ink-secondary">Копирование недоступно в этом браузере.</span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-secondary">Семейный код загружается.</p>
        )}
      </div>
    </Card>
  );
}
