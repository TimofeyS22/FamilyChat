import { ApiError } from "@/lib/api/errors";
import { familyApiBaseUrl } from "@/lib/config/env";

export type CurrentUserProfile = {
  username: string;
  displayName: string;
  familyCode: string;
  role: "admin" | "member";
  isActive: boolean;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  e2eeSessionHint: string;
};

async function profileRequest<TResponse>(
  accessToken: string,
  options: { body?: unknown; method?: "GET" | "PATCH" } = {},
): Promise<TResponse> {
  const response = await fetch(`${familyApiBaseUrl}/api/profile/me`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: options.method ?? "GET",
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

export function getCurrentUserProfile(accessToken: string) {
  return profileRequest<CurrentUserProfile>(accessToken);
}

export function updateCurrentUserProfile(
  accessToken: string,
  payload: { displayName: string },
) {
  return profileRequest<CurrentUserProfile>(accessToken, {
    body: payload,
    method: "PATCH",
  });
}
