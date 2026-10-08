import { ApiError } from "@/lib/api/errors";
import { familyApiBaseUrl } from "@/lib/config/env";

export type PushPrivacyPreference =
  | "fact_only"
  | "sender_name"
  | "message_text"
  | "sender_and_preview";

export type MatrixPusherConfig = {
  appId: string;
  gatewayUrl: string;
  pushKey: string;
};

export type PushSettings = {
  enabled: boolean;
  subscriptionId: string | null;
  privacyPreference: PushPrivacyPreference;
  vapidPublicKey: string | null;
  matrixPusherAppId: string;
  matrixPushGatewayUrl: string;
  matrixPusher: MatrixPusherConfig | null;
  pushAvailable: boolean;
};

export type PushSubscribePayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  contentEncoding: string;
  privacyPreference?: PushPrivacyPreference;
};

export type PushSubscribeResponse = {
  subscriptionId: string;
  enabled: boolean;
  privacyPreference: PushPrivacyPreference;
  matrixPusher: MatrixPusherConfig | null;
};

async function pushRequest<TResponse>(
  accessToken: string,
  path: string,
  options: { body?: unknown; method?: "GET" | "POST" } = {},
): Promise<TResponse> {
  const response = await fetch(`${familyApiBaseUrl}${path}`, {
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

export function getPushSettings(accessToken: string) {
  return pushRequest<PushSettings>(accessToken, "/api/push/settings");
}

export function subscribeToPush(accessToken: string, payload: PushSubscribePayload) {
  return pushRequest<PushSubscribeResponse>(accessToken, "/api/push/subscribe", {
    body: payload,
    method: "POST",
  });
}

export function unsubscribeFromPush(
  accessToken: string,
  payload: { endpoint?: string; subscriptionId?: string },
) {
  return pushRequest<{ success: boolean }>(accessToken, "/api/push/unsubscribe", {
    body: payload,
    method: "POST",
  });
}

export function updatePushPrivacy(
  accessToken: string,
  privacyPreference: PushPrivacyPreference,
) {
  return pushRequest<{ privacyPreference: PushPrivacyPreference }>(accessToken, "/api/push/privacy", {
    body: { privacyPreference },
    method: "POST",
  });
}

export function sendTestPush(accessToken: string) {
  return pushRequest<{ success: boolean }>(accessToken, "/api/push/test", {
    method: "POST",
  });
}
