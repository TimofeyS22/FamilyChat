"use client";

import { useEffect, type ReactNode } from "react";
import { create } from "zustand";

import { loginRequest, registerRequest } from "./api";
import { tokenStorage } from "./token-storage";
import type { AuthRole, LoginRequest, RegisterRequest } from "./types";
import { endActiveMatrixSession, loginToMatrix } from "@/features/matrix/matrix-client";
import { matrixSessionStorage } from "@/features/matrix/session-storage";

type AuthState = {
  accessToken: string | null;
  role: AuthRole;
  hydrated: boolean;
  isAuthenticated: boolean;
  hydrate: () => void;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  role: "unknown",
  hydrated: false,
  isAuthenticated: false,
  hydrate: () => {
    const session = tokenStorage.read();
    set({
      accessToken: session?.accessToken ?? null,
      role: session?.role ?? "unknown",
      hydrated: true,
      isAuthenticated: Boolean(session?.accessToken),
    });
  },
  login: async (payload) => {
    tokenStorage.clear();
    matrixSessionStorage.clear();
    await endActiveMatrixSession();

    const response = await loginRequest(payload);
    const matrixSession = await loginToMatrix({
      password: payload.password,
      username: payload.username,
    }).catch((error: unknown) => {
      tokenStorage.clear();
      matrixSessionStorage.clear();
      set({ accessToken: null, hydrated: true, isAuthenticated: false, role: "unknown" });
      throw error;
    });

    const session = tokenStorage.write(response.accessToken);
    matrixSessionStorage.write(matrixSession);
    set({
      accessToken: session.accessToken,
      role: session.role,
      hydrated: true,
      isAuthenticated: true,
    });
  },
  register: async (payload) => {
    await registerRequest(payload);
  },
  logout: () => {
    void endActiveMatrixSession({ logout: true });
    tokenStorage.clear();
    matrixSessionStorage.clear();
    set({ accessToken: null, role: "unknown", hydrated: true, isAuthenticated: false });
  },
}));

export function AuthProvider({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <>{children}</>;
}
