# Setup

This document covers the local infrastructure setup for the current FamilyChat stage only.

The current stack includes:

- PostgreSQL for Synapse.
- Matrix Synapse.
- Nginx reverse proxy for Matrix client endpoints.
- Optional local LiveKit service for Stage 10 one-to-one calls.
- FastAPI Family API.
- Next.js frontend with Matrix text/media/voice chat, Stage 13 chat UX polish, one-to-one LiveKit call UI, PWA/Web Push settings, user-owned profile settings, Family API-backed family UI, minimal admin access panel, and browser-side E2EE for newly created direct/group chats.

It does not include call push, group calls, screen sharing, call recording, transcription, external Matrix discovery, message/media-reading admin screens, a completed Stage 7/8/9/10/11/12/13 live smoke, or a full cross-device E2EE recovery/verification flow.

## Requirements

- Docker with Docker Compose v2.
- A shell from the repository root: `/Users/timofejsemikin/Desktop/FamilyChat`.

## Environment

Use `.env.example` for config checks only:

```bash
docker compose -f infra/docker-compose.yml --env-file .env.example config
```

Use `.env.production.example` for Stage 14 production scaffold checks only:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  --env-file .env.production.example \
  config
```

For private local work:

```bash
cp .env.example .env
```

Then replace all `change-me` placeholder values in `.env`. For production,
also replace every `<change-me-...>` placeholder copied from
`.env.production.example`. Family API refuses to start with placeholder JWT,
invite pepper, Matrix admin token, database URL values, placeholder LiveKit
values when calls are enabled, or placeholder VAPID values when Web Push is
enabled.

For production-like VPS work, copy `.env.production.example` to a private
`.env.production`, replace every placeholder outside Git, configure real DNS and
HTTPS, and follow `docs/runbooks/stage-14-production-deployment-smoke.md`. Do
not commit `.env.production`.

Important: `infra/synapse/homeserver.yaml` is static. Synapse does not expand `.env` inside YAML, so private Synapse secrets and database credentials must also be updated in a private generated or edited Synapse config before creating real users.

## Start infrastructure

Placeholder config validation:

```bash
docker compose -f infra/docker-compose.yml --env-file .env.example config
```

Stage 1-only smoke with placeholders, if needed:

```bash
docker compose -f infra/docker-compose.yml --env-file .env.example up -d postgres synapse nginx
```

Private local run after replacing secrets:

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres synapse nginx family-api
```

For Stage 10 local call smoke after replacing `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, include LiveKit:

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres synapse nginx family-api livekit
```

Stage 14 production-like scaffold after replacing private values:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  --env-file .env.production \
  up -d postgres synapse family-api frontend livekit nginx
```

The checked-in production Nginx template includes a LiveKit virtual host. Start
`livekit` with the stack or privately remove/replace that server block before
running Nginx.

## Check services

```bash
docker compose -f infra/docker-compose.yml --env-file .env ps
curl http://localhost:8080/health
curl http://localhost:8080/_matrix/client/versions
curl http://localhost:8000/api/health
curl http://localhost:8000/api/health/db
docker compose -f infra/docker-compose.yml --env-file .env logs --tail=80 synapse
docker compose -f infra/docker-compose.yml --env-file .env logs --tail=80 nginx
docker compose -f infra/docker-compose.yml --env-file .env logs --tail=80 family-api
docker compose -f infra/docker-compose.yml --env-file .env logs --tail=80 livekit
```

Expected high-level result:

- `postgres` is healthy.
- `synapse` answers on `/health`.
- `nginx` answers on `/health`.
- Matrix client versions endpoint is reachable through Nginx.
- `family-api` answers on `/api/health`.
- `livekit` is running when Stage 10 call smoke is being attempted.

## Family API local development

From `services/family-api`:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
pytest
```

The API tests use a fake Synapse admin service and do not need a real Synapse admin token.

For migration smoke with SQLite:

```bash
FAMILY_API_ALLOW_SQLITE=true \
FAMILY_API_DATABASE_URL=sqlite:///./family-api-local.db \
FAMILY_API_SECRET_KEY=test-secret-key-with-at-least-32-bytes \
FAMILY_API_INVITE_PEPPER=test-invite-pepper-with-at-least-32-bytes \
MATRIX_ADMIN_ACCESS_TOKEN=test-matrix-admin-token-with-at-least-32-bytes \
alembic upgrade head

FAMILY_API_ALLOW_SQLITE=true \
FAMILY_API_DATABASE_URL=sqlite:///./family-api-local.db \
FAMILY_API_SECRET_KEY=test-secret-key-with-at-least-32-bytes \
FAMILY_API_INVITE_PEPPER=test-invite-pepper-with-at-least-32-bytes \
MATRIX_ADMIN_ACCESS_TOKEN=test-matrix-admin-token-with-at-least-32-bytes \
alembic current
```

The Docker Compose Postgres init script creates a separate Family API database/user only on a fresh Postgres volume.

## Frontend local development

From `apps/web`:

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

The frontend uses these browser-exposed values:

```bash
NEXT_PUBLIC_FAMILY_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_MATRIX_BASE_URL=http://localhost:8080
NEXT_PUBLIC_MATRIX_SERVER_NAME=familychat.local
```

For production, set those values to HTTPS public origins in private
`.env.production`, for example the web app should call the public Family API
domain and Matrix client domain rather than internal Compose service names.

Stage 6 stores the Family API token and Matrix session in separate client-only localStorage wrappers for development. Passwords are not stored. Matrix crypto state is stored separately by the Matrix JS SDK Rust crypto store in browser IndexedDB. A production cookie/session strategy can replace the Family API token storage later.

The Family panel uses the existing authenticated Family API endpoints:

- `GET /api/family/users` for active family members.
- `GET /api/family/users/search?code=...` for family-code lookup.

Direct and group chats are created from those Family API users only and include Matrix encryption initial state. The common Family Chat button opens the backend-managed joined `Family Chat` room. Newly provisioned common rooms include Matrix encryption state; existing local rooms created before Stage 6 E2EE provisioning are not claimed as encrypted unless their Matrix room state is encrypted. If the room is missing after a Synapse outage, run `python -m app.cli reconcile-common-room` inside the Family API container from a trusted shell.

The composer supports selecting one local file at a time up to 100 MB. Files are uploaded directly to Matrix media endpoints. In encrypted rooms, attachment bytes are encrypted in the browser before upload and the event content references Matrix encrypted file metadata. Family API is not in the media path.

Stage 13 adds desktop drag-and-drop and mobile-friendly picker affordances on top of that same media path. Unsupported or oversized files are blocked in the browser with generic errors. No raw local file path, Matrix media URL, room ID, event ID, access token, or stack trace should be rendered.

Voice messages are recorded in the browser with `MediaRecorder` after the user clicks the microphone control. The frontend currently supports browser-provided `audio/webm` or `audio/ogg` output. Voice messages are Matrix `m.audio` media messages with duration, MIME type, size, and a FamilyChat voice marker. In encrypted rooms they reuse the same client-side encrypted attachment path as Stage 7 media; Family API does not receive, proxy, decrypt, or store voice bytes.

Web Push is configured server-side through `.env` and is disabled by default:

```bash
WEB_PUSH_ENABLED=false
WEB_PUSH_VAPID_PUBLIC_KEY=change-me
WEB_PUSH_VAPID_PRIVATE_KEY=change-me
WEB_PUSH_SUBJECT=mailto:admin@example.invalid
MATRIX_PUSH_APP_ID=familychat.web
MATRIX_PUSH_GATEWAY_URL=http://family-api:8000/api/push/matrix/notify
```

For private local smoke, generate disposable VAPID keys outside Git, set `WEB_PUSH_ENABLED=true`, and start Family API with that `.env`. The browser fetches only the VAPID public key from Family API. Raw subscription endpoints and keys must not be pasted into logs or docs.

The `/settings` page uses `GET /api/profile/me` and `PATCH /api/profile/me` for current-user profile metadata only. Users can update their own display name, which Family API synchronizes through the Matrix service layer before committing locally, view/copy their family code, manage the existing Stage 9 notification controls, see honest browser-side E2EE/session limitations, and logout through the existing local auth flow. Avatar upload is not active in this stage; the UI shows initials, does not render stored remote avatar URLs, and does not send avatar bytes through Family API.

LiveKit calls are configured through `.env` and disabled by default:

```bash
LIVEKIT_CALLS_ENABLED=false
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=change-me
LIVEKIT_API_SECRET=change-me
```

For private Stage 10 local smoke, set `LIVEKIT_CALLS_ENABLED=true`, replace the key and secret with disposable private local values, and start the `livekit` service. Use a LiveKit API secret of at least 32 characters. Family API issues short-lived join tokens through `POST /api/calls/token`; the frontend never receives the LiveKit API secret. Calls are limited to direct rooms backed by active Family API users. Stage 10 does not add group calls, screen sharing, recording, transcription, or call push.

The admin panel is available at `/admin` for active admins only. It can list safe user metadata, create one-use invite codes, disable invite codes, deactivate users, show safe technical status, and show a sanitized audit log. It must not be used as a Matrix room browser or Synapse admin proxy: it does not show messages, media, room IDs, event IDs, device IDs, E2EE keys, Matrix access tokens, invite hashes, push secrets, LiveKit tokens, or server secrets. Invite plaintext is shown only immediately after creation.

For local Stage 6 E2EE smoke, including same-browser reload and server plaintext marker checks, follow `docs/runbooks/stage-6-e2ee-smoke.md`.
For local Stage 7 encrypted-media smoke, including media-store marker checks, follow `docs/runbooks/stage-7-media-smoke.md`.
For local Stage 8 voice-message smoke, including microphone permission and encrypted voice marker checks, follow `docs/runbooks/stage-8-voice-smoke.md`.
For local Stage 9 PWA/Web Push smoke, including permission, subscription, notification privacy, invalid-subscription, and offline fallback checks, follow `docs/runbooks/stage-9-pwa-web-push-smoke.md`.
For local Stage 10 LiveKit one-to-one call smoke, including incoming accept/reject, mute/camera/hangup, and permission denial checks, follow `docs/runbooks/stage-10-livekit-calls-smoke.md`.
For local Stage 11 admin panel smoke, including admin/member access, invite create/use/disable, user deactivation, status, audit, and privacy checks, follow `docs/runbooks/stage-11-admin-panel-smoke.md`.
For local Stage 12 settings smoke, including profile edit, family code copy, notification privacy, E2EE wording, logout, and privacy inspection, follow `docs/runbooks/stage-12-settings-smoke.md`.
For local Stage 13 UX polish smoke, including responsive chat layout, skeleton/empty states, toasts, drag-and-drop, mobile picker, offline/online indicator, message actions, retry, and privacy inspection, follow `docs/runbooks/stage-13-ux-polish-smoke.md`.
For Stage 14 production deployment smoke, including production compose config, DNS/HTTPS, frontend/API/Matrix/LiveKit routes, Synapse admin denial, volume persistence, and privacy inspection, follow `docs/runbooks/stage-14-production-deployment-smoke.md`.

Known gap: Stage 7 browser file-picker live smoke is still pending in this local environment because browser automation could not access the local app/file picker. Do not mark Stage 7 fully done until that browser smoke is completed.
Known gap: Stage 8 real microphone send/play smoke remains blocked in this local environment. Do not mark Stage 8 fully done until a real browser can record, send, and play a voice message.
Known gap: Stage 9 real Web Push subscription/delivery smoke remains pending until a browser subscription and Matrix/new-message push are verified with local VAPID keys.
Known gap: Stage 10 real browser audio/video call smoke requires a private local `.env`, LiveKit running, two disposable users, and browser camera/microphone permission.
Known gap: Stage 11 real browser/admin smoke requires a private local `.env`, an active admin, an active member, and a disposable invite code.
Known gap: Stage 12 real browser/settings smoke and a safe avatar flow remain pending.
Known gap: Stage 13 real browser UX smoke requires disposable user credentials, desktop and mobile viewport checks, and safe media/drop/offline interaction checks.
Known gap: Stage 14 real VPS/HTTPS deployment smoke requires a server, DNS, valid certificates, private placeholder-free secrets, and disposable accounts.

Matrix client traffic should use the public client reverse proxy URL, not Synapse admin URLs.

## Stop services

```bash
docker compose -f infra/docker-compose.yml --env-file .env down
```

This keeps named volumes. To delete all local service data, add `-v`; do that only when you intentionally want to remove local data:

```bash
docker compose -f infra/docker-compose.yml --env-file .env down -v
```

## Generating Synapse config

The official Synapse Docker image supports generating a static config:

```bash
docker run -it --rm \
  --mount type=volume,src=familychat_synapse_data,dst=/data \
  -e SYNAPSE_SERVER_NAME=familychat.local \
  -e SYNAPSE_REPORT_STATS=no \
  matrixdotorg/synapse:latest generate
```

After generation:

- Keep the `server_name` stable; changing it later breaks Matrix identities.
- Configure PostgreSQL with `database.name: psycopg2`.
- Keep `enable_registration: false`.
- Replace placeholder secrets privately.
- Do not commit generated signing keys or real secrets.

## Creating an admin user later

For controlled local administration, Synapse provides `register_new_matrix_user`. Only use it after replacing `registration_shared_secret` with a private value:

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec synapse \
  register_new_matrix_user -c /data/homeserver.yaml http://localhost:8008
```

This is an operations step, not public registration.

## Creating the first Family API admin

Family API invite endpoints are admin-only. After `.env` contains private values, migrations have run, and Synapse admin access works, create the first local Family API admin from a trusted shell:

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec family-api \
  python -m app.cli bootstrap-admin \
  --username familyadmin \
  --display-name "Family Admin" \
  --password "replace-with-a-private-password"
```

Do not use reserved Matrix localparts such as `admin`, `root`, `support`, `system`, or `synapse`.
