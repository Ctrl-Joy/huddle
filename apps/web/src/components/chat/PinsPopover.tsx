import { useEffect, useRef } from 'react';
import { Permissions, type Channel } from '@huddle/shared';
import { usePinsStore } from '../../stores/pins';
import { useMessageStore } from '../../stores/messages';
import { useCan } from '../../lib/permissions';
import { setPinned } from '../../lib/actions';
import { Markdown } from '../../lib/markdown';
import { formatTimestamp } from '../../lib/format';
import { displayName, memberColor } from '../../stores/guilds';
import { Avatar, Spinner } from '../common/Avatar';
import { IconClose, IconPin } from '../common/icons';
import { stickerPreview } from '../../lib/stickers';

export function PinsPopover({ channel, close }: { channel: Channel; close: () => void }) {
  const entry = usePinsStore((s) => s.pins[channel.id]);
  const canManage = useCan(channel.id, Permissions.MANAGE_MESSAGES) || !channel.guild_id;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!entry || entry.stale) void usePinsStore.getState().fetch(channel.id);
  }, [entry?.stale, channel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('.popover-anchor, .modal-backdrop, .ctx-menu')) close();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [close]);

  const list = entry?.list;
  return (
    <div className="popover pins-popover" ref={ref}>
      <div className="popover-head"><IconPin size={18} /> Pinned Messages</div>
      <div className="popover-body scroll-thin">
        {!list ? <div className="center-pad"><Spinner /></div>
          : !list.length ? (
            <div className="empty-mini">
              <div className="empty-mini-icon"><IconPin size={28} /></div>
              <p>This channel doesn't have any pinned messages... yet.</p>
            </div>
          ) : list.map((m) => (
            <div key={m.id} className="pin-item">
              <div className="pin-meta">
                <Avatar user={m.author} size={24} />
                <strong style={{ color: memberColor(m.guild_id, m.author.id) || undefined }}>{displayName(m.author.id, m.guild_id)}</strong>
                <span className="muted small">{formatTimestamp(m.created_at)}</span>
              </div>
              <div className="pin-content"><Markdown content={m.content} guildId={m.guild_id} />{!!m.sticker_items?.length && <div className="muted small">{stickerPreview(m)}</div>}{m.attachments.length > 0 && <div className="muted small">📎 {m.attachments.length} attachment(s)</div>}</div>
              <div className="pin-actions">
                <button className="btn btn-small btn-ghost" onClick={() => { close(); void useMessageStore.getState().jumpTo(channel.id, m.id); }}>Jump</button>
                {canManage && <button className="icon-btn tiny" aria-label="Unpin" onClick={() => void setPinned(m, false).then(() => usePinsStore.getState().fetch(channel.id))}><IconClose size={14} /></button>}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
