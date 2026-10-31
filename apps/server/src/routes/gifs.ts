import type { FastifyInstance } from 'fastify';
import type { ClientConfig } from '@huddle/shared';
import type { Ctx } from '../context';
import { ApiErr, ErrorCode, invalidField, tooMany } from '../errors';
import { GifUnavailable } from '../services/gifs';
import { queryInt, queryStr, uid } from './util';

export default function gifRoutes(app: FastifyInstance, ctx: Ctx) {
  const { gifs } = ctx;

  // Public capability flags (no auth): the client hides optional UI the server can't back.
  app.get('/config', async (): Promise<ClientConfig> => ({
    gifs: gifs.enabled,
    gif_provider: gifs.enabled ? gifs.provider : null,
  }));

  /** Auth + configured + per-user rate limit (GETs skip the global write limiter). */
  const guard = (req: Parameters<typeof uid>[0]) => {
    const me = uid(req);
    if (!gifs.enabled) throw new ApiErr(501, 'GIF search is not configured on this server', ErrorCode.GIFS_UNAVAILABLE);
    const wait = ctx.limiter.consume(`gif:${me}`, ctx.limiter.config.gifs);
    if (wait > 0) throw tooMany(wait);
  };
  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof GifUnavailable) throw new ApiErr(502, 'GIF search is unavailable right now', ErrorCode.GIFS_UNAVAILABLE);
      throw e;
    }
  };

  app.get('/gifs/trending', async (req) => {
    guard(req);
    return run(() => gifs.trending(queryInt(req.query, 'offset', 0, 0, 499)));
  });

  app.get('/gifs/search', async (req) => {
    guard(req);
    const q = (queryStr(req.query, 'q') ?? '').trim();
    if (!q) throw invalidField('q', 'Search for something');
    if (q.length > 50) throw invalidField('q', 'Search must be 50 characters or fewer');
    return run(() => gifs.search(q, queryInt(req.query, 'offset', 0, 0, 499)));
  });
}
