# Stage 13 UX Polish Smoke

Use this runbook only against a private local stack with disposable users and disposable files. Stage 13 is UX polish only; it does not expand admin access, Matrix/E2EE visibility, media handling, backups, production deployment, or monitoring.

## Scope

Covered:

- `/chats` responsive desktop and mobile usability.
- Chat list and timeline skeleton loading.
- Empty states for no chats, no selected chat, and empty timelines.
- Safe toast notifications for send, upload, copy, local hide, retry, and offline/online transitions.
- Message bubble readability for long names, long messages, media, voice, timestamps, pending, failed, and sent states.
- Composer usability, disabled/offline states, attachment affordance, desktop drag-and-drop, and mobile-friendly picker.
- Retry for local failed outgoing text/media/voice sends through existing Matrix send paths.
- Message context menu actions: copy text, hide locally on this browser only, and retry failed sends.

Not covered:

- Stage 7 browser file-picker live smoke completion.
- Stage 8 real microphone record/send/play smoke completion.
- Stage 9 real Web Push delivery smoke completion.
- Stage 10 real LiveKit call smoke completion.
- Stage 11 live admin smoke completion.
- Stage 12 live settings smoke or avatar upload/change.
- Production deployment, backup automation, monitoring, E2EE recovery/device management, room browser, message search, admin message/media moderation, impersonation, data export, or backend media proxying.

## Prerequisites

Use a private local `.env` with placeholders replaced. Do not use real family accounts, real private messages, or real private files.

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres synapse nginx family-api
docker compose -f infra/docker-compose.yml --env-file .env ps
curl -fsS http://localhost:8080/health
curl -fsS http://localhost:8000/api/health
curl -fsS http://localhost:8000/api/health/db
```

Start the web app:

```bash
cd apps/web
npm run dev
```

Create or ensure two disposable active FamilyChat users through the documented local invite/admin flow.

## Browser Smoke

1. Log in as disposable user A.
2. Open `/chats` at desktop width.
3. Confirm the chat list, selected timeline, and composer are usable with long room names and long messages.
4. Reload and confirm skeleton/loading states are understandable and do not expose raw Matrix room IDs, event IDs, device IDs, tokens, or stack traces.
5. Open an empty disposable room if available and confirm the empty timeline explains what to do next.
6. Send a disposable text message and confirm the pending/sent state and safe toast.
7. Open the message context menu with mouse and keyboard.
8. Copy a text message and confirm only visible text is copied; no event ID, room ID, sender Matrix ID, token, or metadata is copied.
9. Hide a message locally and confirm the wording says it is hidden only on this device/browser. Confirm it is not described as server deletion or Matrix redaction.
10. Trigger a failed send safely, for example by temporarily disconnecting the browser network before sending a disposable message. Confirm the failed item stays local, shows a retry affordance, and retry does not double-send while pending.
11. Drag a small supported disposable file into the active chat and confirm the existing Matrix media path is used with safe progress/toast UI.
12. Drop an oversized or unsupported disposable file and confirm a generic safe error appears without raw local file path.
13. On a narrow mobile viewport, confirm the chat list/back navigation, composer, attachment picker, message bubbles, and context menu remain reachable with usable tap targets.
14. Toggle browser offline/online in devtools if available. Confirm the offline indicator appears, composer actions are disabled or clearly warned, and online recovery shows a safe transition.
15. Open `/settings` and `/admin` if authorized to confirm no obvious regression from shared layout or toast changes. Do not use `/admin` to inspect messages, media, rooms, or E2EE data.

## Privacy Inspection

Inspect rendered pages and browser network responses for forbidden data. Stage 13 UI must not expose:

- Matrix access tokens or refresh tokens;
- Matrix admin tokens;
- LiveKit tokens, API keys, or API secrets;
- VAPID private keys or raw push subscription endpoints/keys;
- database URLs, JWT secrets, invite hashes, or invite peppers;
- Matrix room IDs, event IDs, or device IDs in ordinary UI;
- raw media URLs or raw local file paths;
- E2EE keys, recovery phrases, recovery keys, exported key material, or decrypted-content tools;
- backend stack traces or raw Matrix/backend exception dumps;
- admin message/media reading, room browser, message search, impersonation, or login-as controls.

## Expected Result

Stage 13 remains partial unless this browser smoke passes in the local environment. This runbook does not close Stage 7, Stage 8, Stage 9, Stage 10, Stage 11, or Stage 12 blockers. Local hide is not Matrix redaction, retry is client-side UX only, and drag-and-drop/mobile picker reuse the existing Matrix media path.
