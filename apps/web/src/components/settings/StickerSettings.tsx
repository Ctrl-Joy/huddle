// Server Settings → Stickers: upload, edit and delete custom server stickers (needs Manage Expressions).
import { useEffect, useRef, useState } from 'react';
import { BUILTIN_STICKERS, Permissions, STICKER_LIMITS, has, type GuildSticker } from '@huddle/shared';
import { displayName } from '../../stores/guilds';
import { useStickerStore } from '../../stores/stickers';
import { confirmDialog, toast } from '../../stores/ui';
import { errorMessage } from '../../api/client';
import { useGuildPermissions } from '../../lib/permissions';
import { deleteSticker, updateSticker, uploadSticker } from '../../lib/stickers';
import { Tooltip } from '../common/Avatar';
import { IconTrash } from '../common/icons';
import { StickerImage } from '../chat/Sticker';

const ACCEPT = 'image/png,image/apng,image/gif,image/webp';
const NO_STICKERS: GuildSticker[] = [];
const hasEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

/** "happy-blob_2.png" → "happy blob 2" (2–30 chars). */
const nameFromFile = (filename: string) => {
  const n = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, STICKER_LIMITS.NAME_MAX);
  return n.length >= STICKER_LIMITS.NAME_MIN ? n : 'sticker';
};

const formError = (name: string, tags: string) =>
  name.trim().length < STICKER_LIMITS.NAME_MIN || name.trim().length > STICKER_LIMITS.NAME_MAX
    ? `Names are ${STICKER_LIMITS.NAME_MIN}–${STICKER_LIMITS.NAME_MAX} characters.`
    : !hasEmoji(tags) ? 'Pick a related emoji (it helps people find the sticker).' : '';

interface Draft { file: File; url: string; name: string; tags: string; description: string }

export function StickerTab({ guildId }: { guildId: string }) {
  const stickers = useStickerStore((s) => s.byGuild[guildId]) ?? NO_STICKERS;
  const canManage = has(useGuildPermissions(guildId), Permissions.MANAGE_EMOJIS);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const full = stickers.length >= STICKER_LIMITS.PER_GUILD;

  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.url); }, [draft?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = (f?: File) => {
    if (!f) return;
    setError('');
    if (!ACCEPT.split(',').includes(f.type)) { setError('Stickers must be a PNG, APNG, GIF or WebP image.'); return; }
    if (f.size > STICKER_LIMITS.BYTES) { setError(`That file is too big — stickers can be at most ${STICKER_LIMITS.BYTES / 1024} KB.`); return; }
    setDraft({ file: f, url: URL.createObjectURL(f), name: nameFromFile(f.name), tags: '', description: '' });
  };

  const upload = async () => {
    if (!draft) return;
    const err = formError(draft.name, draft.tags);
    if (err) { setError(err); return; }
    setBusy(true); setError('');
    try {
      await uploadSticker(guildId, { file: draft.file, name: draft.name.trim(), tags: draft.tags.trim(), description: draft.description });
      toast(`Added the “${draft.name.trim()}” sticker`, 'success');
      setDraft(null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="sticker-settings">
      <h1 className="settings-title">Stickers</h1>
      <p className="setting-desc">
        Upload up to {STICKER_LIMITS.PER_GUILD} stickers that anyone in this server can send from the sticker button in the message box.
        PNG, APNG, GIF or WebP, up to {STICKER_LIMITS.BYTES / 1024} KB — square images around 320×320 look best. Everyone also gets the
        built-in Huddle Buddies pack ({BUILTIN_STICKERS.length} stickers).
      </p>
      {!canManage && <div className="notice">You need the <strong>Manage Expressions</strong> permission to upload, edit or remove stickers.</div>}

      <div className="emoji-upload-row">
        <button className="btn btn-primary" disabled={!canManage || full || busy || !!draft} onClick={() => fileRef.current?.click()}>Upload Sticker</button>
        <span className="muted small">{stickers.length} / {STICKER_LIMITS.PER_GUILD} slots used{full ? ' — remove one to add more' : ''}</span>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {draft && (
        <div className="sticker-draft">
          <img className="sticker-draft-preview" src={draft.url} alt="" />
          <div className="sticker-draft-fields">
            <label><span className="field-label">Name</span>
              <input className="input" autoFocus value={draft.name} maxLength={STICKER_LIMITS.NAME_MAX} disabled={busy}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label><span className="field-label">Related emoji</span>
              <input className="input" value={draft.tags} maxLength={STICKER_LIMITS.TAGS_MAX} placeholder="e.g. 😄" disabled={busy}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></label>
            <label><span className="field-label">Description <span className="muted">(optional)</span></span>
              <input className="input" value={draft.description} maxLength={STICKER_LIMITS.DESCRIPTION_MAX} disabled={busy}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void upload(); } }} /></label>
            <div className="emoji-pending-actions">
              <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Cancel</button>
              <button className="btn btn-primary btn-small" disabled={busy} onClick={() => void upload()}>{busy ? 'Uploading…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="field-label mt">Stickers — {stickers.length}</div>
      {!stickers.length ? <div className="muted center-pad">No server stickers yet.{canManage ? ' Upload one to get started.' : ''}</div> : (
        <div className="sticker-grid-settings">
          {[...stickers].reverse().map((s) => <StickerCard key={s.id} guildId={guildId} sticker={s} canManage={canManage} />)}
        </div>
      )}
    </div>
  );
}

function StickerCard({ guildId, sticker, canManage }: { guildId: string; sticker: GuildSticker; canManage: boolean }) {
  const [f, setF] = useState({ name: sticker.name, tags: sticker.tags, description: sticker.description ?? '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => setF({ name: sticker.name, tags: sticker.tags, description: sticker.description ?? '' }), [sticker.name, sticker.tags, sticker.description]);

  const commit = async () => {
    const next = { name: f.name.trim(), tags: f.tags.trim(), description: f.description.trim() };
    if (next.name === sticker.name && next.tags === sticker.tags && next.description === (sticker.description ?? '')) return;
    const err = formError(next.name, next.tags);
    const reset = () => setF({ name: sticker.name, tags: sticker.tags, description: sticker.description ?? '' });
    if (err) { toast(err, 'error'); reset(); return; }
    setSaving(true);
    try { await updateSticker(guildId, sticker.id, next); }
    catch (e) { toast(errorMessage(e), 'error'); reset(); }
    finally { setSaving(false); }
  };
  const remove = () => confirmDialog({
    title: `Remove “${sticker.name}”?`, danger: true, confirmLabel: 'Remove',
    body: 'Messages that already used it show its name instead of the image.',
    onConfirm: () => deleteSticker(guildId, sticker.id),
  });
  const field = (k: keyof typeof f, label: string, max: number) => (
    <input className="input input-small" aria-label={`${label} for ${sticker.name}`} value={f[k]} maxLength={max} disabled={!canManage || saving}
      placeholder={k === 'description' ? 'No description' : undefined}
      onChange={(e) => setF({ ...f, [k]: e.target.value })} onBlur={() => void commit()}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
  );

  return (
    <div className="sticker-card">
      <StickerImage sticker={sticker} size={96} />
      <div className="sticker-card-fields">
        {field('name', 'Name', STICKER_LIMITS.NAME_MAX)}
        <div className="sticker-card-row">
          {field('tags', 'Related emoji', STICKER_LIMITS.TAGS_MAX)}
          <span className="muted small truncate">{sticker.format.toUpperCase()}{sticker.creator_id ? ` · by ${displayName(sticker.creator_id, guildId)}` : ''}</span>
        </div>
        {field('description', 'Description', STICKER_LIMITS.DESCRIPTION_MAX)}
      </div>
      {canManage && (
        <Tooltip label="Remove sticker">
          <button className="icon-btn tiny danger-hover sticker-card-remove" aria-label={`Remove ${sticker.name}`} onClick={remove}><IconTrash size={16} /></button>
        </Tooltip>
      )}
    </div>
  );
}
