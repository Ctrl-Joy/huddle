// Server Settings → Emoji: upload, rename and delete custom server emoji.
import { useEffect, useRef, useState } from 'react';
import { EMOJI_LIMITS, EMOJI_NAME_RE, Permissions, has, type GuildEmoji } from '@huddle/shared';
import { useGuildStore, displayName } from '../../stores/guilds';
import { confirmDialog, toast } from '../../stores/ui';
import { errorMessage } from '../../api/client';
import { useGuildPermissions } from '../../lib/permissions';
import { deleteEmoji, renameEmoji, uploadEmoji } from '../../lib/actions';
import { Tooltip } from '../common/Avatar';
import { IconTrash } from '../common/icons';
import { CustomEmojiImg } from '../chat/CustomEmoji';

const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';
const NO_EMOJI: GuildEmoji[] = [];

/** "Party Blob!.png" → "Party_Blob" (valid emoji name, 2–32 chars). */
export function nameFromFile(filename: string): string {
  let n = filename.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  n = n.slice(0, EMOJI_LIMITS.NAME_MAX);
  if (n.length < EMOJI_LIMITS.NAME_MIN) n = (n + '_emoji').slice(0, EMOJI_LIMITS.NAME_MAX);
  return n;
}

const nameError = (n: string) =>
  EMOJI_NAME_RE.test(n) ? '' : `Use ${EMOJI_LIMITS.NAME_MIN}–${EMOJI_LIMITS.NAME_MAX} letters, numbers or underscores.`;

export function EmojiTab({ guildId }: { guildId: string }) {
  const emojis = useGuildStore((s) => s.emojis[guildId]) ?? NO_EMOJI;
  const canManage = has(useGuildPermissions(guildId), Permissions.MANAGE_EMOJIS);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: File; url: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const full = emojis.length >= EMOJI_LIMITS.PER_GUILD;

  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  const onFile = (f?: File) => {
    if (!f) return;
    setError('');
    if (!ACCEPT.split(',').includes(f.type)) { setError('Emoji must be a PNG, JPEG, GIF or WebP image.'); return; }
    if (f.size > EMOJI_LIMITS.BYTES) { setError(`That file is too big — emoji can be at most ${EMOJI_LIMITS.BYTES / 1024} KB.`); return; }
    setPending({ file: f, url: URL.createObjectURL(f), name: nameFromFile(f.name) });
  };

  const upload = async () => {
    if (!pending) return;
    const err = nameError(pending.name);
    if (err) { setError(err); return; }
    setBusy(true); setError('');
    try {
      await uploadEmoji(guildId, pending.name, pending.file);
      toast(`Added :${pending.name}:`, 'success');
      setPending(null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="emoji-settings">
      <h1 className="settings-title">Emoji</h1>
      <p className="setting-desc">
        Add up to {EMOJI_LIMITS.PER_GUILD} custom emoji that anyone in this server can use in messages and reactions — type <code>:name:</code> or pick them from the emoji picker.
        PNG, JPEG, GIF or WebP, up to {EMOJI_LIMITS.BYTES / 1024} KB. GIFs stay animated.
      </p>
      {!canManage && <div className="notice">You need the <strong>Manage Emoji</strong> permission to upload, rename or remove emoji.</div>}

      <div className="emoji-upload-row">
        <button className="btn btn-primary" disabled={!canManage || full || busy || !!pending} onClick={() => fileRef.current?.click()}>Upload Emoji</button>
        <span className="muted small">{emojis.length} / {EMOJI_LIMITS.PER_GUILD} slots used{full ? ' — remove one to add more' : ''}</span>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {pending && (
        <div className="emoji-pending">
          <img className="emoji-preview" src={pending.url} alt="" />
          <label className="emoji-name-field">
            <span className="field-label">Name</span>
            <span className="emoji-name-input">
              <span className="muted">:</span>
              <input autoFocus value={pending.name} maxLength={EMOJI_LIMITS.NAME_MAX} disabled={busy}
                onChange={(e) => setPending({ ...pending, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void upload(); } }} />
              <span className="muted">:</span>
            </span>
          </label>
          <div className="emoji-pending-actions">
            <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => { setPending(null); setError(''); }}>Cancel</button>
            <button className="btn btn-primary btn-small" disabled={busy} onClick={() => void upload()}>{busy ? 'Uploading…' : 'Save'}</button>
          </div>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="field-label mt">Emoji — {emojis.length}</div>
      {!emojis.length ? <div className="muted center-pad">No custom emoji yet.{canManage ? ' Upload one to get started.' : ''}</div> : (
        <div className="emoji-table">
          {[...emojis].reverse().map((e) => <EmojiRow key={e.id} guildId={guildId} emoji={e} canManage={canManage} />)}
        </div>
      )}
    </div>
  );
}

function EmojiRow({ guildId, emoji, canManage }: { guildId: string; emoji: GuildEmoji; canManage: boolean }) {
  const [name, setName] = useState(emoji.name);
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(emoji.name), [emoji.name]);

  const commit = async () => {
    const n = name.trim();
    if (n === emoji.name) return;
    const err = nameError(n);
    if (err) { toast(err, 'error'); setName(emoji.name); return; }
    setSaving(true);
    try { await renameEmoji(guildId, emoji.id, n); }
    catch (e) { toast(errorMessage(e), 'error'); setName(emoji.name); }
    finally { setSaving(false); }
  };
  const remove = () => confirmDialog({
    title: `Remove :${emoji.name}:?`, danger: true, confirmLabel: 'Remove',
    body: 'Messages that use it will show its name as text instead, and reactions with it disappear.',
    onConfirm: () => deleteEmoji(guildId, emoji.id),
  });

  return (
    <div className="emoji-row">
      <CustomEmojiImg emoji={emoji} className="custom-emoji emoji-row-img" />
      {canManage ? (
        <span className="emoji-name-input">
          <span className="muted">:</span>
          <input aria-label={`Rename :${emoji.name}:`} value={name} maxLength={EMOJI_LIMITS.NAME_MAX} disabled={saving}
            onChange={(e) => setName(e.target.value)} onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              if (e.key === 'Escape') { e.stopPropagation(); setName(emoji.name); }
            }} />
          <span className="muted">:</span>
        </span>
      ) : <span className="emoji-row-name">:{emoji.name}:</span>}
      <span className="muted small emoji-row-meta truncate">{emoji.animated ? 'Animated · ' : ''}{emoji.creator_id ? `by ${displayName(emoji.creator_id, guildId)}` : ''}</span>
      {canManage && (
        <Tooltip label="Remove emoji">
          <button className="icon-btn tiny danger-hover" aria-label={`Remove :${emoji.name}:`} onClick={remove}><IconTrash size={16} /></button>
        </Tooltip>
      )}
    </div>
  );
}
