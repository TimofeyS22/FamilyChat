import { ApiError } from "@/lib/api/errors";
import { familyApiBaseUrl } from "@/lib/config/env";

import type { CallMode, CallTokenResponse } from "./types";

export async function requestCallToken(
  accessToken: string,
  payload: { callId: string; mode: CallMode; targetUserId: string },
) {
  const response = await fetch(`${familyApiBaseUrl}/api/calls/token`, {
    body: JSON.stringify({
      callId: payload.callId,
      mode: payload.mode,
      targetUserId: payload.targetUserId,
    }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new ApiError("Request failed", response.status);
  }

  return (await response.json()) as CallTokenResponse;
}
