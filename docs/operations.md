# Operations

This document lists basic commands for the current infrastructure services.

## Validate Compose

```bash
docker compose -f infra/docker-compose.yml --env-file .env.example config
```

Stage 14 production scaffold validation:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  --env-file .env.production.example \
  config
```

Use `.env.production.example` only for config validation. Real VPS runs must use
a private `.env.production` outside Git with all placeholders replaced.
The production override uses Docker Compose `!reset`/`!override` merge tags; use
Docker Compose v2.24 or newer.

## Start services

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres synapse nginx family-api
```

Use `.env` instead of `.env.example` for private local work. Family API will fail fast if placeholder secrets are still present.

For Stage 10 one-to-one call smoke, include the local LiveKit service after replacing `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env`:

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres synapse nginx family-api livekit
```

Stage 14 production-like start after replacing all placeholders in private
`.env.production`:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  --env-file .env.production \
  up -d postgres synapse family-api frontend livekit nginx
```

The checked-in production Nginx template includes a LiveKit virtual host, so
start `livekit` with the stack or privately remove/replace that server block
before running Nginx.

## Service status

```bash
docker compose -f infra/docker-compose.yml --env-file .env ps
```

Production scaffold status:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  --env-file .env.production \
  ps
```

## Logs

```bash
docker compose -f infra/docker-compose.yml --env-file .env logs --tail=80 postgres
docker compose -f infra/docker-compose.yml --env-file .env logs --tail=80 synapse
docker compose -f infra/docker-compose.yml --env-file .env logs --tail=80 nginx
docker compose -f infra/docker-compose.yml --env-file .env logs --tail=80 family-api
docker compose -f infra/docker-compose.yml --env-file .env logs --tail=80 livekit
```

For production-like Compose, add both compose files and the private
`.env.production`. Do not paste secrets, raw Matrix IDs, access tokens, LiveKit
tokens/secrets, VAPID private keys, database URLs, invite peppers, or message
bodies into tickets or shared logs.

## Health checks

```bash
curl http://localhost:8080/health
curl http://localhost:8080/_matrix/client/versions
curl http://localhost:8000/api/health
curl http://localhost:8000/api/health/db
docker compose -f infra/docker-compose.yml --env-file .env exec synapse curl -fSs http://localhost:8008/health
```

Production route checks after DNS/HTTPS are configured:

```bash
curl -fsS https://chat.example.invalid/
curl -fsS https://api.example.invalid/api/health
curl -fsS https://matrix.example.invalid/_matrix/client/versions
curl -fsS -o /dev/null -w "%{http_code}\n" https://matrix.example.invalid/_synapse/admin
curl -fsS -H "Host: unexpected.example.invalid" -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
```

Expected admin result is `404` or another non-success public denial. Never use a
browser-exposed route for Synapse admin APIs. Expected unknown-host result is
`404`, except for the internal `/health` route.

## Restart one service

```bash
docker compose -f infra/docker-compose.yml --env-file .env restart synapse
```

Production-like restart:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  --env-file .env.production \
  restart nginx
```

## Family API checks

From `services/family-api`:

```bash
pytest
ruff check .
ruff format --check .
```

Admin invite creation requires a local admin user and JWT. Stage 11 includes the `/admin` access panel, but there is still no public bootstrap endpoint.

## Frontend checks

From `apps/web`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
npm ls matrix-js-sdk
npm ls @matrix-org/matrix-sdk-crypto-wasm
npm ls livekit-client
npm ls postcss
```

Run locally:

```bash
npm run dev
```

The frontend uses `NEXT_PUBLIC_FAMILY_API_BASE_URL` for Family API login/register, current-user profile settings, active family users, family-code search, push subscription settings, LiveKit call-token requests, and admin access-management endpoints. It uses `NEXT_PUBLIC_MATRIX_BASE_URL` for Matrix client login, sync, joined rooms, timeline, direct/group room creation, browser-side E2EE, text sends, Matrix media uploads/downloads, voice media uploads/downloads, Matrix pusher registration, custom FamilyChat call signaling events, and Stage 13 UX affordances that retry or drag/drop through existing Matrix send paths.

Matrix text chat runtime requires Synapse to be reachable through nginx at the configured public Matrix client URL.

Matrix E2EE runtime uses the SDK Rust crypto IndexedDB store in the same browser profile. Normal reload should keep decryptability for messages whose room keys are already in that profile. Logout clears app auth and Matrix session storage but does not claim server-side key deletion or browser IndexedDB crypto erasure.

Settings runtime checks:

- `GET /api/profile/me` requires a Family API bearer token and returns only safe current-user profile metadata.
- `PATCH /api/profile/me` updates only the current user's trimmed display name.
- `/settings` shows the family code for FamilyChat lookup only, reuses Stage 9 notification controls, and renders E2EE/session limitations as informational text.
- Avatar upload/change is not active in this stage; Family API must not be used as an avatar or media proxy.
- Settings logout uses the existing local logout flow and must not be described as secure erasure of browser crypto storage.

Family-panel runtime checks:

- `GET /api/family/users` requires a Family API bearer token and returns active users only.
- `GET /api/family/users/search?code=...` searches by family code only.
- Direct and group room creation uses Matrix user IDs returned by Family API; there is no external Matrix user input. New direct/group rooms include Matrix encryption initial state.
- Common Family Chat opens a joined `Family Chat` room. Canonical room creation and active-user membership reconciliation are owned by Family API, not the browser. Newly provisioned common rooms include Matrix encryption state; older existing rooms are shown according to their actual Matrix room state.

Stage 6 local smoke:

```bash
open docs/runbooks/stage-6-e2ee-smoke.md
```

Stage 7 local media smoke:

```bash
open docs/runbooks/stage-7-media-smoke.md
```

Stage 8 local voice smoke:

```bash
open docs/runbooks/stage-8-voice-smoke.md
```

Stage 9 local PWA/Web Push smoke:

```bash
open docs/runbooks/stage-9-pwa-web-push-smoke.md
```

Stage 10 local LiveKit call smoke:

```bash
open docs/runbooks/stage-10-livekit-calls-smoke.md
```

Stage 11 local admin panel smoke:

```bash
open docs/runbooks/stage-11-admin-panel-smoke.md
```

Stage 12 local settings smoke:

```bash
open docs/runbooks/stage-12-settings-smoke.md
```

Stage 13 local UX polish smoke:

```bash
open docs/runbooks/stage-13-ux-polish-smoke.md
```

Stage 14 production deployment smoke:

```bash
open docs/runbooks/stage-14-production-deployment-smoke.md
```

Known validation gap: Stage 7 browser file-picker live smoke remains pending in this local environment. Keep Stage 7 marked partial until a browser with local app and OS file-picker access completes that runbook.

Known validation gap: Stage 8 real browser microphone record/send/play smoke remains blocked in this local environment. Keep Stage 8 marked partial until a browser with microphone access completes that runbook.

Known validation gap: Stage 9 live push delivery remains partial until a browser service-worker push subscription and a Matrix/new-message push are verified with local VAPID keys.

Known validation gap: Stage 10 live audio/video call smoke requires private local LiveKit keys, the `livekit` service, two disposable active users, and browser microphone/camera permission.

Known validation gap: Stage 11 live admin smoke requires a private local stack with an active admin, active member, and disposable invite code. Keep Stage 11 marked partial until admin login, member denial, invite create/use/disable, user deactivation, status/audit, and privacy inspection are verified end to end.

Known validation gap: Stage 12 live settings smoke and a separate safe avatar flow remain pending.

Known validation gap: Stage 13 live UX smoke requires disposable users, browser desktop/mobile checks, drag-and-drop/file-picker access, offline/online simulation, message actions, retry, and privacy inspection. Keep Stage 13 partial until that runbook is completed.

Known validation gap: Stage 14 live VPS/HTTPS smoke requires real DNS, valid
certificates, private placeholder-free secrets, route checks, WebSocket checks,
Synapse admin denial, LiveKit route/RTC checks when enabled, and persistence
checks. Keep Stage 14 partial until that runbook is completed.

## VPS hardening basics

- Allow only required public ports: SSH, HTTP/HTTPS, and LiveKit RTC ports when the LiveKit route/service is intentionally enabled.
- Use key-based SSH and restrict administrative access.
- Enable unattended OS security updates.
- Install fail2ban or equivalent SSH/reverse-proxy abuse protection.
- Keep Docker and Compose patched.
- Check disk usage with `df -h`, `docker system df`, and volume growth reviews.
- Review logs with `docker compose logs --tail=...` and avoid sharing secret-bearing output.
- Configure host log rotation for reverse-proxy and system logs.
- Store `.env.production` outside Git with restrictive file permissions.

Stage 15 backup automation is not implemented in Stage 14. Do not add cron
backup jobs, restore scripts, or retention automation as part of this stage.

## Admin operations

Use `/admin` only for family access management:

- list safe user metadata;
- create one-use invite codes;
- disable invite codes;
- deactivate users;
- inspect safe service status;
- inspect sanitized audit events.

Do not paste raw admin refs, invite plaintext, Matrix user IDs, Matrix room IDs, Matrix event IDs, Matrix device IDs, media URLs, access tokens, invite hashes, invite peppers, Web Push secrets, LiveKit secrets/tokens, or database URLs into tickets, logs, screenshots, or docs. The admin panel is not a message reader, media browser, E2EE recovery tool, Synapse admin browser, or impersonation tool.

## Web Push operations

Web Push is disabled unless `WEB_PUSH_ENABLED=true` and private VAPID values are present in `.env`.

```bash
WEB_PUSH_ENABLED=true
WEB_PUSH_VAPID_PUBLIC_KEY=...
WEB_PUSH_VAPID_PRIVATE_KEY=...
WEB_PUSH_SUBJECT=mailto:admin@example.invalid
MATRIX_PUSH_APP_ID=familychat.web
MATRIX_PUSH_GATEWAY_URL=http://family-api:8000/api/push/matrix/notify
```

Do not paste raw push subscription endpoints, browser push keys, Matrix room IDs, Matrix event IDs, Matrix access tokens, or VAPID private keys into tickets, logs, or docs. Call notifications are Stage 10 scope and are not handled by the Stage 9 push gateway.
For production Compose, keep `MATRIX_PUSH_GATEWAY_URL` internal to the
`family-api` service unless container egress through the public HTTPS API domain
has been explicitly verified.

## LiveKit call operations

LiveKit calls are disabled unless `LIVEKIT_CALLS_ENABLED=true` and private local LiveKit key material is present in `.env`.

```bash
LIVEKIT_CALLS_ENABLED=true
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

The same `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` values are injected into the Compose `livekit` service through `LIVEKIT_CONFIG` and into Family API for token signing. Use a LiveKit API secret of at least 32 characters. Do not paste LiveKit API secrets, issued LiveKit tokens, or raw `fc-call-...` room names into tickets, logs, screenshots, or docs.
In production, keep `LIVEKIT_RTC_BIND_IP=127.0.0.1` while calls are disabled.
Set it to `0.0.0.0` only when calls are intentionally enabled and firewall rules
allow the configured RTC TCP/UDP ports.

Stage 10 supports one-to-one audio/video calls only. It does not include call push, group calls, screen sharing, recording, transcription, ingress, egress, SIP, or bots.

## Common Family Chat reconcile

Family API attempts to add each newly registered user to the canonical private `Family Chat` room after local registration succeeds. If Synapse was unavailable or a join attempt failed, run:

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec family-api \
  python -m app.cli reconcile-common-room
```

The command ensures the canonical room exists and joins every active local user. New canonical rooms are created with Matrix encryption state, but Family API never receives or stores message keys. Run it from a trusted shell only; it uses server-side Matrix operational credentials and must not be exposed through frontend code.

Create the first local Family API admin from a trusted shell:

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec family-api \
  python -m app.cli bootstrap-admin \
  --username familyadmin \
  --display-name "Family Admin" \
  --password "replace-with-a-private-password"
```

The command refuses to run if an admin already exists and blocks reserved Matrix localparts.

Stage 2 rate limiting is process-local and keyed by request client address plus subject. It is useful as a development guard only; use a shared limiter before public production or multi-worker deployment.

## Stop services

```bash
docker compose -f infra/docker-compose.yml --env-file .env down
```

## Inspect volumes

```bash
docker volume ls | grep familychat
```

Expected current volumes:

- `familychat_postgres_data`
- `familychat_synapse_data`
- `familychat_postgres_data` also contains the Family API database when using the shared Postgres container.

## Common issues

### Synapse cannot connect to PostgreSQL

Check:

- `POSTGRES_PASSWORD` in Compose environment;
- matching PostgreSQL password in private Synapse config;
- `database.args.host: postgres`;
- PostgreSQL health status.

### Matrix endpoint returns 404 at `/`

That is expected in this stage. Nginx only exposes health and Matrix/Synapse client endpoints.

### Public registration attempt fails

That is expected. Public registration is disabled.

### Family API cannot connect to its database

If the Postgres volume already existed before Family API was added, the init script may not have created the `familychat` database/user. Recreate only disposable local volumes or create the DB/user manually with the same values from `.env`.

### Server name was changed after users existed

Matrix user IDs include the server name. Do not change `server_name` after creating real users; rebuild the environment only if no real accounts/data need to be preserved.
