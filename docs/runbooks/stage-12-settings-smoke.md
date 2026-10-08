# Stage 12 Settings Smoke

Use this runbook only against a private local stack with disposable users and secrets. Stage 12 is user-owned settings only; it does not expand admin access or Matrix/E2EE visibility.

## Scope

Covered:

- `/settings` requires an authenticated active Family API user.
- Current-user profile metadata renders without raw internal IDs or tokens.
- Display name can be edited and persists after reload.
- Family code is visible and copyable where the browser clipboard API is available.
- Existing Stage 9 notification controls and privacy preference still work.
- E2EE/session text is honest about browser-side crypto and missing cross-device recovery/verification.
- Logout clears the local app auth and Matrix session wrapper.

Not covered:

- Avatar upload/change. The UI must not show an active upload control in this stage.
- Stage 7 file-picker smoke.
- Stage 8 real microphone record/send/play smoke.
- Stage 9 real Web Push delivery smoke.
- Stage 10 real LiveKit call smoke.
- Stage 11 live admin smoke.
- Production readiness, MVP readiness, security approval, E2EE recovery, key export/import, message search, room browser, media browser, or impersonation.

## Prerequisites

Use a private local `.env` with placeholders replaced. Do not use real family accounts or real private messages for this smoke.

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

Create or ensure one active disposable FamilyChat user through the documented local invite/admin flow.

## Browser Smoke

1. Log in as the active disposable user.
2. Open `/settings`.
3. Confirm the Profile, Family ID, Notifications, E2EE session, and Account sections render.
4. Confirm the profile shows username and display name, but does not show raw database UUIDs, Matrix user IDs, Matrix access tokens, device IDs, room IDs, or event IDs.
5. Change the display name to a disposable value and save.
6. Reload `/settings` and confirm the new display name persists.
7. Open a direct room from another disposable account after Matrix sync and confirm the sender name is shown from Matrix room member state when available, not only as generic `Family member`.
8. Confirm avatar change is clearly unavailable, remote avatar URLs are not rendered, and there is no dead upload control.
9. Confirm the family code is visible and copy works, or degrades with a safe unavailable message.
10. Change the notification privacy preference and confirm the setting updates without exposing push subscription endpoint, `auth`, or `p256dh` values.
11. If Web Push is configured for Stage 9, enable/disable notifications only through the existing settings controls. Do not use this runbook to claim Stage 9 live delivery done.
12. Confirm E2EE/session text says browser-side Matrix crypto is used, that the card is informational only, and that it does not verify crypto readiness, IndexedDB key availability, cross-signing, or device verification.
13. Confirm full cross-device recovery/verification is not implemented.
14. Confirm there is no recovery phrase input, key export/import, device-management list, message-reading control, room browser, media browser, admin control, impersonation, or login-as control.
15. Log out.
16. Confirm the app returns to login. The logout wording should say local app auth and Matrix session wrapper are cleared, without claiming secure deletion of all browser IndexedDB crypto state or server-side Matrix keys.

## Privacy Inspection

Inspect the rendered `/settings` page and browser network responses for forbidden data. They must not expose:

- message bodies or media browser data;
- Matrix access tokens or refresh tokens;
- Matrix admin tokens;
- Matrix room IDs;
- Matrix event IDs;
- Matrix device IDs;
- raw Matrix user IDs in normal UI;
- password hashes;
- invite hashes or invite peppers;
- raw Web Push subscription endpoints, `auth`, or `p256dh`;
- LiveKit tokens, API keys, or API secrets;
- database URLs or JWT secrets;
- E2EE keys, recovery phrases, recovery keys, or exported key material;
- Synapse admin browsing/proxying;
- impersonation or login-as controls.

## Expected Result

Stage 12 remains partial unless the browser smoke above passes in the local environment. This runbook does not close Stage 7, Stage 8, Stage 9, Stage 10, or Stage 11. Avatar upload/change remains a documented limitation until a separate safe Matrix-user-owned avatar flow is designed and tested without making Family API a media proxy.
