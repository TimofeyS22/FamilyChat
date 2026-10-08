# Security

This document describes the current security posture for the infrastructure foundation.

## What is implemented now

- Synapse public registration is disabled with `enable_registration: false`.
- Synapse uses PostgreSQL via `database.name: psycopg2`; SQLite is not configured.
- Secrets are represented only by placeholders in `.env.example` and `infra/synapse/homeserver.yaml`.
- `.env` is ignored by Git.
- Nginx is separated as a reverse proxy and only routes Matrix client paths.
- Nginx returns 404 for `/_synapse/admin`.
- Federation is configured for closed family mode:
  - no federation listener resource is exposed in Synapse;
  - Nginx proxies only `/_matrix` and `/_synapse/client`;
  - `federation_domain_whitelist: []` is set.
- URL previews are disabled to reduce server-side fetching.
- Family API stores invite codes as HMAC-SHA256 hashes using `FAMILY_API_INVITE_PEPPER`.
- Family API stores local passwords as Argon2 hashes.
- Family API refuses to start with placeholder JWT, invite pepper, Matrix admin token, database URL, or unapproved SQLite runtime settings.
- Family API refuses to enable Web Push with placeholder VAPID keys or an invalid VAPID subject.
- Family API refuses to enable LiveKit calls with placeholder LiveKit URL, API key, or API secret.
- Family API protected endpoints require JWT bearer auth.
- Family API admin endpoints require an active local user with `admin` role.
- Family API admin responses use opaque admin refs for user/invite actions and do not return raw database IDs, Matrix user IDs, invite hashes, or invite peppers.
- Family API blocks admin self-deactivation, inactive-user deactivation, and deactivation of the last active admin.
- Family API admin audit output is sanitized to an allow-list of safe access-management metadata.
- Family API Synapse admin calls are isolated behind `services/matrix_admin.py` and `integrations/synapse.py`.
- Family API checks for existing Matrix users before creation and blocks reserved Matrix localparts.
- Family API has an in-memory rate limiter for Stage 2 register/login/invite attempts.
- Frontend auth token access is isolated in `apps/web/src/features/auth/token-storage.ts`.
- Frontend Matrix session access is isolated in `apps/web/src/features/matrix/session-storage.ts`.
- Frontend exposes only public client URLs through `NEXT_PUBLIC_FAMILY_API_BASE_URL`, `NEXT_PUBLIC_MATRIX_BASE_URL`, and `NEXT_PUBLIC_MATRIX_SERVER_NAME`.
- Frontend uses Matrix JS SDK for password login, session restore, sync, joined rooms, text timelines, text-only sends, and browser-side Rust crypto initialization.
- Frontend creates newly requested direct and group rooms as private Matrix rooms without `m.room.encryption`, so notification previews can include plaintext message text.
- Frontend stores Matrix crypto state through the SDK-supported browser IndexedDB Rust crypto store. This is separate from the Matrix session localStorage wrapper.
- Frontend family discovery uses authenticated Family API endpoints only: active users list and family-code search.
- Frontend direct and group family chat creation derives invitees from Family API users only.
- Common Family Chat room creation and active-user membership reconciliation run server-side in Family API.
- Newly provisioned Common Family Chat rooms are private Matrix rooms without `m.room.encryption`, matching the notification-preview product choice.
- Common Family Chat is not shown as encrypted unless its Matrix room state actually contains encryption. Existing local common rooms created before Stage 6 E2EE provisioning are not silently relabeled.
- Frontend media/file sending uses Matrix media APIs directly through Matrix JS SDK. Family API does not proxy, receive, store, or inspect media bytes.
- Frontend blocks files larger than 100 MB before upload.
- In encrypted Matrix rooms, the frontend encrypts attachment bytes client-side using Matrix encrypted attachment metadata before uploading to the homeserver media store. The `m.room.message` content uses `file` metadata, not plaintext `url`, for encrypted media.
- Encrypted media previews/downloads are decrypted client-side. Blob object URLs are used only in the browser and are revoked after preview cleanup or delayed download handoff.
- Frontend voice messages are recorded only after a user gesture requests microphone access through browser `MediaRecorder`.
- Voice messages are sent as Matrix `m.audio` media messages with duration, MIME type, size, and a FamilyChat voice marker. Generic audio file attachments remain regular audio/file media.
- In encrypted rooms, voice message bytes reuse the Stage 7 encrypted attachment path before Matrix media upload. Family API does not receive, proxy, decrypt, or store voice bytes.
- Encrypted voice playback decrypts client-side on playback rather than during initial timeline render, and generated blob URLs are revoked during component cleanup.
- Frontend does not use external Matrix user directory search or public room directory browsing.
- Family API exposes `GET /api/profile/me` and `PATCH /api/profile/me` for the current active user only. The endpoint does not accept a user ID from the client, rejects extra update fields, does not allow role, active status, family code, Matrix user ID, or password changes, and does not return password hashes, Matrix access tokens, admin tokens, push subscription endpoints/keys, LiveKit tokens, invite hashes, database URLs, JWT secrets, room IDs, event IDs, or device IDs.
- Display-name updates are synchronized through the Matrix service layer before Family API commits the local profile update. A Matrix sync failure returns a safe generic error and rolls back the local change.
- Settings profile display uses current-user Family API profile data and does not expose raw UUIDs or Matrix user IDs. Message bubbles use Matrix room member display names when room state provides them.
- Stage 12 avatar upload/change is not active. Family API remains outside avatar/media byte handling and is not a general media proxy. The settings UI does not render stored remote avatar URLs.
- Stage 13 UX polish is frontend-only. Drag-and-drop and the mobile picker reuse the existing Matrix media path and validation; Family API remains outside media bytes and no backend media proxy is added.
- Stage 13 local hide is current-browser UI hiding only. It does not call Matrix redaction, delete for other users, or claim server deletion.
- Stage 13 retry is a same-client UX affordance for failed outgoing text/media/voice sends. It reuses existing Matrix send paths and does not persist failed message bodies, media bytes, tokens, or retry queues to Family API.
- Stage 13 toasts and error states are generic; they must not render message bodies, raw Matrix room/event/device IDs, media URLs, tokens, stack traces, or secrets.
- Stage 14 adds deployment scaffolding only: production Compose override, Nginx production routing template, placeholder-only production env template, and deployment runbook/docs.
- Stage 14 production proxy scaffolding keeps `/_synapse/admin` non-public and routes only frontend, Family API, Matrix client endpoints, and LiveKit WebSocket/API paths.
- Stage 14 does not add backup automation, monitoring dashboards, room/message search, admin message/media access, impersonation, E2EE recovery/device management, data export, or backend media proxying.
- Frontend registers a service worker for navigation-only offline fallback and Web Push display. It does not cache Matrix messages, media, Family API responses, subscription endpoints, room IDs, or event IDs.
- Frontend notification permission is requested only after the user clicks the enable control in settings.
- Frontend registers a Matrix HTTP pusher only after a browser push subscription is accepted by Family API.
- Family API stores Web Push subscriptions for delivery and returns only the subscription UUID as the Matrix pusher `pushkey`; subscription endpoints and keys are not echoed in API responses.
- Family API Web Push notification privacy defaults to fact-only: `Новое сообщение`.
- Family API does not show Matrix message text for encrypted Matrix events. The optional message-text preference is only for server-safe plaintext Matrix push payloads.
- Family API disables invalid Web Push subscriptions when the push service reports a gone or not-found subscription.
- Family API issues LiveKit join tokens only to active authenticated local users calling another active local Family API user.
- LiveKit room names are derived server-side from the two local user IDs and caller-provided call ID through HMAC; clients cannot choose arbitrary LiveKit room names.
- LiveKit tokens are short-lived and grant room join, subscribe, and microphone/camera publication only for one-to-one calls. Audio call tokens only grant microphone publication.
- LiveKit API secrets remain server-side and are not sent to the frontend.
- Family API logs only technical call-token issuance metadata and a hashed call target ID. It does not log LiveKit tokens, API secrets, or raw room names.
- Frontend call signaling uses only FamilyChat custom Matrix events in direct rooms backed by active Family API users.
- Frontend LiveKit calls do not use data tracks, screen sharing, recording, transcription, ingress, egress, SIP, bots, or group-call UI.
- Frontend `/admin` is available only to authenticated users with local `admin` role and renders access-management metadata only.
- Frontend `/admin` does not render message bodies, media URLs, Matrix room IDs, Matrix event IDs, Matrix device IDs, raw Matrix user IDs, invite hashes, server secrets, LiveKit tokens, Web Push secrets, database URLs, or E2EE recovery/key material.
- Frontend `/admin` shows newly created invite plaintext only in the current UI state immediately after creation.

## What is not implemented yet

- Full browser-side E2EE recovery and interactive device verification UX.
- Call push.
- Group calls.
- Screen sharing.
- Call recording or transcription.
- Live-verified production HTTPS/VPS deployment.
- Backup automation.
- Production-grade distributed rate limiting.
- Message/media-reading admin panel.
- Synapse admin browser or proxy.
- Admin impersonation/login-as.
- Monitoring and alerting.
- Production cookie/session strategy for the frontend.
- Public or frontend-managed common-room membership automation.

## Secrets policy

Never commit:

- `.env`;
- generated Synapse signing keys;
- real admin access tokens;
- real VAPID keys;
- real LiveKit keys;
- real database passwords.
- real Family API JWT secrets or invite peppers.

The checked-in `.env.example` is a template only. Placeholder values such as `change-me` are not acceptable for real accounts.

## Registration model

Current Synapse registration state:

```yaml
enable_registration: false
```

That means public self-registration is disabled at the homeserver level. Family API creates users through a controlled invite flow and Synapse admin API service layer. The first local Family API admin must be created through the trusted `python -m app.cli bootstrap-admin` CLI; no public bootstrap endpoint exists.

## Message privacy boundary

Stage 6 implements browser-side Matrix E2EE for newly created direct, group, and newly provisioned common text rooms. The current privacy boundary is:

- Synapse stores Matrix events and media.
- Family API must not store plain-text message content.
- Family API must not store Matrix push notification message bodies, room IDs, event IDs, or sender IDs beyond transient request handling needed to send a notification.
- Family API must not receive, store, proxy, or recover Matrix E2EE keys or recovery material.
- Admin features must not expose message contents.
- Web Push must not include message text by default.
- Family API currently stores local profile and access-control metadata only.
- The Stage 6 frontend reads and sends text messages directly through Matrix client APIs.
- The Stage 7 frontend reads and sends media directly through Matrix client media/message APIs. Family API remains outside the media path.
- The Stage 8 frontend records voice locally and sends it through the same Matrix media/message APIs. Family API remains outside the voice media path.
- In encrypted rooms, original media bytes must be encrypted before upload. Thumbnails are omitted in the current implementation rather than uploaded in plaintext.
- In encrypted rooms, original voice bytes must be encrypted before upload and the Matrix event must use encrypted `file` metadata rather than a plaintext media `url`.
- The Stage 6 frontend calls Family API for family users and family-code search only; it does not proxy message bodies through Family API.
- The Stage 7 frontend still calls Family API only for auth-backed family metadata and never for media/message bodies.
- Family API can create and reconcile the canonical common Matrix room, but it does not read or store message bodies.
- Stage 11 admin APIs and UI manage access only. They list safe user metadata, invite status metadata, service status, and sanitized audit entries.
- Stage 11 admin APIs and UI must not expose message bodies, media URLs, Matrix room IDs, Matrix event IDs, Matrix device IDs, E2EE keys/recovery material, Synapse admin browsing, or impersonation.
- Stage 12 settings are user-owned only: users can view/update their own profile display name, view/copy their family code, manage existing Stage 9 notification preferences, see honest E2EE/session limitations, and logout locally. Stage 12 does not add admin message reading, media browsing, room browsing, impersonation, Synapse admin proxying, E2EE recovery, key export/import, or backend recovery-material storage.
- Stage 13 only polishes existing chat UX. It does not add admin message/media moderation, room browser, message search, impersonation, E2EE recovery/verification management, data export, backup/restore UI, or new backend media handling.
- Stage 14 prepares deployment configuration and documentation only. It does not change Matrix message/media/E2EE protocol behavior, expose new message/media access, expose Synapse admin APIs, or implement Stage 15 backups.
- Stage 11 invite creation returns plaintext only once in the create response; list/status responses expose no plaintext code and no code hash.
- Stage 11 deactivation protects the current admin and the last active admin.
- Stage 9 Web Push subscriptions are stored in Family API because browsers require the endpoint and keys for delivery. API responses and UI must not display raw endpoints or browser push keys.
- Stage 9 Matrix push gateway sends fact-only notifications by default. Sender-name notifications only use an active local Family API display name mapped from the Matrix sender ID. Message-text notifications are opt-in and must fall back to fact-only for encrypted events or missing plaintext content.
- Stage 10 LiveKit token issuance is handled by Family API, but media flows through LiveKit between browser clients. Family API does not receive, proxy, decrypt, record, transcribe, or store call audio/video.
- Stage 10 Matrix call signaling events contain call IDs, mode, timestamps, and expiry metadata only. LiveKit tokens are not sent over Matrix.
- Matrix user IDs are used internally to create private Matrix rooms from Family API users, but the UI avoids rendering raw Matrix IDs.
- Newly created direct, group, and common rooms are encrypted by Matrix room state at creation time. Existing unencrypted rooms are not silently upgraded or relabeled.
- The backend-managed common Family Chat provisioning sets Matrix encryption state only. It does not give Family API access to message keys or recovery material.
- Same-browser reload can reuse the local SDK crypto store. A new browser profile or device may need recovery or verification before old encrypted history can be decrypted.
- Stage 6 does not implement storage of a recovery passphrase in localStorage and does not send recovery material to Family API.
- Local plaintext-storage smoke procedures are documented in `docs/runbooks/stage-6-e2ee-smoke.md`, `docs/runbooks/stage-7-media-smoke.md`, and `docs/runbooks/stage-8-voice-smoke.md`; they are practical smokes, not mathematical proofs.
- Stage 7 browser file-picker live smoke remains a known validation gap until it can be completed in a browser environment with local app and OS file-picker access.
- Stage 8 real microphone record/send/play smoke remains a known validation gap until it can be completed in a browser environment with microphone access.
- Stage 9 live push delivery remains a known validation gap until a browser subscription and Matrix/new-message push can be verified with local VAPID keys.
- Stage 10 live audio/video call smoke requires a private local LiveKit config, two disposable users, and browser microphone/camera permission.
- Stage 11 live admin smoke remains a known validation gap until admin login, member denial, invite create/use/disable, user deactivation, status/audit, and privacy inspection are verified against a private local stack.
- Stage 12 settings smoke is documented in `docs/runbooks/stage-12-settings-smoke.md`. Logout clears local app auth and Matrix session storage wrappers, but it does not claim secure deletion of all browser IndexedDB crypto state or server-side Matrix keys.
- Stage 13 UX polish smoke is documented in `docs/runbooks/stage-13-ux-polish-smoke.md`. It does not close Stage 7, Stage 8, Stage 9, Stage 10, Stage 11, or Stage 12 live-smoke blockers.
- Stage 14 production deployment smoke is documented in `docs/runbooks/stage-14-production-deployment-smoke.md`. It does not close Stage 7, Stage 8, Stage 9, Stage 10, Stage 11, Stage 12, or Stage 13 live-smoke blockers.

## Reverse proxy boundary

Nginx currently proxies:

- `/_matrix`
- `/_synapse/client`

It does not proxy `/_synapse/admin` to public clients. Access-management admin operations should go through the Family API with local admin authorization; Synapse admin APIs and tokens must not be exposed to the browser.

The Stage 14 production Nginx template preserves the same rule: `/_synapse/admin`
returns a public denial, while `/_matrix` and `/_synapse/client` route to
Synapse client endpoints only.

## Production considerations

Before any real deployment:

- replace all placeholder secrets;
- review Synapse `server_name` and keep it stable;
- enable HTTPS at the reverse proxy;
- replace Stage 2 in-memory rate limiting with Redis or another shared limiter before multi-worker/public production use;
- complete Stage 15 backup and restore automation in a later stage;
- review logs for accidental secret exposure;
- define a secret rotation process.
