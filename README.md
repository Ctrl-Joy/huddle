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

To fill Discover for local testing or a demo, run `npm run seed:demo -w @huddle/server`. It adds ~24 clearly
fictional public communities (generated banners and icons, a few messages each) and ~40 demo member accounts with
random, unprinted passwords. It is idempotent (communities that already exist by name are skipped), safe to run while
`npm run dev` is up, and **for local/demo use only**: it is not part of `npm run seed`, so a production deploy starts clean.

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
strict NATs, set a TURN relay on the server with `HUDDLE_TURN_URL`, `HUDDLE_TURN_USERNAME` and
`HUDDLE_TURN_CREDENTIAL` (served to clients at `/api/ice`, no rebuild needed). Build-time
`VITE_TURN_*` in `apps/web/.env` still works as a fallback.
Camera, microphone and screen share require `localhost` or HTTPS.

## Deploy

The `Dockerfile` builds one container that serves everything on port 8080. The host needs:

- **WebSockets** (the gateway at `/gateway`) and **HTTPS** (browsers block mic, camera and screen share otherwise).
- **A persistent volume at `/data`** for the SQLite database, uploads and the JWT secret.
  Without it every redeploy wipes all accounts and messages.
- One instance only: the realtime gateway keeps state in memory.

| Variable | Needed | Purpose |
|---|---|---|
| `HUDDLE_JWT_SECRET` | recommended | Login token signing key; otherwise generated into `/data` on first boot |
| `HUDDLE_TURN_URL` | for calls across networks | e.g. `turn:relay.example.com:3478,turns:relay.example.com:5349` |
| `HUDDLE_TURN_USERNAME`, `HUDDLE_TURN_CREDENTIAL` | with TURN | Relay login |

**Railway or Fly.io** (both support volumes and WebSockets): create an app from this repo, let it
build the Dockerfile, attach a volume mounted at `/data`, set the variables above, and open the
generated `https://` address. **A VPS**: `docker build -t huddle . && docker run -d -p 8080:8080
-v huddle-data:/data --env-file .env huddle`, behind Caddy or nginx for HTTPS.

For TURN, a managed relay (Metered, Twilio, Cloudflare Calls) is quickest; self-hosting means
running coturn on a VPS with UDP 3478 and a relay port range open.
