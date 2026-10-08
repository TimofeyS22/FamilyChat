# Stage 7 Media Local Smoke

This runbook checks Matrix media/file sending and the encrypted-room media privacy boundary. It is a local smoke, not a proof that every storage path is free of plaintext.

## Scope

Covered:

- File picker blocks files larger than 100 MB before upload.
- Images render inline and open in a lightbox.
- Videos render with browser controls when the browser can play the format.
- Generic files render as explicit download cards.
- Encrypted rooms upload encrypted attachment bytes and send Matrix encrypted `file` metadata.
- Same browser profile reload can still preview/download media whose event keys and attachment metadata are available locally.
- Synapse Postgres event JSON and Synapse media store do not contain the exact plaintext marker for an encrypted media fixture.

Not covered:

- Voice recording.
- Web Push.
- LiveKit/WebRTC calls.
- Cross-device key recovery or verification.

## Prerequisites

Use a private local `.env` with placeholder values replaced. Do not use real family files for this smoke.

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

Known local gap: in the current Codex browser environment this smoke could not be completed because local app/file-picker access was blocked. Keep Stage 7 marked partial until these steps run in a browser environment with access to the local app and OS file picker.

1. Log in as test user A in one browser profile.
2. Open a newly created encrypted direct, group, or freshly provisioned common room.
3. Attach a small PNG or JPEG image and send it.
4. Confirm upload progress appears, the image renders inline, and the image opens in the lightbox.
5. Reload the page in the same browser profile and confirm the image still renders.
6. Attach a small PDF, text file, or archive and send it.
7. Confirm the file renders as a card and downloads only after clicking the download action.
8. Reload the page in the same browser profile and confirm the file card still appears and can be downloaded.
9. Try a file larger than 100 MB, for example a disposable local dummy file, and confirm the UI blocks it before upload.
10. If feasible, stop `nginx` or disconnect the browser network during upload and confirm a safe failed state plus retry action appears.
11. Log out and confirm the app returns to login. This clears app auth and Matrix session storage; it is not a server-side key deletion claim.

## Plaintext Media Marker Check

Create a disposable marker fixture. Do not commit it and do not paste access tokens, raw device IDs, room IDs, or recovery material into notes.

```bash
MEDIA_MARKER="FC_E2EE_MEDIA_$(date +%Y%m%d%H%M%S)_$(openssl rand -hex 8)"
printf '%s\n' "$MEDIA_MARKER" > /tmp/familychat-stage7-marker.txt
printf '%s\n' "$MEDIA_MARKER"
```

Send `/tmp/familychat-stage7-marker.txt` in an encrypted room through the browser UI. After sync confirms the message is sent, search Synapse event JSON for the marker. Expected result: no rows.

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres sh -lc \
  "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"select event_id from event_json where json::text like '%${MEDIA_MARKER}%';\""
```

Search Synapse media store bytes for the exact marker. Expected result: no output.

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec -T synapse sh -lc \
  "grep -R -a -n \"${MEDIA_MARKER}\" /data/media_store || true"
```

If either command prints a matching event or media-store path, stop and inspect before continuing. Encrypted media should be stored as ciphertext in the media store, and encrypted-room events should not contain plaintext media bodies.

Optional sanity check: inspect the sent event through Matrix client/dev tooling and confirm the browser-visible decrypted message corresponds to a server-side `m.room.encrypted` event.

## Cleanup

```bash
rm -f /tmp/familychat-stage7-marker.txt
docker compose -f infra/docker-compose.yml --env-file .env down
```

Only add `-v` when you intentionally want to delete disposable local data.
