const CACHE_NAME = "familychat-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL)),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title : "FamilyChat";
  const body =
    typeof payload.body === "string" ? payload.body : "Новое сообщение";
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const requireInteraction = payload.requireInteraction === true;
  const renotify = payload.renotify === true;
  const silent = payload.silent === true;
  const vibrate = Array.isArray(payload.vibrate) ? payload.vibrate : undefined;
  const roomId = typeof data.roomId === "string" ? data.roomId : null;
  const eventId = typeof data.eventId === "string" ? data.eventId : null;
  const sender = typeof data.sender === "string" ? data.sender : null;
  const callId = typeof data.callId === "string" ? data.callId : null;
  const callMode = typeof data.callMode === "string" ? data.callMode : null;
  const expiresAt = typeof data.expiresAt === "string" ? data.expiresAt : null;
  const isCall = Boolean(callId);
  const notificationTag = callId
    ? `familychat-call-${callId}`
    : roomId
      ? `familychat-room-${roomId}`
      : "familychat-message";
  const targetUrl = roomId
    ? `/chats?room=${encodeURIComponent(roomId)}${callId ? `&callId=${encodeURIComponent(callId)}` : ""}`
    : "/chats";
  const actions = isCall
    ? [
        { action: "answer", title: "Ответить" },
        { action: "reject", title: "Отклонить" },
      ]
    : undefined;
  const notificationOptions = {
    actions,
    badge: "/icons/familychat-192.png",
    body,
    data: {
      callId,
      callMode,
      eventId,
      expiresAt,
      roomId,
      sender,
      url: targetUrl,
    },
    icon: "/icons/familychat-192.png",
    renotify,
    requireInteraction,
    silent,
    tag: notificationTag,
    vibrate,
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, notificationOptions),
      isCall
        ? self.clients
            .matchAll({ includeUncontrolled: true, type: "window" })
            .then((clients) =>
              Promise.all(
                clients.map((client) =>
                  client.postMessage({
                    type: "familychat.call.push",
                    payload: {
                      callId,
                      expiresAt,
                      mode: callMode,
                      roomId,
                      sender,
                    },
                  }),
                ),
              ),
            )
        : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/chats";
  const targetUrl = new URL(targetPath, self.location.origin);
  if (event.action === "answer" || event.action === "reject") {
    targetUrl.searchParams.set("callAction", event.action === "answer" ? "accept" : "reject");
  }
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: "window" }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) {
            return client.navigate(targetUrl.href).then((navigatedClient) =>
              navigatedClient ? navigatedClient.focus() : client.focus(),
            );
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl.href);
    }),
  );
});
