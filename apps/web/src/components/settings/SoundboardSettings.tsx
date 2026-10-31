// Server Settings → Soundboard: upload, rename / re-emoji and delete the server's soundboard sounds.
// Managing needs MANAGE_EMOJIS ("Manage Expressions"); anyone can preview.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Permissions, SOUNDBOARD_LIMITS, has, type SoundboardSound } from '@huddle/shared';
import { displayName } from '../../stores/guilds';
import { confirmDialog, toast } from '../../stores/ui';
import { deleteSound, updateSound, uploadSound, useSoundboardStore } from '../../stores/soundboard';
import { errorMessage } from '../../api/client';
import { useGuildPermissions } from '../../lib/permissions';
import { playSoundboardAudio, probeAudioFile } from '../../voice/soundboard';
import { Tooltip } from '../common/Avatar';
import { IconPlay, IconTrash } from '../common/icons';

const ACCEPT = 'audio/mpeg,audio/mp3,audio/ogg,audio/wav,audio/x-wav,audio/wave,.mp3,.ogg,.oga,.wav';
const NO_SOUNDS: SoundboardSound[] = [];
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

const nameError = (n: string) =>
  n.trim().length >= SOUNDBOARD_LIMITS.NAME_MIN && n.trim().length <= SOUNDBOARD_LIMITS.NAME_MAX
    ? '' : `Names are ${SOUNDBOARD_LIMITS.NAME_MIN}–${SOUNDBOARD_LIMITS.NAME_MAX} characters.`;
const emojiError = (e: string) => (!e.trim() || (EMOJI_RE.test(e) && !/\s/.test(e.trim())) ? '' : 'Use a single emoji (or leave it empty).');

/** "big-crowd_cheer.mp3" → "big crowd cheer". */
const nameFromFile = (filename: string) =>
  filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SOUNDBOARD_LIMITS.NAME_MAX) || 'New sound';

export function SoundboardTab({ guildId }: { guildId: string }) {
  const sounds = useSoundboardStore((s) => s.sounds[guildId]) ?? NO_SOUNDS;
  const loaded = useSoundboardStore((s) => !!s.sounds[guildId]);
  const canManage = has(useGuildPermissions(guildId), Permissions.MANAGE_EMOJIS);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: File; url: string; name: string; emoji: string; ms: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const full = sounds.length >= SOUNDBOARD_LIMITS.PER_GUILD;

  useEffect(() => { void useSoundboardStore.getState().fetch(guildId); }, [guildId]);
  useEffect(() => () => { if (pending) URL.revokeObjectURL(pending.url); }, [pending]);

  const onFile = async (f?: File) => {
    if (!f) return;
    setError('');
    if (!/\.(mp3|ogg|oga|wav)$/i.test(f.name)) { setError('Sounds must be MP3, OGG or WAV files.'); return; }
    if (f.size > SOUNDBOARD_LIMITS.BYTES) { setError(`That file is too big. Sounds can be at most ${SOUNDBOARD_LIMITS.BYTES / 1024} KB.`); return; }
    let ms: number;
    try { ms = await probeAudioFile(f); } catch { setError("We couldn't play that file. Is it really audio?"); return; }
    if (ms > SOUNDBOARD_LIMITS.MAX_DURATION_MS + 50) {
      setError(`That sound is ${(ms / 1000).toFixed(1)} s long. Sounds can be at most ${SOUNDBOARD_LIMITS.MAX_DURATION_MS / 1000} seconds.`);
      return;
    }
    setPending({ file: f, url: URL.createObjectURL(f), name: nameFromFile(f.name), emoji: '', ms });
  };

  const upload = async () => {
    if (!pending) return;
    const err = nameError(pending.name) || emojiError(pending.emoji);
    if (err) { setError(err); return; }
    setBusy(true); setError('');
    try {
      await uploadSound(guildId, pending.file, pending.name.trim(), pending.emoji.trim());
      toast(`Added "${pending.name.trim()}" to the soundboard`, 'success');
      setPending(null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="emoji-settings">
      <h1 className="settings-title">Soundboard</h1>
      <p className="setting-desc">
        Add up to {SOUNDBOARD_LIMITS.PER_GUILD} short sounds that anyone in a voice channel here can play for everyone else in it.
        MP3, OGG or WAV, up to {SOUNDBOARD_LIMITS.BYTES / 1024} KB and {SOUNDBOARD_LIMITS.MAX_DURATION_MS / 1000} seconds.
        The built-in Huddle sounds are always available too.
      </p>
      {!canManage && <div className="notice">You need the <strong>Manage Expressions</strong> permission to add, edit or remove sounds.</div>}

      <div className="emoji-upload-row">
        <button className="btn btn-primary" disabled={!canManage || full || busy || !!pending} onClick={() => fileRef.current?.click()}>Upload Sound</button>
        <span className="muted small">{sounds.length} / {SOUNDBOARD_LIMITS.PER_GUILD} slots used{full ? ' (remove one to add more)' : ''}</span>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {pending && (
        <div className="emoji-pending">
          <Tooltip label="Preview">
            <button className="icon-btn sb-preview" aria-label="Preview sound" onClick={() => void new Audio(pending.url).play().catch(() => {})}><IconPlay size={18} /></button>
          </Tooltip>
          <label className="emoji-name-field">
            <span className="field-label">Name</span>
            <input autoFocus value={pending.name} maxLength={SOUNDBOARD_LIMITS.NAME_MAX} disabled={busy}
              onChange={(e) => setPending({ ...pending, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void upload(); } }} />
          </label>
          <label className="emoji-name-field sb-emoji-field">
            <span className="field-label">Emoji</span>
            <input value={pending.emoji} maxLength={SOUNDBOARD_LIMITS.EMOJI_MAX} placeholder="🔊" disabled={busy}
              onChange={(e) => setPending({ ...pending, emoji: e.target.value })} />
          </label>
          <span className="muted small">{(pending.ms / 1000).toFixed(1)} s</span>
          <div className="emoji-pending-actions">
            <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => { setPending(null); setError(''); }}>Cancel</button>
            <button className="btn btn-primary btn-small" disabled={busy} onClick={() => void upload()}>{busy ? 'Uploading…' : 'Save'}</button>
          </div>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}

      <div className="field-label mt">Sounds — {sounds.length}</div>
      {!sounds.length ? <div className="muted center-pad">{loaded ? `No custom sounds yet.${canManage ? ' Upload one to get started.' : ''}` : 'Loading…'}</div> : (
        <div className="emoji-table">
          {[...sounds].reverse().map((s) => <SoundRow key={s.id} guildId={guildId} sound={s} canManage={canManage} />)}
        </div>
      )}
    </div>
  );
}

function SoundRow({ guildId, sound, canManage }: { guildId: string; sound: SoundboardSound; canManage: boolean }) {
  const [name, setName] = useState(sound.name);
  const [emoji, setEmoji] = useState(sound.emoji ?? '');
  const [saving, setSaving] = useState(false);
  useEffect(() => setName(sound.name), [sound.name]);
  useEffect(() => setEmoji(sound.emoji ?? ''), [sound.emoji]);

  const commit = async () => {
    const n = name.trim();
    const e = emoji.trim();
    if (n === sound.name && e === (sound.emoji ?? '')) return;
    const err = nameError(n) || emojiError(e);
    if (err) { toast(err, 'error'); setName(sound.name); setEmoji(sound.emoji ?? ''); return; }
    setSaving(true);
    try { await updateSound(guildId, sound.id, { name: n, emoji: e || null }); }
    catch (x) { toast(errorMessage(x), 'error'); setName(sound.name); setEmoji(sound.emoji ?? ''); }
    finally { setSaving(false); }
  };
  const remove = () => confirmDialog({
    title: `Remove "${sound.name}"?`, danger: true, confirmLabel: 'Remove',
    body: 'It will disappear from the soundboard for everyone in this server.',
    onConfirm: () => deleteSound(guildId, sound.id),
  });
  const keys = (orig: string, reset: (v: string) => void) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
    if (e.key === 'Escape') { e.stopPropagation(); reset(orig); }
  };

  return (
    <div className="emoji-row">
      <Tooltip label="Preview">
        <button className="icon-btn sb-preview" aria-label={`Preview ${sound.name}`} onClick={() => void playSoundboardAudio(sound.id, sound.url)}><IconPlay size={18} /></button>
      </Tooltip>
      {canManage ? (
        <>
          <input className="sb-row-emoji" aria-label={`Emoji for ${sound.name}`} value={emoji} placeholder="🔊" maxLength={SOUNDBOARD_LIMITS.EMOJI_MAX}
            disabled={saving} onChange={(e) => setEmoji(e.target.value)} onBlur={() => void commit()} onKeyDown={keys(sound.emoji ?? '', setEmoji)} />
          <span className="emoji-name-input">
            <input aria-label={`Rename ${sound.name}`} value={name} maxLength={SOUNDBOARD_LIMITS.NAME_MAX} disabled={saving}
              onChange={(e) => setName(e.target.value)} onBlur={() => void commit()} onKeyDown={keys(sound.name, setName)} />
          </span>
        </>
      ) : <span className="emoji-row-name">{sound.emoji ? sound.emoji + ' ' : ''}{sound.name}</span>}
      <span className="muted small emoji-row-meta truncate">
        {(sound.duration_ms / 1000).toFixed(1)} s{sound.creator_id ? ` · by ${displayName(sound.creator_id, guildId)}` : ''}
      </span>
      {canManage && (
        <Tooltip label="Remove sound">
          <button className="icon-btn tiny danger-hover" aria-label={`Remove ${sound.name}`} onClick={remove}><IconTrash size={16} /></button>
        </Tooltip>
      )}
    </div>
  );
}
