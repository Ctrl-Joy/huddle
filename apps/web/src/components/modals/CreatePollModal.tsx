import { useRef, useState } from 'react';
import { LIMITS, parseEmojiToken } from '@huddle/shared';
import { Modal, Field, Toggle } from './Modal';
import { createPoll } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { EmojiPicker } from '../chat/EmojiPicker';
import { IconSmilePlus, IconTrash, IconPlus } from '../common/icons';

const DURATIONS: { hours: number; label: string }[] = [
  { hours: 1, label: '1 hour' }, { hours: 4, label: '4 hours' }, { hours: 8, label: '8 hours' },
  { hours: 24, label: '24 hours' }, { hours: 72, label: '3 days' }, { hours: 168, label: '1 week' },
];

interface Draft { key: number; text: string; emoji: string | null }
let draftKey = 1;
const blank = (): Draft => ({ key: draftKey++, text: '', emoji: null });

export function CreatePollModal({ close, channelId }: { close: () => void; channelId: string }) {
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<Draft[]>(() => [blank(), blank()]);
  const [hours, setHours] = useState(24);
  const [multi, setMulti] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pickAnchor = useRef<HTMLButtonElement | null>(null);

  const filled = answers.filter((a) => a.text.trim());
  const valid = !!question.trim() && filled.length >= LIMITS.POLL_ANSWERS_MIN;
  const patch = (key: number, p: Partial<Draft>) => setAnswers((list) => list.map((a) => (a.key === key ? { ...a, ...p } : a)));

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setError('');
    try {
      await createPoll(channelId, {
        question: question.trim(),
        answers: filled.map((a) => ({ text: a.text.trim(), emoji: a.emoji })),
        duration: hours,
        allow_multiselect: multi,
      });
      close();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal close={close} title="Create a poll" size="md" className="poll-modal"
      footer={<><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={!valid || busy} onClick={submit}>{busy ? 'Posting…' : 'Post'}</button></>}>
      <Field label="Question">
        <input autoFocus value={question} maxLength={LIMITS.POLL_QUESTION} placeholder="What do you want to ask?" onChange={(e) => setQuestion(e.target.value)} />
      </Field>
      <div className="field-label">Answers</div>
      <div className="poll-draft-answers">
        {answers.map((a, i) => (
          <div key={a.key} className="poll-draft-answer">
            <button type="button" className="poll-emoji-btn" aria-label={a.emoji ? `Change emoji for answer ${i + 1}` : `Add emoji to answer ${i + 1}`}
              onClick={(e) => { pickAnchor.current = e.currentTarget; setPicking(a.key); }}
              onContextMenu={(e) => { e.preventDefault(); patch(a.key, { emoji: null }); }}>
              {a.emoji ? <span className="poll-emoji">{a.emoji}</span> : <IconSmilePlus size={18} />}
            </button>
            <input value={a.text} maxLength={LIMITS.POLL_ANSWER} placeholder={`Answer ${i + 1}`} aria-label={`Answer ${i + 1}`}
              onChange={(e) => patch(a.key, { text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && i === answers.length - 1 && answers.length < LIMITS.POLL_ANSWERS_MAX) { e.preventDefault(); setAnswers((l) => [...l, blank()]); }
              }} />
            {answers.length > LIMITS.POLL_ANSWERS_MIN && (
              <button type="button" className="icon-btn danger-hover" aria-label={`Remove answer ${i + 1}`} onClick={() => setAnswers((l) => l.filter((x) => x.key !== a.key))}><IconTrash size={16} /></button>
            )}
          </div>
        ))}
        {answers.length < LIMITS.POLL_ANSWERS_MAX && (
          <button type="button" className="poll-add-answer" onClick={() => setAnswers((l) => [...l, blank()])}><IconPlus size={16} /> Add another answer</button>
        )}
      </div>
      <div className="poll-draft-options">
        <label className="field poll-duration">
          <span className="field-label">Duration</span>
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {DURATIONS.map((d) => <option key={d.hours} value={d.hours}>{d.label}</option>)}
          </select>
        </label>
        <div className="poll-multi">
          <span>Allow multiple answers</span>
          <Toggle checked={multi} onChange={setMulti} label="Allow multiple answers" />
        </div>
      </div>
      {error && <div className="form-error">{error}</div>}
      {picking !== null && (
        <EmojiPicker anchor={pickAnchor.current} closeOnPick close={() => setPicking(null)}
          onPick={(e) => { if (!parseEmojiToken(e)) patch(picking, { emoji: e }); }} />
      )}
    </Modal>
  );
}
