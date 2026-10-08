# Stage 8 Voice Local Smoke

This runbook checks browser voice messages and the encrypted-room voice media privacy boundary. It is a local smoke, not a proof that every storage path is free of plaintext.

## Scope

Covered:

- Microphone permission is requested only after the user clicks the record control.
- Recording shows a timer and can be canceled without upload.
- Recording can be sent as a Matrix `m.audio` media message.
- Voice messages render as voice bubbles with play, pause, progress, and duration.
- Encrypted rooms upload encrypted voice bytes and send Matrix encrypted `file` metadata.
- Synapse Postgres event JSON and Synapse media store do not contain the exact plaintext marker for an encrypted voice fixture.

Not covered:

- Web Push.
- PWA/service worker installation.
- LiveKit/WebRTC calls.
- Cross-device key recovery or verification.
- Stage 7 browser file-picker smoke, which remains a separate known validation gap until it can run in a browser environment with local app and OS file-picker access.

## Prerequisites

Use a private local `.env` with placeholder values replaced. Do not use real family recordings for this smoke.

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

Use disposable users only. Create or ensure one local admin and two non-admin test users through the trusted local CLI/API flow from the setup docs.

## Browser Smoke

1. Log in as test user A in one browser profile.
2. Open a newly created encrypted direct, group, or freshly provisioned common room.
3. Click the voice record control.
4. Deny microphone permission once and confirm a safe UI error appears without raw browser exception text.
5. Allow microphone permission, record a short disposable phrase, then cancel it.
6. Confirm no failed upload or sent voice bubble appears for the canceled recording.
7. Record another short disposable phrase and send it.
8. Confirm upload/sending status is shown and then resolves.
9. Confirm the sent message renders as a voice bubble, not a generic file card.
10. Play and pause the voice bubble. Confirm progress and duration update.
11. Reload the page in the same browser profile and confirm the voice bubble still appears and can be played.
12. Log in as test user B in another browser profile or after the room has synced to B.
13. Confirm the voice message appears as a voice bubble and can be played if B has the required E2EE room keys.

If microphone permission, localhost access, or autoplay/audio APIs are blocked by the environment, record the browser smoke as BLOCKED with the exact blocker. Do not mark Stage 8 browser smoke done from unit tests alone.

## Plaintext Voice Marker Check

Create a disposable marker fixture. Do not commit it and do not paste access tokens, raw device IDs, room IDs, or recovery material into notes.

```bash
VOICE_MARKER="FC_E2EE_VOICE_$(date +%Y%m%d%H%M%S)_$(openssl rand -hex 8)"
printf '%s\n' "$VOICE_MARKER" > /tmp/familychat-stage8-voice-marker.txt
printf '%s\n' "$VOICE_MARKER"
```

Record or send a voice-message fixture in an encrypted room whose original audio bytes contain the marker. The application should upload encrypted attachment bytes, and the Matrix event should use encrypted `file` metadata rather than a plaintext media `url`.

After sync confirms the message is sent, search Synapse event JSON for the marker. Expected result: no rows.

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres sh -lc \
  "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc \"select event_id from event_json where json::text like '%${VOICE_MARKER}%';\""
```

Search Synapse media store bytes for the exact marker. Expected result: no output.

```bash
docker compose -f infra/docker-compose.yml --env-file .env exec -T synapse sh -lc \
  "grep -R -a -n \"${VOICE_MARKER}\" /data/media_store || true"
```

If either command prints a matching event or media-store path, stop and inspect before continuing. Encrypted voice media should be stored as ciphertext in the media store, and encrypted-room events should not contain plaintext voice bodies.

Optional sanity check: inspect the sent event through Matrix client/dev tooling and confirm the browser-visible decrypted message corresponds to a server-side `m.room.encrypted` event.

## Cleanup

```bash
rm -f /tmp/familychat-stage8-voice-marker.txt
docker compose -f infra/docker-compose.yml --env-file .env down
```

Only add `-v` when you intentionally want to delete disposable local data.
