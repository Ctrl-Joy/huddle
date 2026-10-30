// Loads permission context from the DB and delegates to the shared algorithm.
import {
  ChannelType, Permissions, applyChannelTypeRules, computeBasePermissions, computePermissions, has, highestRolePosition,
  threadPermissions,
  type PermOverwrite, type PermissionContext,
} from '@huddle/shared';
import type { Db } from '../db';
import { forbidden, notFound, ErrorCode } from '../errors';
import {
  getChannelRow, isPrivate, isThread, rolesOf, type ChannelRow, type GuildRow, type MemberRow,
} from '../serializers';

/** What a DM / group DM recipient may do. */
export const DM_PERMISSIONS =
  Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES | Permissions.READ_MESSAGE_HISTORY | Permissions.ATTACH_FILES |
  Permissions.ADD_REACTIONS | Permissions.EMBED_LINKS | Permissions.CONNECT | Permissions.SPEAK | Permissions.VIDEO |
  Permissions.STREAM;

const VOICE_ONLY = Permissions.SPEAK | Permissions.VIDEO | Permissions.STREAM | Permissions.PRIORITY_SPEAKER;

export function getGuildRow(db: Db, id: string): GuildRow | undefined {
  return db.one<GuildRow>('SELECT * FROM guilds WHERE id = ?', id);
}

export function permContext(db: Db, g: GuildRow, userId: string): PermissionContext | null {
  const m = db.one<MemberRow>('SELECT * FROM members WHERE guild_id = ? AND user_id = ?', g.id, userId);
  if (!m) return null;
  const roles = rolesOf(db, g.id);
  const memberRoleIds = db.all<{ role_id: string }>(
    'SELECT role_id FROM member_roles WHERE guild_id = ? AND user_id = ?', g.id, userId,
  ).map((r) => r.role_id);
  return {
    guildId: g.id,
    ownerId: g.owner_id,
    userId,
    roles: roles.map((r) => ({ id: r.id, permissions: String(r.permissions), position: r.position })),
    memberRoleIds,
    communicationDisabledUntil: m.communication_disabled_until,
  };
}

function overwritesFor(db: Db, channelId: string): PermOverwrite[] {
  return db.all<{ target_id: string; type: number; allow: string; deny: string }>(
    'SELECT target_id, type, allow, deny FROM permission_overwrites WHERE channel_id = ?', channelId,
  ).map((o) => ({ id: o.target_id, type: o.type === 1 ? 1 : 0, allow: String(o.allow), deny: String(o.deny) }));
}

function finishChannelPerms(c: ChannelRow, perms: bigint): bigint {
  if (c.type === ChannelType.GUILD_VOICE && !has(perms, Permissions.CONNECT)) perms &= ~VOICE_ONLY;
  return applyChannelTypeRules(c.type, perms);
}

/** Guild-level permissions, or null if not a member. */
export function guildPerms(db: Db, g: GuildRow, userId: string): bigint | null {
  const ctx = permContext(db, g, userId);
  return ctx ? computeBasePermissions(ctx) : null;
}

/** Channel permissions for a user (0n if no access at all). */
export function channelPerms(db: Db, c: ChannelRow, userId: string): bigint {
  if (isPrivate(c)) {
    const r = db.one('SELECT 1 AS x FROM channel_recipients WHERE channel_id = ? AND user_id = ?', c.id, userId);
    return r ? DM_PERMISSIONS : 0n;
  }
  if (!c.guild_id) return 0n;
  if (isThread(c)) {
    const parent = c.parent_id ? getChannelRow(db, c.parent_id) : undefined;
    return parent && !isThread(parent) ? threadPermissions(channelPerms(db, parent, userId)) : 0n;
  }
  const g = getGuildRow(db, c.guild_id);
  if (!g) return 0n;
  const ctx = permContext(db, g, userId);
  if (!ctx) return 0n;
  return finishChannelPerms(c, computePermissions(ctx, overwritesFor(db, c.id)));
}

/** Permissions for every member of a guild channel at once (used for fan-out). */
export function channelPermsBulk(db: Db, c: ChannelRow, onlyUsers?: Set<string>): Map<string, bigint> {
  const out = new Map<string, bigint>();
  if (!c.guild_id) return out;
  if (isThread(c)) {
    const parent = c.parent_id ? getChannelRow(db, c.parent_id) : undefined;
    if (!parent || isThread(parent)) return out;
    for (const [u, p] of channelPermsBulk(db, parent, onlyUsers)) out.set(u, threadPermissions(p));
    return out;
  }
  const g = getGuildRow(db, c.guild_id);
  if (!g) return out;
  const roles = rolesOf(db, g.id).map((r) => ({ id: r.id, permissions: String(r.permissions) }));
  const ows = overwritesFor(db, c.id);
  const members = db.all<{ user_id: string; communication_disabled_until: string | null; role_ids: string | null }>(
    `SELECT m.user_id, m.communication_disabled_until,
            (SELECT GROUP_CONCAT(role_id) FROM member_roles mr WHERE mr.guild_id = m.guild_id AND mr.user_id = m.user_id) AS role_ids
       FROM members m WHERE m.guild_id = ?`,
    g.id,
  );
  for (const m of members) {
    if (onlyUsers && !onlyUsers.has(m.user_id)) continue;
    const ctx: PermissionContext = {
      guildId: g.id, ownerId: g.owner_id, userId: m.user_id, roles,
      memberRoleIds: m.role_ids ? m.role_ids.split(',') : [],
      communicationDisabledUntil: m.communication_disabled_until,
    };
    out.set(m.user_id, finishChannelPerms(c, computePermissions(ctx, ows)));
  }
  return out;
}

/** Highest role position; owner = Infinity; non-member = -1. */
export function topPosition(db: Db, g: GuildRow, userId: string): number {
  if (g.owner_id === userId) return Infinity;
  const ctx = permContext(db, g, userId);
  if (!ctx) return -1;
  return highestRolePosition(rolesOf(db, g.id), ctx.memberRoleIds);
}

/** True when actor may moderate target (kick/ban/timeout/nick): target isn't owner and sits strictly below actor. */
export function canActOn(db: Db, g: GuildRow, actorId: string, targetId: string): boolean {
  if (targetId === g.owner_id) return false;
  if (actorId === g.owner_id) return true;
  return topPosition(db, g, actorId) > topPosition(db, g, targetId);
}

// ---------- guards (throw ApiErr) ----------

export function requireGuild(db: Db, guildId: string, userId: string): { g: GuildRow; perms: bigint } {
  const g = getGuildRow(db, guildId);
  if (!g) throw notFound('Guild', ErrorCode.UNKNOWN_GUILD);
  const perms = guildPerms(db, g, userId);
  if (perms === null) throw notFound('Guild', ErrorCode.UNKNOWN_GUILD);
  return { g, perms };
}

export function requireGuildPerm(db: Db, guildId: string, userId: string, flag: bigint): { g: GuildRow; perms: bigint } {
  const r = requireGuild(db, guildId, userId);
  if (!has(r.perms, flag)) throw forbidden();
  return r;
}

/** Loads a channel the user can see. Throws 404 if it doesn't exist or isn't visible. */
export function requireChannel(db: Db, channelId: string, userId: string): { c: ChannelRow; perms: bigint } {
  const c = getChannelRow(db, channelId);
  if (!c) throw notFound('Channel', ErrorCode.UNKNOWN_CHANNEL);
  const perms = channelPerms(db, c, userId);
  if (!has(perms, Permissions.VIEW_CHANNEL)) {
    // Members of the guild get 403 (they know the channel exists), strangers 404.
    if (c.guild_id && db.one('SELECT 1 AS x FROM members WHERE guild_id = ? AND user_id = ?', c.guild_id, userId)) {
      throw forbidden('Missing Access', ErrorCode.MISSING_ACCESS);
    }
    throw notFound('Channel', ErrorCode.UNKNOWN_CHANNEL);
  }
  return { c, perms };
}

export function requirePerm(perms: bigint, ...flags: bigint[]): void {
  for (const f of flags) if (!has(perms, f)) throw forbidden();
}

/** Bits the actor may grant/deny: everything if owner or admin, else their own guild perms. */
export function grantable(db: Db, g: GuildRow, userId: string): bigint {
  const p = guildPerms(db, g, userId) ?? 0n;
  return p;
}
