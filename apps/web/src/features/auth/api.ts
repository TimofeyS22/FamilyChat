import { apiRequest } from "@/lib/api/client";

import type { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse } from "./types";

export function loginRequest(payload: LoginRequest) {
  return apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: {
      username: payload.username.trim().toLowerCase(),
      password: payload.password,
    },
  });
}

export function registerRequest(payload: RegisterRequest) {
  return apiRequest<RegisterResponse>("/api/auth/register", {
    method: "POST",
    body: {
      displayName: payload.displayName.trim(),
      username: payload.username.trim().toLowerCase(),
      password: payload.password,
      inviteCode: payload.inviteCode.trim().toUpperCase(),
    },
  });
}
