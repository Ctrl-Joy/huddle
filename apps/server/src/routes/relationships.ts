import type { FastifyInstance } from 'fastify';
import { RelationshipType } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { ApiErr, ErrorCode, badRequest, invalidField, notFound } from '../errors';
import { getUserRow, relationship, relationshipsOf, type UserRow } from '../serializers';
import { body, uid } from './util';

type RelRow = { type: number } | undefined;

export default function relationshipRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  const get = (a: string, b: string): RelRow =>
    db.one<{ type: number }>('SELECT type FROM relationships WHERE user_id = ? AND other_id = ?', a, b);
  const put = (a: string, b: string, type: RelationshipType) =>
    db.run(
      `INSERT INTO relationships (user_id, other_id, type, since) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, other_id) DO UPDATE SET type = excluded.type, since = excluded.since`,
      a, b, type, now(),
    );
  const del = (a: string, b: string) => db.run('DELETE FROM relationships WHERE user_id = ? AND other_id = ?', a, b);

  const emitAdd = (to: string, other: string) => {
    const r = relationship(db, to, other);
    if (r) gw.dispatchToUser(to, 'RELATIONSHIP_ADD', r);
  };

  const becameFriends = (a: string, b: string) => {
    emitAdd(a, b);
    emitAdd(b, a);
    // friends see each other's presence
    gw.dispatchToUser(a, 'PRESENCE_UPDATE', gw.presence(b));
    gw.dispatchToUser(b, 'PRESENCE_UPDATE', gw.presence(a));
  };

  /** Send (or auto-accept) a friend request from me to target. */
  function request(me: string, target: UserRow) {
    if (target.id === me) throw badRequest('You cannot add yourself as a friend');
    const mine = get(me, target.id);
    const theirs = get(target.id, me);
    if (mine?.type === RelationshipType.BLOCKED) throw badRequest('Unblock this user before sending a friend request');
    if (theirs?.type === RelationshipType.BLOCKED) {
      throw new ApiErr(400, 'Friend request failed', ErrorCode.CANNOT_DM);
    }
    if (mine?.type === RelationshipType.FRIEND) throw badRequest("You're already friends with that user");
    if (mine?.type === RelationshipType.PENDING_INCOMING) {
      db.tx(() => {
        put(me, target.id, RelationshipType.FRIEND);
        put(target.id, me, RelationshipType.FRIEND);
      });
      becameFriends(me, target.id);
      return relationship(db, me, target.id);
    }
    if (mine?.type === RelationshipType.PENDING_OUTGOING) return relationship(db, me, target.id);
    db.tx(() => {
      put(me, target.id, RelationshipType.PENDING_OUTGOING);
      put(target.id, me, RelationshipType.PENDING_INCOMING);
    });
    emitAdd(me, target.id);
    emitAdd(target.id, me);
    return relationship(db, me, target.id);
  }

  app.get('/users/@me/relationships', async (req) => relationshipsOf(db, uid(req)));

  app.post('/users/@me/relationships', async (req) => {
    const me = uid(req);
    const b = body(req);
    if (typeof b.username !== 'string' || !b.username.trim()) throw invalidField('username', 'username is required');
    const target = db.one<UserRow>('SELECT * FROM users WHERE username = ?', b.username.trim().replace(/^@/, ''));
    if (!target) throw notFound('User', ErrorCode.UNKNOWN_USER);
    return request(me, target);
  });

  app.put('/users/@me/relationships/:userId', async (req) => {
    const me = uid(req);
    const { userId } = req.params as { userId: string };
    const target = getUserRow(db, userId);
    if (!target) throw notFound('User', ErrorCode.UNKNOWN_USER);
    if (userId === me) throw badRequest('Invalid target');
    const b = body(req);
    const type = b.type === undefined || b.type === null ? RelationshipType.FRIEND : Number(b.type);

    if (type === RelationshipType.BLOCKED) {
      const theirs = get(userId, me);
      db.tx(() => {
        put(me, userId, RelationshipType.BLOCKED);
        if (theirs && theirs.type !== RelationshipType.BLOCKED) del(userId, me);
      });
      if (theirs && theirs.type !== RelationshipType.BLOCKED) {
        gw.dispatchToUser(userId, 'RELATIONSHIP_REMOVE', { id: me, type: theirs.type });
      }
      emitAdd(me, userId);
      return relationship(db, me, userId);
    }
    if (type !== RelationshipType.FRIEND) throw invalidField('type', 'type must be 1 (friend) or 2 (block)');
    return request(me, target);
  });

  app.delete('/users/@me/relationships/:userId', async (req, reply) => {
    const me = uid(req);
    const { userId } = req.params as { userId: string };
    const mine = get(me, userId);
    if (!mine) throw notFound('Relationship');
    const theirs = get(userId, me);
    db.tx(() => {
      del(me, userId);
      // removing a friend / declining / cancelling clears both sides; unblocking only clears mine
      if (mine.type !== RelationshipType.BLOCKED && theirs && theirs.type !== RelationshipType.BLOCKED) del(userId, me);
    });
    gw.dispatchToUser(me, 'RELATIONSHIP_REMOVE', { id: userId, type: mine.type });
    if (mine.type !== RelationshipType.BLOCKED && theirs && theirs.type !== RelationshipType.BLOCKED) {
      gw.dispatchToUser(userId, 'RELATIONSHIP_REMOVE', { id: me, type: theirs.type });
    }
    return reply.status(204).send();
  });
}
