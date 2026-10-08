import { ApiError } from "@/lib/api/errors";
import { familyApiBaseUrl } from "@/lib/config/env";

export type AdminUser = {
  adminRef: string;
  username: string;
  displayName: string;
  familyCode: string;
  role: "admin" | "member";
  isActive: boolean;
  technicalStatus: string;
  canDeactivate: boolean;
  deactivateBlockedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type InviteStatus = "unused" | "used" | "disabled" | "expired";

export type AdminInvite = {
  adminRef: string;
  label: string;
  boundDisplayName: string | null;
  expiresAt: string | null;
  maxUses: number;
  usedCount: number;
  disabledAt: string | null;
  createdAt: string;
  usedAt: string | null;
  status: InviteStatus;
};

export type AdminInviteCreated = {
  adminRef: string;
  code: string;
  label: string;
  expiresAt: string | null;
  maxUses: number;
  status: InviteStatus;
};

export type AdminStatus = {
  api: {
    status: string;
    detail: string;
  };
  services: Array<{
    name: string;
    status: string;
    detail: string;
  }>;
  stageBlockers: Array<{
    stage: string;
    status: string;
    detail: string;
  }>;
};

export type AdminAudit = {
  items: Array<{
    action: string;
    actorLabel: string;
    createdAt: string;
    metadata: Record<string, string | number | boolean | null>;
    targetLabel: string;
    targetType: string;
  }>;
  limit: number;
  offset: number;
};

export type AdminPushSubscriptionDiagnostics = {
  subscriptionRef: string;
  enabled: boolean;
  privacyPreference: string;
  contentEncoding: string;
  failureCount: number;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserDiagnostics = {
  adminRef: string;
  username: string;
  displayName: string;
  role: "admin" | "member";
  isActive: boolean;
  activePushCount: number;
  totalPushCount: number;
  latestPushUpdatedAt: string | null;
  subscriptions: AdminPushSubscriptionDiagnostics[];
};

export type AdminDiagnostics = {
  pushAvailable: boolean;
  matrixPusherAppId: string;
  matrixPushGatewayConfigured: boolean;
  users: AdminUserDiagnostics[];
};

async function adminRequest<TResponse>(
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

export async function getAdminWorkspace(accessToken: string) {
  const [users, invites, status, audit, diagnostics] = await Promise.all([
    adminRequest<AdminUser[]>(accessToken, "/api/admin/users"),
    adminRequest<AdminInvite[]>(accessToken, "/api/invites"),
    adminRequest<AdminStatus>(accessToken, "/api/admin/status"),
    adminRequest<AdminAudit>(accessToken, "/api/admin/audit?limit=25"),
    adminRequest<AdminDiagnostics>(accessToken, "/api/admin/diagnostics"),
  ]);
  return { audit, diagnostics, invites, status, users };
}

export function createInvite(
  accessToken: string,
  payload: { label: string; boundDisplayName?: string; maxUses?: number },
) {
  return adminRequest<AdminInviteCreated>(accessToken, "/api/invites", {
    body: payload,
    method: "POST",
  });
}

export function disableInvite(accessToken: string, adminRef: string) {
  return adminRequest<{ success: boolean }>(accessToken, `/api/invites/${adminRef}/disable`, {
    method: "POST",
  });
}

export function deactivateUser(accessToken: string, adminRef: string) {
  return adminRequest<{ success: boolean }>(
    accessToken,
    `/api/admin/users/${adminRef}/deactivate`,
    { method: "POST" },
  );
}
