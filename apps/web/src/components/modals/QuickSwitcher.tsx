import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChannelType, RelationshipType } from '@huddle/shared';
import { Modal } from './Modal';
import { useGuildStore, channelDisplayName, userDisplayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useRelationshipStore } from '../../stores/relationships';
import { useChannelUnread } from '../../stores/readStates';
import { channelVisible } from '../../lib/permissionsCore';
import { openDM } from '../../lib/actions';
import { getLastChannel } from '../../lib/nav';
import { Avatar, GuildIcon } from '../common/Avatar';
import { IconHash, IconSpeaker } from '../common/icons';

/** Subsequence fuzzy score; higher is better, -1 = no match. */
export function fuzzyScore(q: string, text: string): number {
  if (!q) return 0;
  const t = text.toLowerCase();
  const s = q.toLowerCase();
  if (t === s) return 1000;
  if (t.startsWith(s)) return 500 - t.length;
  const idx = t.indexOf(s);
  if (idx >= 0) return 300 - idx - t.length * 0.1;
  let ti = 0, score = 0, streak = 0;
  for (const ch of s) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    streak = found === ti ? streak + 1 : 0;
    score += 1 + streak * 2 - (found - ti) * 0.2;
    ti = found + 1;
  }
  return score;
}

interface Result { key: string; kind: 'channel' | 'dm' | 'guild' | 'user'; label: string; sub?: string; icon: ReactNode; go: () => void; score: number; channelId?: string }

export function QuickSwitcher({ close }: { close: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const me = useAuthStore((s) => s.user!.id);
  const channels = useGuildStore((s) => s.channels);
  const guilds = useGuildStore((s) => s.guilds);
  const rels = useRelationshipStore((s) => s.relationships);

  const results = useMemo(() => {
    let mode: 'all' | 'channel' | 'user' | 'guild' = 'all';
    let query = q.trim();
    if (query.startsWith('#')) { mode = 'channel'; query = query.slice(1); }
    else if (query.startsWith('@')) { mode = 'user'; query = query.slice(1); }
    else if (query.startsWith('*')) { mode = 'guild'; query = query.slice(1); }
    const out: Result[] = [];
    if (mode === 'all' || mode === 'channel') {
      for (const c of Object.values(channels)) {
        if (!c.guild_id || c.type === ChannelType.GUILD_CATEGORY || !channelVisible(c, me)) continue;
        const score = fuzzyScore(query, c.name || '');
        if (score < 0) continue;
        out.push({
          key: c.id, kind: 'channel', label: c.name || '', sub: guilds[c.guild_id]?.name, channelId: c.id, score,
          icon: c.type === ChannelType.GUILD_VOICE ? <IconSpeaker size={18} /> : <IconHash size={18} />,
          go: () => nav(`/channels/${c.guild_id}/${c.id}`),
        });
      }
    }
    const dmUsers = new Set<string>();
    if (mode === 'all' || mode === 'user') {
      for (const c of Object.values(channels)) {
        if (c.type !== ChannelType.DM && c.type !== ChannelType.GROUP_DM) continue;
        const name = channelDisplayName(c, me);
        const other = c.type === ChannelType.DM ? c.recipients?.find((r) => r.id !== me) : undefined;
        if (other) dmUsers.add(other.id);
        const score = Math.max(fuzzyScore(query, name), other ? fuzzyScore(query, other.username) : -1);
        if (score < 0) continue;
        out.push({
          key: c.id, kind: 'dm', label: name, sub: other?.username, channelId: c.id, score: score + 1,
          icon: other ? <Avatar user={other} size={22} /> : <GuildIcon guild={{ id: c.id, name, icon: null }} size={22} />,
          go: () => nav(`/channels/@me/${c.id}`),
        });
      }
      for (const r of Object.values(rels)) {
        if (r.type !== RelationshipType.FRIEND || dmUsers.has(r.id)) continue;
        const score = Math.max(fuzzyScore(query, userDisplayName(r.user)), fuzzyScore(query, r.user.username));
        if (score < 0) continue;
        out.push({ key: 'u' + r.id, kind: 'user', label: userDisplayName(r.user), sub: r.user.username, score, icon: <Avatar user={r.user} size={22} />, go: () => void openDM([r.id]) });
      }
    }
    if (mode === 'all' || mode === 'guild') {
      for (const g of Object.values(guilds)) {
        const score = fuzzyScore(query, g.name);
        if (score < 0) continue;
        out.push({ key: 'g' + g.id, kind: 'guild', label: g.name, score, icon: <GuildIcon guild={g} size={22} />, go: () => { const l = getLastChannel(g.id); nav(`/channels/${g.id}${l ? '/' + l : ''}`); } });
      }
    }
    if (!query) {
      // no query: prefer DMs and recently active channels
      out.sort((a, b) => {
        const la = a.channelId ? channels[a.channelId]?.last_message_id || '0' : '0';
        const lb = b.channelId ? channels[b.channelId]?.last_message_id || '0' : '0';
        return BigInt(lb) > BigInt(la) ? 1 : BigInt(lb) < BigInt(la) ? -1 : 0;
      });
    } else out.sort((a, b) => b.score - a.score);
    return out.slice(0, 12);
  }, [q, channels, guilds, rels, me, nav]);

  const choose = (r: Result | undefined) => { if (!r) return; close(); r.go(); };

  return (
    <Modal close={close} size="md" className="quick-switcher" hideClose>
      <input
        className="qs-input"
        autoFocus
        placeholder="Where would you like to go?"
        value={q}
        onChange={(e) => { setQ(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); choose(results[sel]); }
        }}
      />
      <div className="qs-results">
        <div className="qs-section">{q ? 'Results' : 'Recent'}</div>
        {results.map((r, i) => <QSRow key={r.key} r={r} selected={i === sel} onHover={() => setSel(i)} onClick={() => choose(r)} />)}
        {!results.length && <div className="muted center-pad">Nothing matches “{q}”.</div>}
      </div>
      <div className="qs-tip"><strong>Protip:</strong> Start with <kbd>#</kbd> for channels, <kbd>@</kbd> for people, <kbd>*</kbd> for servers.</div>
    </Modal>
  );
}

function QSRow({ r, selected, onHover, onClick }: { r: Result; selected: boolean; onHover: () => void; onClick: () => void }) {
  const { unread, mentions } = useChannelUnread(r.channelId || '');
  return (
    <button className={'qs-row' + (selected ? ' selected' : '') + (unread ? ' unread' : '')} onMouseEnter={onHover} onClick={onClick}>
      <span className="qs-icon">{r.icon}</span>
      <span className="qs-label truncate">{r.label}</span>
      {mentions > 0 && <span className="badge">{mentions}</span>}
      {r.sub && <span className="qs-sub truncate">{r.sub}</span>}
    </button>
  );
}
