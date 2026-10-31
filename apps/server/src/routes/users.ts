import type { FastifyInstance } from 'fastify';
import { ChannelType, LIMITS, RelationshipType, type UserGuildSettings, type UserUpdateResponse } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { hashPassword, verifyPassword } from '../auth';
import { ErrorCode, badRequest, emailNotVerified, forbidden, invalidField, notFound } from '../errors';
import {
  consumeCodeBuckets, cooldownError, issueToken, needsVerification, notifyPasswordChanged, revokeSessions, sendVerificationCode,
  validEmail,
} from '../services/accounts';
import {
  channel as serializeChannel, getChannelRow, getUserRow, guild, guildSettings, privateChannelsOf, privateUser,
  publicUser, type ChannelRow, type GuildRow,
} from '../serializers';
import { getGuildRow } from '../services/permissions';
import { removeMember } from '../services/guilds';
import { IMAGE_EXT, removeUpload, saveUpload, sniffImage } from '../uploads';
import { body, optBool, optInt, optStr, readMultipart, uid } from './util';
import { validateNewPassword, validateUsername } from './auth';

export const AVATAR_BYTES = 8 * 1024 * 1024;

export function isBlocked(ctx: Ctx, a: string, b: string): boolean {
  return !!ctx.db.one(
    'SELECT 1 AS x FROM relationships WHERE ((user_id = ? AND other_id = ?) OR (user_id = ? AND other_id = ?)) AND type = ?',
    a, b, b, a, RelationshipType.BLOCKED,
  );
}

export default function userRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  const self = (id: string) => privateUser(getUserRow(db, id)!, ctx.cfg.requireEmailVerification);

  app.get('/users/@me', async (req) => self(uid(req)));

  // Cancel a pending email change.
  app.delete('/users/@me/pending-email', async (req) => {
    const me = uid(req);
    db.run('UPDATE users SET pending_email = NULL WHERE id = ?', me);
    ctx.codes.clear(me, 'verify_email');
    ctx.gw.broadcastUserUpdate(me);
    return self(me);
  });

  app.patch('/users/@me', async (req) => {
    const me = uid(req);
    const b = body(req);
    const u = getUserRow(db, me)!;
    // Until the email is verified the only change allowed is the email itself (a typo at sign-up).
    if (needsVerification(ctx, u) && Object.keys(b).some((k) => k !== 'email' && k !== 'password')) throw emailNotVerified();
    let newToken: string | undefined;
    let passwordChanged = false;
    let sendCodeTo: string | null = null;
    const sets: string[] = [];
    const vals: (string | null)[] = [];
    const set = (col: string, v: string | null) => { sets.push(`${col} = ?`); vals.push(v); };

    if (b.username !== undefined) {
      const err = validateUsername(b.username);
      if (err) throw invalidField('username', err);
      const name = String(b.username).trim();
      const taken = db.one<{ id: string }>('SELECT id FROM users WHERE username = ?', name);
      if (taken && taken.id !== me) throw invalidField('username', 'Username is taken');
      set('username', name);
    }
    const display = optStr(b, 'display_name', { max: 32, nullable: true });
    if (display !== undefined) set('display_name', display || null);
    const bio = optStr(b, 'bio', { max: LIMITS.BIO, nullable: true, trim: false });
    if (bio !== undefined) set('bio', bio || null);
    const banner = optStr(b, 'banner_color', { nullable: true });
    if (banner !== undefined) {
      if (banner && !/^#[0-9a-fA-F]{6}$/.test(banner)) throw invalidField('banner_color', 'banner_color must be #rrggbb');
      set('banner_color', banner || null);
    }
    const accent = optStr(b, 'accent_color', { nullable: true });
    if (accent !== undefined) {
      if (accent && !/^#[0-9a-fA-F]{6}$/.test(accent)) throw invalidField('accent_color', 'accent_color must be #rrggbb');
      set('accent_color', accent || null);
    }
    const pronouns = optStr(b, 'pronouns', { max: LIMITS.PRONOUNS, nullable: true });
    if (pronouns !== undefined) set('pronouns', pronouns || null);
    if (b.banner === null) {
      removeUpload(ctx.cfg.uploadsDir, u.banner);
      set('banner', null);
    }
    const custom = optStr(b, 'custom_status', { max: 128, nullable: true });
    if (custom !== undefined) set('custom_status', custom || null);
    if (b.status !== undefined) {
      if (!['online', 'idle', 'dnd', 'invisible'].includes(b.status)) throw invalidField('status', 'Invalid status');
      set('status', b.status);
    }
    if (b.avatar === null) {
      removeUpload(ctx.cfg.uploadsDir, u.avatar);
      set('avatar', null);
    }
    // Sensitive changes need the current password.
    if (b.email !== undefined || b.new_password !== undefined) {
      if (typeof b.password !== 'string' || !(await verifyPassword(b.password, u.password_hash))) {
        throw invalidField('password', 'Password does not match');
      }
      if (b.email !== undefined) {
        const email = String(b.email).trim();
        if (!validEmail(email)) throw invalidField('email', 'Enter a valid email address');
        const taken = db.one<{ id: string }>('SELECT id FROM users WHERE email = ?', email);
        if (taken && taken.id !== me) throw invalidField('email', 'Email is already registered');
        const same = email.toLowerCase() === u.email.toLowerCase();
        if (!ctx.cfg.requireEmailVerification) {
          set('email', email); // verification off: switch straight away (the original behaviour)
        } else if (same) {
          if (u.pending_email) set('pending_email', null); // back to the current address = cancel the change
          if (email !== u.email) set('email', email); // capitalisation only
        } else {
          // The new address must prove itself with a code before it replaces the current one.
          const wait = ctx.codes.cooldown(me, 'verify_email', email);
          if (wait > 0) throw cooldownError(wait);
          consumeCodeBuckets(ctx, email, req.ip, me);
          if (needsVerification(ctx, u)) set('email', email); // never verified: fix the sign-up address in place
          else set('pending_email', email);
          sendCodeTo = email;
        }
      }
      if (b.new_password !== undefined) {
        const pErr = validateNewPassword(b.new_password);
        if (pErr) throw invalidField('new_password', pErr);
        set('password_hash', await hashPassword(b.new_password));
        passwordChanged = true;
      }
    }
    if (sets.length) db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...vals, me);
    if (passwordChanged) {
      // Sign out every other session; this one carries on with a fresh token.
      revokeSessions(ctx, me);
      newToken = await issueToken(ctx, getUserRow(db, me)!);
      notifyPasswordChanged(ctx, getUserRow(db, me)!.email);
    }
    ctx.gw.broadcastUserUpdate(me);
    if (custom !== undefined || b.status !== undefined) ctx.gw.broadcastPresence(me);
    if (sendCodeTo) {
      await sendVerificationCode(ctx, {
        user: getUserRow(db, me)!, email: sendCodeTo, ip: req.ip, change: !needsVerification(ctx, u), skipBuckets: true,
      });
    }
    const out: UserUpdateResponse = self(me);
    if (newToken) out.token = newToken;
    return out;
  });

  app.post('/users/@me/avatar', async (req) => {
    const me = uid(req);
    const { files } = await readMultipart(req, { maxFiles: 1, maxFileBytes: AVATAR_BYTES });
    const f = files[0];
    if (!f) throw badRequest('No file uploaded');
    const kind = sniffImage(f.data);
    if (!kind) throw invalidField('file', 'Avatar must be a PNG, JPEG, GIF or WebP image');
    const old = getUserRow(db, me)!.avatar;
    const { url } = saveUpload(ctx.cfg.uploadsDir, `avatars/${me}-${ctx.id()}.${IMAGE_EXT[kind]}`, f.data);
    db.run('UPDATE users SET avatar = ? WHERE id = ?', url, me);
    removeUpload(ctx.cfg.uploadsDir, old);
    ctx.gw.broadcastUserUpdate(me);
    return self(me);
  });

  // Profile banner image (≤2 MB; validated by content, not the declared type).
  app.post('/users/@me/banner', async (req) => {
    const me = uid(req);
    const { files } = await readMultipart(req, { maxFiles: 1, maxFileBytes: LIMITS.USER_BANNER_BYTES });
    const f = files[0];
    if (!f) throw badRequest('No file uploaded');
    const kind = sniffImage(f.data);
    if (!kind) throw invalidField('file', 'Banner must be a PNG, JPEG, GIF or WebP image');
    const old = getUserRow(db, me)!.banner;
    const { url } = saveUpload(ctx.cfg.uploadsDir, `profile-banners/${me}-${ctx.id()}.${IMAGE_EXT[kind]}`, f.data);
    db.run('UPDATE users SET banner = ? WHERE id = ?', url, me);
    removeUpload(ctx.cfg.uploadsDir, old);
    ctx.gw.broadcastUserUpdate(me);
    return self(me);
  });

  app.get('/users/:id', async (req) => {
    const me = uid(req);
    const { id } = req.params as { id: string };
    const target = id === '@me' ? me : id;
    const u = getUserRow(db, target);
    if (!u) throw notFound('User', ErrorCode.UNKNOWN_USER);
    const mutual = db.all<{ guild_id: string }>(
      'SELECT a.guild_id FROM members a JOIN members b ON a.guild_id = b.guild_id WHERE a.user_id = ? AND b.user_id = ?',
      me, target,
    ).map((r) => r.guild_id);
    const mutualFriends = db.all<{ id: string }>(
      `SELECT a.other_id AS id FROM relationships a JOIN relationships b ON a.other_id = b.other_id
        WHERE a.user_id = ? AND b.user_id = ? AND a.type = 1 AND b.type = 1`,
      me, target,
    ).map((r) => r.id);
    return { ...publicUser(u), mutual_guild_ids: mutual, mutual_friend_ids: mutualFriends };
  });

  app.get('/users/@me/guilds', async (req) => {
    const me = uid(req);
    return db.all<GuildRow>(
      'SELECT g.* FROM guilds g JOIN members m ON m.guild_id = g.id WHERE m.user_id = ? ORDER BY m.joined_at', me,
    ).map(guild);
  });

  app.delete('/users/@me/guilds/:id', async (req, reply) => {
    const me = uid(req);
    const { id } = req.params as { id: string };
    const g = getGuildRow(db, id);
    if (!g || !db.one('SELECT 1 AS x FROM members WHERE guild_id = ? AND user_id = ?', id, me)) {
      throw notFound('Guild', ErrorCode.UNKNOWN_GUILD);
    }
    if (g.owner_id === me) throw badRequest('The owner cannot leave the server; transfer or delete it instead');
    removeMember(ctx, g, me);
    return reply.status(204).send();
  });

  // ---------- private channels ----------

  app.get('/users/@me/channels', async (req) => privateChannelsOf(db, uid(req)));

  app.post('/users/@me/channels', async (req) => {
    const me = uid(req);
    const b = body(req);
    let ids: unknown = b.recipient_ids ?? (b.recipient_id ? [b.recipient_id] : undefined);
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) {
      throw invalidField('recipient_ids', 'recipient_ids must be an array of user ids');
    }
    const others = [...new Set(ids as string[])].filter((x) => x !== me);
    if (others.length === 0) throw invalidField('recipient_ids', 'At least one other recipient is required');
    if (others.length + 1 > LIMITS.GROUP_DM_RECIPIENTS) {
      throw invalidField('recipient_ids', `Group DMs are limited to ${LIMITS.GROUP_DM_RECIPIENTS} members`);
    }
    for (const o of others) {
      if (!getUserRow(db, o)) throw notFound('User', ErrorCode.UNKNOWN_USER);
      if (isBlocked(ctx, me, o)) throw forbidden('Cannot send messages to this user', ErrorCode.CANNOT_DM);
    }

    if (others.length === 1) {
      const other = others[0];
      const existing = db.one<ChannelRow>(
        `SELECT c.* FROM channels c
           JOIN channel_recipients a ON a.channel_id = c.id AND a.user_id = ?
           JOIN channel_recipients b ON b.channel_id = c.id AND b.user_id = ?
          WHERE c.type = ?`,
        me, other, ChannelType.DM,
      );
      if (existing) {
        const r = db.run('UPDATE channel_recipients SET closed = 0 WHERE channel_id = ? AND user_id = ? AND closed = 1', existing.id, me);
        const out = serializeChannel(db, existing, me);
        if (r.changes) ctx.gw.dispatchToUser(me, 'CHANNEL_CREATE', out);
        return out;
      }
      const id = ctx.id();
      db.tx(() => {
        db.run('INSERT INTO channels (id, type, created_at) VALUES (?, ?, ?)', id, ChannelType.DM, now());
        db.run('INSERT INTO channel_recipients (channel_id, user_id, closed) VALUES (?, ?, 0)', id, me);
        // The other side sees the DM once the first message arrives (createMessage reopens it).
        db.run('INSERT INTO channel_recipients (channel_id, user_id, closed) VALUES (?, ?, 1)', id, other);
      });
      const c = getChannelRow(db, id)!;
      const out = serializeChannel(db, c, me);
      ctx.gw.dispatchToUser(me, 'CHANNEL_CREATE', out);
      return out;
    }

    const id = ctx.id();
    const name = optStr(b, 'name', { max: 100, nullable: true }) ?? null;
    db.tx(() => {
      db.run('INSERT INTO channels (id, type, name, owner_id, created_at) VALUES (?, ?, ?, ?, ?)', id, ChannelType.GROUP_DM, name, me, now());
      for (const u of [me, ...others]) db.run('INSERT INTO channel_recipients (channel_id, user_id) VALUES (?, ?)', id, u);
    });
    const c = getChannelRow(db, id)!;
    ctx.gw.dispatchToUsers([me, ...others], 'CHANNEL_CREATE', (u) => serializeChannel(db, c, u));
    return serializeChannel(db, c, me);
  });

  // ---------- guild settings ----------

  app.get('/users/@me/guild-settings', async (req) => {
    const me = uid(req);
    return db.all<{ guild_id: string }>('SELECT guild_id FROM members WHERE user_id = ?', me)
      .map((r) => guildSettings(db, me, r.guild_id));
  });

  app.patch('/users/@me/guilds/:guildId/settings', async (req) => {
    const me = uid(req);
    const { guildId } = req.params as { guildId: string };
    if (!db.one('SELECT 1 AS x FROM members WHERE guild_id = ? AND user_id = ?', guildId, me)) {
      throw notFound('Guild', ErrorCode.UNKNOWN_GUILD);
    }
    const b = body(req);
    const cur = guildSettings(db, me, guildId);
    const next: UserGuildSettings = { ...cur };
    const muted = optBool(b, 'muted');
    if (muted !== undefined) next.muted = muted;
    const level = optInt(b, 'message_notifications', 0, 2);
    if (level !== undefined) next.message_notifications = level;
    const se = optBool(b, 'suppress_everyone');
    if (se !== undefined) next.suppress_everyone = se;
    const hide = optBool(b, 'hide_muted_channels');
    if (hide !== undefined) next.hide_muted_channels = hide;
    if (b.channel_overrides !== undefined) {
      if (!Array.isArray(b.channel_overrides)) throw invalidField('channel_overrides', 'channel_overrides must be an array');
      const map = new Map(cur.channel_overrides.map((o) => [o.channel_id, o.muted]));
      for (const o of b.channel_overrides) {
        if (!o || typeof o.channel_id !== 'string') throw invalidField('channel_overrides', 'Invalid channel override');
        const c = getChannelRow(db, o.channel_id);
        if (!c || c.guild_id !== guildId) throw invalidField('channel_overrides', 'Unknown channel in overrides');
        map.set(o.channel_id, !!o.muted);
      }
      next.channel_overrides = [...map].filter(([, m]) => m).map(([channel_id, m]) => ({ channel_id, muted: m }));
    }
    db.run(
      `INSERT INTO user_guild_settings (user_id, guild_id, muted, message_notifications, suppress_everyone, channel_overrides, hide_muted_channels)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, guild_id) DO UPDATE SET muted = excluded.muted,
         message_notifications = excluded.message_notifications, suppress_everyone = excluded.suppress_everyone,
         channel_overrides = excluded.channel_overrides, hide_muted_channels = excluded.hide_muted_channels`,
      me, guildId, next.muted ? 1 : 0, next.message_notifications, next.suppress_everyone ? 1 : 0,
      JSON.stringify(next.channel_overrides), next.hide_muted_channels ? 1 : 0,
    );
    ctx.gw.dispatchToUser(me, 'USER_GUILD_SETTINGS_UPDATE', next);
    return next;
  });

}
