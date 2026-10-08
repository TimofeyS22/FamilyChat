import { ApiError } from "@/lib/api/errors";
import { familyApiBaseUrl } from "@/lib/config/env";

import type { FamilyUser } from "./types";

async function familyRequest<TResponse>(path: string, accessToken: string): Promise<TResponse> {
  const response = await fetch(`${familyApiBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "GET",
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError("Request failed", response.status);
  }

  return payload as TResponse;
}

export function listFamilyUsers(accessToken: string) {
  return familyRequest<FamilyUser[]>("/api/family/users", accessToken);
}

export function searchFamilyUserByCode(accessToken: string, familyCode: string) {
  const normalized = familyCode.trim().toUpperCase();
  return familyRequest<FamilyUser>(
    `/api/family/users/search?code=${encodeURIComponent(normalized)}`,
    accessToken,
  );
}
