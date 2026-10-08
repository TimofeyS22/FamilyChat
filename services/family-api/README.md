# Family API

This is the FamilyChat backend service for closed-family access control, push/call helpers, and admin access management.

It owns:

- invite-code creation and consumption;
- local family user profiles;
- current-user profile read/update endpoints for safe user-owned settings;
- local Family API login with short-lived JWT access tokens;
- family code search inside the local family directory;
- admin-only user deactivation;
- admin-only safe user list, invite list/status, invite disable, technical status, and sanitized audit log;
- isolated Synapse admin integration for user creation/deactivation.
- Web Push subscription storage, privacy preferences, Matrix push gateway handling, test push, and invalid-subscription disabling.
- short-lived one-to-one LiveKit call-token issuance.

It does not store messages, store Matrix event bodies, handle file transfers, proxy media/avatar bytes, decrypt E2EE, implement call push, expose Synapse admin browsing, impersonate users, or provide any UI. Matrix push notifications are handled in memory for delivery and are fact-only by default.

## Local setup

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e ".[dev]"
```

## Test

```bash
pytest
ruff check .
ruff format --check .
```

Tests use SQLite and a fake Synapse admin service. They do not require a real Matrix server.

Web Push delivery uses `pywebpush` at runtime. Tests inject a fake sender and do not contact a push service.

## Production configuration notes

Stage 14 uses `.env.production.example` as a placeholder-only template. Copy it
to a private `.env.production` on the VPS and replace all placeholders outside
Git before starting the API.

Important server-only values:

- `FAMILY_API_DATABASE_URL`
- `FAMILY_API_SECRET_KEY`
- `FAMILY_API_INVITE_PEPPER`
- `MATRIX_ADMIN_ACCESS_TOKEN`
- `WEB_PUSH_VAPID_PRIVATE_KEY` when Web Push is enabled
- `LIVEKIT_API_SECRET` when calls are enabled

The API rejects placeholder JWT, invite pepper, Matrix admin token, database URL
placeholders, invalid Web Push secrets when enabled, and invalid LiveKit secrets
when enabled. Keep `FAMILY_API_CORS_ALLOWED_ORIGINS` limited to the production
web origin. CORS preflight allows the existing authenticated `GET`, `POST`, and
`PATCH` frontend flows; it does not make Synapse admin APIs public.

## Migrations

For a local SQLite migration smoke:

```bash
FAMILY_API_DATABASE_URL=sqlite:///./family-api-local.db alembic upgrade head
FAMILY_API_DATABASE_URL=sqlite:///./family-api-local.db alembic current
```

For Docker Compose, migrations run before Uvicorn starts.

## Web Push

Web Push is disabled by default. To enable it in a private local `.env`, set:

```bash
WEB_PUSH_ENABLED=true
WEB_PUSH_VAPID_PUBLIC_KEY=...
WEB_PUSH_VAPID_PRIVATE_KEY=...
WEB_PUSH_SUBJECT=mailto:admin@example.invalid
MATRIX_PUSH_APP_ID=familychat.web
MATRIX_PUSH_GATEWAY_URL=http://family-api:8000/api/push/matrix/notify
```

Do not commit real VAPID keys. The API never returns raw subscription endpoints or browser push keys in settings responses; it returns only the Matrix pusher configuration needed by the browser.

## Current-user profile API

Settings use authenticated current-user endpoints only:

- `GET /api/profile/me`
- `PATCH /api/profile/me`

The profile endpoint does not accept a user ID from the client. It returns safe profile metadata such as username, display name, family code, role, active state, avatar URL/reference, and timestamps. It does not return password hashes, Matrix access/admin tokens, Matrix room/event/device IDs, LiveKit tokens, push subscription endpoint/key material, invite hashes, invite peppers, database URLs, JWT secrets, message bodies, media bytes, or E2EE key material.

`PATCH /api/profile/me` accepts only the current user's trimmed display name, rejects extra profile fields, and synchronizes the display name through the Matrix service layer before committing the local update. Role, active state, family code, Matrix user ID, and password hash cannot be changed through this endpoint. Avatar upload/change is not implemented in Family API; do not add a backend media proxy for that path without a separate design and tests.

## Admin API

Admin endpoints require an active local user with role `admin`. The API exposes only access-control metadata:

- `GET /api/admin/users`
- `POST /api/admin/users/{admin_ref}/deactivate`
- `GET /api/invites`
- `POST /api/invites`
- `POST /api/invites/{admin_ref}/disable`
- `GET /api/admin/status`
- `GET /api/admin/audit`

User and invite actions use opaque `admin_ref` values derived with server-side HMAC. Responses do not include raw database IDs, Matrix user IDs, invite hashes, invite peppers, Matrix access tokens, LiveKit tokens, Web Push secrets, message bodies, room IDs, event IDs, media URLs, or E2EE key material. Invite plaintext is returned only in the create response and cannot be recovered from list/status endpoints.

Admin deactivation blocks inactive users, self-deactivation, and deactivation of the last active admin. Audit output is sanitized to a limited metadata allow-list.

## Bootstrap note

Stage 2 implements admin-protected invite endpoints. Create the first local admin from a trusted shell:

```bash
python -m app.cli bootstrap-admin \
  --username familyadmin \
  --display-name "Family Admin" \
  --password "replace-with-a-private-password"
```

The command refuses to run if an admin already exists, creates a matching Matrix user through the Synapse admin service layer, and blocks reserved localparts such as `admin`, `root`, `support`, `system`, and `synapse`. Do not expose public registration or a public bootstrap endpoint to solve bootstrapping.
