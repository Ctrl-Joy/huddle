// Public server directory: category sidebar + searchable card grid. Routed as /channels/discover/:category?
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GUILD_CATEGORIES, isGuildCategory, type DiscoverableGuild, type GuildCategory } from '@huddle/shared';
import { useGuildStore } from '../../stores/guilds';
import { useUIStore } from '../../stores/ui';
import { fetchDiscovery, joinDiscoverable } from '../../lib/actions';
import { getLastChannel } from '../../lib/nav';
import { pluralize } from '../../lib/format';
import { errorMessage } from '../../api/client';
import { GuildIcon, Spinner } from '../common/Avatar';
import { IconCompass, IconMenu, IconSearch, IconClose } from '../common/icons';
import { Modal } from '../modals/Modal';

export const DISCOVER_PATH = '/channels/discover';

const categoryLabel = (id: GuildCategory | null) => GUILD_CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';
const discoverPath = (c: GuildCategory | null) => (c ? `${DISCOVER_PATH}/${c}` : DISCOVER_PATH);

export function parseDiscoverCategory(param: string | undefined): GuildCategory | null {
  return isGuildCategory(param) ? param : null;
}

export function DiscoverSidebar({ category }: { category: GuildCategory | null }) {
  const nav = useNavigate();
  return (
    <div className="channel-sidebar">
      <div className="sidebar-header"><span>Discover</span></div>
      <div className="channel-list scroll-thin">
        <button className={'dm-nav' + (!category ? ' active' : '')} onClick={() => nav(DISCOVER_PATH)}>
          <IconCompass size={20} /><span>Home</span>
        </button>
        <div className="dm-section-header"><span>Categories</span></div>
        {GUILD_CATEGORIES.map((c) => (
          <button key={c.id} className={'dm-nav discover-cat' + (category === c.id ? ' active' : '')} onClick={() => nav(discoverPath(c.id))}>
            <span className={'discover-cat-dot cat-' + c.id} /><span>{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function DiscoverView({ category }: { category: GuildCategory | null }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState(''); // debounced
  const [guilds, setGuilds] = useState<DiscoverableGuild[] | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<DiscoverableGuild | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ctrl = new AbortController();
    setGuilds(null); setError('');
    fetchDiscovery({ category, q: query }, ctrl.signal)
      .then((r) => setGuilds(r.guilds))
      .catch((e) => { if (!ctrl.signal.aborted) { setError(errorMessage(e)); setGuilds([]); } });
    return () => ctrl.abort();
  }, [category, query]);

  const heading = category ? categoryLabel(category) : 'Find your people';
  const sub = category
    ? `Public ${categoryLabel(category).toLowerCase()} servers you can join right now.`
    : 'From game nights to study halls: browse public servers and jump straight in.';

  return (
    <div className="discover">
      <header className="chat-header mobile-only discover-mobile-head">
        <button className="icon-btn" aria-label="Open navigation" onClick={() => useUIStore.getState().setMobileNav(true)}><IconMenu size={22} /></button>
        <div className="chat-header-title"><IconCompass size={22} className="header-icon" /><span className="header-name">Discover</span></div>
      </header>
      <div className="discover-scroll scroll-thin">
        <section className={'discover-hero' + (category ? ' cat-' + category : '')}>
          <h1>{heading}</h1>
          <p>{sub}</p>
          <div className="discover-search">
            <IconSearch size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search servers" aria-label="Search servers" maxLength={100} />
            {q && <button className="icon-btn tiny" aria-label="Clear search" onClick={() => setQ('')}><IconClose size={16} /></button>}
          </div>
        </section>
        <nav className="discover-chips" aria-label="Categories">
          <button className={'chip' + (!category ? ' active' : '')} onClick={() => nav(DISCOVER_PATH)}>Home</button>
          {GUILD_CATEGORIES.map((c) => (
            <button key={c.id} className={'chip' + (category === c.id ? ' active' : '')} onClick={() => nav(discoverPath(c.id))}>{c.label}</button>
          ))}
        </nav>
        <h2 className="discover-section-title">
          {query.trim() ? `Results for “${query.trim()}”` : category ? `Popular in ${categoryLabel(category)}` : 'Featured servers'}
        </h2>
        {guilds === null ? (
          <div className="discover-loading"><Spinner size={32} /></div>
        ) : guilds.length === 0 ? (
          <div className="empty-state compact">
            <div className="empty-art" aria-hidden="true"><span /><span /><span /></div>
            <h2>{error ? 'Couldn’t load servers' : 'Nothing here yet'}</h2>
            <p>{error || (query.trim() ? 'No public servers match that search. Try another word or category.' : 'No servers are listed in this category yet. Check back soon!')}</p>
          </div>
        ) : (
          <div className="discover-grid">
            {guilds.map((g) => <ServerCard key={g.id} guild={g} onOpen={() => setPreview(g)} />)}
          </div>
        )}
      </div>
      {preview && <PreviewModal guild={preview} close={() => setPreview(null)} />}
    </div>
  );
}

function Banner({ guild }: { guild: DiscoverableGuild }) {
  return <div className={'discover-banner cat-' + (guild.category ?? 'other')} style={guild.banner_color ? { background: guild.banner_color } : undefined} />;
}

function Counts({ guild }: { guild: DiscoverableGuild }) {
  return (
    <div className="discover-counts">
      <span><span className="online-dot" />{guild.online_count.toLocaleString()} online</span>
      <span><span className="members-dot" />{pluralize(guild.member_count, 'member')}</span>
    </div>
  );
}

function ServerCard({ guild, onOpen }: { guild: DiscoverableGuild; onOpen: () => void }) {
  const joined = useGuildStore((s) => !!s.guilds[guild.id]);
  return (
    <button className="discover-card" onClick={onOpen}>
      <Banner guild={guild} />
      <GuildIcon guild={guild} size={52} className="discover-card-icon" />
      <div className="discover-card-body">
        <div className="discover-card-name">
          <strong className="truncate">{guild.name}</strong>
          {joined && <span className="chip static tiny">Joined</span>}
        </div>
        <p className="discover-card-desc">{guild.description}</p>
        <Counts guild={guild} />
      </div>
    </button>
  );
}

function PreviewModal({ guild, close }: { guild: DiscoverableGuild; close: () => void }) {
  const joined = useGuildStore((s) => !!s.guilds[guild.id]);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = () => { const last = getLastChannel(guild.id); close(); nav(`/channels/${guild.id}${last ? '/' + last : ''}`); };
  const join = async () => {
    setBusy(true); setError('');
    try { await joinDiscoverable(guild.id); close(); nav(`/channels/${guild.id}`); }
    catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return (
    <Modal close={close} className="discover-preview" footer={<>
      <span className="chip static">{categoryLabel(guild.category)}</span>
      <span className="spacer" />
      {joined
        ? <button className="btn btn-primary" onClick={open}>Open</button>
        : <button className="btn btn-primary" disabled={busy} onClick={join}>{busy ? 'Joining…' : 'Join Server'}</button>}
    </>}>
      <Banner guild={guild} />
      <GuildIcon guild={guild} size={72} className="discover-preview-icon" />
      <h2 className="discover-preview-name">{guild.name}</h2>
      <Counts guild={guild} />
      {guild.description && <p className="discover-preview-desc">{guild.description}</p>}
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}
