"use client";

import {
  Activity,
  Bell,
  Clipboard,
  FileClock,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mic,
  RefreshCw,
  ServerCog,
  Smartphone,
  UserRoundX,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { AppShell } from "@/components/ui/shell";
import { useAuthStore } from "@/features/auth/auth-store";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { tokenStorage } from "@/features/auth/token-storage";
import {
  registerMatrixWebPusher,
  removeMatrixWebPusher,
  type MatrixPusherRegistration,
} from "@/features/matrix/matrix-client";
import { matrixSessionStorage } from "@/features/matrix/session-storage";
import {
  getPushSettings,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSettings,
} from "@/features/settings/notifications-api";
import { cn } from "@/lib/utils/cn";

import {
  createInvite,
  deactivateUser,
  disableInvite,
  getAdminWorkspace,
  type AdminAudit,
  type AdminDiagnostics,
  type AdminInvite,
  type AdminInviteCreated,
  type AdminStatus,
  type AdminUser,
} from "./api";

type WorkspaceState =
  | { status: "idle" | "loading" }
  | {
      status: "ready";
      audit: AdminAudit;
      diagnostics: AdminDiagnostics;
      invites: AdminInvite[];
      serviceStatus: AdminStatus;
      users: AdminUser[];
    }
  | { status: "error"; message: string }
  | { status: "denied" };

type PendingAction =
  | "refresh"
  | "device-diagnostics"
  | "repair-push"
  | "repair-matrix-pusher"
  | "update-sw"
  | "check-media"
  | "create-invite"
  | `disable-${string}`
  | `deactivate-${string}`
  | null;

const genericAdminError = "Admin data could not be loaded.";
const notificationStepTimeoutMs = 15000;

type LocalDeviceDiagnostics = {
  browser: string;
  camera: "unknown" | "ok" | "blocked" | "unsupported";
  familyToken: "missing" | "present" | "expired";
  familyTokenExpiresAt: string | null;
  matrixDeviceId: string | null;
  matrixSession: "missing" | "present";
  microphone: "unknown" | "ok" | "blocked" | "unsupported";
  notificationPermission: "default" | "denied" | "granted" | "unsupported";
  pwaMode: "standalone" | "browser";
  pushSubscription: "missing" | "present" | "unsupported";
  serviceWorker: "active" | "installing" | "waiting" | "missing" | "unsupported";
  vapidMatches: "unknown" | "yes" | "no";
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Unknown";
  }
}

function statusTone(status: string) {
  if (status === "ok" || status === "configured" || status === "unused") {
    return "border-accent-teal/40 bg-accent-teal/10 text-accent-teal";
  }
  if (status === "disabled" || status === "partial" || status === "used") {
    return "border-accent-amber/40 bg-accent-amber/10 text-accent-amber";
  }
  if (status === "inactive" || status === "unavailable" || status === "expired") {
    return "border-accent-rose/40 bg-accent-rose/10 text-accent-rose";
  }
  return "border-surface-line bg-surface-raised text-ink-secondary";
}

function safeErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status?: unknown }).status);
    if (status === 403) {
      return "Admin access is required.";
    }
    if (status === 409) {
      return "That admin action is blocked.";
    }
  }
  return genericAdminError;
}

function safeMetadata(metadata: Record<string, string | number | boolean | null>) {
  return Object.entries(metadata).filter(([, value]) => value !== null && value !== "");
}

function decodeJwtExp(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }
    const decoded = JSON.parse(window.atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      exp?: unknown;
    };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isStandalonePwa() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function urlBase64ToUint8Array(value: string) {
  const sanitized = value.trim().replace(/\s/g, "");
  const unpadded = sanitized.replace(/=+$/, "");
  const padding = "=".repeat((4 - (unpadded.length % 4)) % 4);
  const base64 = `${unpadded}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

function arrayBufferEquals(left: ArrayBuffer | null, right: Uint8Array) {
  if (!left) {
    return false;
  }
  const leftBytes = new Uint8Array(left);
  return leftBytes.length === right.length && leftBytes.every((byte, index) => byte === right[index]);
}

function contentEncoding() {
  const manager = window.PushManager as typeof PushManager & {
    supportedContentEncodings?: string[];
  };
  return manager.supportedContentEncodings?.includes("aes128gcm") ? "aes128gcm" : "aesgcm";
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), notificationStepTimeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

function matrixPusherRegistration(settings: PushSettings): MatrixPusherRegistration | null {
  if (!settings.matrixPusher) {
    return null;
  }
  return {
    appId: settings.matrixPusher.appId,
    gatewayUrl: settings.matrixPusher.gatewayUrl,
    pushKey: settings.matrixPusher.pushKey,
  };
}

async function readyServiceWorkerRegistration() {
  const registration =
    (await navigator.serviceWorker.getRegistration?.("/")) ?? (await navigator.serviceWorker.register("/sw.js"));
  if (registration.active) {
    return registration;
  }
  return navigator.serviceWorker.ready;
}

async function readLocalDeviceDiagnostics(accessToken: string | null): Promise<LocalDeviceDiagnostics> {
  const storedToken = tokenStorage.read();
  const tokenExpiresAt = storedToken ? decodeJwtExp(storedToken.accessToken) : null;
  const matrixSession = matrixSessionStorage.read();
  const serviceWorkerSupported = "serviceWorker" in navigator;
  const registration = serviceWorkerSupported ? await navigator.serviceWorker.getRegistration?.("/") : null;
  const pushSupported = "PushManager" in window && serviceWorkerSupported;
  const subscription = pushSupported && registration ? await registration.pushManager.getSubscription() : null;
  let vapidMatches: LocalDeviceDiagnostics["vapidMatches"] = "unknown";
  if (accessToken && subscription) {
    try {
      const settings = await getPushSettings(accessToken);
      if (settings.vapidPublicKey) {
        vapidMatches = arrayBufferEquals(
          subscription.options.applicationServerKey,
          urlBase64ToUint8Array(settings.vapidPublicKey),
        )
          ? "yes"
          : "no";
      }
    } catch {
      vapidMatches = "unknown";
    }
  }
  return {
    browser: navigator.userAgent,
    camera: "unknown",
    familyToken: storedToken ? tokenExpiresAt && tokenExpiresAt <= Date.now() ? "expired" : "present" : "missing",
    familyTokenExpiresAt: tokenExpiresAt ? new Date(tokenExpiresAt).toISOString() : null,
    matrixDeviceId: matrixSession?.deviceId ?? null,
    matrixSession: matrixSession ? "present" : "missing",
    microphone: "unknown",
    notificationPermission: "Notification" in window ? Notification.permission : "unsupported",
    pwaMode: isStandalonePwa() ? "standalone" : "browser",
    pushSubscription: pushSupported ? (subscription ? "present" : "missing") : "unsupported",
    serviceWorker: !serviceWorkerSupported
      ? "unsupported"
      : registration?.active
        ? "active"
        : registration?.waiting
          ? "waiting"
          : registration?.installing
            ? "installing"
            : "missing",
    vapidMatches,
  };
}

async function checkMedia(kind: "camera" | "microphone") {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "unsupported" as const;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "camera" ? { video: true } : { audio: true },
    );
    stream.getTracks().forEach((track) => track.stop());
    return "ok" as const;
  } catch {
    return "blocked" as const;
  }
}

export function AdminShell() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.role);
  const [workspace, setWorkspace] = useState<WorkspaceState>({ status: "idle" });
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<AdminInviteCreated | null>(null);
  const [deviceDiagnostics, setDeviceDiagnostics] = useState<LocalDeviceDiagnostics | null>(null);
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");

  const loadWorkspace = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    if (role !== "admin") {
      setWorkspace({ status: "denied" });
      return;
    }
    setWorkspace((current) => (current.status === "ready" ? current : { status: "loading" }));
    setActionError(null);
    try {
      const nextWorkspace = await getAdminWorkspace(accessToken);
      setWorkspace({
        audit: nextWorkspace.audit,
        diagnostics: nextWorkspace.diagnostics,
        invites: nextWorkspace.invites,
        serviceStatus: nextWorkspace.status,
        status: "ready",
        users: nextWorkspace.users,
      });
    } catch (error) {
      const denied =
        error &&
        typeof error === "object" &&
        "status" in error &&
        Number((error as { status?: unknown }).status) === 403;
      setWorkspace(denied ? { status: "denied" } : { message: safeErrorMessage(error), status: "error" });
    }
  }, [accessToken, role]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadWorkspace]);

  useEffect(() => {
    if (!accessToken || role !== "admin") {
      return;
    }
    let cancelled = false;
    void readLocalDeviceDiagnostics(accessToken).then((diagnostics) => {
      if (!cancelled) {
        setDeviceDiagnostics(diagnostics);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, role]);

  const activeAdminCount = useMemo(() => {
    if (workspace.status !== "ready") {
      return 0;
    }
    return workspace.users.filter((user) => user.role === "admin" && user.isActive).length;
  }, [workspace]);

  async function refreshWorkspace() {
    setPendingAction("refresh");
    try {
      await loadWorkspace();
    } finally {
      setPendingAction(null);
    }
  }

  async function refreshDeviceDiagnostics() {
    setPendingAction("device-diagnostics");
    setActionError(null);
    try {
      setDeviceDiagnostics(await readLocalDeviceDiagnostics(accessToken));
      setDeviceMessage("Device diagnostics refreshed.");
    } catch {
      setActionError("Device diagnostics could not be checked.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleUpdateServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      setDeviceMessage("Service Worker is not supported in this browser.");
      return;
    }
    setPendingAction("update-sw");
    setActionError(null);
    try {
      const registration = await readyServiceWorkerRegistration();
      await registration.update();
      setDeviceMessage("Service Worker update requested. Reload if the app asks for it.");
      setDeviceDiagnostics(await readLocalDeviceDiagnostics(accessToken));
    } catch {
      setActionError("Service Worker could not be updated.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRepairMatrixPusher() {
    if (!accessToken) {
      return;
    }
    setPendingAction("repair-matrix-pusher");
    setActionError(null);
    try {
      const settings = await getPushSettings(accessToken);
      const pusher = matrixPusherRegistration(settings);
      const session = matrixSessionStorage.read();
      if (!session || !pusher) {
        setDeviceMessage("Matrix session or pusher settings are missing.");
        return;
      }
      await registerMatrixWebPusher(session, pusher);
      setDeviceMessage("Matrix pusher was re-registered for this device.");
      setDeviceDiagnostics(await readLocalDeviceDiagnostics(accessToken));
    } catch {
      setActionError("Matrix pusher could not be repaired.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRepairPushSubscription() {
    if (!accessToken || !("PushManager" in window) || !("Notification" in window)) {
      setDeviceMessage("Web Push is not supported in this browser.");
      return;
    }
    setPendingAction("repair-push");
    setActionError(null);
    try {
      const settings = await getPushSettings(accessToken);
      if (!settings.vapidPublicKey) {
        setDeviceMessage("Server VAPID key is not configured.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDeviceMessage("Notifications are not allowed in this browser.");
        return;
      }
      const registration = await readyServiceWorkerRegistration();
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await unsubscribeFromPush(accessToken, { endpoint: existing.endpoint }).catch(() => undefined);
        await existing.unsubscribe().catch(() => undefined);
      }
      const subscription = await withTimeout(
        registration.pushManager.subscribe({
          applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey),
          userVisibleOnly: true,
        }),
        "Push subscription is taking too long.",
      );
      const subscriptionJson = subscription.toJSON();
      const response = await subscribeToPush(accessToken, {
        contentEncoding: contentEncoding(),
        endpoint: subscription.endpoint,
        keys: {
          auth: subscriptionJson.keys?.auth ?? "",
          p256dh: subscriptionJson.keys?.p256dh ?? "",
        },
        privacyPreference: settings.privacyPreference,
      });
      const matrixSession = matrixSessionStorage.read();
      if (matrixSession && response.matrixPusher) {
        await removeMatrixWebPusher(matrixSession, {
          appId: response.matrixPusher.appId,
          gatewayUrl: response.matrixPusher.gatewayUrl,
          pushKey: response.matrixPusher.pushKey,
        }).catch(() => undefined);
        await registerMatrixWebPusher(matrixSession, {
          appId: response.matrixPusher.appId,
          gatewayUrl: response.matrixPusher.gatewayUrl,
          pushKey: response.matrixPusher.pushKey,
        });
      }
      setDeviceMessage("Push subscription was rebuilt for this device.");
      setDeviceDiagnostics(await readLocalDeviceDiagnostics(accessToken));
      await loadWorkspace();
    } catch {
      setActionError("Push subscription could not be repaired.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCheckMediaDevices() {
    setPendingAction("check-media");
    setActionError(null);
    try {
      const [microphone, camera] = await Promise.all([checkMedia("microphone"), checkMedia("camera")]);
      const current = await readLocalDeviceDiagnostics(accessToken);
      setDeviceDiagnostics({ ...current, camera, microphone });
      setDeviceMessage("Camera and microphone check completed.");
    } catch {
      setActionError("Camera and microphone could not be checked.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCreateInvite() {
    if (!accessToken || !inviteLabel.trim()) {
      return;
    }
    setPendingAction("create-invite");
    setActionError(null);
    try {
      const invite = await createInvite(accessToken, {
        boundDisplayName: inviteDisplayName.trim() || undefined,
        label: inviteLabel.trim(),
        maxUses: 1,
      });
      setCreatedInvite(invite);
      setInviteLabel("");
      setInviteDisplayName("");
      await loadWorkspace();
    } catch {
      setActionError("Invite could not be created.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDisableInvite(invite: AdminInvite) {
    if (!accessToken || invite.status === "disabled") {
      return;
    }
    if (!window.confirm(`Disable invite ${invite.label}?`)) {
      return;
    }
    setPendingAction(`disable-${invite.adminRef}`);
    setActionError(null);
    try {
      await disableInvite(accessToken, invite.adminRef);
      await loadWorkspace();
    } catch {
      setActionError("Invite could not be disabled.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDeactivateUser(user: AdminUser) {
    if (!accessToken || !user.canDeactivate) {
      return;
    }
    if (!window.confirm(`Deactivate ${user.displayName}?`)) {
      return;
    }
    setPendingAction(`deactivate-${user.adminRef}`);
    setActionError(null);
    try {
      await deactivateUser(accessToken, user.adminRef);
      await loadWorkspace();
    } catch {
      setActionError("User could not be deactivated.");
    } finally {
      setPendingAction(null);
    }
  }

  async function copyInviteCode() {
    if (!createdInvite?.code || !window.navigator.clipboard?.writeText) {
      return;
    }
    await window.navigator.clipboard.writeText(createdInvite.code).catch(() => undefined);
  }

  return (
    <ProtectedRoute>
      <AppShell className="px-4 py-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-accent-teal">Admin</p>
              <h1 className="mt-1 text-2xl font-semibold">Family administration</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {workspace.status === "ready" ? (
                <Button
                  disabled={pendingAction === "refresh"}
                  onClick={() => void refreshWorkspace()}
                  variant="secondary"
                >
                  {pendingAction === "refresh" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
              ) : null}
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-surface-line bg-surface-muted px-4 py-2 text-sm font-semibold text-ink-primary transition hover:bg-surface-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-teal"
                href="/chats"
              >
                Back to chats
              </Link>
            </div>
          </div>

          {workspace.status === "idle" || workspace.status === "loading" ? (
            <LoadingState className="min-h-80 rounded-lg border border-surface-line bg-surface-panel" label="Loading admin workspace" />
          ) : null}

          {workspace.status === "denied" ? (
            <EmptyState
              className="min-h-80 rounded-lg border border-surface-line bg-surface-panel"
              description="This account cannot open the administration workspace."
              icon={<LockKeyhole className="h-5 w-5" />}
              title="Admin access required"
            />
          ) : null}

          {workspace.status === "error" ? <ErrorState message={workspace.message} /> : null}

          {workspace.status === "ready" ? (
            <>
              {actionError ? <ErrorState message={actionError} /> : null}
              <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
                <UsersSection
                  activeAdminCount={activeAdminCount}
                  onDeactivate={handleDeactivateUser}
                  pendingAction={pendingAction}
                  users={workspace.users}
                />
                <InvitesSection
                  createdInvite={createdInvite}
                  inviteDisplayName={inviteDisplayName}
                  inviteLabel={inviteLabel}
                  invites={workspace.invites}
                  onCopyInvite={copyInviteCode}
                  onCreateInvite={handleCreateInvite}
                  onDisableInvite={handleDisableInvite}
                  pendingAction={pendingAction}
                  setInviteDisplayName={setInviteDisplayName}
                  setInviteLabel={setInviteLabel}
                />
              </div>
              <DiagnosticsSection
                diagnostics={workspace.diagnostics}
                deviceDiagnostics={deviceDiagnostics}
                deviceMessage={deviceMessage}
                onCheckMediaDevices={handleCheckMediaDevices}
                onRefreshDeviceDiagnostics={refreshDeviceDiagnostics}
                onRepairMatrixPusher={handleRepairMatrixPusher}
                onRepairPushSubscription={handleRepairPushSubscription}
                onUpdateServiceWorker={handleUpdateServiceWorker}
                pendingAction={pendingAction}
              />
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <StatusSection serviceStatus={workspace.serviceStatus} />
                <AuditSection audit={workspace.audit} />
              </div>
            </>
          ) : null}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

function SectionHeader({
  icon,
  kicker,
  title,
}: {
  icon: ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="mt-1 text-accent-teal">{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase text-ink-muted">{kicker}</p>
        <h2 className="text-base font-semibold text-ink-primary">{title}</h2>
      </div>
    </div>
  );
}

function UsersSection({
  activeAdminCount,
  onDeactivate,
  pendingAction,
  users,
}: {
  activeAdminCount: number;
  onDeactivate: (user: AdminUser) => void;
  pendingAction: PendingAction;
  users: AdminUser[];
}) {
  return (
    <Card>
      <SectionHeader
        icon={<Users className="h-5 w-5" />}
        kicker={`${users.length} accounts`}
        title="Users"
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="text-xs uppercase text-ink-muted">
            <tr className="border-b border-surface-line">
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Role</th>
              <th className="py-2 pr-3 font-semibold">Status</th>
              <th className="py-2 pr-3 font-semibold">Family code</th>
              <th className="py-2 pr-3 font-semibold">Created</th>
              <th className="py-2 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="border-b border-surface-line/70 last:border-0" key={user.adminRef}>
                <td className="py-3 pr-3">
                  <div className="font-semibold text-ink-primary">{user.displayName}</div>
                  <div className="text-xs text-ink-secondary">@{user.username}</div>
                </td>
                <td className="py-3 pr-3">
                  <Badge className={user.role === "admin" ? "text-accent-teal" : undefined}>
                    {user.role}
                  </Badge>
                </td>
                <td className="py-3 pr-3">
                  <Badge className={statusTone(user.isActive ? "ok" : "inactive")}>
                    {user.technicalStatus}
                  </Badge>
                </td>
                <td className="py-3 pr-3 font-semibold text-accent-amber">{user.familyCode}</td>
                <td className="py-3 pr-3 text-ink-secondary">{formatDate(user.createdAt)}</td>
                <td className="py-3 text-right">
                  <Button
                    disabled={!user.canDeactivate || pendingAction === `deactivate-${user.adminRef}`}
                    onClick={() => onDeactivate(user)}
                    title={
                      user.deactivateBlockedReason ??
                      (activeAdminCount <= 1 && user.role === "admin"
                        ? "The last active admin is protected."
                        : "Deactivate user")
                    }
                    variant="danger"
                  >
                    {pendingAction === `deactivate-${user.adminRef}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserRoundX className="h-4 w-4" />
                    )}
                    Deactivate
                  </Button>
                  {user.deactivateBlockedReason ? (
                    <p className="mt-1 max-w-48 text-right text-xs text-ink-muted">
                      {user.deactivateBlockedReason}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function InvitesSection({
  createdInvite,
  inviteDisplayName,
  inviteLabel,
  invites,
  onCopyInvite,
  onCreateInvite,
  onDisableInvite,
  pendingAction,
  setInviteDisplayName,
  setInviteLabel,
}: {
  createdInvite: AdminInviteCreated | null;
  inviteDisplayName: string;
  inviteLabel: string;
  invites: AdminInvite[];
  onCopyInvite: () => void;
  onCreateInvite: () => void;
  onDisableInvite: (invite: AdminInvite) => void;
  pendingAction: PendingAction;
  setInviteDisplayName: (value: string) => void;
  setInviteLabel: (value: string) => void;
}) {
  return (
    <Card>
      <SectionHeader icon={<KeyRound className="h-5 w-5" />} kicker="Access" title="Invite codes" />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Input
          label="Invite label"
          maxLength={32}
          onChange={(event) => setInviteLabel(event.currentTarget.value)}
          placeholder="Mama"
          value={inviteLabel}
        />
        <Input
          label="Bound display name"
          maxLength={120}
          onChange={(event) => setInviteDisplayName(event.currentTarget.value)}
          placeholder="Optional"
          value={inviteDisplayName}
        />
        <Button
          disabled={!inviteLabel.trim() || pendingAction === "create-invite"}
          onClick={() => onCreateInvite()}
        >
          {pendingAction === "create-invite" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          Create
        </Button>
      </div>

      {createdInvite ? (
        <div className="mt-4 rounded-lg border border-accent-amber/40 bg-accent-amber/10 p-3">
          <p className="text-sm font-semibold text-accent-amber">Copy/save this invite now.</p>
          <p className="mt-1 text-sm text-ink-secondary">
            The plaintext invite code is shown only once and cannot be recovered after reload.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-surface-line bg-surface-canvas px-3 py-2 text-sm font-semibold text-ink-primary">
              {createdInvite.code}
            </code>
            <Button onClick={() => onCopyInvite()} variant="secondary">
              <Clipboard className="h-4 w-4" />
              Copy
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {invites.length === 0 ? (
          <p className="text-sm text-ink-secondary">No invite codes yet.</p>
        ) : null}
        {invites.map((invite) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-line pb-3 last:border-0 last:pb-0"
            key={invite.adminRef}
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink-primary">{invite.label}</p>
                <Badge className={statusTone(invite.status)}>{invite.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-secondary">
                Uses {invite.usedCount}/{invite.maxUses}
                {invite.boundDisplayName ? ` · bound to ${invite.boundDisplayName}` : ""}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Created {formatDate(invite.createdAt)}
                {invite.usedAt ? ` · used ${formatDate(invite.usedAt)}` : ""}
              </p>
            </div>
            <Button
              disabled={invite.status === "disabled" || pendingAction === `disable-${invite.adminRef}`}
              onClick={() => onDisableInvite(invite)}
              variant="secondary"
            >
              {pendingAction === `disable-${invite.adminRef}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Disable
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function diagnosticTone(value: string | number | boolean | null) {
  if (value === true || value === "ok" || value === "present" || value === "active" || value === "granted" || value === "standalone" || value === "yes") {
    return statusTone("ok");
  }
  if (value === false || value === "blocked" || value === "denied" || value === "expired" || value === "missing" || value === "no") {
    return statusTone("inactive");
  }
  return statusTone("partial");
}

function DiagnosticsSection({
  diagnostics,
  deviceDiagnostics,
  deviceMessage,
  onCheckMediaDevices,
  onRefreshDeviceDiagnostics,
  onRepairMatrixPusher,
  onRepairPushSubscription,
  onUpdateServiceWorker,
  pendingAction,
}: {
  diagnostics: AdminDiagnostics;
  deviceDiagnostics: LocalDeviceDiagnostics | null;
  deviceMessage: string | null;
  onCheckMediaDevices: () => void;
  onRefreshDeviceDiagnostics: () => void;
  onRepairMatrixPusher: () => void;
  onRepairPushSubscription: () => void;
  onUpdateServiceWorker: () => void;
  pendingAction: PendingAction;
}) {
  const localItems = deviceDiagnostics
    ? [
        ["PWA mode", deviceDiagnostics.pwaMode],
        ["Notifications", deviceDiagnostics.notificationPermission],
        ["Service Worker", deviceDiagnostics.serviceWorker],
        ["Browser push", deviceDiagnostics.pushSubscription],
        ["VAPID match", deviceDiagnostics.vapidMatches],
        ["Family token", deviceDiagnostics.familyToken],
        ["Matrix session", deviceDiagnostics.matrixSession],
        ["Matrix device", deviceDiagnostics.matrixDeviceId ? "present" : "missing"],
        ["Microphone", deviceDiagnostics.microphone],
        ["Camera", deviceDiagnostics.camera],
      ]
    : [];
  return (
    <Card>
      <SectionHeader
        icon={<Activity className="h-5 w-5" />}
        kicker="Troubleshooting"
        title="Device diagnostics"
      />
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.25fr]">
        <div className="rounded-lg border border-surface-line bg-surface-raised p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ink-primary">This admin device</p>
              <p className="mt-1 text-sm text-ink-secondary">
                Browser-only checks for the current device. Remote Safari permission cannot be read from here.
              </p>
            </div>
            <Button
              disabled={pendingAction === "device-diagnostics"}
              onClick={() => onRefreshDeviceDiagnostics()}
              variant="secondary"
            >
              {pendingAction === "device-diagnostics" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Check
            </Button>
          </div>
          {deviceMessage ? <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-700">{deviceMessage}</p> : null}
          {deviceDiagnostics ? (
            <>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {localItems.map(([label, value]) => (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm" key={label}>
                    <span className="text-ink-secondary">{label}</span>
                    <Badge className={diagnosticTone(value)}>{value ?? "unknown"}</Badge>
                  </div>
                ))}
              </div>
              <p className="mt-3 truncate text-xs text-ink-muted">Browser: {deviceDiagnostics.browser}</p>
              {deviceDiagnostics.familyTokenExpiresAt ? (
                <p className="mt-1 text-xs text-ink-muted">
                  Token expires: {formatDate(deviceDiagnostics.familyTokenExpiresAt)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-4 text-sm text-ink-secondary">Device diagnostics have not been checked yet.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={pendingAction === "repair-push"} onClick={() => onRepairPushSubscription()} variant="secondary">
              {pendingAction === "repair-push" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Rebuild push
            </Button>
            <Button disabled={pendingAction === "repair-matrix-pusher"} onClick={() => onRepairMatrixPusher()} variant="secondary">
              {pendingAction === "repair-matrix-pusher" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              Re-register pusher
            </Button>
            <Button disabled={pendingAction === "update-sw"} onClick={() => onUpdateServiceWorker()} variant="secondary">
              {pendingAction === "update-sw" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Update SW
            </Button>
            <Button disabled={pendingAction === "check-media"} onClick={() => onCheckMediaDevices()} variant="secondary">
              {pendingAction === "check-media" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              Mic/camera
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-surface-line bg-surface-raised p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-ink-primary">Family push health</p>
              <p className="mt-1 text-sm text-ink-secondary">
                Server-side state for users. No endpoints, keys, tokens, or Matrix IDs are exposed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className={diagnosticTone(diagnostics.pushAvailable)}>
                Push {diagnostics.pushAvailable ? "configured" : "unavailable"}
              </Badge>
              <Badge className={diagnosticTone(diagnostics.matrixPushGatewayConfigured)}>
                Matrix gateway {diagnostics.matrixPushGatewayConfigured ? "set" : "missing"}
              </Badge>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {diagnostics.users.map((user) => (
              <div className="rounded-lg border border-surface-line bg-white/70 p-3" key={user.adminRef}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-primary">@{user.username}</p>
                    <p className="text-xs text-ink-muted">{user.role}</p>
                  </div>
                  <Badge className={diagnosticTone(user.activePushCount > 0)}>
                    {user.activePushCount}/{user.totalPushCount} active push
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-ink-secondary">
                  Latest push update: {formatDate(user.latestPushUpdatedAt)}
                </p>
                <div className="mt-3 grid gap-2">
                  {user.subscriptions.length === 0 ? (
                    <p className="text-sm text-ink-muted">No push subscriptions for this user.</p>
                  ) : null}
                  {user.subscriptions.map((subscription) => (
                    <div className="rounded-lg bg-surface-canvas px-3 py-2 text-xs" key={subscription.subscriptionRef}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-ink-primary">{subscription.subscriptionRef}</span>
                        <Badge className={diagnosticTone(subscription.enabled)}>
                          {subscription.enabled ? "enabled" : "disabled"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-ink-secondary">
                        Updated {formatDate(subscription.updatedAt)} · privacy {subscription.privacyPreference} · failures {subscription.failureCount}
                      </p>
                      {subscription.lastFailureReason ? (
                        <p className="mt-1 text-accent-rose">
                          Last failure: {subscription.lastFailureReason} {subscription.lastFailureAt ? `at ${formatDate(subscription.lastFailureAt)}` : ""}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function StatusSection({ serviceStatus }: { serviceStatus: AdminStatus }) {
  return (
    <Card>
      <SectionHeader
        icon={<ServerCog className="h-5 w-5" />}
        kicker="Safe checks"
        title="Technical status"
      />
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 rounded-lg border border-surface-line bg-surface-raised p-3">
          <div>
            <p className="font-semibold text-ink-primary">Family API</p>
            <p className="mt-1 text-sm text-ink-secondary">{serviceStatus.api.detail}</p>
          </div>
          <Badge className={statusTone(serviceStatus.api.status)}>{serviceStatus.api.status}</Badge>
        </div>
        {serviceStatus.services.map((service) => (
          <div
            className="flex items-start justify-between gap-3 rounded-lg border border-surface-line bg-surface-raised p-3"
            key={service.name}
          >
            <div>
              <p className="font-semibold text-ink-primary">{service.name}</p>
              <p className="mt-1 text-sm text-ink-secondary">{service.detail}</p>
            </div>
            <Badge className={statusTone(service.status)}>{service.status}</Badge>
          </div>
        ))}
      </div>
      <div className="mt-5 border-t border-surface-line pt-4">
        <p className="text-sm font-semibold text-ink-primary">Live smoke blockers</p>
        <div className="mt-3 grid gap-2">
          {serviceStatus.stageBlockers.map((blocker) => (
            <div className="flex items-start justify-between gap-3 text-sm" key={blocker.stage}>
              <div>
                <p className="font-semibold text-ink-primary">{blocker.stage}</p>
                <p className="text-ink-secondary">{blocker.detail}</p>
              </div>
              <Badge className={statusTone(blocker.status)}>{blocker.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function AuditSection({ audit }: { audit: AdminAudit }) {
  return (
    <Card>
      <SectionHeader
        icon={<FileClock className="h-5 w-5" />}
        kicker={`Latest ${audit.items.length}`}
        title="Audit log"
      />
      <div className="space-y-3">
        {audit.items.length === 0 ? (
          <p className="text-sm text-ink-secondary">No audit events yet.</p>
        ) : null}
        {audit.items.map((item, index) => {
          const metadata = safeMetadata(item.metadata);
          return (
            <div
              className="border-b border-surface-line pb-3 last:border-0 last:pb-0"
              key={`${item.createdAt}-${item.action}-${index}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink-primary">{item.action}</p>
                <Badge>{item.targetLabel}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-secondary">
                {formatDate(item.createdAt)} by {item.actorLabel}
              </p>
              {metadata.length ? (
                <dl className="mt-2 flex flex-wrap gap-2 text-xs text-ink-secondary">
                  {metadata.map(([key, value]) => (
                    <div
                      className={cn(
                        "rounded-md border border-surface-line bg-surface-raised px-2 py-1",
                      )}
                      key={key}
                    >
                      <dt className="inline font-semibold">{key}: </dt>
                      <dd className="inline">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
