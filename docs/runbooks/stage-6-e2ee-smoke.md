# Stage 6 E2EE Local Smoke

This runbook checks the Stage 6 browser-side Matrix E2EE path for newly created direct, group, and newly provisioned common chats. It is a local smoke, not a proof that every storage path is free of plaintext.

## Scope

Covered:

- Matrix crypto starts in the browser.
- Newly created direct and group rooms are encrypted.
- Newly provisioned backend-managed common `Family Chat` rooms are encrypted by Matrix room state.
- Same browser profile reload can still read messages whose keys are already local.
- Synapse/Postgres event JSON does not contain the exact plaintext marker strings for encrypted-room messages.

Not covered:

- Media, files, Web Push, LiveKit, or calls.
- Cross-device recovery, secret storage setup, or interactive device verification.

## Prerequisites

Use a private local `.env` with placeholder values replaced. Do not use real family messages for this smoke.

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

Create or ensure one local admin and two non-admin test users through the trusted local CLI/API flow from the setup docs. Use disposable accounts only.

## Browser Smoke

Generate two unique marker strings locally. Do not commit them.

```bash
DIRECT_MARKER="FC_E2EE_DIRECT_$(date +%Y%m%d%H%M%S)_$(openssl rand -hex 8)"
GROUP_MARKER="FC_E2EE_GROUP_$(date +%Y%m%d%H%M%S)_$(openssl rand -hex 8)"
printf '%s\n%s\n' "$DIRECT_MARKER" "$GROUP_MARKER"
```

1. Log in as test user A in one browser profile.
2. Create a direct chat with test user B from the Family panel.
3. Confirm the chat header says encrypted or encrypted with recovery setup needed.
4. Send `DIRECT_MARKER` in the direct chat.
5. Reload the page in the same browser profile.
6. Confirm the direct chat still shows `DIRECT_MARKER`.
7. Create a group chat with at least two Family API users.
8. Send `GROUP_MARKER` in the group chat.
9. Reload the page in the same browser profile.
10. Confirm the group chat still shows `GROUP_MARKER`.
11. Log out and confirm the app returns to login. This clears app auth and Matrix session storage; it is not a server-side key deletion claim.

## Server Plaintext Check

Search Synapse event JSON for the exact marker strings. Expected result: no rows for encrypted direct/group/common room messages.

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres sh -lc \
  "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"select event_id from event_json where json::text like '%${DIRECT_MARKER}%';\""

docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres sh -lc \
  "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"select event_id from event_json where json::text like '%${GROUP_MARKER}%';\""
```

If either command prints an event ID, stop and inspect before continuing. Do not paste access tokens, raw device IDs, room IDs, or recovery material into issue notes.

Optional raw event sanity check: inspect the sent events through Matrix client/dev tooling and confirm encrypted-room events are `m.room.encrypted` on the server side while still readable in the browser UI.

## Common Family Chat Check

Open the backend-managed `Family Chat`. For a freshly provisioned Stage 6 stack, its header should show encrypted or encrypted with recovery setup needed. Stage 6 uses server-side Matrix operational credentials only to create the room with Matrix encryption state and reconcile membership; it does not use a server bot or Synapse admin operation to hold E2EE message keys for this room. Existing rooms created before Stage 6 E2EE provisioning may still show as not encrypted and should not be silently relabeled.

## Cleanup

```bash
docker compose -f infra/docker-compose.yml --env-file .env down
```

Only add `-v` when you intentionally want to delete disposable local data.
