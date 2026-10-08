# Stage 14 Production Deployment Smoke

Use this runbook only with disposable accounts, private placeholder-free secrets,
and a controlled VPS or production-like host. Stage 14 prepares deployment
artifacts and checks; it does not prove production readiness, MVP readiness,
security approval, or full security.

## Scope

Covered:

- Production Compose scaffold validation.
- Placeholder-only production env template review.
- Frontend, Family API, Matrix, and LiveKit routing checks.
- HTTPS/domain checklist.
- Synapse admin endpoint public denial.
- Persistent volume sanity checks.
- Basic firewall, fail2ban, security updates, disk, and log review.

Not covered:

- Stage 7 browser file-picker live smoke completion.
- Stage 8 real microphone record/send/play smoke completion.
- Stage 9 real Web Push delivery smoke completion.
- Stage 10 real LiveKit call smoke completion.
- Stage 11 live admin smoke completion.
- Stage 12 live settings smoke or avatar upload/change.
- Stage 13 live UX polish smoke completion.
- Stage 15 backup/restore automation.
- Monitoring dashboard, CI/CD, Kubernetes, Terraform, Ansible, data export,
  room browser, message search, admin message/media access, impersonation,
  E2EE recovery/device management, or backend media proxying.

## Static Validation

From the repository root:

```bash
docker compose version
docker compose -f infra/docker-compose.yml --env-file .env.example config
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  --env-file .env.production.example \
  config
```

Docker Compose must be v2.24 or newer because the production override uses
`!reset`/`!override` merge tags.

Confirm `.env.production.example` contains placeholders only and no real values.
Do not paste private `.env.production` contents into notes.

## VPS Preconditions

1. DNS records point to the VPS:
   - web domain;
   - API domain;
   - Matrix domain;
   - LiveKit domain, if calls are enabled.
2. A private `.env.production` exists on the VPS and is not committed.
3. Synapse private `/data/homeserver.yaml` has real generated secrets, stable
   `server_name`, `public_baseurl` set to the HTTPS Matrix URL, PostgreSQL
   configured with the same password as private `.env.production`, a signing key
   path matching the production server name, and `enable_registration: false`.
4. Firewall allows only required ports:
   - SSH from trusted sources;
   - `80/tcp` and `443/tcp`;
   - LiveKit RTC TCP/UDP ports only when calls are enabled.
5. Host security updates and fail2ban or equivalent are configured.
6. TLS certificates are issued by a host-level TLS proxy or a private extension
   of the Nginx scaffold.

## Start Production-Like Stack

Use private `.env.production`, not the example file:

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  --env-file .env.production \
  up -d postgres synapse family-api frontend livekit nginx
```

The checked-in production Nginx template includes a LiveKit virtual host. Start
`livekit` with the stack, even if Family API has `LIVEKIT_CALLS_ENABLED=false`,
or privately remove/replace that Nginx server block before running Nginx.

## Route Smoke

Replace the domains with the real private deployment domains:

```bash
curl -fsS https://chat.example.invalid/
curl -fsS https://api.example.invalid/api/health
curl -fsS https://api.example.invalid/api/health/db
curl -fsS https://matrix.example.invalid/_matrix/client/versions
curl -fsS https://matrix.example.invalid/.well-known/matrix/client
curl -fsS -o /dev/null -w "%{http_code}\n" https://matrix.example.invalid/_synapse/admin
curl -fsS -H "Host: unexpected.example.invalid" -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
```

Expected:

- frontend route returns the web app;
- Family API health routes return safe health data only;
- Matrix client versions route works;
- Matrix well-known points to the HTTPS Matrix base URL;
- `/_synapse/admin` returns `404` or another non-success denial.
- unknown non-health Host headers return `404` and do not serve the web app.

For WebSocket sync, log in with a disposable user and confirm Matrix sync
connects through the public Matrix URL. Do not copy access tokens, room IDs,
event IDs, device IDs, or message contents into notes.

## LiveKit Checks

If calls are enabled in Family API:

1. Confirm `LIVEKIT_URL` is `wss://...` and matches the public LiveKit domain.
2. Set `LIVEKIT_RTC_BIND_IP=0.0.0.0` only after the host firewall allows the
   configured RTC TCP/UDP ports intentionally.
3. Run the Stage 10 call smoke with disposable users.
4. Confirm frontend never renders LiveKit API secrets or issued tokens.

If Family API calls are disabled, document that production call smoke was
skipped and keep Stage 10 partial unless separately completed. Still verify the
Nginx config/start path if the LiveKit virtual host remains present.

## HTTPS Checks

1. Confirm `http://` redirects to `https://` at the host TLS layer if configured.
2. Confirm certificates are valid for every public domain.
3. Confirm HSTS is enabled only after HTTPS and renewal are verified.
4. Confirm Web Push is tested only on a real HTTPS origin with disposable
   VAPID keys and accounts.

Do not claim HTTPS works unless the certificate and browser path were verified.

## Persistence Check

With disposable data only:

1. Create a disposable user and room.
2. Send a disposable text message.
3. Restart `frontend`, `nginx`, and `family-api`.
4. Confirm login and Matrix sync still work.
5. If safe, restart `synapse` and confirm Matrix client versions returns.

Do not destroy or restore real volumes as part of Stage 14. Backup/restore
automation is Stage 15 and remains pending.

## Privacy Inspection

Inspect rendered frontend, response headers, selected safe logs, and shared notes.
They must not expose:

- private `.env.production` values;
- Matrix access tokens or refresh tokens;
- Matrix admin tokens;
- LiveKit API secrets or issued tokens;
- VAPID private keys or raw browser push subscription keys;
- database URLs or passwords;
- JWT secrets or invite peppers;
- password hashes or invite code hashes;
- Matrix room IDs, event IDs, or device IDs in ordinary UI;
- message bodies in backend/admin views;
- media browser/admin access;
- E2EE keys, recovery phrases, exported key material, or decrypt tooling;
- Synapse admin browser/proxy;
- impersonation or login-as controls.

## Expected Result

Stage 14 remains partial unless the real VPS/domain/HTTPS smoke above passes.
This runbook does not close Stage 7, Stage 8, Stage 9, Stage 10, Stage 11,
Stage 12, or Stage 13 blockers. Stage 15 backup automation is not implemented.
