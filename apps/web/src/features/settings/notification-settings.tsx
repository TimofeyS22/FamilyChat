"use client";

import { Bell, BellOff, Loader2, Send, ShieldCheck, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { useAuthStore } from "@/features/auth/auth-store";
import {
  callRingtoneEnabled,
  startCallRingtone,
  stopCallRingtone,
  unlockCallRingtone,
} from "@/features/calls/call-ringtone";
import {
  registerMatrixWebPusher,
  removeMatrixWebPusher,
  type MatrixPusherRegistration,
} from "@/features/matrix/matrix-client";
import { matrixSessionStorage } from "@/features/matrix/session-storage";
import { ApiError } from "@/lib/api/errors";

import {
  getPushSettings,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
  updatePushPrivacy,
  type MatrixPusherConfig,
  type PushPrivacyPreference,
  type PushSettings,
} from "./notifications-api";

type NotificationState =
  | "checking"
  | "unsupported"
  | "default"
  | "denied"
  | "disabled"
  | "enabled"
  | "subscribing"
  | "unsubscribing"
  | "error";

const notificationStepTimeoutMs = 15000;

function isLocalhost() {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function isIosBrowserSession() {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function unsupportedNotificationsMessage() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "Уведомления недоступны в этой сессии браузера.";
  }
  if (!window.isSecureContext && !isLocalhost()) {
    return "Уведомления доступны только через HTTPS.";
  }
  if (isIosBrowserSession()) {
    return "На iPhone уведомления работают только в приложении с экрана Домой. Откройте сайт в Safari, нажмите «Поделиться» и выберите «На экран Домой», затем запустите FamilyChat с иконки.";
  }
  if (!("serviceWorker" in navigator)) {
    return "Этот браузер не поддерживает Service Worker, поэтому уведомления недоступны.";
  }
  if (!("PushManager" in window) || !("Notification" in window)) {
    return "Этот браузер или режим приложения не поддерживает Web Push.";
  }
  return "Уведомления недоступны в этой сессии браузера.";
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

function browserSupportsPush(settings: PushSettings | null) {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return Boolean(
    settings?.pushAvailable &&
      settings.vapidPublicKey &&
      "Notification" in window &&
      "PushManager" in window &&
      "serviceWorker" in navigator &&
      (window.isSecureContext || isLocalhost()),
  );
}

function urlBase64ToUint8Array(value: string) {
  const sanitized = value.trim().replace(/\s/g, "");
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(sanitized)) {
    throw new Error("Публичный VAPID-ключ имеет неверный формат");
  }
  const unpadded = sanitized.replace(/=+$/, "");
  const padding = "=".repeat((4 - (unpadded.length % 4)) % 4);
  const base64 = `${unpadded}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  if (raw.length !== 65) {
    throw new Error("Публичный VAPID-ключ имеет неверную длину");
  }
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

function bytesEqual(left: ArrayBuffer | null, right: Uint8Array) {
  if (!left) {
    return false;
  }
  const leftBytes = new Uint8Array(left);
  if (leftBytes.length !== right.length) {
    return false;
  }
  return leftBytes.every((byte, index) => byte === right[index]);
}

function subscriptionUsesVapidKey(subscription: PushSubscription, vapidPublicKey: string) {
  return bytesEqual(subscription.options.applicationServerKey, urlBase64ToUint8Array(vapidPublicKey));
}

function matrixPusherRegistration(
  pusher: MatrixPusherConfig | null,
): MatrixPusherRegistration | null {
  if (!pusher) {
    return null;
  }
  return {
    appId: pusher.appId,
    gatewayUrl: pusher.gatewayUrl,
    pushKey: pusher.pushKey,
  };
}

async function ensureMatrixPusher(settings: PushSettings) {
  const session = matrixSessionStorage.read();
  const pusher = matrixPusherRegistration(settings.matrixPusher);
  if (!session || !pusher) {
    return;
  }
  await registerMatrixWebPusher(session, pusher);
}

function contentEncoding() {
  const manager = window.PushManager as typeof PushManager & {
    supportedContentEncodings?: string[];
  };
  return manager.supportedContentEncodings?.includes("aes128gcm") ? "aes128gcm" : "aesgcm";
}

async function readyServiceWorkerRegistration() {
  const existingRegistration = navigator.serviceWorker.getRegistration
    ? await navigator.serviceWorker.getRegistration("/")
    : null;
  const registration = existingRegistration ?? (await navigator.serviceWorker.register("/sw.js"));
  if (registration.active) {
    return registration;
  }
  return navigator.serviceWorker.ready;
}

function notificationEnableErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 503) {
      return "Web Push ещё не настроен на сервере.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Сессия устарела. Войдите снова и включите уведомления.";
    }
    return "Сервер не принял подписку на уведомления. Попробуйте ещё раз.";
  }

  const message = error instanceof Error ? error.message : "";
  const name = error instanceof DOMException ? error.name : "";
  if (message.includes("слишком долго")) {
    return `Не удалось включить уведомления: ${message}`;
  }
  if (name === "NotAllowedError" || message.includes("permission")) {
    return "Браузер запретил уведомления для этого сайта. Разрешите уведомления в настройках браузера.";
  }
  if (name === "NotSupportedError" || message.includes("PushManager")) {
    return "Этот браузер или режим приложения не поддерживает Web Push.";
  }
  if (message.includes("applicationServerKey") || message.includes("VAPID")) {
    return "Браузер не принял VAPID-ключ уведомлений. Обновите страницу и попробуйте ещё раз.";
  }
  if (message.includes("service worker")) {
    return "Service Worker ещё не готов. Обновите страницу и попробуйте снова.";
  }
  if (message) {
    return `Не удалось включить уведомления: ${message}`;
  }
  return "Не удалось включить уведомления. Попробуйте ещё раз.";
}

export function NotificationSettings() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<PushSettings | null>(null);
  const [state, setState] = useState<NotificationState>("checking");
  const [testSending, setTestSending] = useState(false);
  const [ringtoneMessage, setRingtoneMessage] = useState<string | null>(null);
  const [ringtoneUnlocked, setRingtoneUnlocked] = useState(() => callRingtoneEnabled());
  const privacyPreference = settings?.privacyPreference ?? "fact_only";

  const loadSettings = useCallback(async () => {
    if (!accessToken) {
      setState("unsupported");
      return;
    }

    setErrorMessage(null);
    try {
      const nextSettings = await getPushSettings(accessToken);
      setSettings(nextSettings);
      if (!browserSupportsPush(nextSettings)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const registration = await withTimeout(
        readyServiceWorkerRegistration(),
        "Service Worker готовится слишком долго. Обновите приложение с экрана Домой и попробуйте снова.",
      );
      const currentBrowserSubscription = await withTimeout(
        registration.pushManager.getSubscription(),
        "Проверка push-подписки браузера выполняется слишком долго.",
      );
      if (
        nextSettings.enabled &&
        currentBrowserSubscription &&
        nextSettings.vapidPublicKey &&
        subscriptionUsesVapidKey(currentBrowserSubscription, nextSettings.vapidPublicKey)
      ) {
        await withTimeout(
          ensureMatrixPusher(nextSettings),
          "Восстановление Matrix-уведомлений выполняется слишком долго.",
        );
        setState("enabled");
        return;
      }
      setState(Notification.permission === "default" ? "default" : "disabled");
    } catch {
      setState("error");
      setErrorMessage("Не удалось загрузить настройки уведомлений.");
    }
  }, [accessToken]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadSettings(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadSettings]);

  async function enableLoudCallRingtone() {
    setRingtoneMessage(null);
    const unlocked = await unlockCallRingtone();
    setRingtoneUnlocked(unlocked);
    if (!unlocked) {
      setRingtoneMessage("Браузер не разрешил громкий звонок. Попробуйте открыть настройки из установленного приложения.");
      return;
    }
    setRingtoneMessage("Громкий звонок включён для этого устройства.");
    await startCallRingtone();
    window.setTimeout(stopCallRingtone, 1400);
  }

  async function enableNotifications() {
    if (!accessToken || !settings?.vapidPublicKey || state === "subscribing") {
      return;
    }

    setState("subscribing");
    setErrorMessage(null);

    let browserSubscription: PushSubscription | null = null;
    let backendSubscriptionId: string | null = null;
    try {
      if (Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission === "denied") {
          setState("denied");
          return;
        }
        if (permission !== "granted") {
          setState("default");
          return;
        }
      }

      const registration = await withTimeout(
        readyServiceWorkerRegistration(),
        "Service Worker готовится слишком долго. Закройте приложение, откройте его с экрана Домой и попробуйте снова.",
      );
      const existingSubscription = await withTimeout(
        registration.pushManager.getSubscription(),
        "Проверка push-подписки браузера выполняется слишком долго.",
      );
      if (existingSubscription && !subscriptionUsesVapidKey(existingSubscription, settings.vapidPublicKey)) {
        await unsubscribeFromPush(accessToken, { endpoint: existingSubscription.endpoint }).catch(
          () => undefined,
        );
        await existingSubscription.unsubscribe().catch(() => undefined);
      }
      browserSubscription =
        existingSubscription && subscriptionUsesVapidKey(existingSubscription, settings.vapidPublicKey)
          ? existingSubscription
          : await withTimeout(
              registration.pushManager.subscribe({
                applicationServerKey: urlBase64ToUint8Array(settings.vapidPublicKey),
                userVisibleOnly: true,
              }),
              "Создание push-подписки браузера выполняется слишком долго.",
            );
      const serialized = browserSubscription.toJSON();
      const endpoint = serialized.endpoint;
      const keys = serialized.keys;
      if (!endpoint || !keys?.p256dh || !keys.auth) {
        throw new Error("Неполная push-подписка браузера");
      }

      const response = await withTimeout(
        subscribeToPush(accessToken, {
          contentEncoding: contentEncoding(),
          endpoint,
          keys: {
            auth: keys.auth,
            p256dh: keys.p256dh,
          },
          privacyPreference,
        }),
        "Сохранение push-подписки на сервере выполняется слишком долго.",
      );
      backendSubscriptionId = response.subscriptionId;

      const session = matrixSessionStorage.read();
      const pusher = matrixPusherRegistration(response.matrixPusher);
      if (!session || !pusher) {
        throw new Error("Конфигурация Matrix pusher недоступна");
      }
      await withTimeout(
        registerMatrixWebPusher(session, pusher),
        "Регистрация Matrix-уведомлений выполняется слишком долго.",
      );

      setSettings((current) =>
        current
          ? {
              ...current,
              enabled: true,
              matrixPusher: response.matrixPusher,
              privacyPreference: response.privacyPreference,
              subscriptionId: response.subscriptionId,
            }
          : current,
      );
      setState("enabled");
    } catch (error) {
      if (browserSubscription) {
        await unsubscribeFromPush(accessToken, {
          endpoint: browserSubscription.endpoint,
          subscriptionId: backendSubscriptionId ?? undefined,
        }).catch(() => undefined);
        await browserSubscription.unsubscribe().catch(() => undefined);
      }
      setState("error");
      setErrorMessage(notificationEnableErrorMessage(error));
    }
  }

  async function disableNotifications() {
    if (!accessToken || state === "unsubscribing") {
      return;
    }

    setState("unsubscribing");
    setErrorMessage(null);

    try {
      const registration = await readyServiceWorkerRegistration();
      const subscription = await registration.pushManager.getSubscription();
      const session = matrixSessionStorage.read();
      const pusher = matrixPusherRegistration(settings?.matrixPusher ?? null);
      if (session && pusher) {
        await removeMatrixWebPusher(session, pusher);
      }
      await unsubscribeFromPush(
        accessToken,
        subscription?.endpoint
          ? { endpoint: subscription.endpoint }
          : { subscriptionId: settings?.subscriptionId ?? undefined },
      );
      await subscription?.unsubscribe();
      setSettings((current) =>
        current ? { ...current, enabled: false, matrixPusher: null, subscriptionId: null } : current,
      );
      setState("disabled");
    } catch {
      setState("error");
      setErrorMessage("Не удалось выключить уведомления. Попробуйте ещё раз.");
    }
  }

  async function changePrivacy(nextPreference: PushPrivacyPreference) {
    if (!accessToken) {
      return;
    }
    setErrorMessage(null);
    try {
      const response = await updatePushPrivacy(accessToken, nextPreference);
      setSettings((current) =>
        current ? { ...current, privacyPreference: response.privacyPreference } : current,
      );
    } catch {
      setErrorMessage("Не удалось обновить приватность уведомлений.");
    }
  }

  async function testNotification() {
    if (!accessToken || state !== "enabled") {
      return;
    }
    setTestSending(true);
    setErrorMessage(null);
    try {
      await sendTestPush(accessToken);
    } catch {
      setErrorMessage("Не удалось отправить тестовое уведомление.");
    } finally {
      setTestSending(false);
    }
  }

  const badgeLabel = useMemo(() => {
    if (state === "enabled") {
      return "Включены";
    }
    if (state === "denied") {
      return "Запрещены";
    }
    if (state === "unsupported") {
      return "Недоступны";
    }
    return "Выключены";
  }, [state]);
  const disabling = state === "unsubscribing";
  const enabledOrDisabling = state === "enabled" || disabling;

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-4">
        {state === "enabled" ? (
          <Bell className="mt-1 h-5 w-5 text-accent-teal" />
        ) : (
          <BellOff className="mt-1 h-5 w-5 text-accent-amber" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Уведомления</h2>
            <Badge>{badgeLabel}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            {state === "unsupported"
              ? unsupportedNotificationsMessage()
              : "По умолчанию уведомления сообщают только о новом сообщении FamilyChat."}
          </p>
        </div>
      </div>

      {errorMessage ? <ErrorState message={errorMessage} /> : null}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink-secondary">
            Приватность уведомлений
          </span>
          <select
            aria-label="Приватность уведомлений"
            className="min-h-11 w-full rounded-lg border border-surface-line bg-surface-canvas px-3 text-sm text-ink-primary outline-none transition focus:border-accent-teal focus:shadow-focus"
            disabled={state === "checking"}
            onChange={(event) => void changePrivacy(event.currentTarget.value as PushPrivacyPreference)}
            value={privacyPreference}
          >
            <option value="fact_only">Только факт нового сообщения</option>
            <option value="sender_name">Имя отправителя</option>
            <option value="message_text">Текст сообщения, если это безопасно для сервера</option>
            <option value="sender_and_preview">Отправитель и превью сообщения</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {enabledOrDisabling ? (
            <Button
              disabled={disabling}
              onClick={() => void disableNotifications()}
              type="button"
              variant="secondary"
            >
              {disabling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Выключить
            </Button>
          ) : (
            <Button
              disabled={state === "unsupported" || state === "denied" || state === "subscribing"}
              onClick={() => void enableNotifications()}
              type="button"
            >
              {state === "subscribing" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Включить
            </Button>
          )}
          <Button
            disabled={state !== "enabled" || testSending}
            onClick={() => void testNotification()}
            type="button"
            variant="ghost"
          >
            {testSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Тест
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-surface-line bg-surface-raised p-3 text-sm text-ink-secondary">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-none text-accent-teal" />
        <span>
          Режим с превью показывает текст в системных push-уведомлениях. Включайте его только
          для доверенных семейных устройств.
        </span>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
        <div className="flex items-start gap-3">
          <Volume2 className="mt-0.5 h-5 w-5 flex-none text-sky-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink-primary">Громкий звонок в открытом приложении</p>
            <p className="mt-1 text-sm leading-6 text-ink-secondary">
              Нажмите один раз на этом устройстве. Тогда FamilyChat сможет играть рингтон,
              когда приложение уже открыто или проснулось после клика по уведомлению.
            </p>
            {ringtoneMessage ? (
              <p className="mt-2 text-sm font-semibold text-sky-700">{ringtoneMessage}</p>
            ) : null}
          </div>
        </div>
        <Button
          className="mt-3"
          onClick={() => void enableLoudCallRingtone()}
          type="button"
          variant={ringtoneUnlocked ? "secondary" : undefined}
        >
          {ringtoneUnlocked ? "Громкий звонок разрешён" : "Разрешить громкий звонок"}
        </Button>
      </div>
    </Card>
  );
}
