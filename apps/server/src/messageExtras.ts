// Message fields that live beside the core columns: flags, link previews (embeds), polls and forwarded snapshots.
import { MessageFlags, type Attachment, type Embed, type Message, type MessageSnapshot, type Poll, type PublicUser, type StickerItem } from '@huddle/shared';
import { placeholders, type Db } from './db';
import { publicUser, usersById, type MessageRow } from './serializers';

/** Stored in messages.forward_json — the forwarded message as it was when forwarded. */
export interface ForwardData {
  message_id: string; channel_id: string; guild_id: string | null; author_id: string;
  content: string; created_at: string; edited_at: string | null; embeds: Embed[];
  sticker_items?: StickerItem[];
}

export interface PollAnswerRow { answer_id: number; text: string; emoji: string | null }
export interface PollRow {
  message_id: string; question: string; answers: string; allow_multiselect: number; expires_at: string; ended: number;
}

export function attachment(a: any): Attachment {
  const out: Attachment = {
    id: a.id, filename: a.filename, size: a.size, content_type: a.content_type, url: a.url,
    width: a.width ?? null, height: a.height ?? null,
  };
  if (a.flags) out.flags = a.flags;
  if (a.duration_secs !== null && a.duration_secs !== undefined) out.duration_secs = a.duration_secs;
  if (a.waveform) out.waveform = a.waveform;
  return out;
}

export function parseEmbeds(raw: string | null | undefined): Embed[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function parseStickers(raw: string | null | undefined): StickerItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function parseForward(raw: string | null | undefined): ForwardData | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as ForwardData; } catch { return null; }
}

const missingUser = (id: string): PublicUser => ({
  id, username: 'deleted-user', display_name: 'Deleted User', avatar: null, banner_color: null, bio: null, bot: false,
  created_at: new Date(0).toISOString(),
});

type Extras = Pick<Message, 'flags' | 'embeds' | 'poll' | 'forward' | 'sticker_items'>;

/** Batch-loads polls (with the viewer's votes) and forward authors; returns a per-row field builder. */
export function messageExtras(
  db: Db, rows: MessageRow[], viewerId: string | null, snapshotAtts: Map<string, Attachment[]>,
): (r: MessageRow) => Extras {
  const ids = rows.map((r) => r.id);
  const polls = new Map<string, Poll>();
  const pollRows = db.raw.prepare(`SELECT * FROM polls WHERE message_id IN (${placeholders(ids.length)})`).all(...ids) as unknown as PollRow[];
  if (pollRows.length) {
    const pids = pollRows.map((p) => p.message_id);
    const counts = db.raw.prepare(
      `SELECT message_id, answer_id, COUNT(*) AS n, MAX(user_id = ?) AS me FROM poll_votes
        WHERE message_id IN (${placeholders(pids.length)}) GROUP BY message_id, answer_id`,
    ).all(viewerId ?? '', ...pids) as unknown as { message_id: string; answer_id: number; n: number; me: number }[];
    const byKey = new Map(counts.map((c) => [`${c.message_id}:${c.answer_id}`, c]));
    const now = Date.now();
    for (const p of pollRows) {
      const answers = (JSON.parse(p.answers) as PollAnswerRow[]).map((a) => {
        const c = byKey.get(`${p.message_id}:${a.answer_id}`);
        return { ...a, count: c?.n ?? 0, me: !!c?.me };
      });
      polls.set(p.message_id, {
        question: p.question, answers, allow_multiselect: !!p.allow_multiselect, expires_at: p.expires_at,
        ended: !!p.ended || Date.parse(p.expires_at) <= now,
      });
    }
  }

  const forwards = new Map<string, ForwardData>();
  for (const r of rows) {
    const f = parseForward(r.forward_json);
    if (f) forwards.set(r.id, f);
  }
  const fwdAuthors = forwards.size ? usersById(db, [...forwards.values()].map((f) => f.author_id)) : new Map();

  return (r) => {
    const flags = r.flags ?? 0;
    const out: Extras = { flags, embeds: flags & MessageFlags.SUPPRESS_EMBEDS ? [] : parseEmbeds(r.embeds) };
    const poll = polls.get(r.id);
    if (poll) out.poll = poll;
    const stickers = parseStickers(r.stickers);
    if (stickers.length) out.sticker_items = stickers;
    const f = forwards.get(r.id);
    if (f) {
      const u = fwdAuthors.get(f.author_id);
      const snap: MessageSnapshot = {
        message_id: f.message_id, channel_id: f.channel_id, guild_id: f.guild_id,
        author: u ? publicUser(u) : missingUser(f.author_id),
        content: f.content, created_at: f.created_at, edited_at: f.edited_at,
        attachments: snapshotAtts.get(r.id) ?? [], embeds: f.embeds ?? [],
      };
      if (f.sticker_items?.length) snap.sticker_items = f.sticker_items;
      out.forward = snap;
    }
    return out;
  };
}
