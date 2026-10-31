import type { FastifyInstance } from 'fastify';
import {
  BUILTIN_SOUNDS, ChannelType, Permissions, SOUNDBOARD_LIMITS, has, type SoundboardPlayEvent, type SoundboardSound,
} from '@huddle/shared';
import { now, type Ctx } from '../context';
import type { Db } from '../db';
import { ApiErr, ErrorCode, badRequest, forbidden, invalidField, notFound, tooMany } from '../errors';
import { isPrivate, type GuildRow } from '../serializers';
import { requireChannel, requireGuild, requireGuildPerm } from '../services/permissions';
import { AUDIO_EXT, audioDurationMs, removeUpload, saveUpload, sniffAudio } from '../uploads';
import { body, readMultipart, uid } from './util';

interface SoundRow {
  id: string; guild_id: string; name: string; emoji: string | null; url: string; duration_ms: number;
  creator_id: string | null; created_at: string;
}

const serialize = (r: SoundRow): SoundboardSound => ({
  id: r.id, guild_id: r.guild_id, name: r.name, emoji: r.emoji, url: r.url, duration_ms: r.duration_ms, creator_id: r.creator_id,
});

export const soundsOf = (db: Db, guildId: string): SoundboardSound[] =>
  db.all<SoundRow>('SELECT * FROM soundboard_sounds WHERE guild_id = ? ORDER BY CAST(id AS INTEGER) ASC', guildId).map(serialize);

function checkName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < SOUNDBOARD_LIMITS.NAME_MIN || name.length > SOUNDBOARD_LIMITS.NAME_MAX) {
    throw invalidField('name', `Sound names must be ${SOUNDBOARD_LIMITS.NAME_MIN}-${SOUNDBOARD_LIMITS.NAME_MAX} characters`);
  }
  return name;
}

/** Optional unicode emoji shown with the sound; null / "" clears it. */
function checkEmoji(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const e = String(raw).trim();
  if (!e) return null;
  if (e.length > SOUNDBOARD_LIMITS.EMOJI_MAX || /\s/.test(e) || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(e)) {
    throw invalidField('emoji', 'Pick a single emoji');
  }
  return e;
}

export default function soundboardRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, gw } = ctx;

  const loadSound = (g: GuildRow, sid: string): SoundRow => {
    const s = db.one<SoundRow>('SELECT * FROM soundboard_sounds WHERE id = ? AND guild_id = ?', sid, g.id);
    if (!s) throw notFound('Sound', ErrorCode.UNKNOWN_SOUND);
    return s;
  };
  const broadcast = (guildId: string) =>
    gw.dispatchToGuild(guildId, 'GUILD_SOUNDBOARD_SOUNDS_UPDATE', { guild_id: guildId, sounds: soundsOf(db, guildId) });

  app.get('/guilds/:id/soundboard-sounds', async (req) => {
    const { g } = requireGuild(db, (req.params as { id: string }).id, uid(req));
    return soundsOf(db, g.id);
  });

  // multipart: file (MP3/OGG/WAV, ≤ 512 KB, ≤ 5 s) + name + optional emoji
  app.post('/guilds/:id/soundboard-sounds', async (req) => {
    const me = uid(req);
    const { g } = requireGuildPerm(db, (req.params as { id: string }).id, me, Permissions.MANAGE_EMOJIS);
    const { fields, files } = await readMultipart(req, { maxFiles: 1, maxFileBytes: SOUNDBOARD_LIMITS.BYTES });
    const f = files[0];
    if (!f) throw badRequest('No file uploaded');
    const kind = sniffAudio(f.data);
    if (!kind) throw invalidField('file', 'Sounds must be MP3, OGG or WAV audio');
    const ms = audioDurationMs(f.data, kind);
    if (ms === null) throw invalidField('file', "Couldn't read the length of that sound");
    if (ms > SOUNDBOARD_LIMITS.MAX_DURATION_MS + 50) {
      throw invalidField('file', `Sounds can be at most ${SOUNDBOARD_LIMITS.MAX_DURATION_MS / 1000} seconds long`);
    }
    const name = checkName(fields.name);
    const emoji = checkEmoji(fields.emoji);
    const count = db.one<{ n: number }>('SELECT COUNT(*) AS n FROM soundboard_sounds WHERE guild_id = ?', g.id)!.n;
    if (count >= SOUNDBOARD_LIMITS.PER_GUILD) {
      throw new ApiErr(400, `Maximum number of soundboard sounds reached (${SOUNDBOARD_LIMITS.PER_GUILD})`, ErrorCode.MAX_SOUNDS);
    }
    const id = ctx.id();
    const { url } = saveUpload(ctx.cfg.uploadsDir, `sounds/${id}.${AUDIO_EXT[kind]}`, f.data);
    db.run(
      'INSERT INTO soundboard_sounds (id, guild_id, name, emoji, url, duration_ms, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, g.id, name, emoji, url, Math.round(ms), me, now(),
    );
    broadcast(g.id);
    return serialize(loadSound(g, id));
  });

  app.patch('/guilds/:id/soundboard-sounds/:sid', async (req) => {
    const me = uid(req);
    const { id, sid } = req.params as { id: string; sid: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.MANAGE_EMOJIS);
    const s = loadSound(g, sid);
    const b = body(req);
    const name = b.name === undefined ? s.name : checkName(b.name);
    const emoji = b.emoji === undefined ? s.emoji : checkEmoji(b.emoji);
    if (name !== s.name || emoji !== s.emoji) {
      db.run('UPDATE soundboard_sounds SET name = ?, emoji = ? WHERE id = ?', name, emoji, s.id);
      broadcast(g.id);
    }
    return serialize(loadSound(g, s.id));
  });

  app.delete('/guilds/:id/soundboard-sounds/:sid', async (req, reply) => {
    const me = uid(req);
    const { id, sid } = req.params as { id: string; sid: string };
    const { g } = requireGuildPerm(db, id, me, Permissions.MANAGE_EMOJIS);
    const s = loadSound(g, sid);
    db.run('DELETE FROM soundboard_sounds WHERE id = ?', s.id);
    removeUpload(ctx.cfg.uploadsDir, s.url);
    broadcast(g.id);
    return reply.status(204).send();
  });

  // Plays a sound for everyone connected to this voice channel / DM call (the sender included).
  app.post('/channels/:id/soundboard', async (req, reply) => {
    const me = uid(req);
    const { c, perms } = requireChannel(db, (req.params as { id: string }).id, me);
    if (!isPrivate(c) && c.type !== ChannelType.GUILD_VOICE) throw badRequest('Not a voice channel');
    const state = ctx.voice.get(me);
    if (!state || state.channel_id !== c.id) throw forbidden('You must be connected to this call to use the soundboard');
    if (state.mute || (!isPrivate(c) && !has(perms, Permissions.SPEAK))) throw forbidden('You are muted in this channel');

    const soundId = String(body(req).sound_id ?? '');
    const builtin = BUILTIN_SOUNDS.find((x) => x.id === soundId);
    let sound: Pick<SoundboardPlayEvent, 'name' | 'emoji' | 'url'>;
    if (builtin) sound = { name: builtin.name, emoji: builtin.emoji, url: null };
    else {
      // uploaded sounds only play in their own server's voice channels
      const row = c.guild_id
        ? db.one<SoundRow>('SELECT * FROM soundboard_sounds WHERE id = ? AND guild_id = ?', soundId, c.guild_id)
        : undefined;
      if (!row) throw notFound('Sound', ErrorCode.UNKNOWN_SOUND);
      sound = { name: row.name, emoji: row.emoji, url: row.url };
    }

    const wait = ctx.limiter.consume(`sb:${me}`, ctx.limiter.config.soundboard);
    if (wait > 0) throw tooMany(wait, 'Slow down! You can play another sound in a moment.');

    const ev: SoundboardPlayEvent = { channel_id: c.id, guild_id: c.guild_id ?? null, user_id: me, sound_id: soundId, ...sound };
    gw.dispatchToUsers(ctx.voice.inChannel(c.id).map((s) => s.user_id), 'SOUNDBOARD_SOUND_PLAY', ev);
    return reply.status(204).send();
  });
}
