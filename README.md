# FamilyChat

FamilyChat is a private family messenger planned as a custom web client on top of Matrix Synapse.

This copy was recovered from a local Cursor snapshot on 2026-10-09. See
[the recovery record](docs/recovery-2026-10-09.md) for provenance and verification limits.

This repository currently contains the initial infrastructure foundation, the Family API backend, the frontend family interface, backend-managed common Family Chat membership, browser-side Matrix E2EE for newly created direct, group, and newly provisioned common chats, Matrix media/file sending, browser voice messages, PWA install assets, Web Push subscription plumbing, one-to-one LiveKit call plumbing, a minimal access-only admin panel, user-owned settings, Stage 13 chat UX polish, and Stage 14 production deployment scaffolding.

This is not a finished app or an MVP. Full cross-device E2EE recovery/verification, completed Stage 7/8/9/10 browser live smokes, completed Stage 11 live admin smoke, completed Stage 12 live settings/avatar smoke, completed Stage 13 UX smoke, and completed Stage 14 live VPS/HTTPS smoke are intentionally not claimed in this stage.

## Current scope

Implemented in this stage:

- Next.js frontend in `apps/web`.
- `.env.example` with placeholder values and no real secrets.
- Docker Compose for `postgres`, `synapse`, and `nginx`.
- PostgreSQL-backed Synapse configuration; SQLite is not configured.
- Public Synapse registration disabled.
- Closed family-mode federation defaults.
- Nginx proxying for Matrix client endpoints.
- FastAPI Family API for invite registration, local login, family users, and admin-only API operations.
- Alembic migration for Family API tables.
- Unit tests for Family API behavior with a fake Synapse admin integration.
- Login/register UI wired to Family API auth endpoints.
- Matrix JS SDK login after Family API login, using the same entered credentials without password persistence.
- Matrix session restore, sync lifecycle, joined room list, text timeline, and text sending.
- Matrix JS SDK Rust crypto initialization in the browser with a persistent IndexedDB crypto store.
- E2EE initial state for newly created direct, group, and common family rooms.
- Matrix media upload and rendering for images, videos, audio files, PDFs, archives, documents, and generic files up to 100 MB.
- Encrypted-room media upload encrypts attachment bytes client-side before Matrix media upload and sends Matrix encrypted file metadata instead of plaintext `url` content.
- Inline image previews, image lightbox, video controls, file download cards, upload progress, selected-file removal, and local retry for failed media sends.
- Voice message recording with browser `MediaRecorder`, cancel/send controls, duration metadata, Matrix `m.audio` message content, and a voice bubble player with play/pause/progress.
- Encrypted-room voice messages reuse the encrypted Matrix media attachment path; Family API does not receive, proxy, decrypt, or store voice bytes.
- PWA manifest, install icons, service worker registration, and navigation-only offline fallback.
- Authenticated Web Push subscription settings in `/settings`; notification permission is requested only after the user clicks enable.
- Family API Web Push subscription storage, privacy preference updates, test push endpoint, and invalid-subscription disabling.
- Matrix HTTP push gateway endpoint for new-message notifications; notifications are fact-only by default and do not include encrypted message text.
- Browser Matrix pusher registration using the Family API push gateway URL and subscription ID as the Matrix push key.
- One-to-one LiveKit call-token endpoint, local LiveKit Compose service, direct-room call signaling, and browser audio/video call controls.
- Minimal `/admin` access-management panel for admins only: user list/deactivation, invite creation/disable/status, safe service status, and sanitized audit log.
- Truthful per-room encryption status for encrypted, unencrypted, checking, and recovery/setup-needed states.
- Family member panel backed only by `GET /api/family/users`.
- Family-code lookup backed only by `GET /api/family/users/search?code=...`.
- Direct and group family chat creation from active Family API users only.
- Backend-managed canonical `Family Chat` room creation and active-user reconciliation.
- Common `Family Chat` is opened truthfully as a backend-managed room; newly provisioned rooms include Matrix encryption state and existing older rooms are not relabeled.
- User-owned `/settings` profile page backed by `GET/PATCH /api/profile/me`, with display-name edits synced through the Matrix service layer, family code display/copy, existing Web Push notification controls, honest E2EE/session wording, and logout.
- Avatar display falls back to initials. Avatar upload/change is not wired in this stage, and stored remote avatar URLs are not rendered in settings because Family API must not become a media proxy and Matrix profile-media plumbing needs separate design/testing.
- Stage 13 chat UX polish: responsive chat layout refinements, skeleton loading states, safer empty/error states, toast notifications, improved bubbles/composer, desktop drag-and-drop through the existing Matrix media send path, mobile-friendly picker affordances, browser offline/online indicator, local-only failed-send retry, and message context actions for copy text, hide locally, and retry failed sends.
- Stage 14 production deployment scaffold: `infra/docker-compose.prod.yml`, `infra/nginx/nginx.prod.conf`, Nginx production templates for web/API/Matrix/LiveKit host routing, placeholder-only `.env.production.example`, deployment hardening docs, and a Stage 14 smoke runbook.
- Protected frontend shells for chats, settings, and admin.
- Basic docs for setup, security, backup, deployment, and operations.

Not implemented yet:

- Call push.
- Cross-device E2EE recovery/verification flows beyond honest setup-needed UX.
- Automatic encryption upgrade for common Family Chat rooms that were created before Stage 6 E2EE provisioning.
- Completed live browser Web Push delivery smoke in this local environment.

Known validation gap:

- Stage 7 browser file-picker live smoke remains partial in this local environment because the in-app browser could not access the local app URL/file picker. Automated tests and a Node/Synapse encrypted-media marker smoke were run, but Stage 7 should not be marked fully done until that browser smoke is completed.
- Stage 8 browser microphone live smoke remains partial in this local environment because microphone access was denied. Automated tests cover the voice flow, but Stage 8 should not be marked fully done until a real browser can record, send, and play a voice message.
- Stage 9 implementation is present, but live Web Push delivery should stay partial until a browser subscription can be enabled with local VAPID keys and a Matrix/new-message push can be observed.
- Stage 10 implementation is present, but live audio/video call smoke should stay partial until two disposable users can complete a real browser LiveKit call with camera/microphone permission.
- Stage 11 implementation is present, but live admin smoke should stay partial until a private local stack verifies admin login, member denial, invite create/use/disable, user deactivation, status, audit, and privacy inspection.
- Stage 12 implementation is present, but live settings smoke and a separate safe avatar flow remain pending.
- Stage 13 implementation is present, but live browser UX smoke should stay partial until desktop/mobile chat, drag-and-drop, offline/online, message actions, and privacy inspection are verified against a disposable local stack.
- Stage 14 scaffold is present, but deployment should stay partial until a real VPS/domain/HTTPS smoke validates frontend, Family API, Matrix, LiveKit routing, `/_synapse/admin` blocking, and persistence with private secrets.

## Architecture

```text
client/browser
  -> Next.js frontend
  -> Family API (local auth, invites, family users)
  -> Matrix JS SDK
  -> nginx reverse proxy
    -> Synapse Matrix homeserver
  -> PostgreSQL
```

Current services:

- `postgres`: stores Synapse data in a named Docker volume.
- `synapse`: Matrix homeserver using PostgreSQL and persistent `/data`.
- `nginx`: local reverse proxy for `/_matrix` and `/_synapse/client`.
- `family-api`: FastAPI service for Stage 2 family access logic.
- `apps/web`: Next.js frontend with Matrix text/media/voice chat, one-to-one call UI, PWA/Web Push settings, Family API-backed family UI, minimal admin UI, and browser-side E2EE for encrypted rooms.

Future placeholders:

- `infra/livekit`: future calls infrastructure.
- `infra/backups`: future backup scripts and local backup notes.

## Quick start

From the repository root:

```bash
cp .env.example .env
```

For Compose config validation with placeholder values:

```bash
docker compose -f infra/docker-compose.yml --env-file .env.example config
```

For private local runtime, copy `.env.example`, replace all placeholders, and then start services:

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres synapse nginx family-api
docker compose -f infra/docker-compose.yml --env-file .env ps
curl http://localhost:8080/_matrix/client/versions
curl http://localhost:8000/api/health
docker compose -f infra/docker-compose.yml --env-file .env down
```

Family API intentionally refuses to start with placeholder JWT, invite-pepper, Matrix admin token, or database URL values.

Create the first local Family API admin from a trusted shell after migrations have run and Synapse admin credentials are configured:

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec family-api \
  python -m app.cli bootstrap-admin \
  --username familyadmin \
  --display-name "Family Admin" \
  --password "replace-with-a-private-password"
```

Frontend local run:

```bash
cd apps/web
npm install
npm run dev
```

The web app reads `NEXT_PUBLIC_FAMILY_API_BASE_URL`, defaulting to `http://localhost:8000`, and `NEXT_PUBLIC_MATRIX_BASE_URL`, defaulting to `http://localhost:8080`.

Web Push is disabled by default. For local notification smoke, set private VAPID values in `.env`, set `WEB_PUSH_ENABLED=true`, keep `MATRIX_PUSH_GATEWAY_URL` reachable by Synapse/Family API, and follow `docs/runbooks/stage-9-pwa-web-push-smoke.md`.

Production deployment preparation uses `.env.production.example` as a placeholder-only template and `infra/docker-compose.prod.yml` as an override:

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file .env.production.example config
```

Do not use `.env.production.example` for real users. Copy it to a private `.env.production`, replace all placeholders outside Git, configure real DNS/HTTPS, and follow `docs/runbooks/stage-14-production-deployment-smoke.md`.

The admin panel is available at `/admin` for active Family API users with role `admin`. It manages access only. It does not expose message bodies, Matrix room/event/device IDs, media URLs, E2EE keys, Synapse admin browsing, impersonation, invite hashes, or server secrets. Newly created invite plaintext is shown once in the browser; later list responses expose only safe invite status metadata.

The common Family Chat button opens an existing joined room named `Family Chat`. The Family API creates and reconciles that canonical room server-side. Newly provisioned common rooms include Matrix encryption state without giving message keys to the server. Existing local rooms created before this Stage 6 change are not silently upgraded or relabeled. If Synapse was unavailable during registration, run the reconcile command from a trusted shell:

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec family-api \
  python -m app.cli reconcile-common-room
```

## Synapse notes

`infra/synapse/homeserver.yaml` is a static template. Synapse does not interpolate values from `.env` inside YAML. The checked-in config uses placeholders that match `.env.example` so the infrastructure can be validated locally, but real deployments must use a private generated or edited config with real secrets.

Critical current settings:

- `enable_registration: false`
- `database.name: psycopg2`
- `media_store_path: /data/media_store`
- `federation_domain_whitelist: []`

## Security notes

- Do not commit `.env`.
- Do not use the placeholder Synapse secrets for real users.
- Public registration is disabled in Synapse.
- Nginx proxies client endpoints and returns 404 for `/_synapse/admin`.
- Federation is configured for a closed family server by default.
- Family API invite codes are hashed with a pepper and passwords are hashed with Argon2.
- Family discovery in the frontend goes through Family API endpoints only; external Matrix directory search and public room browsing are not used.
- Newly created direct, group, and common family rooms are private Matrix rooms without `m.room.encryption`, so notification previews can include message text.
- Matrix E2EE crypto state is stored by the Matrix SDK in browser IndexedDB under the FamilyChat crypto database prefix; the Matrix access session remains in the separate local Matrix session wrapper.
- Logout clears local app auth and Matrix session data, but it does not claim to delete server-side keys or securely erase browser IndexedDB crypto state.
- Common Family Chat is backend-managed; new common rooms follow the current private-without-E2EE policy, while older existing rooms are displayed according to their actual Matrix encryption state.
- Web Push privacy controls are implemented with fact-only defaults, but browser delivery still needs live smoke in an environment with service-worker push support. Production HTTPS, call push, and backup automation are future stages.
- The Stage 11 admin panel is access-only. It uses opaque admin refs for user/invite actions, protects self/last-admin deactivation, shows one-time invite plaintext only immediately after creation, and displays sanitized audit metadata only.
- Stage 12 settings are user-owned only. Admins do not gain message/media/E2EE access, impersonation, room browsing, or Matrix admin browsing through this stage.
- Stage 14 keeps Synapse admin endpoints non-public in the production reverse-proxy scaffold. It adds deployment configuration and documentation only; it does not add backups, monitoring dashboard, room/message search, admin message/media access, impersonation, or E2EE recovery.
- Stage 6 plaintext-storage smoke procedure: [docs/runbooks/stage-6-e2ee-smoke.md](/Users/timofejsemikin/Desktop/FamilyChat/docs/runbooks/stage-6-e2ee-smoke.md).
- Stage 7 encrypted-media plaintext-storage smoke procedure: [docs/runbooks/stage-7-media-smoke.md](/Users/timofejsemikin/Desktop/FamilyChat/docs/runbooks/stage-7-media-smoke.md).
- Stage 8 voice-message smoke procedure: [docs/runbooks/stage-8-voice-smoke.md](/Users/timofejsemikin/Desktop/FamilyChat/docs/runbooks/stage-8-voice-smoke.md).
- Stage 9 PWA/Web Push smoke procedure: [docs/runbooks/stage-9-pwa-web-push-smoke.md](/Users/timofejsemikin/Desktop/FamilyChat/docs/runbooks/stage-9-pwa-web-push-smoke.md).
- Stage 10 LiveKit call smoke procedure: [docs/runbooks/stage-10-livekit-calls-smoke.md](/Users/timofejsemikin/Desktop/FamilyChat/docs/runbooks/stage-10-livekit-calls-smoke.md).
- Stage 11 admin panel smoke procedure: [docs/runbooks/stage-11-admin-panel-smoke.md](/Users/timofejsemikin/Desktop/FamilyChat/docs/runbooks/stage-11-admin-panel-smoke.md).
- Stage 12 settings smoke procedure: [docs/runbooks/stage-12-settings-smoke.md](/Users/timofejsemikin/Desktop/FamilyChat/docs/runbooks/stage-12-settings-smoke.md).
- Stage 13 UX polish smoke procedure: [docs/runbooks/stage-13-ux-polish-smoke.md](/Users/timofejsemikin/Desktop/FamilyChat/docs/runbooks/stage-13-ux-polish-smoke.md).
- Stage 14 production deployment smoke procedure: [docs/runbooks/stage-14-production-deployment-smoke.md](/Users/timofejsemikin/Desktop/FamilyChat/docs/runbooks/stage-14-production-deployment-smoke.md).

More detail: [docs/security.md](/Users/timofejsemikin/Desktop/FamilyChat/docs/security.md).

## Documentation

- [Roadmap](/Users/timofejsemikin/Desktop/FamilyChat/docs/roadmap.md)
- [Setup](/Users/timofejsemikin/Desktop/FamilyChat/docs/setup.md)
- [Security](/Users/timofejsemikin/Desktop/FamilyChat/docs/security.md)
- [Backup](/Users/timofejsemikin/Desktop/FamilyChat/docs/backup.md)
- [Deployment](/Users/timofejsemikin/Desktop/FamilyChat/docs/deployment.md)
- [Operations](/Users/timofejsemikin/Desktop/FamilyChat/docs/operations.md)
