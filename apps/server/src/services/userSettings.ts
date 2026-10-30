// Per-user settings document: server folders + rail order. Stored as JSON, always read back filtered to the
// guilds the user is currently in (leaving a server silently drops it from folders and positions).
import { LIMITS, type GuildFolder, type UserSettings } from '@huddle/shared';
import type { Db } from '../db';
import { invalidField } from '../errors';

const FOLDER_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}

function memberGuildIds(db: Db, userId: string): Set<string> {
  return new Set(db.all<{ guild_id: string }>('SELECT guild_id FROM members WHERE user_id = ?', userId).map((r) => r.guild_id));
}

/** Drops guilds the user isn't in, empty folders, and duplicate ids. */
function prune(s: UserSettings, inGuild: Set<string>): UserSettings {
  const seen = new Set<string>();
  const folders: GuildFolder[] = [];
  for (const f of s.guild_folders) {
    const ids = f.guild_ids.filter((id) => inGuild.has(id) && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    if (ids.length) folders.push({ ...f, guild_ids: ids });
  }
  const positions = [...new Set(s.guild_positions)].filter((id) => inGuild.has(id));
  return { guild_folders: folders, guild_positions: positions };
}

export function userSettingsOf(db: Db, userId: string): UserSettings {
  const row = db.one<{ guild_folders: string; guild_positions: string }>('SELECT * FROM user_settings WHERE user_id = ?', userId);
  const raw: UserSettings = {
    guild_folders: parseJson<GuildFolder[]>(row?.guild_folders, []),
    guild_positions: parseJson<string[]>(row?.guild_positions, []),
  };
  return prune(raw, memberGuildIds(db, userId));
}

/** Validates a PATCH body against the current document; throws 400 on malformed input. */
export function validateUserSettings(db: Db, userId: string, b: Record<string, any>): UserSettings {
  const cur = userSettingsOf(db, userId);
  const next: UserSettings = { ...cur };
  const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string' && /^\d{1,20}$/.test(x));

  if (b.guild_folders !== undefined) {
    const list = b.guild_folders;
    if (!Array.isArray(list)) throw invalidField('guild_folders', 'guild_folders must be an array');
    if (list.length > LIMITS.GUILD_FOLDERS) throw invalidField('guild_folders', `At most ${LIMITS.GUILD_FOLDERS} folders`);
    const folderIds = new Set<string>();
    const guildIds = new Set<string>();
    next.guild_folders = list.map((f: any) => {
      if (!f || typeof f !== 'object') throw invalidField('guild_folders', 'Invalid folder');
      if (typeof f.id !== 'string' || !FOLDER_ID_RE.test(f.id)) throw invalidField('guild_folders', 'Folder id must be 1-32 letters, digits, _ or -');
      if (folderIds.has(f.id)) throw invalidField('guild_folders', 'Duplicate folder id');
      folderIds.add(f.id);
      if (f.name != null && (typeof f.name !== 'string' || f.name.trim().length > LIMITS.FOLDER_NAME)) {
        throw invalidField('guild_folders', `Folder name must be at most ${LIMITS.FOLDER_NAME} characters`);
      }
      if (f.color != null && (typeof f.color !== 'string' || !COLOR_RE.test(f.color))) {
        throw invalidField('guild_folders', 'Folder color must be #rrggbb');
      }
      if (!isIdList(f.guild_ids)) throw invalidField('guild_folders', 'guild_ids must be an array of guild ids');
      for (const id of f.guild_ids) {
        if (guildIds.has(id)) throw invalidField('guild_folders', 'A server can only be in one folder');
        guildIds.add(id);
      }
      return { id: f.id, name: f.name?.trim() || null, color: f.color ?? null, guild_ids: [...f.guild_ids] };
    });
  }
  if (b.guild_positions !== undefined) {
    if (!isIdList(b.guild_positions)) throw invalidField('guild_positions', 'guild_positions must be an array of guild ids');
    if (b.guild_positions.length > 1000) throw invalidField('guild_positions', 'Too many guild positions');
    next.guild_positions = b.guild_positions;
  }
  return prune(next, memberGuildIds(db, userId));
}

export function saveUserSettings(db: Db, userId: string, s: UserSettings): void {
  db.run(
    `INSERT INTO user_settings (user_id, guild_folders, guild_positions) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET guild_folders = excluded.guild_folders, guild_positions = excluded.guild_positions`,
    userId, JSON.stringify(s.guild_folders), JSON.stringify(s.guild_positions),
  );
}
