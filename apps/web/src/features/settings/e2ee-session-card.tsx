"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { matrixSessionStorage } from "@/features/matrix/session-storage";

export function E2eeSessionCard() {
  const [hasMatrixSession] = useState(() => Boolean(matrixSessionStorage.read()));

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-4">
        <ShieldCheck className="mt-1 h-5 w-5 text-accent-teal" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">E2EE-сессия</h2>
            <Badge>{hasMatrixSession ? "Matrix-сессия найдена" : "Нужно войти"}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            Зашифрованные чаты используют Matrix-криптографию в браузере. Обновление страницы в
            том же браузере сохраняет расшифровку, если локальное хранилище Matrix содержит ключи
            комнаты.
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-lg border border-surface-line bg-surface-raised p-3 text-sm leading-6 text-ink-secondary">
        <KeyRound className="mt-0.5 h-4 w-4 flex-none text-accent-amber" />
        <span>
          Эта карточка информационная: она не проверяет готовность Matrix crypto, наличие ключей
          комнат в IndexedDB, cross-signing или верификацию устройств. Полное восстановление между
          устройствами и интерактивная верификация пока не реализованы. Приложение не запрашивает,
          не экспортирует, не импортирует и не хранит фразы восстановления в Family API.
        </span>
      </div>
    </Card>
  );
}
