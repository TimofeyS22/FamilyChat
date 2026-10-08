# Stage 11 Admin Panel Smoke

Use this runbook only against a private local stack with disposable accounts and secrets. Stage 11 is access management only; do not use it to inspect messages, media, rooms, devices, E2EE keys, or Synapse admin APIs.

## Preconditions

- Private `.env` values are set; `.env.example` placeholders are not used for runtime.
- `postgres`, `synapse`, `nginx`, `family-api`, and the web app are running.
- One active Family API admin exists.
- One active member exists, or a disposable invite can be used to create one.
- Browser localStorage/session data from previous unrelated tests has been cleared.

## Commands

From the repository root:

```bash
docker compose -f infra/docker-compose.yml --env-file .env ps
curl http://localhost:8000/api/health
curl http://localhost:8000/api/health/db
```

From `apps/web`:

```bash
npm run lint
npm run typecheck
npm test -- --run tests/admin.test.tsx
npm run build
```

From `services/family-api`:

```bash
pytest tests/test_admin.py tests/test_invites.py
ruff check .
ruff format --check .
```

## Browser Smoke

1. Log in as the admin and open `/admin`.
2. Verify the Users, Invite codes, Technical status, and Audit log sections render.
3. Verify Stage 7, Stage 8, Stage 9, and Stage 10 are shown as partial/live-smoke blockers, not done.
4. Log out, log in as a member, and open `/admin`.
5. Verify the member sees an admin-denied state and no admin sections are rendered.
6. Log in as admin again.
7. Create a disposable invite code with a recognizable label.
8. Verify the plaintext code is shown only in the current create result.
9. Reload `/admin`.
10. Verify the plaintext code is no longer visible and only invite status metadata remains.
11. Register a disposable member with the invite code.
12. Return to `/admin` and verify the invite is shown as used.
13. Create a second disposable invite, disable it, and verify the disabled status.
14. Deactivate a disposable member and verify the user status changes to inactive.
15. Verify the current admin cannot deactivate their own account.
16. Verify the last active admin cannot be deactivated.
17. Open Technical status and confirm only safe service status is shown.
18. Open Audit log and confirm only safe action metadata is shown.

## Privacy Inspection

Search the rendered `/admin` page, browser devtools network responses, and logs for forbidden data. The admin panel must not expose:

- message bodies;
- media URLs or `mxc://` values;
- Matrix room IDs;
- Matrix event IDs;
- Matrix device IDs;
- raw Matrix user IDs;
- Matrix access tokens or refresh tokens;
- invite code hashes;
- invite pepper values;
- Web Push endpoints or private keys;
- LiveKit tokens, API keys, API secrets, or raw LiveKit room names;
- database URLs;
- password hashes;
- E2EE keys or recovery material;
- Synapse admin endpoints;
- impersonation or login-as controls.

## Expected Result

Stage 11 can be considered locally smoked only when admin access, member denial, invite create/use/disable, user deactivation, status, audit, and privacy inspection all pass. This runbook does not close Stage 7, Stage 8, Stage 9, or Stage 10.
