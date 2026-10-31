import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ChannelType, LIMITS, Permissions, has, parseEmojiToken, type Channel } from '@huddle/shared';
import { useAuthStore } from '../../stores/auth';
import { useComposerStore } from '../../stores/composer';
import { sendMessage, useMessageStore } from '../../stores/messages';
import { useGuildStore, sortedRoles, intToHex, displayName, channelDisplayName } from '../../stores/guilds';
import { useUIStore, toast } from '../../stores/ui';
import { usePermissions } from '../../lib/permissions';
import { channelVisible } from '../../lib/permissionsCore';
import { sendTyping, resetTyping } from '../../lib/actions';
import { encodeCustomEmoji, searchCustomEmoji, searchEmoji } from '../../lib/emoji';
import { formatBytes, formatTimestamp } from '../../lib/format';
import { Avatar, Tooltip } from '../common/Avatar';
import { IconClose, IconEye, IconFile, IconHash, IconPlusCircle, IconSmile, IconSpeaker, IconTrash, IconClock, IconAt } from '../common/icons';
import { EmojiPicker } from './EmojiPicker';
import { CustomEmojiImg } from './CustomEmoji';
import { TypingIndicator } from './TypingIndicator';
import { addFilesChecked } from './ChatView';
import { ApiError } from '../../api/client';
import { openModal, type MenuItem } from '../../stores/ui';
import { IconPoll, IconUpload } from '../common/icons';
import { MicButton, RecordingBar, useVoiceRecording } from './VoiceMessage';
import { GifPicker, IconGif, IconSticker, StickerPicker } from './MediaPickers';
import { ensureServerConfig, useServerConfig } from '../../stores/stickers';
import { sendGif, sendSticker } from '../../lib/stickers';

// Custom emoji picks show as ":name:" in the textarea; submit turns them into tokens.
const pickedToText = (e: string) => { const t = parseEmojiToken(e); return t ? `:${t.name}: ` : e; };

// per-channel slow-mode cooldown end timestamps
const cooldowns = new Map<string, number>();

interface Suggestion { key: string; insert: string; label: ReactNode; sub?: string; icon: ReactNode }

/** Convert friendly "@name" / "@Role" / "#channel" text into wire tokens. Skips code spans/blocks. */
export function encodeMentions(text: string, channel: Channel, meId: string): string {
  const gs = useGuildStore.getState();
  const cands: { text: string; token: string }[] = [];
  const addUser = (id: string, ...names: (string | null | undefined)[]) => {
    for (const n of names) if (n) cands.push({ text: '@' + n, token: `<@${id}>` });
  };
  if (channel.guild_id) {
    for (const m of Object.values(gs.members[channel.guild_id] || {})) addUser(m.user.id, m.user.username, m.nick, m.user.display_name);
    for (const r of Object.values(gs.roles[channel.guild_id] || {})) if (r.id !== channel.guild_id) cands.push({ text: '@' + r.name, token: `<@&${r.id}>` });
    for (const c of Object.values(gs.channels)) if (c.guild_id === channel.guild_id && c.name && c.type !== ChannelType.GUILD_CATEGORY && channelVisible(c, meId)) cands.push({ text: '#' + c.name, token: `<#${c.id}>` });
  } else {
    for (const r of channel.recipients || []) addUser(r.id, r.username, r.display_name);
    const me = useAuthStore.getState().user;
    if (me) addUser(me.id, me.username, me.display_name);
  }
  // usernames win over nicknames on ties: they were pushed first; sort by length only (stable)
  cands.sort((a, b) => b.text.length - a.text.length);
  const convert = (s: string) => {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if ((ch === '@' || ch === '#') && (i === 0 || /[\s([{]/.test(s[i - 1]))) {
        const hit = cands.find((c) => s.startsWith(c.text, i) && !/[\p{L}\p{N}_-]/u.test(s[i + c.text.length] ?? ''));
        if (hit) { out += hit.token; i += hit.text.length; continue; }
      }
      out += ch; i++;
    }
    return out;
  };
  // split on code fences and inline code, convert only prose
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, idx) => (idx % 2 ? part : convert(part))).join('');
}

export function Composer({ channel }: { channel: Channel }) {
  const channelId = channel.id;
  const me = useAuthStore((s) => s.user!);
  const perms = usePermissions(channelId);
  const myMember = useGuildStore((s) => (channel.guild_id ? s.members[channel.guild_id]?.[me.id] : undefined));
  const draft = useComposerStore((s) => s.drafts[channelId] ?? '');
  const files = useComposerStore((s) => s.files[channelId]) || [];
  const replyToId = useUIStore((s) => s.replyTo[channelId] ?? null);
  const replyMsg = useMessageStore((s) => (replyToId ? s.channels[channelId]?.messages.find((m) => m.id === replyToId) : undefined));
  const [text, setText] = useState(draft);
  const [cursor, setCursor] = useState(0);
  const [selIdx, setSelIdx] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiBtn = useRef<HTMLButtonElement>(null);
  const stickerBtn = useRef<HTMLButtonElement>(null);
  const gifBtn = useRef<HTMLButtonElement>(null);
  const [media, setMedia] = useState<'sticker' | 'gif' | null>(null);
  const gifsOn = useServerConfig((s) => !!s.config?.gifs);
  useEffect(ensureServerConfig, []);
  const voice = useVoiceRecording(channelId);

  const canSend = has(perms, Permissions.SEND_MESSAGES);
  const canAttach = has(perms, Permissions.ATTACH_FILES);
  const timedOutUntil = myMember?.communication_disabled_until && Date.parse(myMember.communication_disabled_until) > Date.now() ? myMember.communication_disabled_until : null;
  const bypassSlow = has(perms, Permissions.MANAGE_MESSAGES) || has(perms, Permissions.MANAGE_CHANNELS);
  const slow = channel.rate_limit_per_user > 0 && !bypassSlow ? channel.rate_limit_per_user : 0;
  const cooldownLeft = Math.max(0, Math.ceil(((cooldowns.get(channelId) ?? 0) - now) / 1000));

  useEffect(() => { if (cooldownLeft > 0) { const t = setTimeout(() => setNow(Date.now()), 250); return () => clearTimeout(t); } }, [cooldownLeft, now]);

  // persist draft
  useEffect(() => { const t = setTimeout(() => useComposerStore.getState().setDraft(channelId, text), 300); return () => clearTimeout(t); }, [text, channelId]);
  // autosize
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.45) + 'px';
  }, [text]);
  // focus on mount / reply
  useEffect(() => { taRef.current?.focus(); }, [channelId, replyToId]);
  // type-anywhere focuses the composer
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"], .modal, .emoji-picker')) return;
      if (useUIStore.getState().modals.length) return;
      taRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- autocomplete ----
  const trigger = useMemo(() => {
    const before = text.slice(0, cursor);
    const m = /(^|[\s(])([@#:])([^\s@#:]{0,32})$/.exec(before);
    if (!m) return null;
    if (m[2] === ':' && m[3].length < 2) return null;
    return { char: m[2], query: m[3], start: before.length - m[3].length - 1 };
  }, [text, cursor]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!trigger || dismissed === `${trigger.start}:${trigger.char}`) return [];
    const q = trigger.query.toLowerCase();
    const gs = useGuildStore.getState();
    const out: Suggestion[] = [];
    if (trigger.char === '@') {
      const users = channel.guild_id
        ? Object.values(gs.members[channel.guild_id] || {}).map((m) => ({ u: m.user, nick: m.nick }))
        : [...(channel.recipients || []), me].map((u) => ({ u, nick: null as string | null }));
      for (const { u, nick } of users) {
        const names = [u.username, u.display_name, nick].filter(Boolean) as string[];
        if (q && !names.some((n) => n.toLowerCase().includes(q))) continue;
        out.push({ key: 'u' + u.id, insert: '@' + u.username, label: nick || u.display_name || u.username, sub: u.username, icon: <Avatar user={u} size={22} /> });
      }
      out.sort((a, b) => Number(!String(a.sub).toLowerCase().startsWith(q)) - Number(!String(b.sub).toLowerCase().startsWith(q)));
      if (channel.guild_id) {
        const canEveryone = has(perms, Permissions.MENTION_EVERYONE);
        for (const r of sortedRoles(gs.roles[channel.guild_id])) {
          if (r.id === channel.guild_id) continue;
          if (!r.mentionable && !canEveryone) continue;
          if (q && !r.name.toLowerCase().includes(q)) continue;
          out.push({ key: 'r' + r.id, insert: '@' + r.name, label: <span style={{ color: r.color ? intToHex(r.color) : undefined }}>@{r.name}</span>, sub: 'Role', icon: <span className="ac-role-dot" style={{ background: r.color ? intToHex(r.color) : 'var(--text-faint)' }} /> });
        }
        if (canEveryone) for (const s of ['everyone', 'here']) {
          if (!q || s.startsWith(q)) out.push({ key: s, insert: '@' + s, label: '@' + s, sub: s === 'everyone' ? 'Notify everyone who can see this channel.' : 'Notify everyone online.', icon: <IconAt size={18} /> });
        }
      }
    } else if (trigger.char === '#' && channel.guild_id) {
      for (const c of Object.values(gs.channels)) {
        if (c.guild_id !== channel.guild_id || c.type === ChannelType.GUILD_CATEGORY || !c.name || !channelVisible(c, me.id)) continue;
        if (q && !c.name.toLowerCase().includes(q)) continue;
        const parent = c.parent_id ? gs.channels[c.parent_id]?.name : undefined;
        out.push({ key: 'c' + c.id, insert: '#' + c.name, label: c.name, sub: parent ?? undefined, icon: c.type === ChannelType.GUILD_VOICE ? <IconSpeaker size={18} /> : <IconHash size={18} /> });
      }
    } else if (trigger.char === ':') {
      for (const e of searchCustomEmoji(channel.guild_id, q, 5)) out.push({ key: 'ce' + e.id, insert: `:${e.name}:`, label: `:${e.name}:`, sub: 'Server emoji', icon: <CustomEmojiImg emoji={e} className="custom-emoji ac-emoji" /> });
      for (const e of searchEmoji(q, 10)) out.push({ key: 'e' + e.e + e.n, insert: e.e, label: `:${e.n}:`, icon: <span className="ac-emoji">{e.e}</span> });
    }
    return out.slice(0, 10);
  }, [trigger, dismissed, channel, me, perms]);

  useEffect(() => setSelIdx(0), [trigger?.query, trigger?.char]);

  const applySuggestion = (s: Suggestion) => {
    if (!trigger) return;
    const before = text.slice(0, trigger.start);
    const after = text.slice(cursor);
    const ins = s.insert + ' ';
    const next = before + ins + after.replace(/^ /, '');
    setText(next);
    const pos = before.length + ins.length;
    requestAnimationFrame(() => { taRef.current?.setSelectionRange(pos, pos); setCursor(pos); taRef.current?.focus(); });
  };

  const insertAtCursor = (s: string) => {
    const el = taRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + s + text.slice(end);
    setText(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + s.length, start + s.length); setCursor(start + s.length); });
  };

  // ---- send ----
  const submit = () => {
    if (!canSend || timedOutUntil) return;
    const content = text.trim();
    if (!content && !files.length) return;
    if (content.length > LIMITS.MESSAGE_LENGTH) { toast(`Messages can be at most ${LIMITS.MESSAGE_LENGTH} characters (yours is ${content.length}).`, 'error'); return; }
    if (cooldownLeft > 0) return;
    const encoded = encodeCustomEmoji(encodeMentions(content, channel, me.id), channel.guild_id);
    const sendFiles = files;
    setText('');
    useComposerStore.getState().setDraft(channelId, '');
    useComposerStore.getState().clearFiles(channelId);
    useUIStore.getState().setReplyTo(channelId, null);
    resetTyping();
    if (slow) { cooldowns.set(channelId, Date.now() + slow * 1000); setNow(Date.now()); }
    sendMessage(channelId, { content: encoded, replyToId, files: sendFiles }, me).catch((e) => {
      if (e instanceof ApiError && e.status === 429) toast('You are sending messages too quickly. Slow down!', 'error');
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx((i) => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelIdx((i) => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); applySuggestion(suggestions[selIdx]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (trigger) setDismissed(`${trigger.start}:${trigger.char}`); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); return; }
    if (e.key === 'ArrowUp' && !text) {
      const list = useMessageStore.getState().get(channelId).messages;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].author.id === me.id && !list[i]._state && (list[i].type === 0 || list[i].type === 19)) {
          e.preventDefault();
          useUIStore.getState().setEditing({ channelId, messageId: list[i].id });
          return;
        }
      }
    }
    if (e.key === 'Escape' && replyToId) { e.preventDefault(); e.stopPropagation(); useUIStore.getState().setReplyTo(channelId, null); }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length && canAttach) {
      e.preventDefault();
      addFilesChecked(channelId, pasted.map((f, i) => (f.name === 'image.png' || !f.name ? new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type }) : f)));
    }
  };

  const disabledReason = timedOutUntil
    ? `You're timed out until ${formatTimestamp(timedOutUntil)}.`
    : !canSend ? 'You do not have permission to send messages in this channel.' : null;
  const placeholder = disabledReason ?? (channel.guild_id ? `Message #${channel.name}` : `Message ${channel.type === ChannelType.DM ? '@' : ''}${channelDisplayName(channel, me.id)}`);

  return (
    <div className="composer-wrap">
      {suggestions.length > 0 && (
        <div className="autocomplete" role="listbox">
          <div className="ac-title">{trigger?.char === '@' ? 'Members & Roles' : trigger?.char === '#' ? 'Text Channels' : 'Emoji matching'} <span>{trigger?.query}</span></div>
          {suggestions.map((s, i) => (
            <button key={s.key} role="option" aria-selected={i === selIdx} className={'ac-row' + (i === selIdx ? ' selected' : '')}
              onMouseEnter={() => setSelIdx(i)} onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}>
              <span className="ac-icon">{s.icon}</span>
              <span className="ac-label truncate">{s.label}</span>
              {s.sub && <span className="ac-sub truncate">{s.sub}</span>}
            </button>
          ))}
        </div>
      )}
      <div className={'composer' + (disabledReason ? ' disabled' : '') + (replyToId ? ' has-reply' : '')}>
        {replyToId && (
          <div className="reply-bar">
            <span>Replying to <strong>{replyMsg ? displayName(replyMsg.author.id, channel.guild_id) : 'a message'}</strong></span>
            <button className="icon-btn tiny" aria-label="Cancel reply" onClick={() => useUIStore.getState().setReplyTo(channelId, null)}><IconClose size={16} /></button>
          </div>
        )}
        {files.length > 0 && (
          <div className="upload-chips scroll-thin">
            {files.map((f) => <FileChip key={f.id} channelId={channelId} id={f.id} file={f.file} spoiler={!!f.spoiler} />)}
          </div>
        )}
        {voice.active ? <RecordingBar rec={voice} /> : <div className="composer-row">
          {canSend && !timedOutUntil && (
            <Tooltip label="Upload or create">
              <button className="composer-btn" aria-label="Upload or create" aria-haspopup="menu" onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                const items: MenuItem[] = [];
                if (canAttach) items.push({ label: 'Upload a File', icon: <IconUpload size={16} />, onClick: () => fileRef.current?.click() });
                items.push({ label: 'Create Poll', icon: <IconPoll size={16} />, onClick: () => openModal('createPoll', { channelId }) });
                useUIStore.getState().openContextMenu({ clientX: r.left, clientY: r.top - 8 - items.length * 36 }, items, { tag: 'composer-plus' });
              }}><IconPlusCircle size={22} /></button>
            </Tooltip>
          )}
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFilesChecked(channelId, Array.from(e.target.files || [])); e.target.value = ''; }} />
          <textarea
            ref={taRef}
            className="composer-input"
            rows={1}
            value={text}
            disabled={!!disabledReason}
            placeholder={placeholder}
            aria-label={placeholder}
            maxLength={LIMITS.MESSAGE_LENGTH + 500}
            onChange={(e) => {
              setText(e.target.value);
              setCursor(e.target.selectionStart);
              setDismissed(null);
              if (e.target.value.trim()) sendTyping(channelId);
            }}
            onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
          {!disabledReason && gifsOn && (
            <Tooltip label="Send a GIF">
              <button ref={gifBtn} className={'composer-btn gif-btn' + (media === 'gif' ? ' active' : '')} aria-label="Send a GIF" onClick={() => setMedia((v) => (v === 'gif' ? null : 'gif'))}><IconGif size={22} /></button>
            </Tooltip>
          )}
          {!disabledReason && (
            <Tooltip label="Send a sticker">
              <button ref={stickerBtn} className={'composer-btn sticker-btn' + (media === 'sticker' ? ' active' : '')} aria-label="Send a sticker" onClick={() => setMedia((v) => (v === 'sticker' ? null : 'sticker'))}><IconSticker size={22} /></button>
            </Tooltip>
          )}
          {!disabledReason && (
            <Tooltip label="Select emoji">
              <button ref={emojiBtn} className={'composer-btn emoji-btn' + (pickerOpen ? ' active' : '')} aria-label="Select emoji" onClick={() => setPickerOpen((v) => !v)}><IconSmile size={22} /></button>
            </Tooltip>
          )}
          {!disabledReason && canAttach && !text.trim() && !files.length && !replyToId && <MicButton rec={voice} />}
        </div>}
        {text.length > LIMITS.MESSAGE_LENGTH - 200 && <div className={'char-count' + (text.length > LIMITS.MESSAGE_LENGTH ? ' over' : '')}>{LIMITS.MESSAGE_LENGTH - text.length}</div>}
      </div>
      <div className="composer-footer">
        <TypingIndicator channelId={channelId} guildId={channel.guild_id} />
        {slow > 0 && (
          <span className={'slowmode' + (cooldownLeft ? ' active' : '')}>
            <IconClock size={13} /> {cooldownLeft ? `${Math.floor(cooldownLeft / 60)}:${String(cooldownLeft % 60).padStart(2, '0')}` : `Slowmode is enabled (${slow}s)`}
          </span>
        )}
      </div>
      {media === 'sticker' && (
        <StickerPicker anchor={stickerBtn.current} guildId={channel.guild_id} close={() => setMedia(null)}
          onPick={(st) => { if (cooldownLeft > 0) return; void sendSticker(channelId, st, replyToId); useUIStore.getState().setReplyTo(channelId, null); if (slow) { cooldowns.set(channelId, Date.now() + slow * 1000); setNow(Date.now()); } }} />
      )}
      {media === 'gif' && (
        <GifPicker anchor={gifBtn.current} close={() => setMedia(null)}
          onPick={(g) => { if (cooldownLeft > 0) return; void sendGif(channelId, g.url, replyToId); useUIStore.getState().setReplyTo(channelId, null); if (slow) { cooldowns.set(channelId, Date.now() + slow * 1000); setNow(Date.now()); } }} />
      )}
      {pickerOpen && <EmojiPicker anchor={emojiBtn.current} placement="above" guildId={channel.guild_id} onPick={(e) => insertAtCursor(pickedToText(e))} close={() => setPickerOpen(false)} />}
    </div>
  );
}

function FileChip({ channelId, id, file, spoiler }: { channelId: string; id: string; file: File; spoiler: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className={'upload-chip' + (spoiler ? ' spoiler' : '')}>
      <div className="upload-chip-preview">{url ? <img src={url} alt="" /> : <IconFile size={36} />}</div>
      <div className="upload-chip-name truncate" title={file.name}>{file.name}</div>
      <div className="upload-chip-size">{formatBytes(file.size)}</div>
      <div className="upload-chip-actions">
        <Tooltip label={spoiler ? 'Remove spoiler' : 'Mark as spoiler'}>
          <button className="icon-btn tiny" aria-label="Toggle spoiler" onClick={() => useComposerStore.getState().toggleSpoiler(channelId, id)}><IconEye size={15} /></button>
        </Tooltip>
        <Tooltip label="Remove Attachment">
          <button className="icon-btn tiny danger-hover" aria-label="Remove attachment" onClick={() => useComposerStore.getState().removeFile(channelId, id)}><IconTrash size={15} /></button>
        </Tooltip>
      </div>
    </div>
  );
}
