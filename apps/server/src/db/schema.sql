-- Huddle schema. Idempotent: every statement is safe to run on every boot.
-- Ids are snowflake strings (TEXT); compare/order them with CAST(id AS INTEGER).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT,
  password_hash TEXT NOT NULL,
  avatar        TEXT,
  banner_color  TEXT,
  bio           TEXT,
  -- profile extras (older DBs get these via migrate() in db/index.ts)
  banner        TEXT,
  accent_color  TEXT,
  pronouns      TEXT,
  custom_status TEXT,
  status        TEXT NOT NULL DEFAULT 'online',
  bot           INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

-- One row per direction: (user_id → other_id, type from user_id's point of view).
CREATE TABLE IF NOT EXISTS relationships (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type     INTEGER NOT NULL,
  since    TEXT NOT NULL,
  PRIMARY KEY (user_id, other_id)
);
CREATE INDEX IF NOT EXISTS idx_relationships_other ON relationships(other_id);

CREATE TABLE IF NOT EXISTS guilds (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  icon              TEXT,
  description       TEXT,
  owner_id          TEXT NOT NULL REFERENCES users(id),
  system_channel_id TEXT,
  created_at        TEXT NOT NULL,
  -- public directory (older DBs get these via migrate() in db/index.ts)
  discoverable      INTEGER NOT NULL DEFAULT 0,
  category          TEXT,
  banner_color      TEXT,
  banner            TEXT,
  verified          INTEGER NOT NULL DEFAULT 0 -- set by seed/admin tooling only, never through the API
);

CREATE TABLE IF NOT EXISTS members (
  guild_id   TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nick       TEXT,
  joined_at  TEXT NOT NULL,
  communication_disabled_until TEXT,
  mute       INTEGER NOT NULL DEFAULT 0,
  deaf       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);

CREATE TABLE IF NOT EXISTS roles (
  id          TEXT PRIMARY KEY,
  guild_id    TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       INTEGER NOT NULL DEFAULT 0,
  hoist       INTEGER NOT NULL DEFAULT 0,
  mentionable INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  permissions TEXT NOT NULL DEFAULT '0'
);
CREATE INDEX IF NOT EXISTS idx_roles_guild ON roles(guild_id);

CREATE TABLE IF NOT EXISTS member_roles (
  guild_id TEXT NOT NULL,
  user_id  TEXT NOT NULL,
  role_id  TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (guild_id, user_id, role_id),
  FOREIGN KEY (guild_id, user_id) REFERENCES members(guild_id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_member_roles_role ON member_roles(role_id);

CREATE TABLE IF NOT EXISTS channels (
  id                  TEXT PRIMARY KEY,
  type                INTEGER NOT NULL,
  guild_id            TEXT REFERENCES guilds(id) ON DELETE CASCADE,
  name                TEXT,
  topic               TEXT,
  position            INTEGER NOT NULL DEFAULT 0,
  parent_id           TEXT,
  rate_limit_per_user INTEGER NOT NULL DEFAULT 0,
  last_message_id     TEXT,
  owner_id            TEXT,
  icon                TEXT,
  created_at          TEXT NOT NULL,
  -- threads (type 11; parent_id = text/announcement/forum channel). Older DBs get these via migrate() in db/index.ts
  archived              INTEGER NOT NULL DEFAULT 0,
  archive_timestamp     TEXT,
  auto_archive_duration INTEGER NOT NULL DEFAULT 4320,
  message_count         INTEGER NOT NULL DEFAULT 0,
  last_message_at       TEXT,
  starter_message_id    TEXT,
  applied_tags          TEXT NOT NULL DEFAULT '[]', -- forum posts: tag ids
  available_tags        TEXT NOT NULL DEFAULT '[]'  -- forum channels: [{ id, name, emoji }]
);
CREATE INDEX IF NOT EXISTS idx_channels_guild ON channels(guild_id);

-- DM / group DM membership. closed = 1 hides the DM from the user's list until new activity.
CREATE TABLE IF NOT EXISTS channel_recipients (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  closed     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_channel_recipients_user ON channel_recipients(user_id);

CREATE TABLE IF NOT EXISTS permission_overwrites (
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL,
  type       INTEGER NOT NULL, -- 0 role, 1 member
  allow      TEXT NOT NULL DEFAULT '0',
  deny       TEXT NOT NULL DEFAULT '0',
  PRIMARY KEY (channel_id, target_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id               TEXT PRIMARY KEY,
  channel_id       TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  guild_id         TEXT,
  author_id        TEXT NOT NULL REFERENCES users(id),
  content          TEXT NOT NULL DEFAULT '',
  type             INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  edited_at        TEXT,
  pinned           INTEGER NOT NULL DEFAULT 0,
  pinned_at        TEXT,
  mention_everyone INTEGER NOT NULL DEFAULT 0,
  mentions         TEXT NOT NULL DEFAULT '[]',
  mention_roles    TEXT NOT NULL DEFAULT '[]',
  reference_id     TEXT,
  reference_channel_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);
CREATE INDEX IF NOT EXISTS idx_messages_guild ON messages(guild_id);

CREATE TABLE IF NOT EXISTS message_mentions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id           TEXT PRIMARY KEY,
  message_id   TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  size         INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  url          TEXT NOT NULL,
  path         TEXT NOT NULL,
  width        INTEGER,
  height       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, emoji, user_id)
);

-- A poll belongs to exactly one message. answers = JSON [{answer_id, text, emoji}].
CREATE TABLE IF NOT EXISTS polls (
  message_id        TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  question          TEXT NOT NULL,
  answers           TEXT NOT NULL,
  allow_multiselect INTEGER NOT NULL DEFAULT 0,
  expires_at        TEXT NOT NULL,
  ended             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_polls_open ON polls(ended, expires_at);

CREATE TABLE IF NOT EXISTS poll_votes (
  message_id TEXT NOT NULL REFERENCES polls(message_id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer_id  INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, answer_id)
);

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  guild_id   TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  inviter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  uses       INTEGER NOT NULL DEFAULT 0,
  max_uses   INTEGER NOT NULL DEFAULT 0,
  max_age    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invites_guild ON invites(guild_id);

CREATE TABLE IF NOT EXISTS bans (
  guild_id   TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  guild_id    TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  target_id   TEXT,
  action_type INTEGER NOT NULL,
  changes     TEXT NOT NULL DEFAULT '[]',
  reason      TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_guild ON audit_log(guild_id);

CREATE TABLE IF NOT EXISTS read_states (
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id           TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read_message_id TEXT,
  mention_count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS user_guild_settings (
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guild_id              TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  muted                 INTEGER NOT NULL DEFAULT 0,
  message_notifications INTEGER NOT NULL DEFAULT 0,
  suppress_everyone     INTEGER NOT NULL DEFAULT 0,
  channel_overrides     TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (user_id, guild_id)
);

-- Custom server emoji. Image lives at url (under /uploads/emojis/); animated = GIF.
CREATE TABLE IF NOT EXISTS emojis (
  id         TEXT PRIMARY KEY,
  guild_id   TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  animated   INTEGER NOT NULL DEFAULT 0,
  creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_emojis_guild ON emojis(guild_id);

-- Per-user settings document (server folders + rail order), JSON-encoded.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  guild_folders   TEXT NOT NULL DEFAULT '[]',
  guild_positions TEXT NOT NULL DEFAULT '[]'
);

-- Mentions the user has dismissed from their inbox.
CREATE INDEX IF NOT EXISTS idx_message_mentions_user ON message_mentions(user_id);
CREATE TABLE IF NOT EXISTS mention_dismissals (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  PRIMARY KEY (user_id, message_id)
);
