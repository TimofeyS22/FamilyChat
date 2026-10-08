# LiveKit local service

`infra/docker-compose.yml` defines the local `livekit` service and passes its
configuration through `LIVEKIT_CONFIG` so private keys can come from `.env`.

Stage 10 uses LiveKit only for one-to-one audio/video calls. The local service
does not configure group rooms, screen sharing, recording, transcription,
ingress, egress, SIP, or bots.

To enable local calls, replace these values in `.env`:

```bash
LIVEKIT_CALLS_ENABLED=true
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=<private-local-key>
LIVEKIT_API_SECRET=<private-local-secret-at-least-32-chars>
```

`LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` must match the values used by the
Compose `livekit` service. Do not commit real keys.
