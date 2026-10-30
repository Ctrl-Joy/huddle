// Poll votes, message forwarding and embed suppression (message create / edit live in messages.ts).
import type { FastifyInstance } from 'fastify';
import { ChannelType, LIMITS, MessageFlags, MessageType, Permissions, has } from '@huddle/shared';
import type { Ctx } from '../context';
import { ErrorCode, badRequest, forbidden, invalidField, notFound } from '../errors';
import {
  getMessageRow, isPrivate, message as serializeMessage, recipientIds, type ChannelRow, type MessageRow,
} from '../serializers';
import { requireChannel, requirePerm } from '../services/permissions';
import { createMessage, dispatchMessageUpdate, type NewAttachment } from '../services/messages';
import { endPoll, getPollRow, pollIsOpen, setVotes } from '../services/polls';
import { parseEmbeds, parseForward, type ForwardData } from '../messageExtras';
import { body, isSnowflake, uid } from './util';
import { isBlocked } from './users';

const FORWARDABLE = new Set<number>([MessageType.DEFAULT, MessageType.REPLY]);
const NO_MESSAGES = new Set<number>([ChannelType.GUILD_CATEGORY, ChannelType.GUILD_VOICE, ChannelType.GUILD_FORUM]);

export default function messageFeatureRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  const loadMessage = (c: ChannelRow, mid: string): MessageRow => {
    const m = getMessageRow(db, c.id, mid);
    if (!m) throw notFound('Message', ErrorCode.UNKNOWN_MESSAGE);
    return m;
  };

  // ---------- polls ----------

  /** Replace the caller's vote set: { answer_ids: [] } removes their vote. */
  app.put('/channels/:id/polls/:mid/votes', async (req) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c, perms } = requireChannel(db, id, me);
    requirePerm(perms, Permissions.READ_MESSAGE_HISTORY);
    const m = loadMessage(c, mid);
    setVotes(ctx, c, m, me, body(req).answer_ids);
    return serializeMessage(db, getMessageRow(db, c.id, m.id)!, me);
  });

  app.delete('/channels/:id/polls/:mid/votes', async (req) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c, perms } = requireChannel(db, id, me);
    requirePerm(perms, Permissions.READ_MESSAGE_HISTORY);
    const m = loadMessage(c, mid);
    setVotes(ctx, c, m, me, []);
    return serializeMessage(db, getMessageRow(db, c.id, m.id)!, me);
  });

  /** The poll's author ends it early. */
  app.post('/channels/:id/polls/:mid/expire', async (req) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c } = requireChannel(db, id, me);
    const m = loadMessage(c, mid);
    const poll = getPollRow(ctx, m.id);
    if (!poll) throw badRequest('This message has no poll');
    if (m.author_id !== me) throw forbidden('Only the poll author can end it');
    if (!pollIsOpen(poll)) throw badRequest('This poll has already ended');
    endPoll(ctx, poll);
    return serializeMessage(db, getMessageRow(db, c.id, m.id)!, me);
  });

  // ---------- forwarding ----------

  /** POST { channel_ids: [...], content?: "note" } → the created copies (one per destination). */
  app.post('/channels/:id/messages/:mid/forward', async (req) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const src = requireChannel(db, id, me);
    requirePerm(src.perms, Permissions.READ_MESSAGE_HISTORY);
    const m = loadMessage(src.c, mid);
    if (!FORWARDABLE.has(m.type)) throw badRequest('This message cannot be forwarded');
    if (getPollRow(ctx, m.id)) throw badRequest('Polls cannot be forwarded');

    const b = body(req);
    const note = b.content === undefined || b.content === null ? '' : b.content;
    if (typeof note !== 'string') throw invalidField('content', 'content must be a string');
    if (note.length > LIMITS.MESSAGE_LENGTH) throw invalidField('content', `Message must be ${LIMITS.MESSAGE_LENGTH} characters or fewer`);
    if (!Array.isArray(b.channel_ids) || !b.channel_ids.length) throw invalidField('channel_ids', 'Pick at least one destination');
    const targetIds = [...new Set(b.channel_ids)];
    if (targetIds.length > LIMITS.FORWARD_TARGETS) throw invalidField('channel_ids', `You can forward to at most ${LIMITS.FORWARD_TARGETS} places at once`);
    if (!targetIds.every(isSnowflake)) throw invalidField('channel_ids', 'channel_ids must be snowflakes');

    // Forwarding a forward passes the original along (one level of snapshot, like replies).
    const inner = parseForward(m.forward_json);
    const snap: ForwardData = inner ?? {
      message_id: m.id, channel_id: m.channel_id, guild_id: m.guild_id, author_id: m.author_id,
      content: m.content, created_at: m.created_at, edited_at: m.edited_at,
      embeds: (m.flags ?? 0) & MessageFlags.SUPPRESS_EMBEDS ? [] : parseEmbeds(m.embeds),
    };
    const files = db.all<any>(
      `SELECT * FROM attachments WHERE message_id = ? AND snapshot = ? ORDER BY rowid`, m.id, inner ? 1 : 0,
    );
    if (!snap.content.trim() && !files.length && !snap.embeds.length) throw badRequest('This message has nothing to forward');

    // Validate every destination before creating anything.
    const targets = targetIds.map((tid) => {
      const { c, perms } = requireChannel(db, tid, me);
      if (NO_MESSAGES.has(c.type)) throw badRequest('Cannot send messages in that channel');
      requirePerm(perms, Permissions.SEND_MESSAGES);
      if (files.length) requirePerm(perms, Permissions.ATTACH_FILES);
      if (c.type === ChannelType.DM) {
        const other = recipientIds(db, c.id).find((u) => u !== me);
        if (other && isBlocked(ctx, me, other)) throw forbidden('Cannot send messages to this user', ErrorCode.CANNOT_DM);
      }
      if (!isPrivate(c) && c.rate_limit_per_user > 0 && !has(perms, Permissions.MANAGE_MESSAGES) && !has(perms, Permissions.MANAGE_CHANNELS)) {
        const last = ctx.slowmode.get(`${c.id}:${me}`) ?? 0;
        if (Date.now() - last < c.rate_limit_per_user * 1000) throw badRequest('Slowmode is enabled in one of the destinations');
      }
      return c;
    });

    return targets.map((c) => {
      if (c.rate_limit_per_user > 0) ctx.slowmode.set(`${c.id}:${me}`, Date.now());
      const attachments: NewAttachment[] = files.map((a) => ({
        id: ctx.id(), filename: a.filename, size: a.size, content_type: a.content_type, url: a.url, path: a.path,
        width: a.width, height: a.height, flags: a.flags, duration_secs: a.duration_secs, waveform: a.waveform, snapshot: true,
      }));
      return createMessage(ctx, {
        channel: c, authorId: me, content: note, type: MessageType.DEFAULT, attachments, forward: snap,
        flags: (m.flags ?? 0) & MessageFlags.IS_VOICE_MESSAGE,
      });
    });
  });

  // ---------- embeds ----------

  /** { suppress: boolean } — hide (or restore) a message's link previews. Author, or MANAGE_MESSAGES in servers. */
  app.post('/channels/:id/messages/:mid/suppress-embeds', async (req) => {
    const me = uid(req);
    const { id, mid } = req.params as { id: string; mid: string };
    const { c, perms } = requireChannel(db, id, me);
    const m = loadMessage(c, mid);
    if (m.author_id !== me && (isPrivate(c) || !has(perms, Permissions.MANAGE_MESSAGES))) throw forbidden();
    const b = body(req);
    const suppress = b.suppress === undefined ? true : b.suppress;
    if (typeof suppress !== 'boolean') throw invalidField('suppress', 'suppress must be a boolean');
    const flags = suppress ? (m.flags ?? 0) | MessageFlags.SUPPRESS_EMBEDS : (m.flags ?? 0) & ~MessageFlags.SUPPRESS_EMBEDS;
    if (flags !== (m.flags ?? 0)) {
      db.run('UPDATE messages SET flags = ? WHERE id = ?', flags, m.id);
      dispatchMessageUpdate(ctx, c, getMessageRow(db, c.id, m.id)!);
    }
    return serializeMessage(db, getMessageRow(db, c.id, m.id)!, me);
  });
}
