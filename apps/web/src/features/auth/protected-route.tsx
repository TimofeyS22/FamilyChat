"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { LoadingState } from "@/components/ui/loading-state";
import { useAuthStore } from "@/features/auth/auth-store";

type ProtectedRouteProps = {
  children: ReactNode;
};

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const hydrated = useAuthStore((state) => state.hydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated) {
    return <LoadingState label="Открываем FamilyChat" className="min-h-dvh" />;
  }

  if (!isAuthenticated) {
    return <LoadingState label="Перенаправляем" className="min-h-dvh" />;
  }

  return children;
}

export function HomeRedirect() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    router.replace(isAuthenticated ? "/chats" : "/login");
  }, [hydrated, isAuthenticated, router]);

  return <LoadingState label="Открываем FamilyChat" className="min-h-dvh" />;
}
