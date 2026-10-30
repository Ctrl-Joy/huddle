# Huddle

A real-time community platform: servers, text and voice channels, roles and permissions,
DMs and group DMs, friends, voice/video/screen share, file sharing and notifications.
Product analysis and architecture: [docs/SPEC.md](docs/SPEC.md).

## Run it

Requires Node 24+. No database server or Docker needed (uses Node's built-in SQLite).

```bash
npm install
npm run seed -w @huddle/server   # demo users alice / bob / carol, password: password123
npm run dev                      # API on :3001, web on http://localhost:5173
```

Open http://localhost:5173 for the marketing site, or http://localhost:5173/login for the app.
To try two accounts at once, use two origins with separate storage, e.g.
`http://localhost:5173` and `http://127.0.0.1:5173`.

## Test

```bash
npm test          # 48 server tests (REST, gateway, permissions, voice signaling)
npm run typecheck
npm run build     # production web build -> apps/web/dist
```

Production: `npm run build && NODE_ENV=production npm start` serves the API and the built web app from one port.

## Layout

| Path | What |
|---|---|
| `packages/shared` | Wire contract: models, permission bitfield + algorithm, gateway opcodes/events, snowflakes |
| `apps/server` | Fastify REST API, WebSocket gateway, voice signaling, uploads, SQLite |
| `apps/web` | React app (`src/components`, `src/stores`), WebRTC engine (`src/voice`), marketing site (`src/landing`) |

## Voice & video across networks

Calls are peer-to-peer (WebRTC mesh, best for ≤ 8 people) and use public STUN. For users behind
strict NATs, configure a TURN server in `apps/web/.env` (see `apps/web/.env.example`).
Camera, microphone and screen share require `localhost` or HTTPS.
