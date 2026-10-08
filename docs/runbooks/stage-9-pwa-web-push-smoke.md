# Stage 9 PWA and Web Push Local Smoke

This runbook checks PWA install assets, explicit notification permission, Web Push subscription storage, Matrix new-message push delivery, privacy defaults, invalid-subscription handling, and offline fallback.

This is a local smoke, not a production readiness review. Do not use real family accounts, real message text, or real push credentials.

## Scope

Covered:

- The app exposes a manifest and install icons.
- The service worker registers and provides a navigation-only offline fallback.
- Notification permission is not requested on page load.
- The user can enable notifications from settings after an explicit click.
- Family API stores a Web Push subscription and returns a Matrix pusher config without echoing raw endpoint/key material.
- Matrix pusher registration points Synapse at the Family API Matrix push gateway.
- Default notification text is fact-only: `Новое сообщение`.
- Encrypted Matrix events do not produce server-side message text in notifications.
- Invalid subscriptions are disabled after a gone/not-found push-service response.

Not covered:

- LiveKit.
- WebRTC calls.
- Incoming-call push.
- Production HTTPS/certificate setup.
- Push delivery reliability across mobile vendors.
- Stage 7 browser file-picker smoke.
- Stage 8 real microphone record/send/play smoke.

## Prerequisites

Use a private local `.env` with placeholder values replaced. Do not commit `.env`.

Generate disposable VAPID keys with a local tool, for example:

```bash
npx web-push generate-vapid-keys
```

Then set these private values in `.env`:

```bash
WEB_PUSH_ENABLED=true
WEB_PUSH_VAPID_PUBLIC_KEY=replace-with-generated-public-key
WEB_PUSH_VAPID_PRIVATE_KEY=replace-with-generated-private-key
WEB_PUSH_SUBJECT=mailto:admin@example.invalid
MATRIX_PUSH_APP_ID=familychat.web
MATRIX_PUSH_GATEWAY_URL=http://family-api:8000/api/push/matrix/notify
```

Do not paste the VAPID private key, raw push subscription endpoint, `p256dh`, `auth`, Matrix access token, Matrix room ID, or Matrix event ID into notes.

Start the stack:

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres synapse nginx family-api
docker compose -f infra/docker-compose.yml --env-file .env ps
curl -fsS http://localhost:8080/health
curl -fsS http://localhost:8000/api/health
```

Start the web app in another shell:

```bash
cd apps/web
npm run dev
```

Use disposable users only. Create or ensure one local admin and two non-admin test users through the trusted local CLI/API flow from the setup docs.

## Static PWA Checks

1. Open the web app in a browser that supports service workers and Push API on localhost.
2. Confirm the manifest is reachable at `/manifest.webmanifest`.
3. Confirm the browser devtools Application panel shows the service worker registered for the local origin.
4. Confirm installability is offered by the browser where supported.
5. Turn off network in devtools and navigate within the app.
6. Confirm the offline page appears for navigation requests.
7. Confirm Matrix message timelines and media are not served from the offline cache.

## Permission and Subscription Smoke

1. Log in as test user A.
2. Open `/settings`.
3. Confirm the browser does not show a notification permission prompt on page load.
4. Click `Enable` in the Notifications card.
5. Allow notification permission.
6. Confirm the UI changes to enabled.
7. Confirm Family API has one enabled subscription for the user, without copying the endpoint or keys into notes.
8. Confirm the Matrix account has an HTTP pusher with:
   - `app_id` = `familychat.web`;
   - gateway URL ending with `/api/push/matrix/notify`;
   - `format` = `event_id_only`.
9. Click `Test`.
10. Confirm a browser notification appears with fact-only text.

If the browser blocks service workers, Push API, notification permission, localhost delivery, or push-service delivery, record Stage 9 live smoke as BLOCKED with the exact blocker.

## New Message Push Smoke

1. Keep test user A logged in with notifications enabled.
2. Log in as test user B in another browser profile.
3. Send a disposable message from B to A in an existing direct/group/common room.
4. Confirm A receives a notification.
5. Confirm the notification does not contain the full message text by default.
6. In A's settings, switch privacy to sender name.
7. Send another disposable message from B.
8. Confirm the notification uses the local Family API display name when available.
9. Switch privacy to message text only for the disposable smoke account.
10. Send an unencrypted/plaintext Matrix test message only if the room state and test account make that safe.
11. Confirm plaintext message text appears only for that opt-in plaintext case.
12. Send or observe an encrypted Matrix event.
13. Confirm encrypted event notifications fall back to fact-only text.

Do not perform this smoke with real private message text.

## Disable and Invalid Subscription Smoke

1. In A's settings, click `Disable`.
2. Confirm the Matrix pusher is removed.
3. Confirm the browser subscription is unsubscribed.
4. Confirm Family API marks the subscription disabled.
5. Re-enable notifications with a disposable subscription.
6. Simulate an invalid push-service response in a controlled local test or backend test harness.
7. Confirm Family API disables the subscription and returns the push key in Matrix `rejected`.

The automated backend tests cover the invalid-subscription branch with a fake sender. Do not try to create fake production push-service failures against real user subscriptions.

## Cleanup

```bash
docker compose -f infra/docker-compose.yml --env-file .env down
```

Only add `-v` when you intentionally want to delete disposable local data.
