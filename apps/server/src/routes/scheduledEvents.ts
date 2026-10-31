import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  AuditLogAction, ChannelType, EVENT_LIMITS, Permissions, has, type ScheduledEventLocationType, type ScheduledEventStatus,
} from '@huddle/shared';
import { now, type Ctx } from '../context';
import { ErrorCode, badRequest, forbidden, invalidField, notFound } from '../errors';
import { getChannelRow, getUserRow, publicUser, type GuildRow } from '../serializers';
import { channelPerms, requireGuild, requireGuildPerm } from '../services/permissions';
import { diff, writeAudit } from '../services/audit';
import {
  canSeeEvent, dispatchEvent, eventAudience, getEventRow, interestedIds, serializeEvent, setEventStatus,
  type ScheduledEventRow,
} from '../services/scheduledEvents';
import { IMAGE_EXT, removeUpload, saveUpload, sniffImage } from '../uploads';
import { auditReason, body, optStr, readMultipart, reqStr, uid } from './util';

type Fields = Pick<ScheduledEventRow,
  'name' | 'description' | 'start_time' | 'end_time' | 'location_type' | 'channel_id' | 'location'>;

const EDITABLE: (keyof Fields)[] = ['name', 'description', 'start_time', 'end_time', 'location_type', 'channel_id', 'location'];

function optTime(b: Record<string, any>, key: string): string | null | undefined {
  const v = b[key];
  if (v === undefined || v === null) return v;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw invalidField(key, `${key} must be an ISO-8601 timestamp`);
  return new Date(v).toISOString();
}

/** Validates a create body, or a partial edit merged over `cur`. */
function readFields(ctx: Ctx, g: GuildRow, me: string, b: Record<string, any>, cur?: ScheduledEventRow): Fields {
  const name = cur ? optStr(b, 'name', { min: 1, max: EVENT_LIMITS.NAME }) ?? cur.name : reqStr(b, 'name', { min: 1, max: EVENT_LIMITS.NAME });
  const desc = optStr(b, 'description', { max: EVENT_LIMITS.DESCRIPTION, nullable: true });
  const description = desc === undefined ? cur?.description ?? null : desc || null;

  const start = optTime(b, 'start_time');
  if (start === null || (start === undefined && !cur)) throw invalidField('start_time', 'start_time is required');
  const start_time = start ?? cur!.start_time;
  if (start !== undefined && start !== cur?.start_time) {
    if (cur && cur.status !== 'scheduled') throw invalidField('start_time', "An event that's already started can't be rescheduled");
    if (Date.parse(start_time) < Date.now() - 60_000) throw invalidField('start_time', 'Start time must be in the future');
  }
  const end = optTime(b, 'end_time');
  const end_time = end === undefined ? cur?.end_time ?? null : end;
  if (end_time && Date.parse(end_time) <= Date.parse(start_time)) throw invalidField('end_time', 'End time must be after the start time');

  const lt = b.location_type ?? cur?.location_type;
  if (lt !== 'voice' && lt !== 'external') throw invalidField('location_type', "location_type must be 'voice' or 'external'");
  const location_type = lt as ScheduledEventLocationType;
  let channel_id: string | null = null, location: string | null = null;
  if (location_type === 'voice') {
    channel_id = b.channel_id !== undefined ? b.channel_id : cur?.channel_id ?? null;
    const c = typeof channel_id === 'string' ? getChannelRow(ctx.db, channel_id) : undefined;
    if (!c || c.guild_id !== g.id || c.type !== ChannelType.GUILD_VOICE) throw invalidField('channel_id', 'Pick a voice channel in this server');
    if (!has(channelPerms(ctx.db, c, me), Permissions.VIEW_CHANNEL)) throw invalidField('channel_id', 'Pick a voice channel in this server');
  } else {
    const loc = optStr(b, 'location', { max: EVENT_LIMITS.LOCATION, nullable: true });
    location = loc === undefined ? cur?.location ?? null : loc || null;
    if (!location) throw invalidField('location', 'Where is it happening? Add a location');
  }
  return { name, description, start_time, end_time, location_type, channel_id, location };
}

export default function scheduledEventRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  /** The event (visible to the caller) plus the caller's guild permissions. */
  const load = (req: FastifyRequest) => {
    const me = uid(req);
    const { id, eid } = req.params as { id: string; eid: string };
    const { g, perms } = requireGuild(db, id, me);
    const e = getEventRow(db, g.id, eid);
    if (!e || !canSeeEvent(db, e, me)) throw notFound('Scheduled Event', ErrorCode.UNKNOWN_SCHEDULED_EVENT);
    return { me, g, perms, e };
  };
  /** Editing needs MANAGE_EVENTS; starting / ending is also open to whoever created the event. */
  const loadManaged = (req: FastifyRequest, allowCreator = false) => {
    const r = load(req);
    if (!has(r.perms, Permissions.MANAGE_EVENTS) && !(allowCreator && r.e.creator_id === r.me)) throw forbidden();
    return r;
  };
  const reload = (e: ScheduledEventRow) => getEventRow(db, e.guild_id, e.id)!;

  app.get('/guilds/:id/scheduled-events', async (req) => {
    const me = uid(req);
    const { g } = requireGuild(db, (req.params as { id: string }).id, me);
    return db.all<ScheduledEventRow>(
      "SELECT * FROM scheduled_events WHERE guild_id = ? AND status IN ('scheduled', 'active') ORDER BY start_time ASC", g.id,
    ).filter((e) => canSeeEvent(db, e, me)).map((e) => serializeEvent(db, e, me));
  });

  app.post('/guilds/:id/scheduled-events', async (req) => {
    const me = uid(req);
    const { g } = requireGuildPerm(db, (req.params as { id: string }).id, me, Permissions.MANAGE_EVENTS);
    const b = body(req);
    const f = readFields(ctx, g, me, b);
    const id = ctx.id();
    const ts = now();
    db.tx(() => {
      db.run(
        `INSERT INTO scheduled_events (id, guild_id, channel_id, creator_id, name, description, start_time, end_time,
           location_type, location, image, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'scheduled', ?)`,
        id, g.id, f.channel_id, me, f.name, f.description, f.start_time, f.end_time, f.location_type, f.location, ts,
      );
      // the creator is interested in their own event
      db.run('INSERT INTO scheduled_event_users (event_id, user_id, created_at) VALUES (?, ?, ?)', id, me, ts);
    });
    const e = getEventRow(db, g.id, id)!;
    writeAudit(ctx, g.id, me, AuditLogAction.SCHEDULED_EVENT_CREATE, id,
      [{ key: 'name', new_value: f.name }, { key: 'start_time', new_value: f.start_time }], auditReason(req, b));
    dispatchEvent(ctx, 'SCHEDULED_EVENT_CREATE', e);
    return serializeEvent(db, e, me);
  });

  app.get('/guilds/:id/scheduled-events/:eid', async (req) => {
    const { me, e } = load(req);
    return serializeEvent(db, e, me);
  });

  app.patch('/guilds/:id/scheduled-events/:eid', async (req) => {
    const { me, g, e } = loadManaged(req);
    if (e.status !== 'scheduled' && e.status !== 'active') throw badRequest('This event has already ended');
    const b = body(req);
    const f = readFields(ctx, g, me, b, e);
    const changes = diff(e as unknown as Record<string, unknown>, f, EDITABLE);
    if (changes.length) {
      const before = eventAudience(ctx, e);
      db.run(
        `UPDATE scheduled_events SET name = ?, description = ?, start_time = ?, end_time = ?, location_type = ?,
           channel_id = ?, location = ? WHERE id = ?`,
        f.name, f.description, f.start_time, f.end_time, f.location_type, f.channel_id, f.location, e.id,
      );
      writeAudit(ctx, g.id, me, AuditLogAction.SCHEDULED_EVENT_UPDATE, e.id, changes, auditReason(req, b));
      dispatchEvent(ctx, 'SCHEDULED_EVENT_UPDATE', reload(e), before);
    }
    return serializeEvent(db, reload(e), me);
  });

  app.delete('/guilds/:id/scheduled-events/:eid', async (req, reply) => {
    const { me, g, e } = loadManaged(req);
    const audience = eventAudience(ctx, e);
    db.run('DELETE FROM scheduled_events WHERE id = ?', e.id);
    removeUpload(ctx.cfg.uploadsDir, e.image);
    writeAudit(ctx, g.id, me, AuditLogAction.SCHEDULED_EVENT_DELETE, e.id, [{ key: 'name', old_value: e.name }], auditReason(req));
    gw.dispatchToUsers(audience, 'SCHEDULED_EVENT_DELETE', { id: e.id, guild_id: g.id });
    return reply.status(204).send();
  });

  // ---------- status ----------

  const transition = (from: ScheduledEventStatus, to: ScheduledEventStatus, wrong: string, allowCreator: boolean) =>
    async (req: FastifyRequest) => {
      const { me, g, e } = loadManaged(req, allowCreator);
      if (e.status !== from) throw badRequest(wrong);
      const next = setEventStatus(ctx, e, to);
      if (!next) throw badRequest(wrong);
      writeAudit(ctx, g.id, me, AuditLogAction.SCHEDULED_EVENT_UPDATE, e.id, [{ key: 'status', old_value: from, new_value: to }]);
      return serializeEvent(db, next, me);
    };

  app.post('/guilds/:id/scheduled-events/:eid/start', transition('scheduled', 'active', 'Only an upcoming event can be started', true));
  app.post('/guilds/:id/scheduled-events/:eid/end', transition('active', 'completed', "This event isn't live", true));
  app.post('/guilds/:id/scheduled-events/:eid/cancel', transition('scheduled', 'cancelled', 'Only an upcoming event can be cancelled', false));

  // ---------- cover image (≤2 MB; validated by content) ----------

  app.post('/guilds/:id/scheduled-events/:eid/cover', async (req) => {
    const { me, g, e } = loadManaged(req);
    const { files } = await readMultipart(req, { maxFiles: 1, maxFileBytes: EVENT_LIMITS.COVER_BYTES });
    const f = files[0];
    if (!f) throw badRequest('No file uploaded');
    const kind = sniffImage(f.data);
    if (!kind) throw invalidField('file', 'Cover must be a PNG, JPEG, GIF or WebP image');
    const { url } = saveUpload(ctx.cfg.uploadsDir, `event-covers/${e.id}-${ctx.id()}.${IMAGE_EXT[kind]}`, f.data);
    db.run('UPDATE scheduled_events SET image = ? WHERE id = ?', url, e.id);
    removeUpload(ctx.cfg.uploadsDir, e.image);
    writeAudit(ctx, g.id, me, AuditLogAction.SCHEDULED_EVENT_UPDATE, e.id, [{ key: 'image', old_value: e.image, new_value: url }]);
    dispatchEvent(ctx, 'SCHEDULED_EVENT_UPDATE', reload(e));
    return serializeEvent(db, reload(e), me);
  });

  app.delete('/guilds/:id/scheduled-events/:eid/cover', async (req) => {
    const { me, g, e } = loadManaged(req);
    if (e.image) {
      db.run('UPDATE scheduled_events SET image = NULL WHERE id = ?', e.id);
      removeUpload(ctx.cfg.uploadsDir, e.image);
      writeAudit(ctx, g.id, me, AuditLogAction.SCHEDULED_EVENT_UPDATE, e.id, [{ key: 'image', old_value: e.image, new_value: null }]);
      dispatchEvent(ctx, 'SCHEDULED_EVENT_UPDATE', reload(e));
    }
    return serializeEvent(db, reload(e), me);
  });

  // ---------- interested ----------

  const setInterested = (on: boolean) => async (req: FastifyRequest) => {
    const { me, g, e } = load(req);
    if (on && e.status !== 'scheduled' && e.status !== 'active') throw badRequest('This event has already ended');
    const r = on
      ? db.run('INSERT OR IGNORE INTO scheduled_event_users (event_id, user_id, created_at) VALUES (?, ?, ?)', e.id, me, now())
      : db.run('DELETE FROM scheduled_event_users WHERE event_id = ? AND user_id = ?', e.id, me);
    const interested = interestedIds(db, e);
    if (r.changes) {
      gw.dispatchToUsers(eventAudience(ctx, e), on ? 'SCHEDULED_EVENT_INTEREST_ADD' : 'SCHEDULED_EVENT_INTEREST_REMOVE', {
        event_id: e.id, guild_id: g.id, user_id: me, user_count: interested.length,
      });
    }
    return serializeEvent(db, e, me, interested);
  };

  app.put('/guilds/:id/scheduled-events/:eid/users/@me', setInterested(true));
  app.delete('/guilds/:id/scheduled-events/:eid/users/@me', setInterested(false));

  app.get('/guilds/:id/scheduled-events/:eid/users', async (req) => {
    const { e } = load(req);
    return interestedIds(db, e).map((id) => getUserRow(db, id)).filter((u) => !!u).map((u) => publicUser(u!));
  });
}
