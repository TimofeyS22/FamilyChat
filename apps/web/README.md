# FamilyChat Web

Frontend family interface, Matrix text/media/voice-chat integration, one-to-one call UI, PWA/Web Push settings, minimal admin access panel, and browser-side E2EE setup for FamilyChat.

Implemented here:

- Next.js App Router with TypeScript and Tailwind CSS.
- Dark UI foundation and local design primitives.
- `/login` and `/register` forms wired to Family API auth endpoints.
- Matrix JS SDK password login after successful Family API login.
- Local Family API and Matrix session storage abstractions for development.
- Protected route guard for app pages.
- `/chats` joined chat list, Matrix text/media timeline, composer, sync states, and safe empty/error states.
- Attachment picker for images, videos, audio files, PDFs, archives, documents, and generic files up to 100 MB.
- Matrix media upload through Matrix JS SDK with progress, selected-file removal, safe failure UI, and same-tab retry for failed file sends.
- Encrypted-room file sends encrypt attachment bytes with Matrix encrypted attachment metadata before upload; the event uses `file` metadata instead of plaintext media `url`.
- Inline image rendering with lightbox, video controls, and file cards with explicit download actions.
- Voice message recording through browser `MediaRecorder`, with cancel/send controls, duration metadata, and `audio/webm` or `audio/ogg` Matrix media uploads.
- Voice message playback with play/pause/progress. Encrypted voice messages are decrypted client-side only when playback starts.
- Browser-side Matrix JS SDK Rust crypto initialization with persistent IndexedDB storage.
- Newly created direct and group rooms are private but do not add Matrix `m.room.encryption`, so push previews can include message text.
- Chat headers show truthful encryption state: encrypted and ready, not encrypted, checking, or recovery/setup needed.
- `/chats` Family panel backed by active Family API users.
- Family-code search backed by Family API only.
- Direct and group chats can be created only from Family API users.
- The common Family Chat is opened only when the backend-managed joined room is available; rooms are shown according to their actual encryption state.
- `/settings` is guarded by the existing auth shell and displays the signed-in Family API profile through `GET /api/profile/me`.
- `/settings` can update the current user's display name through `PATCH /api/profile/me`, show/copy the family code, reuse Stage 9 notification controls, show honest E2EE/session limitations, and logout through the existing local auth flow.
- Remote Matrix room member display names are used in message bubbles when the Matrix room state provides them, instead of rendering every sender as a generic family member.
- Avatar upload/change is not active in this settings page yet; the UI shows initials and does not render stored remote avatar URLs or route avatar bytes through Family API.
- `/settings` includes Web Push controls that request notification permission only after the user clicks enable, register a Matrix HTTP pusher, and allow notification privacy selection.
- PWA manifest, icons, service worker registration, and navigation-only offline fallback are under `public/` and `src/lib/pwa/`.
- `/admin` access-management panel for active admins only, backed by Family API admin endpoints.
- `/admin` user list/deactivation, invite code creation/disable/status, safe technical status, and sanitized audit log.
- Stage 13 chat UX polish: responsive chat shell refinements, skeleton loading, empty/offline states, safe toasts, improved message bubbles/composer, drag-and-drop file sending through the existing Matrix media path, mobile-friendly picker affordances, client-side retry for failed sends, and message context actions for copy text, local-only hide, and retry.
- Stage 14 production deployment scaffold can build the frontend container through `infra/docker-compose.prod.yml` with public `NEXT_PUBLIC_*` values from private production env.

Not implemented here:

- Full cross-device E2EE recovery or device verification flows.
- Camera capture, call push, or completed live Web Push delivery smoke.
- Avatar upload/change in settings.
- External Matrix user search or room directory browsing.
- Message/media browsing, E2EE key access, Synapse admin browsing, or impersonation in admin UI.
- Backend media proxying, avatar upload/change, message search, room browser, E2EE recovery/device-management UI, data export, backup/restore UI, or production hardening as part of Stage 13.
- Production readiness, MVP readiness, or security approval from the Stage 14 scaffold alone.

Known validation gap:

- Stage 7 media implementation remains marked partial until the browser file-picker live smoke can be run in an environment that can access the local app and OS file picker. Stage 8 voice tests use mocked `MediaRecorder`; a real microphone/browser smoke is still an environment-dependent check. Stage 9 Web Push delivery needs a real browser/service-worker push smoke, Stage 10 needs a real two-user LiveKit call smoke, and Stage 11 needs a real admin/member access smoke before being marked fully done.
- Stage 12 settings remains partial until live settings smoke and a separate safe avatar flow are completed. Stage 13 UX polish should remain partial until its desktop/mobile/browser smoke is completed with disposable accounts.

The common Family Chat action is intentionally limited to the browser-safe part: it opens an existing joined `Family Chat` room. Canonical room creation, encryption-state provisioning, and future-user membership are handled by Family API server-side orchestration and the `reconcile-common-room` CLI command. Family API does not receive or store message keys.

## Local commands

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

The frontend reads:

```bash
NEXT_PUBLIC_FAMILY_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_MATRIX_BASE_URL=http://localhost:8080
NEXT_PUBLIC_MATRIX_SERVER_NAME=familychat.local
```

Only `NEXT_PUBLIC_*` values should be exposed to the browser.

For Stage 14 production deployment, set these to public HTTPS origins in private
`.env.production`:

```bash
NEXT_PUBLIC_FAMILY_API_BASE_URL=https://api.example.invalid
NEXT_PUBLIC_MATRIX_BASE_URL=https://matrix.example.invalid
NEXT_PUBLIC_MATRIX_SERVER_NAME=familychat.example.invalid
```

Do not place Matrix access tokens, Matrix admin tokens, LiveKit API secrets,
VAPID private keys, database URLs, JWT secrets, invite peppers, or `.env`
contents in frontend env variables.

Web Push VAPID keys are not exposed through frontend env. The browser fetches the public VAPID key from the authenticated Family API push settings endpoint when server-side Web Push is enabled.

The admin panel renders access-control metadata only. It does not render Matrix message bodies, media URLs, raw Matrix user/room/event/device IDs, invite hashes, server tokens, LiveKit tokens, VAPID private keys, or E2EE recovery material. Newly created invite plaintext is shown only in the current UI state immediately after creation.

The settings page is user-owned only. It does not render raw Matrix access tokens, device IDs, room IDs, event IDs, message bodies, media browser data, push subscription endpoints/keys, LiveKit tokens, E2EE keys, recovery phrases, or remote avatar URLs. The E2EE card is informational only and does not verify Matrix crypto readiness, IndexedDB key availability, cross-signing, or device verification. Logout clears local app auth and the Matrix session wrapper, but does not claim secure deletion of browser IndexedDB crypto state.

Stage 13 message actions are local UI actions only. Hiding a message removes it from the current browser view and is not Matrix redaction or server deletion. Retry reuses the existing Matrix text/media/voice send paths for local failed outgoing items and does not persist sensitive content to Family API. Toasts and errors must stay generic and must not include message bodies, raw Matrix IDs, media URLs, tokens, stack traces, or secrets.
