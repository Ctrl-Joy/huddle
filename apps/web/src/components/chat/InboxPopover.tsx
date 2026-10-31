// Inbox (chat header, top right): recent mentions across every server you can still read, newest first,
// paged from GET /users/@me/mentions; and an Unreads view built from local read states.
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChannelType, NotificationLevel, type Channel, type Message } from '@huddle/shared';
import { api, errorMessage } from '../../api/client';
import { gateway } from '../../api/gateway';
import { useAuthStore } from '../../stores/auth';
import { useGuildStore, channelDisplayName, displayName, memberColor } from '../../stores/guilds';
import { useMessageStore } from '../../stores/messages';
import { isChannelMuted, isUnread, useReadStateStore } from '../../stores/readStates';
import { useUIStore, type MenuItem } from '../../stores/ui';
import { ackChannel } from '../../lib/actions';
import { channelPath } from '../../lib/nav';
import { mentionsMe } from '../../lib/mentionUtil';
import { channelVisible } from '../../lib/permissionsCore';
import { formatTimestamp } from '../../lib/format';
import { Markdown } from '../../lib/markdown';
import { Avatar, Badge, GuildIcon, Spinner, Tooltip } from '../common/Avatar';
import { IconAt, IconCheck, IconClose, IconHash, IconInbox, IconMore } from '../common/icons';
import { stickerPreview } from '../../lib/stickers';

const PAGE = 25;
const FILTER_KEY = 'huddle.inboxFilters';
type Tab = 'mentions' | 'unreads';
interface Filters { everyone: boolean; roles: boolean }

function loadFilters(): Filters {
  try { return { everyone: true, roles: true, ...JSON.parse(localStorage.getItem(FILTER_KEY) || '{}') }; } catch { return { everyone: true, roles: true }; }
}

/** Header button + popover. */
export function InboxButton() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="popover-anchor">
      <Tooltip label="Inbox" side="bottom">
        <button className={'icon-btn' + (open ? ' active' : '')} aria-label="Inbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}><IconInbox size={20} /></button>
      </Tooltip>
      {open && <InboxPopover close={close} />}
    </div>
  );
}

function InboxPopover({ close }: { close: () => void }) {
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('huddle.inboxTab') as Tab) || 'mentions');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { try { sessionStorage.setItem('huddle.inboxTab', tab); } catch { /* ignore */ } }, [tab]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.('.popover-anchor, .modal-backdrop, .ctx-menu')) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !useUIStore.getState().contextMenu) close(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [close]);

  return (
    <div className="popover inbox-popover" ref={ref} role="dialog" aria-label="Inbox">
      <div className="popover-head inbox-head">
        <IconInbox size={18} /> Inbox
        <div className="inbox-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'mentions'} className={'tab' + (tab === 'mentions' ? ' active' : '')} onClick={() => setTab('mentions')}>Mentions</button>
          <button role="tab" aria-selected={tab === 'unreads'} className={'tab' + (tab === 'unreads' ? ' active' : '')} onClick={() => setTab('unreads')}>Unreads</button>
        </div>
      </div>
      {tab === 'mentions' ? <MentionsTab close={close} /> : <UnreadsTab close={close} />}
    </div>
  );
}

// ---------------- mentions ----------------

function useJump(close: () => void) {
  const nav = useNavigate();
  return (channel: { id: string; guild_id: string | null }, messageId?: string) => {
    close();
    useUIStore.getState().setMobileNav(false);
    nav(channelPath(channel));
    if (messageId) setTimeout(() => void useMessageStore.getState().jumpTo(channel.id, messageId), 50);
  };
}

function MentionsTab({ close }: { close: () => void }) {
  const [filters, setFilters] = useState(loadFilters);
  const [items, setItems] = useState<Message[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const jump = useJump(close);
  const me = useAuthStore((s) => s.user!.id);

  const load = useCallback(async (before?: string) => {
    setLoading(true); setError('');
    try {
      const page = await api.get<Message[]>('/users/@me/mentions', { limit: PAGE, before, everyone: filters.everyone, roles: filters.roles });
      useGuildStore.getState().upsertUsers(page.map((m) => m.author));
      setItems((prev) => (before && prev ? [...prev, ...page.filter((m) => !prev.some((p) => p.id === m.id))] : page));
      setDone(page.length < PAGE);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { setItems(null); void load(); }, [load]);

  // live: new mentions slide in at the top, edits/deletes apply in place
  useEffect(() => {
    const offs = [
      gateway.on('MESSAGE_CREATE', (m) => {
        if (!m.guild_id || m.author.id === me || !mentionsMe(m)) return;
        if (m.mention_everyone && !m.mentions.includes(me) && !filters.everyone) return;
        setItems((prev) => (prev && !prev.some((p) => p.id === m.id) ? [m, ...prev] : prev));
      }),
      gateway.on('MESSAGE_UPDATE', (m) => setItems((prev) => prev?.map((p) => (p.id === m.id ? { ...p, ...m } : p)) ?? prev)),
      gateway.on('MESSAGE_DELETE', ({ id }) => setItems((prev) => prev?.filter((p) => p.id !== id) ?? prev)),
    ];
    return () => offs.forEach((off) => off());
  }, [me, filters.everyone]);

  const dismiss = (m: Message) => {
    setItems((prev) => prev?.filter((p) => p.id !== m.id) ?? prev);
    api.del(`/users/@me/mentions/${m.id}`).catch(() => {});
  };

  const openFilters = (e: RMouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const set = (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch };
      try { localStorage.setItem(FILTER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      setFilters(next);
    };
    const items: MenuItem[] = [
      { label: 'Include @everyone and @here', checked: filters.everyone, onClick: () => set({ everyone: !filters.everyone }) },
      { label: 'Include role mentions', checked: filters.roles, onClick: () => set({ roles: !filters.roles }) },
    ];
    useUIStore.getState().openContextMenu({ clientX: r.left - 160, clientY: r.bottom + 4 }, items, { tag: 'inbox-filters', width: 220 });
  };

  return (
    <>
      <div className="inbox-toolbar">
        <span className="muted small">Recent mentions from your servers</span>
        <Tooltip label="Filter" side="bottom"><button className="icon-btn tiny" aria-label="Mention filters" onClick={openFilters}><IconMore size={16} /></button></Tooltip>
      </div>
      <div className="popover-body scroll-thin inbox-body">
        {error && <div className="form-error">{error}</div>}
        {!items ? <div className="center-pad"><Spinner /></div>
          : !items.length ? (
            <div className="empty-mini">
              <div className="empty-mini-icon"><IconAt size={28} /></div>
              <p>Nobody has mentioned you lately. When they do, it'll land here.</p>
            </div>
          ) : (
            <>
              {items.map((m) => <MentionItem key={m.id} m={m} onJump={() => jump({ id: m.channel_id, guild_id: m.guild_id }, m.id)} onDismiss={() => dismiss(m)} />)}
              {!done && (
                <button className="btn btn-secondary btn-small btn-block inbox-more" disabled={loading} onClick={() => void load(items[items.length - 1]?.id)}>
                  {loading ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
      </div>
    </>
  );
}

function MentionItem({ m, onJump, onDismiss }: { m: Message; onJump: () => void; onDismiss: () => void }) {
  const channel = useGuildStore((s) => s.channels[m.channel_id]);
  const guild = useGuildStore((s) => (m.guild_id ? s.guilds[m.guild_id] : undefined));
  return (
    <div className="inbox-item">
      <div className="inbox-item-where">
        {guild && <GuildIcon guild={guild} size={20} />}
        <span className="truncate"><IconHash size={13} />{channel?.name ?? 'unknown-channel'}{guild && <span className="muted"> · {guild.name}</span>}</span>
        <span className="inbox-item-actions">
          <button className="btn btn-small btn-ghost" onClick={onJump}>Jump</button>
          <Tooltip label="Dismiss" side="bottom"><button className="icon-btn tiny" aria-label="Dismiss mention" onClick={onDismiss}><IconClose size={14} /></button></Tooltip>
        </span>
      </div>
      <div className="pin-meta">
        <Avatar user={m.author} size={24} />
        <strong style={{ color: memberColor(m.guild_id, m.author.id) || undefined }}>{displayName(m.author.id, m.guild_id)}</strong>
        <span className="muted small">{formatTimestamp(m.created_at)}</span>
      </div>
      <div className="pin-content">
        <Markdown content={m.content} guildId={m.guild_id} />
        {!!m.sticker_items?.length && <div className="muted small">{stickerPreview(m)}</div>}
        {m.attachments.length > 0 && <div className="muted small">📎 {m.attachments.length} attachment(s)</div>}
      </div>
    </div>
  );
}

// ---------------- unreads ----------------

interface UnreadGroup { key: string; guildId: string | null; channels: { channel: Channel; mentions: number }[] }

function UnreadsTab({ close }: { close: () => void }) {
  const channels = useGuildStore((s) => s.channels);
  const guilds = useGuildStore((s) => s.guilds);
  const order = useGuildStore((s) => s.guildOrder);
  const readStates = useReadStateStore((s) => s.readStates);
  const guildSettings = useReadStateStore((s) => s.guildSettings);
  const me = useAuthStore((s) => s.user!.id);
  const jump = useJump(close);

  const groups = useMemo<UnreadGroup[]>(() => {
    const byGuild = new Map<string, UnreadGroup>();
    for (const c of Object.values(channels)) {
      if (!isUnread(c, readStates)) continue;
      const mentions = readStates[c.id]?.mention_count ?? 0;
      const isDM = c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM;
      if (!isDM) {
        if (!c.guild_id || !guilds[c.guild_id] || !channelVisible(c, me)) continue;
        const gs = guildSettings[c.guild_id];
        const quiet = gs?.muted || gs?.message_notifications === NotificationLevel.NOTHING || isChannelMuted(c, guildSettings);
        if (quiet && !mentions) continue;
      }
      const key = c.guild_id ?? '@me';
      let g = byGuild.get(key);
      if (!g) byGuild.set(key, (g = { key, guildId: c.guild_id, channels: [] }));
      g.channels.push({ channel: c, mentions: isDM ? Math.max(1, mentions) : mentions });
    }
    const newest = (x: Channel) => BigInt(x.last_message_id || '0');
    for (const g of byGuild.values()) g.channels.sort((a, b) => (newest(b.channel) > newest(a.channel) ? 1 : -1));
    const rank = (k: string) => (k === '@me' ? -1 : order.indexOf(k));
    return [...byGuild.values()].sort((a, b) => rank(a.key) - rank(b.key));
  }, [channels, guilds, order, readStates, guildSettings, me]);

  const markAll = () => { for (const g of groups) for (const { channel } of g.channels) ackChannel(channel.id, channel.last_message_id, true); };

  return (
    <>
      <div className="inbox-toolbar">
        <span className="muted small">{groups.length ? 'Channels with unread messages' : ''}</span>
        {groups.length > 0 && <button className="btn btn-small btn-secondary" onClick={markAll}><IconCheck size={14} /> Mark all read</button>}
      </div>
      <div className="popover-body scroll-thin inbox-body">
        {!groups.length ? (
          <div className="empty-mini">
            <div className="empty-mini-icon"><IconCheck size={28} /></div>
            <p>You're all caught up. Nothing unread anywhere.</p>
          </div>
        ) : groups.map((g) => (
          <section key={g.key} className="inbox-group">
            <h4 className="inbox-group-head">
              {g.guildId && guilds[g.guildId] ? <><GuildIcon guild={guilds[g.guildId]} size={18} /><span className="truncate">{guilds[g.guildId].name}</span></> : <span>Direct Messages</span>}
            </h4>
            {g.channels.map(({ channel, mentions }) => (
              <div key={channel.id} className="inbox-unread-row">
                <button className="inbox-unread-link" onClick={() => jump(channel)}>
                  {channel.guild_id ? <IconHash size={16} /> : <IconAt size={16} />}
                  <span className="truncate">{channelDisplayName(channel, me)}</span>
                  {mentions > 0 && <Badge count={mentions} />}
                </button>
                <Tooltip label="Mark as read" side="left">
                  <button className="icon-btn tiny" aria-label="Mark as read" onClick={() => ackChannel(channel.id, channel.last_message_id, true)}><IconCheck size={14} /></button>
                </Tooltip>
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
