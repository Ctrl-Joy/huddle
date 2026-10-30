import type { FastifyInstance } from 'fastify';
import { AuditLogAction, ChannelType, LIMITS, MessageType, Permissions, has } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { ErrorCode, badRequest, forbidden, invalidField, notFound, tooMany, ApiErr } from '../errors';
import {
  getMessageRow, getUserRow, isPrivate, message as serializeMessage, publicUser, readState, recipientIds,
  serializeMessages, type ChannelRow, type MessageRow,
} from '../serializers';
import { requireChannel, requirePerm } from '../services/permissions';
import { createMessage, dispatchMessageUpdate, resolveMentions, type NewAttachment } from '../services/messages';
import { writeAudit } from '../services/audit';
import { guessContentType, imageSize, removeUpload, safeName, saveUpload } from '../uploads';
import { auditReason, body, isMultipart, isSnowflake, queryInt, queryStr, readMultipart, uid, type UploadedFile } from './util';
import { isBlocked } from './users';

const MAX_PINS = 50;

export default function messageRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  const loadMessage = (c: ChannelRow, mid: string): MessageRow => {
    const m = getMessageRow(db, c.id, mid);
    if (!m) throw notFound('Message', ErrorCode.UNKNOWN_MESSAGE);
    return m;
  };

  const assertNotBlockedDm = (c: ChannelRow, me: string) => {
    if (c.type !== ChannelType.DM) return;
    const other = recipientIds(db, c.id).find((u) => u !== me);
    if (other && isBlocked(ctx, me, other)) throw forbidden('Cannot send messages to this user', ErrorCode.CANNOT_DM);
  };

  // ---------- history ----------

  app.get('/channels/:id/messages', async (req) => {
    const me = uid(req);
    const { c, perms } = requireChannel(db, (req.params as { id: string }).id, me);
    requirePerm(perms, Permissions.READ_MESSAGE_HISTORY);
    const q = req.query;
    const limit = queryInt(q, 'limit', LIMITS.MESSAGES_PAGE, 1, 100);
    const before = queryStr(q, 'before'), after = queryStr(q, 'after'), around = queryStr(q, 'around');
    for (const [k, v] of [['before', before], ['after', after], ['around', around]] as const) {
      if (v !== undefined && !isSnowflake(v)) throw invalidField(k, `${k} must be a snowflake`);
    }
    const DESC = 'SELECT * FROM messages WHERE channel_id = ? AND CAST(id AS INTEGER) < CAST(? AS INTEGER) ORDER BY CAST(id AS INTEGER) DESC LIMIT ?';
    const ASC = 'SELECT * FROM messages WHERE channel_id = ? AND CAST(id AS INTEGER) > CAST(? AS INTEGER) ORDER BY CAST(id AS INTEGER) ASC LIMIT ?';
    let rows: MessageRow[];
    if (around) {
      const newer = db.all<MessageRow>(ASC, c.id, around, Math.floor(limit / 2)).reverse();
      const older = db.all<MessageRow>(
        'SELECT * FROM messages WHERE channel_id = ? AND CAST(id AS INTEGER) <= CAST(? AS INTEGER) ORDER BY CAST(id AS INTEGER) DESC LIMIT ?',
        c.id, around, limit - newer.length,
      );
      rows = [...newer, ...older];
    } else if (after) {
      rows = db.all<MessageRow>(ASC, c.id, after, limit).reverse();
    } else {
      rows = db.all<MessageRow>(DESC, c.id, before ?? '9223372036854775807', limit);
    }
    return serializeMessages(db, rows, me); // newest first
  });

  app.get('/channels/:id/messages/:mid', async (req) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c, perms } = requireChannel(db, id, me);
    requirePerm(perms, Permissions.READ_MESSAGE_HISTORY);
    return serializeMessage(db, loadMessage(c, mid), me);
  });

  // ---------- create ----------

  app.post('/channels/:id/messages', async (req) => {
    const me = uid(req);
    const { c, perms } = requireChannel(db, (req.params as { id: string }).id, me);
    if (c.type === ChannelType.GUILD_CATEGORY || c.type === ChannelType.GUILD_VOICE) {
      throw badRequest('Cannot send messages in this channel');
    }
    requirePerm(perms, Permissions.SEND_MESSAGES);
    assertNotBlockedDm(c, me);

    let payload: Record<string, any>;
    let files: UploadedFile[] = [];
    if (isMultipart(req)) {
      const mp = await readMultipart(req, { maxFiles: LIMITS.ATTACHMENTS_PER_MESSAGE, maxFileBytes: LIMITS.ATTACHMENT_BYTES });
      files = mp.files;
      try {
        payload = mp.fields.payload_json ? JSON.parse(mp.fields.payload_json) : {};
      } catch {
        throw invalidField('payload_json', 'payload_json must be valid JSON');
      }
      if (payload === null || typeof payload !== 'object') payload = {};
      if (payload.content === undefined && typeof mp.fields.content === 'string') payload.content = mp.fields.content;
      if (payload.nonce === undefined && typeof mp.fields.nonce === 'string') payload.nonce = mp.fields.nonce;
    } else {
      payload = body(req);
    }

    const content = payload.content === undefined || payload.content === null ? '' : payload.content;
    if (typeof content !== 'string') throw invalidField('content', 'content must be a string');
    if (content.length > LIMITS.MESSAGE_LENGTH) {
      throw invalidField('content', `Message must be ${LIMITS.MESSAGE_LENGTH} characters or fewer`);
    }
    if (!content.trim() && files.length === 0) throw invalidField('content', 'Cannot send an empty message');
    if (files.length) requirePerm(perms, Permissions.ATTACH_FILES);

    let nonce: string | null = null;
    if (payload.nonce !== undefined && payload.nonce !== null) {
      if ((typeof payload.nonce !== 'string' && typeof payload.nonce !== 'number') || String(payload.nonce).length > 64) {
        throw invalidField('nonce', 'nonce must be a string of at most 64 characters');
      }
      nonce = String(payload.nonce);
    }

    const replyTo: unknown = payload.reply_to_id ?? payload.message_reference?.message_id;
    let referenceId: string | null = null;
    if (replyTo !== undefined && replyTo !== null) {
      requirePerm(perms, Permissions.READ_MESSAGE_HISTORY);
      if (typeof replyTo !== 'string' || !getMessageRow(db, c.id, replyTo)) {
        throw invalidField('reply_to_id', 'Unknown message to reply to');
      }
      referenceId = replyTo;
    }

    // Slow-mode
    if (!isPrivate(c) && c.rate_limit_per_user > 0 &&
        !has(perms, Permissions.MANAGE_MESSAGES) && !has(perms, Permissions.MANAGE_CHANNELS)) {
      const key = `${c.id}:${me}`;
      const last = ctx.slowmode.get(key) ?? 0;
      const wait = c.rate_limit_per_user * 1000 - (Date.now() - last);
      if (wait > 0) throw tooMany(wait / 1000, 'Slowmode is enabled; please wait before sending again.', ErrorCode.SLOWMODE);
      ctx.slowmode.set(key, Date.now());
    }

    const attachments: NewAttachment[] = files.map((f) => {
      const id = ctx.id();
      const filename = safeName(f.filename);
      const rel = `attachments/${c.id}/${id}-${filename}`;
      const { url } = saveUpload(ctx.cfg.uploadsDir, rel, f.data);
      const contentType = guessContentType(filename, f.mimetype);
      const dims = contentType.startsWith('image/') ? imageSize(f.data) : null;
      return {
        id, filename, size: f.data.length, content_type: contentType, url, path: rel,
        width: dims?.width ?? null, height: dims?.height ?? null,
      };
    });

    return createMessage(ctx, {
      channel: c,
      authorId: me,
      content,
      type: referenceId ? MessageType.REPLY : MessageType.DEFAULT,
      referenceId,
      attachments,
      nonce,
    });
  });

  // ---------- edit / delete ----------

  app.patch('/channels/:id/messages/:mid', async (req) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c } = requireChannel(db, id, me);
    const m = loadMessage(c, mid);
    if (m.author_id !== me) throw forbidden('You can only edit your own messages');
    if (m.type !== MessageType.DEFAULT && m.type !== MessageType.REPLY) throw badRequest('System messages cannot be edited');
    const b = body(req);
    if (typeof b.content !== 'string') throw invalidField('content', 'content is required');
    if (b.content.length > LIMITS.MESSAGE_LENGTH) {
      throw invalidField('content', `Message must be ${LIMITS.MESSAGE_LENGTH} characters or fewer`);
    }
    const hasAtt = !!db.one('SELECT 1 AS x FROM attachments WHERE message_id = ?', m.id);
    if (!b.content.trim() && !hasAtt) throw invalidField('content', 'Cannot make a message empty');
    const replyAuthor = m.reference_id ? getMessageRow(db, c.id, m.reference_id)?.author_id ?? null : null;
    const mentions = resolveMentions(ctx, c, me, b.content, replyAuthor);
    db.tx(() => {
      db.run(
        'UPDATE messages SET content = ?, edited_at = ?, mentions = ?, mention_roles = ?, mention_everyone = ? WHERE id = ?',
        b.content, now(), JSON.stringify(mentions.users), JSON.stringify(mentions.roles), mentions.everyone ? 1 : 0, m.id,
      );
      db.run('DELETE FROM message_mentions WHERE message_id = ?', m.id);
      for (const u of mentions.users) db.run('INSERT OR IGNORE INTO message_mentions (message_id, user_id) VALUES (?, ?)', m.id, u);
    });
    const row = getMessageRow(db, c.id, m.id)!;
    dispatchMessageUpdate(ctx, c, row);
    return serializeMessage(db, row, me);
  });

  app.delete('/channels/:id/messages/:mid', async (req, reply) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c, perms } = requireChannel(db, id, me);
    const m = loadMessage(c, mid);
    const own = m.author_id === me;
    if (!own && (isPrivate(c) || !has(perms, Permissions.MANAGE_MESSAGES))) throw forbidden();
    const atts = db.all<{ url: string }>('SELECT url FROM attachments WHERE message_id = ?', m.id);
    db.run('DELETE FROM messages WHERE id = ?', m.id);
    for (const a of atts) removeUpload(ctx.cfg.uploadsDir, a.url);
    if (!own && c.guild_id) {
      writeAudit(ctx, c.guild_id, me, AuditLogAction.MESSAGE_DELETE, m.author_id, [
        { key: 'channel_id', new_value: c.id }, { key: 'message_id', new_value: m.id },
      ], auditReason(req));
    }
    gw.dispatchToChannel(c, 'MESSAGE_DELETE', { id: m.id, channel_id: c.id, guild_id: c.guild_id });
    if (m.pinned) gw.dispatchToChannel(c, 'CHANNEL_PINS_UPDATE', { channel_id: c.id, guild_id: c.guild_id });
    return reply.status(204).send();
  });

  // ---------- reactions ----------

  const parseEmoji = (raw: string): string => {
    let e = raw;
    try { e = decodeURIComponent(raw); } catch { /* already decoded */ }
    if (!e || e.length > 64 || /\s/.test(e)) throw invalidField('emoji', 'Invalid emoji');
    return e;
  };

  app.put('/channels/:id/messages/:mid/reactions/:emoji/@me', async (req, reply) => {
    const me = uid(req);
    const p = req.params as { id: string; mid: string; emoji: string };
    const { c, perms } = requireChannel(db, p.id, me);
    requirePerm(perms, Permissions.READ_MESSAGE_HISTORY);
    const m = loadMessage(c, p.mid);
    const emoji = parseEmoji(p.emoji);
    const exists = db.one('SELECT 1 AS x FROM reactions WHERE message_id = ? AND emoji = ?', m.id, emoji);
    if (!exists) {
      requirePerm(perms, Permissions.ADD_REACTIONS);
      const distinct = db.one<{ n: number }>('SELECT COUNT(DISTINCT emoji) AS n FROM reactions WHERE message_id = ?', m.id)!.n;
      if (distinct >= 20) throw badRequest('Maximum number of reactions reached (20)');
    }
    const r = db.run('INSERT OR IGNORE INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)', m.id, me, emoji, now());
    if (r.changes) {
      gw.dispatchToChannel(c, 'MESSAGE_REACTION_ADD', { user_id: me, channel_id: c.id, message_id: m.id, guild_id: c.guild_id, emoji });
    }
    return reply.status(204).send();
  });

  const removeReaction = (c: ChannelRow, m: MessageRow, userId: string, emoji: string) => {
    const r = db.run('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?', m.id, userId, emoji);
    if (r.changes) {
      gw.dispatchToChannel(c, 'MESSAGE_REACTION_REMOVE', { user_id: userId, channel_id: c.id, message_id: m.id, guild_id: c.guild_id, emoji });
    }
  };

  app.delete('/channels/:id/messages/:mid/reactions/:emoji/@me', async (req, reply) => {
    const me = uid(req);
    const p = req.params as { id: string; mid: string; emoji: string };
    const { c } = requireChannel(db, p.id, me);
    removeReaction(c, loadMessage(c, p.mid), me, parseEmoji(p.emoji));
    return reply.status(204).send();
  });

  app.delete('/channels/:id/messages/:mid/reactions/:emoji/:userId', async (req, reply) => {
    const me = uid(req);
    const p = req.params as { id: string; mid: string; emoji: string; userId: string };
    const { c, perms } = requireChannel(db, p.id, me);
    if (p.userId !== me && (isPrivate(c) || !has(perms, Permissions.MANAGE_MESSAGES))) throw forbidden();
    removeReaction(c, loadMessage(c, p.mid), p.userId, parseEmoji(p.emoji));
    return reply.status(204).send();
  });

  app.get('/channels/:id/messages/:mid/reactions/:emoji', async (req) => {
    const me = uid(req);
    const p = req.params as { id: string; mid: string; emoji: string };
    const { c, perms } = requireChannel(db, p.id, me);
    requirePerm(perms, Permissions.READ_MESSAGE_HISTORY);
    const m = loadMessage(c, p.mid);
    const ids = db.all<{ user_id: string }>(
      'SELECT user_id FROM reactions WHERE message_id = ? AND emoji = ? ORDER BY created_at LIMIT 100', m.id, parseEmoji(p.emoji),
    ).map((r) => r.user_id);
    return ids.flatMap((id) => {
      const u = getUserRow(db, id);
      return u ? [publicUser(u)] : [];
    });
  });

  // ---------- pins ----------

  app.get('/channels/:id/pins', async (req) => {
    const me = uid(req);
    const { c, perms } = requireChannel(db, (req.params as { id: string }).id, me);
    requirePerm(perms, Permissions.READ_MESSAGE_HISTORY);
    const rows = db.all<MessageRow>('SELECT * FROM messages WHERE channel_id = ? AND pinned = 1 ORDER BY pinned_at DESC', c.id);
    return serializeMessages(db, rows, me);
  });

  const canPin = (c: ChannelRow, perms: bigint) => isPrivate(c) || has(perms, Permissions.MANAGE_MESSAGES);

  app.put('/channels/:id/pins/:mid', async (req, reply) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c, perms } = requireChannel(db, id, me);
    if (!canPin(c, perms)) throw forbidden();
    const m = loadMessage(c, mid);
    if (m.pinned) return reply.status(204).send();
    const count = db.one<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE channel_id = ? AND pinned = 1', c.id)!.n;
    if (count >= MAX_PINS) throw new ApiErr(400, `Maximum number of pins reached (${MAX_PINS})`, ErrorCode.MAX_PINS);
    db.run('UPDATE messages SET pinned = 1, pinned_at = ? WHERE id = ?', now(), m.id);
    const row = getMessageRow(db, c.id, m.id)!;
    dispatchMessageUpdate(ctx, c, row);
    gw.dispatchToChannel(c, 'CHANNEL_PINS_UPDATE', { channel_id: c.id, guild_id: c.guild_id });
    createMessage(ctx, { channel: c, authorId: me, content: '', type: MessageType.CHANNEL_PINNED_MESSAGE, referenceId: m.id });
    if (c.guild_id) {
      writeAudit(ctx, c.guild_id, me, AuditLogAction.MESSAGE_PIN, m.author_id, [
        { key: 'channel_id', new_value: c.id }, { key: 'message_id', new_value: m.id },
      ], auditReason(req));
    }
    return reply.status(204).send();
  });

  app.delete('/channels/:id/pins/:mid', async (req, reply) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c, perms } = requireChannel(db, id, me);
    if (!canPin(c, perms)) throw forbidden();
    const m = loadMessage(c, mid);
    if (!m.pinned) return reply.status(204).send();
    db.run('UPDATE messages SET pinned = 0, pinned_at = NULL WHERE id = ?', m.id);
    dispatchMessageUpdate(ctx, c, getMessageRow(db, c.id, m.id)!);
    gw.dispatchToChannel(c, 'CHANNEL_PINS_UPDATE', { channel_id: c.id, guild_id: c.guild_id });
    if (c.guild_id) {
      writeAudit(ctx, c.guild_id, me, AuditLogAction.MESSAGE_UNPIN, m.author_id, [
        { key: 'channel_id', new_value: c.id }, { key: 'message_id', new_value: m.id },
      ], auditReason(req));
    }
    return reply.status(204).send();
  });

  // ---------- read state ----------

  app.post('/channels/:id/messages/:mid/ack', async (req) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c } = requireChannel(db, id, me);
    if (!isSnowflake(mid)) throw invalidField('message_id', 'Invalid message id');
    db.run(
      `INSERT INTO read_states (user_id, channel_id, last_read_message_id, mention_count) VALUES (?, ?, ?, 0)
       ON CONFLICT (user_id, channel_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, mention_count = 0`,
      me, c.id, mid,
    );
    const rs = readState(db.one<any>('SELECT * FROM read_states WHERE user_id = ? AND channel_id = ?', me, c.id)!);
    gw.dispatchToUser(me, 'MESSAGE_ACK', rs);
    return rs;
  });
}
