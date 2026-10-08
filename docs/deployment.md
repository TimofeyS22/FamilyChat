# Deployment

This document captures Stage 14 deployment preparation for a VPS. It provides
configuration scaffolding and checklists only. It does not prove the app is
production-ready, MVP-ready, security-approved, or fully secure without a real
VPS/domain/HTTPS smoke.

## Compose Files

Local/dev validation still uses:

```bash
docker compose -f infra/docker-compose.yml --env-file .env.example config
```

Stage 14 adds a production override:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  --env-file .env.production.example \
  config
```

The production override uses Docker Compose merge tags such as `!reset` and
`!override`; use Docker Compose v2.24 or newer for validation and deployment.

For a real VPS, copy `.env.production.example` to a private `.env.production`,
replace every placeholder outside Git, and use that private file for runtime.

The production override:

- adds a `frontend` service built from `apps/web`;
- keeps `postgres`, `synapse`, and `family-api` off public host ports;
- exposes Nginx on `${PUBLIC_HTTP_PORT:-80}`;
- exposes LiveKit RTC ports only on `${LIVEKIT_RTC_BIND_IP:-127.0.0.1}` by
  default. Set that bind IP to `0.0.0.0` only when calls are intentionally
  enabled and the host firewall is ready;
- keeps named volumes for PostgreSQL and Synapse `/data`;
- uses restart policies and health checks where practical.

The frontend `NEXT_PUBLIC_*` values are baked into the Next.js build. Rebuild
the `frontend` image after changing public API/Matrix URLs; changing only the
runtime container environment does not update an already built bundle.

## Domains

Recommended domain split:

- Web app: `chat.example.invalid` in the template, replace with a real HTTPS domain.
- Family API: `api.example.invalid` in the template, replace with a real HTTPS domain.
- Matrix client API: `matrix.example.invalid` in the template.
- LiveKit WebSocket/API: `livekit.example.invalid` in the template.

The Synapse `server_name` is more sensitive than a proxy hostname. Choose it
before creating real accounts and avoid changing it later. Keep
`MATRIX_SERVER_NAME`, `NEXT_PUBLIC_MATRIX_SERVER_NAME`, Synapse `server_name`,
and Matrix `public_baseurl` consistent.

Path-based routing can be used later only after a separate review. The Stage 14
scaffold uses host-based routing because it is easier to reason about and keeps
Family API, Matrix, and LiveKit boundaries explicit.

## HTTPS

The checked-in production Nginx scaffold listens on HTTP so it can sit behind a
host-level TLS terminator or be used for initial certificate bootstrapping. Do
not use it for real family accounts without HTTPS.

Safe HTTPS options:

- terminate HTTPS on the VPS host with Caddy, Traefik, or a host Nginx/certbot setup;
- forward only validated HTTPS traffic to the Compose Nginx HTTP port;
- or extend the checked-in Nginx scaffold privately with mounted certificates after cert issuance.

Let’s Encrypt/certbot outline for a host-level reverse proxy:

1. Point DNS `A/AAAA` records for all public domains to the VPS.
2. Open ports `80/tcp` and `443/tcp`.
3. Issue certificates with a host-managed tool such as certbot or Caddy.
4. Configure the host TLS proxy to forward:
   - web domain -> Compose Nginx web virtual host;
   - API domain -> Compose Nginx API virtual host;
   - Matrix domain -> Compose Nginx Matrix virtual host;
   - LiveKit domain -> Compose Nginx LiveKit virtual host.
5. Add HSTS only after HTTPS and renewal have been verified.

Web Push requires a real HTTPS origin for normal browser behavior. LiveKit must
use a public `wss://` URL and reachable RTC ports. Do not claim HTTPS works until
it has been verified live.

## Reverse Proxy Routing

Current local routing:

- `/_matrix` -> Synapse
- `/_synapse/client` -> Synapse
- `/_synapse/admin` -> 404

Stage 14 production template routing:

- `${FAMILYCHAT_WEB_DOMAIN}` -> frontend
- `${FAMILYCHAT_API_DOMAIN}` -> Family API
- `${MATRIX_DOMAIN}/_matrix` -> Synapse client API
- `${MATRIX_DOMAIN}/_synapse/client` -> Synapse client API
- `${MATRIX_DOMAIN}/_synapse/admin` -> 404
- `${LIVEKIT_DOMAIN}` -> LiveKit WebSocket/API
- unknown non-health Host headers -> 404

The checked-in production template includes the LiveKit virtual host. Start the
`livekit` service with the production stack, even if Family API has
`LIVEKIT_CALLS_ENABLED=false`, or privately remove/replace the LiveKit server
block before running Nginx.

The production template sets `client_max_body_size 100m` to match the current
Matrix media limit. It includes WebSocket upgrade headers for Matrix sync and
LiveKit. It adds basic security headers, with camera/microphone allowed for the
same web origin so existing voice/call features are not broken.

Synapse admin endpoints must not be public. Do not add a public browser route to
`/_synapse/admin`, and do not expose Matrix admin tokens to frontend code.

## Secrets and Environment

Use `.env.production.example` as the placeholder-only checklist. Required
private values include:

- PostgreSQL passwords;
- Family API JWT secret;
- Family API invite pepper;
- Synapse generated secrets and signing key in private Synapse config/data;
- Matrix admin access token for Family API server-side use only;
- VAPID keys if Web Push is enabled;
- LiveKit API key/secret if calls are enabled.

`MATRIX_PUSH_GATEWAY_URL` is called by Synapse from inside the Compose network;
the production template defaults it to the internal `family-api` service URL to
avoid depending on host hairpin/NAT. Use a public HTTPS URL only after verifying
container egress to that domain.

Family API already refuses placeholder JWT, invite pepper, Matrix admin token,
database URL placeholders, invalid Web Push secrets when enabled, and invalid
LiveKit secrets when enabled. Do not weaken these checks.

Rotation notes:

- rotate Family API JWT secret only with a planned user re-login window;
- rotate invite pepper only with an invite-code invalidation plan;
- rotate Matrix admin token from a trusted server context;
- rotate VAPID keys knowing existing browser subscriptions may need renewal;
- rotate LiveKit keys and update both Family API and LiveKit together.

## Synapse Config

Before creating real users:

- generate or privately edit Synapse `/data/homeserver.yaml`;
- replace `macaroon_secret_key`, `form_secret`, and any registration shared secret;
- keep `enable_registration: false`;
- keep PostgreSQL configured;
- set `public_baseurl` to the HTTPS Matrix URL;
- keep `server_name`, signing key path/name, `public_baseurl`, and the
  `NEXT_PUBLIC_MATRIX_SERVER_NAME`/`NEXT_PUBLIC_MATRIX_BASE_URL` values
  consistent before creating users;
- keep the Synapse PostgreSQL password in the private YAML synchronized with
  `POSTGRES_PASSWORD` from the private production env;
- keep media store under persistent Synapse `/data`;
- keep federation closed unless a separate review intentionally changes it.

Synapse YAML is static. It does not read `.env` values automatically. The
`SYNAPSE_*` values in `.env.production.example` are an operator checklist for a
private generated/edited homeserver config, not automatic Compose injection.

The Family API service exists, and the frontend can use Matrix text/media/voice chat plus Family API-backed family member discovery and current-user profile settings. Newly created direct, group, and newly provisioned common rooms use browser-side Matrix E2EE. Media/files and voice messages are sent through Matrix media APIs, and encrypted-room attachments are encrypted in the browser before upload. PWA install assets and Web Push subscription plumbing are present, with fact-only notifications by default. One-to-one LiveKit call plumbing, the minimal access-only admin panel, and user-owned `/settings` are present. External Matrix discovery, call push, group calls, screen sharing, recording, transcription, E2EE recovery/key export, impersonation, and admin message/media browsing are not part of the current stage.

Common Family Chat membership is backend-managed by Family API using server-side Matrix operational credentials. Keep those credentials private, run `reconcile-common-room` after incidents, and do not expose Synapse admin APIs or tokens to the browser. New common rooms are created with real Matrix encryption state, but message keys remain browser-side and are not available to Family API.

The admin panel is for access management only. It must not expose Synapse admin browsing, Matrix room/event/device IDs, Matrix access tokens, invite hashes, server secrets, media URLs, message bodies, E2EE keys, or impersonation flows.

Stage 12 settings are user-owned only. They allow current users to edit their display name with Matrix service-layer synchronization, view/copy their family code, reuse Stage 9 notification controls, read honest informational E2EE/session limitations, and logout locally. Avatar upload/change is not active in this stage, and settings does not render stored remote avatar URLs. The settings page must not be treated as production readiness, security approval, E2EE cross-device recovery, backend media handling, or admin visibility expansion.

Stage 13 is UX polish only. It improves chat layout, loading/empty states, toasts, composer affordances, drag-and-drop/mobile file selection, offline indication, local retry, and local message actions through existing frontend/Matrix paths. It does not add production deployment, backup automation, monitoring, backend media proxying, message search, room browsing, admin message/media access, E2EE recovery/device management, impersonation, or data export.

Stage 14 is deployment preparation only. It adds production Compose/proxy/env
scaffolding and operational docs. It does not implement Stage 15 backup
automation, monitoring dashboards, data export, E2EE recovery/device management,
message/media moderation, room browser, message search, impersonation, or admin
message/media access.

## Server Hardening Basics

Minimum VPS controls before real accounts:

- firewall allows only `22/tcp` for admin SSH, `80/tcp` and `443/tcp` for HTTP/HTTPS, and LiveKit RTC ports only when the LiveKit route/service is intentionally enabled;
- restrict SSH with keys, no password login where possible, and non-root admin workflow;
- enable unattended security updates for the OS;
- install fail2ban or equivalent SSH/reverse-proxy brute-force protection;
- keep Docker and Compose updated through OS packages or a documented upgrade process;
- monitor `docker system df`, `df -h`, and PostgreSQL/Synapse volume growth;
- review `docker compose logs --tail=...` without pasting secrets into tickets;
- configure host log rotation for reverse-proxy/system logs;
- keep `.env.production` readable only by trusted operators.

Minimal incident checklist:

1. Preserve logs privately.
2. Rotate exposed secrets if exposure is suspected.
3. Disable invites if invite abuse is suspected.
4. Stop public ingress before destructive debugging.
5. Do not run restore over the only copy of data.

Stage 15 backup automation is still pending. Stage 14 can document backup
requirements but does not add backup scripts, restore scripts, timers, or
retention implementation.

## Server operations checklist

Before using real accounts:

- firewall exposes only required public ports;
- Docker volumes are identified and backup planning is documented;
- `.env` is stored outside Git;
- logs are reviewed for accidental secrets;
- restart policy is configured;
- disk usage is monitored;
- Stage 15 backup/restore planning is documented, and no restore has been run
  over the only copy of data.
- Family API JWT secret and invite pepper are replaced with private values.
- An initial admin bootstrap process is performed from a trusted operational context.
- Family API `python -m app.cli bootstrap-admin` was used only once, from a trusted shell, and no public bootstrap endpoint was exposed.
- Stage 6 E2EE smoke has been run for newly created direct/group rooms, including same-browser reload and server plaintext marker checks.
- Stage 7 encrypted media smoke has been run for at least one image and one generic file, including Synapse media-store plaintext marker checks.
- Stage 7 browser file-picker live smoke has been completed; this is still a known local validation gap if browser automation cannot access the app/file picker.
- Stage 8 voice smoke has been run in a browser with microphone permission and in an encrypted room, including Synapse media-store plaintext marker checks.
- Stage 9 PWA/Web Push smoke has been run with local VAPID keys, including installability, explicit permission request, subscription persistence, default fact-only delivery, invalid-subscription disabling, and offline fallback checks.
- Stage 10 one-to-one LiveKit call smoke has been run with two disposable active users and local browser camera/microphone permission.
- Stage 11 admin panel smoke has been run with admin login, member denial, invite create/use/disable, user deactivation, status/audit, and privacy inspection.
- Stage 12 settings smoke has been run with active-user login, profile display-name update, reload persistence, family-code copy, notification privacy update, E2EE/session wording check, logout, and privacy inspection.
- Stage 13 UX polish smoke has been run with desktop/mobile chat layout, skeleton/empty states, text send, context menu copy/local hide/retry, drag-and-drop/mobile picker, offline/online indicator, settings/admin regression checks, and privacy inspection.
- Stage 14 production deployment smoke has been run with real DNS/HTTPS, frontend/API/Matrix/LiveKit routes, WebSocket sync, Synapse admin blocking, volume persistence, and privacy inspection.
- Raw push subscription endpoints, browser push keys, VAPID private keys, Matrix access tokens, Matrix room IDs, and Matrix event IDs have not been logged or pasted into deployment notes.
- Admin notes/screenshots do not expose raw admin refs, invite plaintext after creation, invite hashes, invite peppers, Matrix user IDs, Matrix room IDs, Matrix event IDs, Matrix device IDs, media URLs, LiveKit tokens/secrets, Web Push secrets, database URLs, message bodies, or E2EE material.
- Stage 2 in-memory rate limiting is replaced with a shared limiter before public production use.
