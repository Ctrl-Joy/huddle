import type { FastifyInstance } from 'fastify';
import { isGuildCategory, type DiscoverableGuild, type DiscoveryResponse } from '@huddle/shared';
import type { Ctx } from '../context';
import { ErrorCode, invalidField, notFound } from '../errors';
import type { GuildRow } from '../serializers';
import { getGuildRow } from '../services/permissions';
import { fullGuild, joinGuild } from '../services/guilds';
import { queryInt, queryStr, uid } from './util';

export default function discoveryRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  // Public server directory. Busiest first: online now, then total members.
  app.get('/discovery', async (req) => {
    uid(req);
    const category = queryStr(req.query, 'category');
    if (category !== undefined && !isGuildCategory(category)) throw invalidField('category', 'Unknown category');
    const q = queryStr(req.query, 'q')?.trim().toLowerCase().slice(0, 100);
    const limit = queryInt(req.query, 'limit', 48, 1, 100);
    const offset = queryInt(req.query, 'offset', 0, 0, 10_000);

    const where = ['discoverable = 1'];
    const params: string[] = [];
    if (category) { where.push('category = ?'); params.push(category); }
    if (q) {
      const like = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
      where.push("(LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(description, '')) LIKE ? ESCAPE '\\')");
      params.push(like, like);
    }
    const rows = db.all<GuildRow>(`SELECT * FROM guilds WHERE ${where.join(' AND ')}`, ...params);
    const memberIds = new Map<string, string[]>();
    for (const g of rows) {
      memberIds.set(g.id, db.all<{ user_id: string }>('SELECT user_id FROM members WHERE guild_id = ?', g.id).map((r) => r.user_id));
    }
    const cards: DiscoverableGuild[] = rows.map((g) => {
      const ids = memberIds.get(g.id)!;
      return {
        id: g.id, name: g.name, icon: g.icon, description: g.description,
        category: (g.category as DiscoverableGuild['category']) ?? null, banner_color: g.banner_color,
        member_count: ids.length,
        online_count: ids.filter((id) => ctx.gw.presence(id).status !== 'offline').length,
      };
    });
    cards.sort((a, b) => b.online_count - a.online_count || b.member_count - a.member_count || a.name.localeCompare(b.name));
    const out: DiscoveryResponse = { total: cards.length, guilds: cards.slice(offset, offset + limit) };
    return out;
  });

  // Join a listed server without an invite (same path as an invite join: bans apply, members no-op).
  app.post('/discovery/:id/join', async (req) => {
    const me = uid(req);
    const g = getGuildRow(db, (req.params as { id: string }).id);
    if (!g || !g.discoverable) throw notFound('Guild', ErrorCode.UNKNOWN_GUILD);
    joinGuild(ctx, g, me);
    return fullGuild(ctx, g.id);
  });
}
