"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/features/auth/auth-store";

export function AccountCard() {
  const logout = useAuthStore((state) => state.logout);

  return (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-base font-semibold">Аккаунт</h2>
        <p className="mt-2 text-sm leading-6 text-ink-secondary">
          Выход очищает локальный токен приложения и локальную оболочку Matrix-сессии. Ключи
          шифрования в IndexedDB и серверные Matrix-ключи этим не удаляются.
        </p>
      </div>
      <Button className="sm:flex-none" onClick={logout} variant="danger">
        <LogOut className="h-4 w-4" />
        Выйти
      </Button>
    </Card>
  );
}
