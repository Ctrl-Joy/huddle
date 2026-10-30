// Polls: validation of the create payload, vote sets (one set per user), and closing expired polls.
import { LIMITS, MessageType } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { badRequest, invalidField } from '../errors';
import { getChannelRow, getMessageRow, type ChannelRow, type MessageRow } from '../serializers';
import type { PollAnswerRow, PollRow } from '../messageExtras';
import { createMessage, dispatchMessageUpdate } from './messages';

export interface PollInput {
  question: string;
  answers: PollAnswerRow[];
  allow_multiselect: boolean;
  expires_at: string;
}

const EMOJI_MAX = 32;

/** Validates the `poll` field of a message create body. */
export function parsePoll(raw: unknown): PollInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw invalidField('poll', 'poll must be an object');
  const p = raw as Record<string, any>;
  const qRaw = typeof p.question === 'object' && p.question ? p.question.text : p.question;
  if (typeof qRaw !== 'string' || !qRaw.trim()) throw invalidField('poll.question', 'A poll needs a question');
  const question = qRaw.trim();
  if (question.length > LIMITS.POLL_QUESTION) throw invalidField('poll.question', `Question must be ${LIMITS.POLL_QUESTION} characters or fewer`);
  if (!Array.isArray(p.answers)) throw invalidField('poll.answers', 'answers must be an array');
  const answers: PollAnswerRow[] = [];
  for (const a of p.answers) {
    const text = typeof a === 'string' ? a : typeof a?.text === 'string' ? a.text : typeof a?.poll_media?.text === 'string' ? a.poll_media.text : null;
    if (text === null || !text.trim()) throw invalidField('poll.answers', 'Every answer needs text');
    if (text.trim().length > LIMITS.POLL_ANSWER) throw invalidField('poll.answers', `Answers must be ${LIMITS.POLL_ANSWER} characters or fewer`);
    const emojiRaw = typeof a === 'object' ? a?.emoji ?? null : null;
    let emoji: string | null = null;
    if (emojiRaw !== null && emojiRaw !== undefined && emojiRaw !== '') {
      if (typeof emojiRaw !== 'string' || emojiRaw.length > EMOJI_MAX || /[\s<>]/.test(emojiRaw)) throw invalidField('poll.answers', 'Invalid answer emoji');
      emoji = emojiRaw;
    }
    answers.push({ answer_id: answers.length + 1, text: text.trim(), emoji });
  }
  if (answers.length < LIMITS.POLL_ANSWERS_MIN || answers.length > LIMITS.POLL_ANSWERS_MAX) {
    throw invalidField('poll.answers', `A poll needs between ${LIMITS.POLL_ANSWERS_MIN} and ${LIMITS.POLL_ANSWERS_MAX} answers`);
  }
  const duration = Number(p.duration ?? 24);
  if (!(LIMITS.POLL_DURATIONS_HOURS as readonly number[]).includes(duration)) {
    throw invalidField('poll.duration', `duration must be one of ${LIMITS.POLL_DURATIONS_HOURS.join(', ')} hours`);
  }
  if (p.allow_multiselect !== undefined && typeof p.allow_multiselect !== 'boolean') {
    throw invalidField('poll.allow_multiselect', 'allow_multiselect must be a boolean');
  }
  return {
    question, answers, allow_multiselect: !!p.allow_multiselect,
    expires_at: new Date(Date.now() + duration * 3600_000).toISOString(),
  };
}

/** Call inside the message insert transaction. */
export function insertPoll(ctx: Ctx, messageId: string, p: PollInput): void {
  ctx.db.run(
    'INSERT INTO polls (message_id, question, answers, allow_multiselect, expires_at, ended) VALUES (?, ?, ?, ?, ?, 0)',
    messageId, p.question, JSON.stringify(p.answers), p.allow_multiselect ? 1 : 0, p.expires_at,
  );
}

export function getPollRow(ctx: Ctx, messageId: string): PollRow | undefined {
  return ctx.db.one<PollRow>('SELECT * FROM polls WHERE message_id = ?', messageId);
}

export const pollIsOpen = (p: PollRow) => !p.ended && Date.parse(p.expires_at) > Date.now();

/** Replaces userId's vote set on a poll (an empty list removes their vote) and fans out the per-answer diff. */
export function setVotes(ctx: Ctx, c: ChannelRow, m: MessageRow, userId: string, raw: unknown): { added: number[]; removed: number[] } {
  const { db, gw } = ctx;
  const poll = getPollRow(ctx, m.id);
  if (!poll) throw badRequest('This message has no poll');
  if (!pollIsOpen(poll)) throw badRequest('This poll has ended');
  if (!Array.isArray(raw)) throw invalidField('answer_ids', 'answer_ids must be an array');
  const valid = new Set((JSON.parse(poll.answers) as PollAnswerRow[]).map((a) => a.answer_id));
  const next = [...new Set(raw.map((x) => Number(x)))];
  for (const id of next) if (!Number.isInteger(id) || !valid.has(id)) throw invalidField('answer_ids', 'Unknown poll answer');
  if (!poll.allow_multiselect && next.length > 1) throw invalidField('answer_ids', 'This poll only allows one answer');

  const prev = new Set(db.all<{ answer_id: number }>('SELECT answer_id FROM poll_votes WHERE message_id = ? AND user_id = ?', m.id, userId).map((r) => r.answer_id));
  const nextSet = new Set(next);
  const added = next.filter((id) => !prev.has(id));
  const removed = [...prev].filter((id) => !nextSet.has(id));
  db.tx(() => {
    for (const id of removed) db.run('DELETE FROM poll_votes WHERE message_id = ? AND user_id = ? AND answer_id = ?', m.id, userId, id);
    for (const id of added) db.run('INSERT OR IGNORE INTO poll_votes (message_id, user_id, answer_id, created_at) VALUES (?, ?, ?, ?)', m.id, userId, id, now());
  });
  const base = { user_id: userId, channel_id: c.id, message_id: m.id, guild_id: c.guild_id };
  for (const id of removed) gw.dispatchToChannel(c, 'MESSAGE_POLL_VOTE_REMOVE', { ...base, answer_id: id });
  for (const id of added) gw.dispatchToChannel(c, 'MESSAGE_POLL_VOTE_ADD', { ...base, answer_id: id });
  return { added, removed };
}

/** Marks a poll ended, refreshes it for viewers and posts the "poll ended" system line. */
export function endPoll(ctx: Ctx, poll: PollRow): boolean {
  const { db } = ctx;
  const r = db.run('UPDATE polls SET ended = 1 WHERE message_id = ? AND ended = 0', poll.message_id);
  if (!r.changes) return false;
  const m = db.one<MessageRow>('SELECT * FROM messages WHERE id = ?', poll.message_id);
  const c = m ? getChannelRow(db, m.channel_id) : undefined;
  if (!m || !c) return false;
  dispatchMessageUpdate(ctx, c, getMessageRow(db, c.id, m.id)!);
  createMessage(ctx, { channel: c, authorId: m.author_id, content: '', type: MessageType.POLL_RESULT, referenceId: m.id });
  return true;
}

/** Closes every poll whose expiry has passed. Runs on a timer (see app.ts); returns how many were closed. */
export function finalizeExpiredPolls(ctx: Ctx): number {
  const due = ctx.db.all<PollRow>('SELECT * FROM polls WHERE ended = 0 AND expires_at <= ?', now());
  let n = 0;
  for (const p of due) if (endPoll(ctx, p)) n++;
  return n;
}
