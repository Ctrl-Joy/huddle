import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Message } from '@huddle/shared';
import { useUIStore } from '../../stores/ui';
import { useGuildStore, displayName, memberColor } from '../../stores/guilds';
import { useMessageStore } from '../../stores/messages';
import { api, errorMessage } from '../../api/client';
import { Markdown } from '../../lib/markdown';
import { formatTimestamp } from '../../lib/format';
import { Avatar, Spinner } from '../common/Avatar';
import { IconClose, IconHash, IconSearch } from '../common/icons';

const PAGE = 25;

export interface ParsedSearch { content: string; author_id?: string; channel_id?: string; errors: string[]; fromName?: string; inName?: string }

export function parseSearchQuery(q: string, guildId: string): ParsedSearch {
  const s = useGuildStore.getState();
  const errors: string[] = [];
  let author_id: string | undefined;
  let channel_id: string | undefined;
  let fromName: string | undefined;
  let inName: string | undefined;
  const rest = q.replace(/\b(from|in):\s*("[^"]+"|\S+)/gi, (_, key: string, raw: string) => {
    const val = raw.replace(/^"|"$/g, '').replace(/^[@#]/, '');
    if (key.toLowerCase() === 'from') {
      fromName = val;
      const lower = val.toLowerCase();
      const m = Object.values(s.members[guildId] || {}).find((x) => x.user.username.toLowerCase() === lower)
        || Object.values(s.members[guildId] || {}).find((x) => (x.nick || '').toLowerCase() === lower || (x.user.display_name || '').toLowerCase() === lower);
      if (m) author_id = m.user.id; else errors.push(`No member named “${val}”`);
    } else {
      inName = val;
      const c = Object.values(s.channels).find((x) => x.guild_id === guildId && (x.name || '').toLowerCase() === val.toLowerCase());
      if (c) channel_id = c.id; else errors.push(`No channel named “${val}”`);
    }
    return '';
  }).trim();
  return { content: rest, author_id, channel_id, errors, fromName, inName };
}

export function SearchPanel({ guildId }: { guildId: string }) {
  const query = useUIStore((s) => s.searchQuery);
  const [results, setResults] = useState<Message[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const parsed = parseSearchQuery(query, guildId);

  useEffect(() => { setOffset(0); }, [query]);
  useEffect(() => {
    if (parsed.errors.length) { setResults([]); setTotal(0); return; }
    let cancelled = false;
    setLoading(true); setError('');
    api.get<Message[] | { messages: Message[]; total_results?: number; total?: number }>(`/guilds/${guildId}/messages/search`, {
      content: parsed.content || undefined, author_id: parsed.author_id, channel_id: parsed.channel_id, limit: PAGE, offset,
    }).then((res) => {
      if (cancelled) return;
      const list = Array.isArray(res) ? res : res.messages;
      const t = Array.isArray(res) ? null : res.total_results ?? res.total ?? null;
      useGuildStore.getState().upsertUsers(list.map((m) => m.author));
      setResults(list);
      setTotal(t ?? (list.length < PAGE ? offset + list.length : null));
    }).catch((e) => { if (!cancelled) setError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query, offset, guildId]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = (m: Message) => {
    nav(`/channels/${guildId}/${m.channel_id}`);
    setTimeout(() => void useMessageStore.getState().jumpTo(m.channel_id, m.id), 50);
  };

  return (
    <aside className="side-panel search-panel">
      <div className="side-panel-head">
        <IconSearch size={16} />
        <span className="truncate">
          {loading ? 'Searching…' : total !== null ? `${total} Result${total === 1 ? '' : 's'}` : `${results?.length ?? 0}+ Results`}
        </span>
        <button className="icon-btn tiny" aria-label="Close search" onClick={() => useUIStore.getState().closeSearch()}><IconClose size={16} /></button>
      </div>
      <div className="search-chips">
        {parsed.fromName && <span className="chip static">from: {parsed.fromName}</span>}
        {parsed.inName && <span className="chip static">in: #{parsed.inName}</span>}
        {parsed.content && <span className="chip static">“{parsed.content}”</span>}
      </div>
      <div className="side-panel-body scroll-thin">
        {parsed.errors.map((e) => <div key={e} className="form-error">{e}</div>)}
        {error && <div className="form-error">{error}</div>}
        {!results && loading && <div className="center-pad"><Spinner /></div>}
        {results && !results.length && !loading && !parsed.errors.length && (
          <div className="empty-mini"><div className="empty-mini-icon"><IconSearch size={28} /></div><p>We searched far and wide. Unfortunately, no results were found.</p></div>
        )}
        {results?.map((m) => <SearchResult key={m.id} m={m} onJump={() => jump(m)} />)}
        {results && results.length > 0 && (
          <div className="pager">
            <button className="btn btn-small btn-ghost" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
            <span className="muted small">Page {offset / PAGE + 1}</span>
            <button className="btn btn-small btn-ghost" disabled={results.length < PAGE || loading} onClick={() => setOffset(offset + PAGE)}>Next</button>
          </div>
        )}
      </div>
      <div className="search-help muted small">Tip: use <code>from:username</code> and <code>in:channel</code></div>
    </aside>
  );
}

function SearchResult({ m, onJump }: { m: Message; onJump: () => void }) {
  const channel = useGuildStore((s) => s.channels[m.channel_id]);
  return (
    <div className="search-result">
      <div className="search-result-channel"><IconHash size={13} />{channel?.name ?? 'unknown'}</div>
      <div className="search-result-card" onClick={onJump} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onJump(); }}>
        <Avatar user={m.author} size={32} />
        <div className="search-result-main">
          <div className="message-header">
            <span className="author-name" style={{ color: memberColor(m.guild_id, m.author.id) || undefined }}>{displayName(m.author.id, m.guild_id)}</span>
            <time className="message-time">{formatTimestamp(m.created_at)}</time>
          </div>
          <div className="message-content"><Markdown content={m.content} guildId={m.guild_id} /></div>
          {m.attachments.length > 0 && <div className="muted small">📎 {m.attachments.map((a) => a.filename).join(', ')}</div>}
        </div>
        <span className="jump-chip">Jump</span>
      </div>
    </div>
  );
}
