import { useMemo, useState } from 'react';
import { ChannelType, LIMITS, Permissions, has, type Channel, type Message } from '@huddle/shared';
import { Modal } from './Modal';
import { useGuildStore, channelDisplayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { toast } from '../../stores/ui';
import { channelPermissionsFor } from '../../lib/permissionsCore';
import { forwardMessage } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { Avatar } from '../common/Avatar';
import { IconAt, IconCheck, IconHash, IconUsers } from '../common/icons';

const TEXTUAL = new Set<number>([ChannelType.GUILD_TEXT, ChannelType.GUILD_ANNOUNCEMENT, ChannelType.DM, ChannelType.GROUP_DM]);
const byRecent = (a: Channel, b: Channel) => {
  const x = BigInt(a.last_message_id || a.id), y = BigInt(b.last_message_id || b.id);
  return x > y ? -1 : x < y ? 1 : 0;
};

/** Where the current user may post this message (SEND_MESSAGES, plus ATTACH_FILES when it carries files). */
function useDestinations(m: Message): Channel[] {
  const channels = useGuildStore((s) => s.channels);
  const me = useAuthStore((s) => s.user!.id);
  const hasFiles = (m.forward?.attachments.length ?? 0) + m.attachments.length > 0;
  return useMemo(() => Object.values(channels).filter((c) => {
    if (!TEXTUAL.has(c.type)) return false;
    const p = channelPermissionsFor(c, me);
    return has(p, Permissions.VIEW_CHANNEL) && has(p, Permissions.SEND_MESSAGES) && (!hasFiles || has(p, Permissions.ATTACH_FILES));
  }).sort(byRecent), [channels, me, hasFiles]);
}

export function ForwardModal({ close, message }: { close: () => void; message: Message }) {
  const me = useAuthStore((s) => s.user!.id);
  const guilds = useGuildStore((s) => s.guilds);
  const all = useDestinations(message);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const label = (c: Channel) => (c.guild_id ? c.name ?? '' : channelDisplayName(c, me));
  const sub = (c: Channel) => (c.guild_id ? guilds[c.guild_id]?.name ?? '' : c.type === ChannelType.GROUP_DM ? 'Group' : 'Direct Message');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/^[#@]/, '');
    const list = needle ? all.filter((c) => label(c).toLowerCase().includes(needle) || sub(c).toLowerCase().includes(needle)) : all;
    return list.slice(0, 60);
  }, [all, q, guilds, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= LIMITS.FORWARD_TARGETS ? s : [...s, id]));
  const send = async () => {
    if (!selected.length || busy) return;
    setBusy(true); setError('');
    try {
      await forwardMessage(message, selected, note.trim());
      toast(selected.length === 1 ? 'Message forwarded' : `Forwarded to ${selected.length} places`, 'success');
      close();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const src = message.forward ?? message;
  const preview = src.content || (src.attachments.length ? `${src.attachments.length} attachment${src.attachments.length === 1 ? '' : 's'}` : 'Link preview');
  return (
    <Modal close={close} title="Forward to" subtitle={`Pick up to ${LIMITS.FORWARD_TARGETS} places.`} size="md" className="forward-modal"
      footer={
        <div className="forward-foot">
          <input value={note} maxLength={LIMITS.MESSAGE_LENGTH} placeholder="Add an optional message…" aria-label="Optional message" onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} />
          <button className="btn btn-primary" disabled={!selected.length || busy} onClick={send}>{busy ? 'Sending…' : selected.length > 1 ? `Send (${selected.length})` : 'Send'}</button>
        </div>
      }>
      <div className="forward-preview">
        <Avatar user={src.author} size={20} />
        <span className="truncate">{preview}</span>
      </div>
      <input autoFocus type="search" className="forward-search" placeholder="Search channels and conversations" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <div className="form-error">{error}</div>}
      <div className="pick-list forward-list scroll-thin" role="listbox" aria-multiselectable="true">
        {shown.map((c) => {
          const on = selected.includes(c.id);
          const other = c.type === ChannelType.DM ? c.recipients?.find((r) => r.id !== me) : undefined;
          return (
            <button key={c.id} role="option" aria-selected={on} className={'pick-row' + (on ? ' selected' : '')} onClick={() => toggle(c.id)}>
              <span className="forward-icon">
                {other ? <Avatar user={other} size={28} /> : c.type === ChannelType.GROUP_DM ? <IconUsers size={18} /> : c.guild_id ? <IconHash size={18} /> : <IconAt size={18} />}
              </span>
              <span className="pick-name truncate">{label(c)}<small>{sub(c)}</small></span>
              <span className={'checkbox' + (on ? ' on' : '')}>{on && <IconCheck size={12} strokeWidth={3} />}</span>
            </button>
          );
        })}
        {!shown.length && <div className="muted center-pad">{all.length ? 'Nothing matches that search.' : 'There is nowhere you can forward this to yet.'}</div>}
      </div>
    </Modal>
  );
}
