import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "@/features/auth/auth-store";
import { matrixSessionStorage } from "@/features/matrix/session-storage";
import { NotificationSettings } from "@/features/settings/notification-settings";
import type { CurrentUserProfile } from "@/features/settings/profile-api";
import { SettingsShell } from "@/features/settings/settings-shell";

import { getMatrixSdkMocks, mockRouter } from "./setup";

const profileResponse: CurrentUserProfile = {
  avatarUrl: null,
  createdAt: "2026-06-28T12:00:00Z",
  displayName: "Timofey",
  e2eeSessionHint: "Browser-side Matrix crypto is managed by the web client.",
  familyCode: "TIM-1000",
  isActive: true,
  role: "member",
  updatedAt: "2026-06-28T12:00:00Z",
  username: "timofey",
};

function authenticate() {
  useAuthStore.setState({
    accessToken: "not-rendered-family-token",
    hydrated: true,
    isAuthenticated: true,
    role: "member",
  });
  matrixSessionStorage.write({
    accessToken: "not-rendered-matrix-token",
    baseUrl: "http://localhost:8080",
    deviceId: "FAKEDEVICE",
    userId: "@timofey:familychat.local",
  });
}

type BrowserPushOptions = {
  existingSubscription?: PushSubscription | null;
  permission?: NotificationPermission;
  requestPermissionResult?: NotificationPermission;
};

const pushEndpoint = "https://push.example/subscription/secret-endpoint";
const pushKeys = {
  auth: "auth-secret",
  p256dh: "p256dh-public-key",
};
const vapidPublicKey =
  "BAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0-P0A";

function decodedVapidKey(value = vapidPublicKey) {
  const unpadded = value.replace(/=+$/, "");
  const padding = "=".repeat((4 - (unpadded.length % 4)) % 4);
  const raw = window.atob(`${unpadded}${padding}`.replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output.buffer;
}

function makePushSubscription(endpoint = pushEndpoint, applicationServerKey = decodedVapidKey()) {
  return {
    endpoint,
    options: {
      applicationServerKey,
    },
    toJSON: vi.fn(() => ({
      endpoint,
      keys: pushKeys,
    })),
    unsubscribe: vi.fn(() => Promise.resolve(true)),
  } as unknown as PushSubscription;
}

function installBrowserPush({
  existingSubscription = null,
  permission = "default",
  requestPermissionResult = "granted",
}: BrowserPushOptions = {}) {
  const requestPermission = vi.fn(() => Promise.resolve(requestPermissionResult));
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: true,
  });
  vi.stubGlobal("Notification", {
    permission,
    requestPermission,
  });
  vi.stubGlobal("PushManager", {
    supportedContentEncodings: ["aes128gcm"],
  });

  const subscription = makePushSubscription();
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(existingSubscription)),
    subscribe: vi.fn(() => Promise.resolve(subscription)),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager }),
      register: vi.fn(() => Promise.resolve({})),
    },
  });

  return {
    pushManager,
    requestPermission,
    subscription,
  };
}

function pushSettingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    enabled: false,
    matrixPushGatewayUrl: "http://family-api:8000/api/push/matrix/notify",
    matrixPusher: null,
    matrixPusherAppId: "familychat.web",
    privacyPreference: "fact_only",
    pushAvailable: true,
    subscriptionId: null,
    vapidPublicKey,
    ...overrides,
  };
}

function stubSettingsFetch({
  patchFails = false,
  profile = profileResponse,
  settings = pushSettingsResponse(),
}: {
  patchFails?: boolean;
  profile?: typeof profileResponse;
  settings?: ReturnType<typeof pushSettingsResponse>;
} = {}) {
  const calls: { body: unknown; method: string; path: string }[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    let body: unknown = null;
    if (typeof init?.body === "string") {
      body = JSON.parse(init.body) as unknown;
    }
    calls.push({ body, method, path: url.pathname });

    if (url.pathname === "/api/profile/me" && method === "GET") {
      return Promise.resolve(
        new Response(JSON.stringify(profile), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );
    }

    if (url.pathname === "/api/profile/me" && method === "PATCH") {
      if (patchFails) {
        return Promise.resolve(new Response(JSON.stringify({ detail: "failed" }), { status: 500 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ...profile,
            displayName:
              typeof body === "object" && body !== null && "displayName" in body
                ? String((body as { displayName: unknown }).displayName)
                : profile.displayName,
            updatedAt: "2026-06-28T12:01:00Z",
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      );
    }

    if (url.pathname === "/api/push/settings") {
      return Promise.resolve(
        new Response(JSON.stringify(settings), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );
    }

    if (url.pathname === "/api/push/subscribe") {
      return Promise.resolve(
        new Response(
          JSON.stringify(
            pushSettingsResponse({
              enabled: true,
              matrixPusher: {
                appId: "familychat.web",
                gatewayUrl: "http://family-api:8000/api/push/matrix/notify",
                pushKey: "push-subscription-id",
              },
              subscriptionId: "push-subscription-id",
            }),
          ),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        ),
      );
    }

    if (url.pathname === "/api/push/unsubscribe" || url.pathname === "/api/push/test") {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );
    }

    if (url.pathname === "/api/push/privacy") {
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );
    }

    return Promise.resolve(new Response("not found", { status: 404 }));
  });

  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

beforeEach(() => {
  authenticate();
});

describe("settings profile", () => {
  it("renders the current Family API profile without raw identifiers", async () => {
    installBrowserPush();
    stubSettingsFetch();

    render(<SettingsShell />);

    expect(await screen.findByDisplayValue("Timofey")).toBeInTheDocument();
    expect(screen.getByText("@timofey")).toBeInTheDocument();
    expect(screen.getByText("TIM-1000")).toBeInTheDocument();
    expect(screen.queryByText("@timofey:familychat.local")).not.toBeInTheDocument();
    expect(screen.queryByText("FAKEDEVICE")).not.toBeInTheDocument();
    expect(screen.queryByText("not-rendered-family-token")).not.toBeInTheDocument();
    expect(screen.queryByText("not-rendered-matrix-token")).not.toBeInTheDocument();
  });

  it("blocks unauthenticated settings and does not render private data before redirect", async () => {
    useAuthStore.setState({
      accessToken: null,
      hydrated: true,
      isAuthenticated: false,
      role: "unknown",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<SettingsShell />);

    expect(screen.getByText("Перенаправляем")).toBeInTheDocument();
    expect(screen.queryByText("TIM-1000")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/login"));
  });

  it("shows a safe loading state while auth hydrates", () => {
    useAuthStore.setState({
      accessToken: null,
      hydrated: false,
      isAuthenticated: false,
      role: "unknown",
    });

    render(<SettingsShell />);

    expect(screen.getByText("Открываем FamilyChat")).toBeInTheDocument();
    expect(screen.queryByText("TIM-1000")).not.toBeInTheDocument();
  });

  it("edits and saves the display name", async () => {
    const user = userEvent.setup();
    installBrowserPush();
    const { calls } = stubSettingsFetch();

    render(<SettingsShell />);

    const input = await screen.findByLabelText("Имя");
    await user.clear(input);
    await user.type(input, "  Updated Timofey  ");
    await user.click(screen.getByRole("button", { name: /сохранить имя/i }));

    expect(await screen.findByText("Имя сохранено.")).toBeInTheDocument();
    expect(
      calls.find((call) => call.path === "/api/profile/me" && call.method === "PATCH")?.body,
    ).toEqual({
      displayName: "Updated Timofey",
    });
  });

  it("shows display name validation and disables save while invalid", async () => {
    const user = userEvent.setup();
    installBrowserPush();
    stubSettingsFetch();

    render(<SettingsShell />);

    const input = await screen.findByLabelText("Имя");
    await user.clear(input);

    expect(screen.getByText("Введите имя.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /сохранить имя/i })).toBeDisabled();
  });

  it("shows a safe backend failure message for display name save", async () => {
    const user = userEvent.setup();
    installBrowserPush();
    stubSettingsFetch({ patchFails: true });

    render(<SettingsShell />);

    const input = await screen.findByLabelText("Имя");
    await user.clear(input);
    await user.type(input, "Updated Timofey");
    await user.click(screen.getByRole("button", { name: /сохранить имя/i }));

    expect(
      await screen.findByText("Не удалось сохранить имя. Попробуйте ещё раз."),
    ).toBeInTheDocument();
  });

  it("shows avatar unavailable without an active upload control", async () => {
    installBrowserPush();
    stubSettingsFetch({
      profile: {
        ...profileResponse,
        avatarUrl: "https://tracker.example/avatar.png",
      },
    });

    render(<SettingsShell />);

    expect(await screen.findByText(/изменение аватара.+пока недоступно/i)).toBeInTheDocument();
    expect(screen.getByText(/не проксирует файлы аватаров/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/avatar/i, { selector: "input" })).not.toBeInTheDocument();
  });

  it("copies the family code when clipboard is available", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    installBrowserPush();
    stubSettingsFetch();

    render(<SettingsShell />);

    await user.click(await screen.findByRole("button", { name: /скопировать/i }));

    expect(writeText).toHaveBeenCalledWith("TIM-1000");
    expect(screen.getByText("Скопировано.")).toBeInTheDocument();
  });

  it("renders honest E2EE and logout wording", async () => {
    installBrowserPush();
    stubSettingsFetch();

    render(<SettingsShell />);

    expect(await screen.findByText("E2EE-сессия")).toBeInTheDocument();
    expect(screen.getByText("Matrix-сессия найдена")).toBeInTheDocument();
    expect(screen.getByText(/не проверяет готовность Matrix crypto/i)).toBeInTheDocument();
    expect(screen.getByText(/полное восстановление между устройствами/i)).toBeInTheDocument();
    expect(screen.queryByText(/secure backup enabled/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/all devices verified/i)).not.toBeInTheDocument();
    expect(screen.getByText(/не запрашивает.+фразы восстановления/i)).toBeInTheDocument();
  });

  it("logs out through the existing auth flow", async () => {
    const user = userEvent.setup();
    installBrowserPush();
    stubSettingsFetch();

    render(<SettingsShell />);

    await user.click(await screen.findByRole("button", { name: /выйти/i }));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(matrixSessionStorage.read()).toBeNull();
  });
});

describe("notification settings", () => {
  it("does not request notification permission while loading settings", async () => {
    const browserPush = installBrowserPush({ permission: "default" });
    stubSettingsFetch();

    render(<NotificationSettings />);

    expect(await screen.findByText("Выключены")).toBeInTheDocument();
    expect(browserPush.requestPermission).not.toHaveBeenCalled();
  });

  it("enables Web Push after a click and registers the Matrix pusher", async () => {
    const user = userEvent.setup();
    installBrowserPush({ permission: "default" });
    const { calls } = stubSettingsFetch();

    render(<NotificationSettings />);

    await user.click(await screen.findByRole("button", { name: /включить/i }));

    expect(await screen.findByText("Включены")).toBeInTheDocument();
    expect(getMatrixSdkMocks().client.setPusher).toHaveBeenCalledWith(
      expect.objectContaining({
        app_id: "familychat.web",
        data: expect.objectContaining({
          url: "http://family-api:8000/api/push/matrix/notify",
        }),
        pushkey: "push-subscription-id",
      }),
    );
    expect(calls.find((call) => call.path === "/api/push/subscribe")?.body).toMatchObject({
      contentEncoding: "aes128gcm",
      endpoint: pushEndpoint,
      keys: pushKeys,
      privacyPreference: "fact_only",
    });
    expect(screen.queryByText(pushEndpoint)).not.toBeInTheDocument();
  });

  it("replaces an existing browser subscription when the VAPID key changed", async () => {
    const user = userEvent.setup();
    const staleSubscription = makePushSubscription(
      "https://push.example/subscription/stale-endpoint",
      new Uint8Array(65).buffer,
    );
    const browserPush = installBrowserPush({
      existingSubscription: staleSubscription,
      permission: "granted",
    });
    const { calls } = stubSettingsFetch();

    render(<NotificationSettings />);

    await user.click(await screen.findByRole("button", { name: /включить/i }));

    expect(await screen.findByText("Включены")).toBeInTheDocument();
    expect(staleSubscription.unsubscribe).toHaveBeenCalled();
    expect(browserPush.pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(calls.find((call) => call.path === "/api/push/unsubscribe")?.body).toEqual({
      endpoint: "https://push.example/subscription/stale-endpoint",
    });
    expect(calls.find((call) => call.path === "/api/push/subscribe")?.body).toMatchObject({
      endpoint: pushEndpoint,
    });
  });

  it("updates notification privacy through the Family API", async () => {
    const user = userEvent.setup();
    installBrowserPush({ permission: "granted" });
    const { calls } = stubSettingsFetch();

    render(<NotificationSettings />);

    const privacySelect = await screen.findByLabelText("Приватность уведомлений");
    await waitFor(() => expect(privacySelect).not.toBeDisabled());
    await user.selectOptions(privacySelect, "sender_and_preview");

    await waitFor(() =>
      expect(calls.find((call) => call.path === "/api/push/privacy")?.body).toEqual({
        privacyPreference: "sender_and_preview",
      }),
    );
  });

  it("removes the Matrix pusher and browser subscription when disabled", async () => {
    const user = userEvent.setup();
    const existingSubscription = makePushSubscription();
    installBrowserPush({ existingSubscription, permission: "granted" });
    const { calls } = stubSettingsFetch({
      settings: pushSettingsResponse({
        enabled: true,
        matrixPusher: {
          appId: "familychat.web",
          gatewayUrl: "http://family-api:8000/api/push/matrix/notify",
          pushKey: "push-subscription-id",
        },
        subscriptionId: "push-subscription-id",
      }),
    });

    render(<NotificationSettings />);

    await user.click(await screen.findByRole("button", { name: /выключить/i }));

    expect(await screen.findByText("Выключены")).toBeInTheDocument();
    expect(getMatrixSdkMocks().client.removePusher).toHaveBeenCalledWith(
      "push-subscription-id",
      "familychat.web",
    );
    expect(existingSubscription.unsubscribe).toHaveBeenCalled();
    expect(calls.find((call) => call.path === "/api/push/unsubscribe")?.body).toEqual({
      endpoint: pushEndpoint,
    });
  });

  it("does not render raw push endpoint or browser keys", async () => {
    installBrowserPush({ permission: "granted" });
    stubSettingsFetch();

    render(<NotificationSettings />);

    expect(await screen.findByText("Выключены")).toBeInTheDocument();
    expect(screen.queryByText(pushEndpoint)).not.toBeInTheDocument();
    expect(screen.queryByText(pushKeys.auth)).not.toBeInTheDocument();
    expect(screen.queryByText(pushKeys.p256dh)).not.toBeInTheDocument();
  });
});
