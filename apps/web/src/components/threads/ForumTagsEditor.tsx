import { useEffect, useState } from 'react';
import { LIMITS, type Channel, type ForumTag } from '@huddle/shared';
import { errorMessage } from '../../api/client';
import { toast } from '../../stores/ui';
import { updateForumTags } from '../../lib/threads';
import { IconPlus, IconTrash } from '../common/icons';
import { ForumTagPill } from './ForumTagPill';

type Draft = { id?: string; name: string; emoji: string };

const toDraft = (t: ForumTag): Draft => ({ id: t.id, name: t.name, emoji: t.emoji ?? '' });

/** Channel Settings → Overview for forums: up to LIMITS.FORUM_TAGS tags (name + optional emoji). */
export function ForumTagsEditor({ channel }: { channel: Channel }) {
  const saved = channel.available_tags ?? [];
  const [tags, setTags] = useState<Draft[]>(() => saved.map(toDraft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const savedKey = JSON.stringify(saved.map(toDraft));
  useEffect(() => { setTags(JSON.parse(savedKey)); }, [savedKey]);
  const dirty = JSON.stringify(tags) !== savedKey;

  const patch = (i: number, p: Partial<Draft>) => setTags((ts) => ts.map((t, j) => (j === i ? { ...t, ...p } : t)));
  const save = async () => {
    if (tags.some((t) => !t.name.trim())) { setError('Every tag needs a name.'); return; }
    setBusy(true); setError('');
    try {
      await updateForumTags(channel.id, tags.map((t) => ({ id: t.id ?? '', name: t.name.trim(), emoji: t.emoji.trim() || null })));
      toast('Tags saved', 'success');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <section className="forum-tags-editor">
      <div className="field-label">Post Tags <span className="muted">— {tags.length}/{LIMITS.FORUM_TAGS}</span></div>
      <p className="setting-desc">Tags help people sort and find posts. Members pick up to {LIMITS.TAGS_PER_POST} when posting.</p>
      {tags.map((t, i) => (
        <div key={t.id ?? 'new' + i} className="forum-tag-row">
          <input className="forum-tag-emoji-input" value={t.emoji} maxLength={8} placeholder="🙂" aria-label="Tag emoji" onChange={(e) => patch(i, { emoji: e.target.value })} />
          <input value={t.name} maxLength={LIMITS.FORUM_TAG_NAME} placeholder="Tag name" aria-label="Tag name" onChange={(e) => patch(i, { name: e.target.value })} />
          <ForumTagPill tag={{ id: t.id ?? '', name: t.name || 'preview', emoji: t.emoji || null }} />
          <button type="button" className="icon-btn tiny danger" aria-label="Remove tag" onClick={() => setTags((ts) => ts.filter((_, j) => j !== i))}><IconTrash size={15} /></button>
        </div>
      ))}
      <div className="forum-tags-actions">
        <button type="button" className="btn btn-secondary btn-small" disabled={tags.length >= LIMITS.FORUM_TAGS} onClick={() => setTags((ts) => [...ts, { name: '', emoji: '' }])}>
          <IconPlus size={14} /> Add Tag
        </button>
        {dirty && <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={save}>Save Tags</button>}
        {dirty && <button type="button" className="btn btn-ghost btn-small" onClick={() => { setTags(JSON.parse(savedKey)); setError(''); }}>Reset</button>}
      </div>
      {error && <div className="form-error">{error}</div>}
    </section>
  );
}
