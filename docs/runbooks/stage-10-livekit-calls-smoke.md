# Stage 10 LiveKit one-to-one call smoke

This runbook validates Stage 10 only: one-to-one audio/video calls through
LiveKit with Family API token issuance and Matrix custom-event signaling.

## Out of scope

- Stage 7 media file-picker smoke.
- Stage 8 voice-message microphone record/send/play smoke.
- Stage 9 Web Push subscription or delivery smoke.
- Group calls or common-room calls.
- Screen sharing.
- Call recording.
- Transcription.
- Bots, SIP, ingress, or egress.
- Production readiness or security approval.

## Prerequisites

- A private local `.env` with all placeholder secrets replaced.
- `LIVEKIT_CALLS_ENABLED=true`.
- `LIVEKIT_URL=ws://localhost:7880` for the default local Compose service.
- Private disposable `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` values. Use a
  LiveKit API secret of at least 32 characters.
- The same LiveKit key and secret injected into the `livekit` service through
  Compose.
- Two disposable active FamilyChat users that are visible through Family API.
- A direct one-to-one Matrix room between those users.
- Browser microphone permission for audio-call smoke.
- Browser microphone and camera permission for video-call smoke.

## Start local services

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres synapse nginx family-api livekit
docker compose -f infra/docker-compose.yml --env-file .env ps
curl http://localhost:8080/health
curl http://localhost:8000/api/health
curl http://localhost:8000/api/health/db
docker compose -f infra/docker-compose.yml --env-file .env logs --tail=80 livekit
```

Run the frontend from `apps/web`:

```bash
npm run dev
```

## Audio call smoke

1. Sign in as disposable user A in one browser profile.
2. Sign in as disposable user B in another browser profile or device.
3. Open the direct one-to-one room between A and B.
4. From A, click the audio call button.
5. Confirm B sees an incoming audio call screen.
6. On B, accept the call and allow microphone access.
7. Confirm both sides show a connected call state.
8. Confirm audio is heard both ways using disposable test speech only.
9. Confirm the UI does not show LiveKit tokens, API secrets, raw Matrix user IDs,
   raw Family API UUIDs, or `fc-call-...` room names.
10. End the call from either side and confirm both UIs leave the call state.

## Video call smoke

1. Repeat the audio-call setup.
2. From A, click the video call button.
3. Confirm B sees an incoming video call screen.
4. On B, accept the call and allow microphone and camera access.
5. Confirm local and remote video render.
6. Toggle microphone mute and unmute.
7. Toggle camera off and on.
8. End the call from either side.

## Incoming reject smoke

1. From A, start an audio or video call to B.
2. On B, reject the incoming call.
3. Confirm A sees a declined or ended call state.
4. Confirm B did not request microphone or camera access before rejection.

## Permission denial smoke

1. In a browser profile, block microphone permission and start or accept an audio
   call.
2. Confirm the UI shows a safe microphone-access error.
3. Block camera permission and start or accept a video call.
4. Confirm the UI shows a safe camera/microphone-access error.
5. Confirm raw browser exception text and device paths are not rendered.

## Call push

Call push was not added in this Stage 10 implementation. If it is attempted in a
future pass, document it separately and do not use that result to close Stage 9
Web Push smoke.

## Blocker handling

If LiveKit cannot start, browser permissions are unavailable, autoplay/media
policy blocks playback, or the local environment cannot run two browser
sessions, record Stage 10 live smoke as blocked or partial with the exact
blocker. Do not mark Stage 7, Stage 8, or Stage 9 complete from this runbook.
