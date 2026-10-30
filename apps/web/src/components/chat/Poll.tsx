import { useEffect, useState } from 'react';
import type { Message, Poll } from '@huddle/shared';
import { useAuthStore } from '../../stores/auth';
import { votePoll, endPoll } from '../../lib/actions';
import { pluralize } from '../../lib/format';
import { IconCheck, IconPoll } from '../common/icons';

export const pollEnded = (p: Poll, now = Date.now()) => p.ended || Date.parse(p.expires_at) <= now;

function timeLeft(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `${Math.max(1, min)}m left`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}

/** Re-render every 30s so "time left" stays honest and the poll flips to ended on time. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function PollView({ message: m, canVote }: { message: Message; canVote: boolean }) {
  const p = m.poll!;
  const me = useAuthStore((s) => s.user!.id);
  const [open] = useState(() => !pollEnded(p));
  const now = useNow(open);
  const ended = pollEnded(p, now);
  const myVotes = p.answers.filter((a) => a.me).map((a) => a.answer_id);
  const voted = myVotes.length > 0;
  const [choosing, setChoosing] = useState(false); // changing an existing vote
  const [peek, setPeek] = useState(false); // non-voter looking at results
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const total = p.answers.reduce((n, a) => n + a.count, 0);
  const top = Math.max(0, ...p.answers.map((a) => a.count));
  const showResults = ended || !canVote || (voted ? !choosing : peek);

  const pick = (id: number) => {
    if (showResults) return;
    setPicked((cur) => (p.allow_multiselect ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : cur[0] === id ? [] : [id]));
  };
  const submit = async (ids: number[]) => {
    setBusy(true);
    await votePoll(m, ids);
    setBusy(false);
    setChoosing(false);
    setPicked([]);
  };

  return (
    <div className={'poll' + (ended ? ' ended' : '')} role="group" aria-label={`Poll: ${p.question}`}>
      <div className="poll-question">{p.question}</div>
      <div className="poll-hint">
        {ended ? 'Final results' : showResults ? (voted ? 'You voted' : 'Results so far') : p.allow_multiselect ? 'Select one or more answers' : 'Select one answer'}
      </div>
      <div className="poll-answers">
        {p.answers.map((a) => {
          const pct = total ? Math.round((a.count / total) * 100) : 0;
          const selected = picked.includes(a.answer_id);
          const winner = ended && top > 0 && a.count === top;
          return (
            <button key={a.answer_id} type="button"
              className={'poll-answer' + (showResults ? ' results' : '') + (a.me ? ' mine' : '') + (selected ? ' selected' : '') + (winner ? ' winner' : '')}
              aria-pressed={showResults ? a.me : selected} disabled={showResults ? true : !canVote || busy}
              onClick={() => pick(a.answer_id)}>
              {showResults && <span className="poll-bar" style={{ width: `${pct}%` }} />}
              {a.emoji && <span className="poll-answer-emoji">{a.emoji}</span>}
              <span className="poll-answer-text">{a.text}</span>
              {showResults ? (
                <span className="poll-answer-stats">
                  {a.me && <IconCheck size={14} strokeWidth={3} />}
                  <span className="poll-count">{pluralize(a.count, 'vote')}</span>
                  <strong>{pct}%</strong>
                </span>
              ) : (
                <span className={(p.allow_multiselect ? 'checkbox' : 'poll-radio') + (selected ? ' on' : '')}>
                  {selected && p.allow_multiselect && <IconCheck size={12} strokeWidth={3} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="poll-foot">
        <span className="poll-meta">{pluralize(total, 'vote')} · {ended ? 'Poll closed' : timeLeft(Date.parse(p.expires_at) - now)}</span>
        <span className="poll-actions">
          {!ended && canVote && !showResults && (
            <>
              {voted
                ? <button className="btn-link" onClick={() => { setChoosing(false); setPicked([]); }}>Cancel</button>
                : <button className="btn-link" onClick={() => setPeek(true)}>Show results</button>}
              <button className="btn btn-primary btn-small" disabled={!picked.length || busy} onClick={() => submit(picked)}>Vote</button>
            </>
          )}
          {!ended && canVote && showResults && voted && (
            <>
              <button className="btn-link" disabled={busy} onClick={() => submit([])}>Remove vote</button>
              <button className="btn-link" onClick={() => { setPicked(myVotes); setChoosing(true); }}>Change vote</button>
            </>
          )}
          {!ended && canVote && showResults && !voted && <button className="btn-link" onClick={() => setPeek(false)}>Back to voting</button>}
          {!ended && m.author.id === me && <button className="btn-link danger" onClick={() => void endPoll(m)}>End poll</button>}
        </span>
      </div>
    </div>
  );
}

/** "The poll X has closed" system line body. */
export function PollResultLine({ m }: { m: Message }) {
  const poll = m.referenced_message?.poll;
  if (!poll) return <>A poll has closed.</>;
  const total = poll.answers.reduce((n, a) => n + a.count, 0);
  const top = Math.max(0, ...poll.answers.map((a) => a.count));
  const winners = top > 0 ? poll.answers.filter((a) => a.count === top) : [];
  return (
    <>
      <IconPoll size={14} className="inline-icon" /> The poll <strong>{poll.question}</strong> has closed.{' '}
      {winners.length === 1
        ? <>Winning answer: <strong>{winners[0].emoji ? winners[0].emoji + ' ' : ''}{winners[0].text}</strong> ({Math.round((top / total) * 100)}%).</>
        : winners.length > 1 ? <>It ended in a tie.</> : <>Nobody voted.</>}
    </>
  );
}
