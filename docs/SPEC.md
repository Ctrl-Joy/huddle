# Huddle — Product Analysis & Architecture Spec

Huddle is an original real-time community platform: servers ("huddles" in UI copy are called
**servers**), text/voice channels, roles & permissions, DMs, friends, voice/video/screen share,
file sharing and notifications. It is functionally modelled on the category of community chat products, but uses its own branding, palette, iconography and copy.

This document is the single source of truth for every contributor. The machine-readable half of
the contract lives in `packages/shared/src` — **types there win over prose here**.

---

## 1. Feature analysis (what the product category does, and what Huddle ships)

### 1.1 Identity & social
| Feature | Behaviour in Huddle |
|---|---|
| Accounts | Register (email, username, password), login, JWT session (stored in `localStorage`), logout. |
| Profile | Display name, unique username, avatar upload, banner colour, "about me", custom status text. |
| Presence | `online` / `idle` / `dnd` / `invisible` (shown as offline to others). Auto-`idle` after 10 min inactivity. Offline when last gateway socket closes. |
| Friends | Send request by username, accept/decline/cancel, remove, block. Tabs: Online, All, Pending, Blocked, Add Friend. |
| DMs | 1:1 DM channels and group DMs (≤10). Opened from friend list or profile. Show in the DM list ordered by last activity. |

### 1.2 Servers (guilds), channels, roles
| Feature | Behaviour |
|---|---|
| Servers | Create (name + optional icon), edit, delete (owner only), leave. Creating a server seeds `@everyone` role, a "Text Channels" category with `#general`, and a "Voice Channels" category with `General` voice. |
| Invites | Create invite (max uses, expiry), join via `/invite/:code` page or "Join a server" modal, list & revoke in settings. |
| Channel types | `GUILD_TEXT (0)`, `DM (1)`, `GUILD_VOICE (2)`, `GROUP_DM (3)`, `GUILD_CATEGORY (4)`. |
| Channel mgmt | Create/edit/delete, topic, slow-mode, reorder by position, categories collapse (client-side). |
| Roles | Create/edit/delete/reorder, colour, hoist (separate group in member list), mentionable, permission toggles. Role hierarchy: you can only manage roles below your highest role. |
| Overwrites | Per-channel allow/deny for roles and members. |
| Moderation | Kick, ban (with reason), unban, timeout (`communication_disabled_until`), nickname change, delete others' messages. Audit log records every moderation/config change. |

### 1.3 Messaging
- Send, edit (own), delete (own or `MANAGE_MESSAGES`), reply with jump-to-original, pin/unpin & pins popover.
- Markdown subset: `**bold**`, `*italic*`, `__underline__`, `~~strike~~`, `` `code` ``, fenced code blocks,
  `> quote`, `||spoiler||`, auto-links, `@user`, `@role`, `@everyone`, `#channel` mentions.
- Reactions with unicode emoji; reaction counts, "me" highlight, toggling.
- Attachments: up to 10 files / 25 MB each, drag & drop or paste; image/video inline preview, lightbox; other files as download cards.
- Typing indicators ("X is typing…") with 8 s expiry.
- Message grouping: consecutive messages from same author within 7 min collapse under one header.
- Infinite scroll back through history (50 per page), "jump to present".
- Unread state per channel (bold channel name, red mention badge), "new messages" divider, mark-as-read.
- Search messages in a server (content contains, `from:` user, `in:` channel).
- System messages: member join, pin added, call started (DM).

### 1.4 Voice & video
- Join/leave voice channels; one voice connection per user at a time.
- Self mute, self deafen, camera on/off, screen share; server mute/deafen by moderators (`MUTE_MEMBERS`/`DEAFEN_MEMBERS`), move/disconnect (`MOVE_MEMBERS`).
- Participants listed under the voice channel in the sidebar with mic/deafen/camera/live icons and a speaking ring.
- Voice view: tile grid of participants (video or avatar), focused tile for screen share.
- DM calls: ring the other party, accept/decline, same media engine.
- Transport: WebRTC **full mesh** (each peer ↔ each peer) with signaling relayed by the gateway (op `VOICE_SIGNAL`). STUN only. Fine for ≤ 8 people; an SFU is the documented scale-out path.

### 1.5 Notifications
- In-app: unread/mention badges on channels, servers and the DM icon; tab title `(n) Huddle`.
- Desktop: browser `Notification` API for mentions and DMs when the tab is hidden; sound ping.
- Per-server settings: All messages / Only @mentions / Nothing, plus mute server. Per-channel mute.

### 1.6 Settings / UX surfaces
- User settings modal: My Account, Profile, Notifications, Voice & Video (device pickers, mic test), Appearance (dark/light), Log out.
- Server settings modal: Overview, Roles, Members, Invites, Bans, Audit Log, Delete server.
- Channel settings modal: Overview, Permissions.
- Context menus (right click) on servers, channels, messages, members.
- Quick switcher (`Ctrl+K`), keyboard: `Esc` closes modals / cancels edit, `↑` edits last own message, `Enter` sends, `Shift+Enter` newline.
- User popout card on avatar/name click: banner, avatar, roles, "Message" button, add friend.

---

## 2. Architecture

```
┌──────────── apps/web (React + Vite) ───────────┐
│ zustand stores  ◄── Gateway client (WebSocket) │
│ REST client (fetch + JWT)    WebRTC mesh engine │
└───────────────▲───────────────────▲─────────────┘
          REST /api/*         WS /gateway   (signaling only; media is P2P)
┌───────────────┴───────────────────┴─────────────┐
│ apps/server (Fastify + ws)                       │
│  routes/*  →  services/*  →  db (node:sqlite)    │
│  gateway: sessions, heartbeats, fan-out by perms │
│  voice: in-memory voice states + signal relay    │
│  uploads/ on disk, served at /uploads/*          │
└──────────────────────────────────────────────────┘
```

- **IDs**: Snowflakes (64-bit, custom epoch 2025-01-01) serialised as strings. Message ordering and pagination use ID comparison (`BigInt`).
- **Auth**: `Authorization: Bearer <jwt>` (HS256, 30-day). Passwords hashed with `crypto.scrypt` + per-user salt.
- **Persistence**: one SQLite file `apps/server/data/huddle.db`, WAL mode, foreign keys on. Schema migrations in `apps/server/src/db/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`).
- **Realtime fan-out**: the gateway keeps `userId → Set<socket>`. Guild-scoped events are sent to members who can `VIEW_CHANNEL` (for channel-scoped events) or are members (guild-scoped). DM events go to recipients.
- **Permissions**: computed server-side on every mutating request using `computePermissions` from `@huddle/shared` (same function the client uses to hide UI).
- **Rate limits**: simple in-memory token bucket per user per route group (messages: 5 / 5 s).

### 2.1 Gateway protocol (WebSocket `/gateway`)
Frame: `{ op: number, d?: any, s?: number, t?: string }` — see `packages/shared/src/gateway.ts`.

1. Server → `HELLO { heartbeat_interval: 30000 }`
2. Client → `IDENTIFY { token }`  → Server → `DISPATCH READY` (full initial state)
3. Client → `HEARTBEAT` every interval → Server → `HEARTBEAT_ACK`. Missing two beats → server closes 4009.
4. Client → `PRESENCE_UPDATE { status }`, `VOICE_STATE_UPDATE { guild_id, channel_id | null, self_mute, self_deaf, self_video, self_stream }`, `VOICE_SIGNAL { target_user_id, channel_id, kind, data }`.
5. Close codes: 4004 auth failed, 4009 session timeout, 4000 unknown error.

### 2.2 REST API (`/api`)
All bodies JSON unless noted. Errors: `{ message, code }` with HTTP status.

```
POST   /auth/register {email, username, password}       → {token, user}
POST   /auth/login    {login (email|username), password}  → {token, user}
GET    /users/@me                                         → User (private)
PATCH  /users/@me     {display_name?, username?, bio?, banner_color?, custom_status?} → User
POST   /users/@me/avatar (multipart file)                 → User
GET    /users/:id                                         → PublicUser + mutual guild ids
GET    /users/@me/relationships                           → Relationship[]
POST   /users/@me/relationships {username}                → send friend request
PUT    /users/@me/relationships/:userId {type?:1|2}       → accept (1) / block (2)
DELETE /users/@me/relationships/:userId                   → remove/decline/cancel/unblock
POST   /users/@me/channels {recipient_ids: string[]}      → DM or group DM Channel (reuses existing 1:1)
GET    /users/@me/guild-settings                          → UserGuildSettings[]
PATCH  /users/@me/guilds/:guildId/settings {...}           → UserGuildSettings

POST   /guilds {name} (+ optional multipart icon at /guilds/:id/icon) → Guild
GET    /guilds/:id                                        → Guild
PATCH  /guilds/:id {name?, description?, system_channel_id?} MANAGE_GUILD
POST   /guilds/:id/icon (multipart)                        MANAGE_GUILD
DELETE /guilds/:id                                         owner
DELETE /users/@me/guilds/:id                               leave
GET    /guilds/:id/channels | POST {name,type,parent_id?,topic?}  MANAGE_CHANNELS
PATCH  /guilds/:id/channels  [{id, position, parent_id?}]  reorder
GET    /guilds/:id/members?limit&after | GET /guilds/:id/members/:userId
PATCH  /guilds/:id/members/:userId {nick?, roles?, communication_disabled_until?, mute?, deaf?, channel_id?}
PATCH  /guilds/:id/members/@me {nick}
DELETE /guilds/:id/members/:userId                         KICK_MEMBERS
GET    /guilds/:id/bans | PUT /guilds/:id/bans/:userId {reason} | DELETE ...   BAN_MEMBERS
GET    /guilds/:id/roles | POST | PATCH /roles/:roleId | DELETE /roles/:roleId | PATCH /roles [{id,position}]
GET    /guilds/:id/invites | POST /channels/:id/invites {max_uses?, max_age?}
GET    /invites/:code (public preview) | POST /invites/:code (join) | DELETE /invites/:code
GET    /guilds/:id/audit-logs?limit
GET    /guilds/:id/messages/search?content&author_id&channel_id&limit&offset

GET    /channels/:id | PATCH {name?, topic?, rate_limit_per_user?, parent_id?} | DELETE
PUT    /channels/:id/permissions/:targetId {type, allow, deny} | DELETE
GET    /channels/:id/messages?before&after&around&limit(≤100)
POST   /channels/:id/messages  JSON {content, reply_to_id?, nonce?}  or multipart (field `payload_json` + files[])
PATCH  /channels/:id/messages/:mid {content}
DELETE /channels/:id/messages/:mid
PUT    /channels/:id/messages/:mid/reactions/:emoji/@me | DELETE same
GET    /channels/:id/pins | PUT /channels/:id/pins/:mid | DELETE /channels/:id/pins/:mid
POST   /channels/:id/typing
POST   /channels/:id/messages/:mid/ack                    → read state
POST   /channels/:id/call/ring  {}                         DM call ring (dispatches CALL_CREATE)
GET    /health
```

Static: `GET /uploads/<path>` (attachments, avatars, icons).

### 2.3 Data model (SQLite)
See `apps/server/src/db/schema.sql`. Tables: `users, relationships, guilds, members, roles,
member_roles, channels, channel_recipients, permission_overwrites, messages, attachments,
reactions, message_mentions, pins (column on messages), invites, bans, audit_log, read_states,
user_guild_settings`. Voice states are in memory only.

### 2.4 Permission algorithm (shared)
1. Guild owner → ALL. 
2. base = `@everyone.permissions | OR(member roles)`; if `ADMINISTRATOR` → ALL.
3. Channel: apply `@everyone` overwrite (deny then allow), then OR of all role overwrites for the member's roles (deny then allow), then member overwrite (deny then allow).
4. No `VIEW_CHANNEL` → 0. Timed-out members lose everything except `VIEW_CHANNEL | READ_MESSAGE_HISTORY`.
5. Voice channel without `CONNECT` → strip voice perms. Text-only perms are irrelevant on voice and vice-versa.

---

## 3. Delivery stages
1. **Foundation** — monorepo, shared contract, schema, auth.
2. **Core backend** — every REST route + gateway fan-out + uploads.
3. **Core frontend** — layout, auth screens, servers/channels/messages/members/settings/friends/DMs.
4. **Voice & video** — gateway voice states, WebRTC mesh, voice UI, DM calls.
5. **Notifications & polish** — badges, desktop notifs, search, quick switcher, context menus.
6. **Verification** — automated API/gateway test suite + multi-user browser run-through.
