// Public server directory: Servers (Home + one tab per category, searchable) and Apps. Routed as /channels/discover/:page?
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GUILD_CATEGORIES, isGuildCategory, type DiscoverableGuild, type GuildCategory } from '@huddle/shared';
import { useGuildStore } from '../../stores/guilds';
import { useUIStore, openModal } from '../../stores/ui';
import { fetchDiscovery, joinDiscoverable } from '../../lib/actions';
import { getLastChannel } from '../../lib/nav';
import { pluralize } from '../../lib/format';
import { errorMessage } from '../../api/client';
import { GuildIcon } from '../common/Avatar';
import {
  IconApps, IconClose, IconCompass, IconExpand, IconMenu, IconMessage, IconScreen, IconSearch, IconSmile, IconSpeaker,
  IconUsers, IconVerified, IconVideo,
} from '../common/icons';
import { Modal } from '../modals/Modal';

export const DISCOVER_PATH = '/channels/discover';
const APPS_PATH = DISCOVER_PATH + '/apps';

/** null = Servers → Home, a category = that tab, 'apps' = the Apps page. */
export type DiscoverPage = GuildCategory | 'apps' | null;

const categoryLabel = (id: GuildCategory | null) => GUILD_CATEGORIES.find((c) => c.id === id)?.label ?? 'Other';
const discoverPath = (c: GuildCategory | null) => (c ? `${DISCOVER_PATH}/${c}` : DISCOVER_PATH);

const CATEGORY_BLURBS: Record<GuildCategory, string> = {
  gaming: 'Squads, game nights and clip swaps. Find your next party.',
  music: 'Players, producers and listeners sharing what’s on repeat.',
  entertainment: 'Shows, films and books, talked through with people who care.',
  science_tech: 'Builders, tinkerers and the endlessly curious.',
  education: 'Study rooms, language swaps and people who love to explain.',
  community: 'Local groups, support circles and friendly hangouts.',
  art: 'Sketches, crafts and works in progress, with kind feedback.',
  other: 'Everything that doesn’t fit neatly in a box.',
};

/** Busiest first, verified servers lifted to the top of the Home picks. */
const FEATURED = 6;
const PER_ROW = 6;

/** Returns undefined for an unknown page (the shell redirects to Home). */
export function parseDiscoverPage(param: string | undefined): DiscoverPage | undefined {
  if (!param) return null;
  if (param === 'apps') return 'apps';
  return isGuildCategory(param) ? param : undefined;
}

export function DiscoverSidebar({ page }: { page: DiscoverPage }) {
  const nav = useNavigate();
  const go = (path: string) => { nav(path); useUIStore.getState().setMobileNav(false); };
  return (
    <div className="channel-sidebar">
      <div className="sidebar-header"><span>Discover</span></div>
      <div className="channel-list scroll-thin">
        <button className={'dm-nav' + (page !== 'apps' ? ' active' : '')} aria-current={page !== 'apps' ? 'page' : undefined} onClick={() => go(DISCOVER_PATH)}>
          <IconCompass size={20} /><span>Servers</span>
        </button>
        <button className={'dm-nav' + (page === 'apps' ? ' active' : '')} aria-current={page === 'apps' ? 'page' : undefined} onClick={() => go(APPS_PATH)}>
          <IconApps size={20} /><span>Apps</span>
        </button>
      </div>
    </div>
  );
}

export function DiscoverView({ page }: { page: DiscoverPage }) {
  return page === 'apps' ? <AppsPage /> : <ServersPage category={page} />;
}

function MenuButton() {
  return (
    <button className="icon-btn mobile-only" aria-label="Open navigation" onClick={() => useUIStore.getState().setMobileNav(true)}>
      <IconMenu size={22} />
    </button>
  );
}

/** Category theme class: sets --cat / --cat-accent / --cat-deep (see discover.css). Home has its own. */
const catClass = (c: GuildCategory | null | undefined) => 'cat-' + (c ?? 'home');

function Hero({ title, sub, category }: { title: string; sub: string; category?: GuildCategory | null }) {
  // keyed by the caller so the heading animates in again on every tab change
  return (
    <section className={'discover-hero ' + catClass(category)}>
      <h1>{title}</h1>
      <p>{sub}</p>
    </section>
  );
}

function ServersPage({ category }: { category: GuildCategory | null }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState(''); // debounced
  const [guilds, setGuilds] = useState<DiscoverableGuild[] | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<DiscoverableGuild | null>(null);
  const search = query.trim();

  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const ctrl = new AbortController();
    setGuilds(null); setError('');
    // a search spans every category; Home loads everything once and groups it into rows
    fetchDiscovery(search ? { q: search } : { category, limit: 100 }, ctrl.signal)
      .then((r) => setGuilds(r.guilds))
      .catch((e) => { if (!ctrl.signal.aborted) { setError(errorMessage(e)); setGuilds([]); } });
    return () => ctrl.abort();
  }, [category, search]);

  // keep the active tab in view, slide the underline to it, and show which edges have more tabs behind them
  const tabsRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placeIndicator = () => {
    const tab = tabsRef.current?.querySelector<HTMLElement>('.discover-tab.active');
    const bar = indicatorRef.current;
    if (!tab || !bar) return;
    bar.style.transform = `translateX(${tab.offsetLeft + 9}px) scaleX(${Math.max(0, tab.offsetWidth - 18) / 100})`;
    requestAnimationFrame(() => bar.classList.add('ready')); // no slide on first placement
  };
  const markOverflow = () => {
    const el = tabsRef.current;
    if (!el) return;
    el.classList.toggle('more-left', el.scrollLeft > 2);
    el.classList.toggle('more-right', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    markOverflow();
    placeIndicator();
    const onResize = () => { markOverflow(); placeIndicator(); };
    window.addEventListener('resize', onResize);
    void document.fonts?.ready.then(placeIndicator); // tab widths change once the web font lands
    return () => window.removeEventListener('resize', onResize);
  }, [category]);

  const pick = (c: GuildCategory | null) => { setQ(''); setQuery(''); nav(discoverPath(c)); };
  const open = (g: DiscoverableGuild) => setPreview(g);

  let body: ReactNode;
  if (search) {
    body = (
      <>
        <SectionTitle>Results for “{search}”</SectionTitle>
        {guilds === null ? <SkeletonGrid /> : guilds.length ? <CardGrid guilds={guilds} onOpen={open} /> : <Empty error={error} text="No public servers match that search. Try another word." />}
      </>
    );
  } else if (category) {
    body = (
      <>
        <Hero key={category} title={categoryLabel(category)} sub={CATEGORY_BLURBS[category]} category={category} />
        <SectionTitle>Popular {categoryLabel(category)} servers</SectionTitle>
        {guilds === null ? <SkeletonGrid /> : guilds.length ? <CardGrid guilds={guilds} onOpen={open} /> : <Empty error={error} text="No servers are listed in this category yet. Check back soon!" />}
      </>
    );
  } else {
    body = (
      <>
        <Hero key="home" title="Find your people" sub="From game nights to study halls: browse public servers and jump straight in." />
        {guilds === null
          ? <><SectionTitle>Featured servers</SectionTitle><SkeletonGrid /></>
          : <HomeSections guilds={guilds} error={error} onOpen={open} onSeeAll={pick} />}
      </>
    );
  }

  return (
    <div className={'discover ' + catClass(category)}>
      <header className="chat-header discover-topbar">
        <MenuButton />
        <IconCompass size={22} className="header-icon discover-topbar-icon" />
        <nav className="discover-tabs" aria-label="Categories" ref={tabsRef} onScroll={markOverflow}>
          <button className={'discover-tab' + (!category ? ' active' : '')} aria-current={!category ? 'page' : undefined} onClick={() => pick(null)}>Home</button>
          {GUILD_CATEGORIES.map((c) => (
            <button key={c.id} className={'discover-tab' + (category === c.id ? ' active' : '')} aria-current={category === c.id ? 'page' : undefined} onClick={() => pick(c.id)}>
              {c.label}
            </button>
          ))}
          <span className="discover-tab-indicator" ref={indicatorRef} aria-hidden="true" />
        </nav>
        <div className="discover-search">
          <IconSearch size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search servers" aria-label="Search servers" maxLength={100} />
          {q && <button className="icon-btn tiny" aria-label="Clear search" onClick={() => setQ('')}><IconClose size={14} /></button>}
        </div>
      </header>
      <div className="discover-scroll scroll-thin">{body}</div>
      {preview && <PreviewModal guild={preview} close={() => setPreview(null)} />}
    </div>
  );
}

function HomeSections({ guilds, error, onOpen, onSeeAll }: {
  guilds: DiscoverableGuild[]; error: string; onOpen: (g: DiscoverableGuild) => void; onSeeAll: (c: GuildCategory) => void;
}) {
  const featured = useMemo(() => [...guilds].sort((a, b) => Number(b.verified) - Number(a.verified)).slice(0, FEATURED), [guilds]);
  const rows = useMemo(
    () => GUILD_CATEGORIES.map((c) => ({ ...c, guilds: guilds.filter((g) => (g.category ?? 'other') === c.id) })).filter((r) => r.guilds.length),
    [guilds],
  );
  if (!guilds.length) return <Empty error={error} text="No servers are listed in Discover yet. List yours from Server Settings → Discovery." />;
  return (
    <>
      <SectionTitle>Featured servers</SectionTitle>
      <CardGrid guilds={featured} onOpen={onOpen} />
      {rows.map((r) => (
        <section key={r.id} className={'discover-row ' + catClass(r.id)}>
              <SectionTitle action={<button className="btn-link discover-see-all" onClick={() => onSeeAll(r.id)}>See all</button>}>
                Popular {r.label} servers
              </SectionTitle>
          <CardGrid guilds={r.guilds.slice(0, PER_ROW)} onOpen={onOpen} />
        </section>
      ))}
    </>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="discover-section-head"><h2 className="discover-section-title">{children}</h2>{action}</div>;
}

function Empty({ error, text }: { error: string; text: string }) {
  return (
    <div className="empty-state compact">
      <div className="empty-art" aria-hidden="true"><span /><span /><span /></div>
      <h2>{error ? 'Couldn’t load servers' : 'Nothing here yet'}</h2>
      <p>{error || text}</p>
    </div>
  );
}

function CardGrid({ guilds, onOpen }: { guilds: DiscoverableGuild[]; onOpen: (g: DiscoverableGuild) => void }) {
  return <div className="discover-grid">{guilds.map((g, i) => <ServerCard key={g.id} guild={g} index={i} onOpen={() => onOpen(g)} />)}</div>;
}

/** Placeholder cards with a shimmer while a page loads. */
function SkeletonGrid() {
  return (
    <div className="discover-grid" aria-busy="true" aria-label="Loading servers">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="discover-card discover-skeleton" style={{ '--i': i } as CSSProperties} aria-hidden="true">
          <div className="discover-banner" />
          <div className="discover-card-body"><i /><i /><i /></div>
        </div>
      ))}
    </div>
  );
}

/** Image banner, else the server's colour, else its category tint. */
export function DiscoverBanner({ guild }: { guild: Pick<DiscoverableGuild, 'banner' | 'banner_color' | 'category'> }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={'discover-banner cat-' + (guild.category ?? 'other')} style={guild.banner_color ? { '--banner': guild.banner_color } as CSSProperties : undefined}>
      {guild.banner && !broken && <img src={guild.banner} alt="" loading="lazy" draggable={false} onError={() => setBroken(true)} />}
    </div>
  );
}

function Counts({ guild }: { guild: Pick<DiscoverableGuild, 'online_count' | 'member_count'> }) {
  return (
    <div className="discover-counts">
      {guild.online_count > 0 && <span><span className="online-dot" />{guild.online_count.toLocaleString()} online</span>}
      <span><span className="members-dot" />{pluralize(guild.member_count, 'member')}</span>
    </div>
  );
}

function Verified() {
  return <span className="discover-verified" title="Verified" aria-label="Verified"><IconVerified size={16} /></span>;
}

/** Card markup, shared with the Server Settings → Discovery preview. */
export function ServerCardView({ guild, joined, preview }: { guild: DiscoverableGuild; joined?: boolean; preview?: boolean }) {
  return (
    <>
      <DiscoverBanner guild={guild} />
      {!preview && <span className="discover-card-expand" aria-hidden="true"><IconExpand size={14} /></span>}
      <GuildIcon guild={guild} size={40} className="discover-card-icon" />
      <div className="discover-card-body">
        <div className="discover-card-name">
          {guild.verified && <Verified />}
          <strong className="truncate">{guild.name}</strong>
          {joined && <span className="chip static tiny">Joined</span>}
        </div>
        <p className="discover-card-desc">{guild.description}</p>
        <Counts guild={guild} />
      </div>
    </>
  );
}

function ServerCard({ guild, index, onOpen }: { guild: DiscoverableGuild; index: number; onOpen: () => void }) {
  const joined = useGuildStore((s) => !!s.guilds[guild.id]);
  return (
    <button className="discover-card" style={{ '--i': index } as CSSProperties} onClick={onOpen} aria-label={`${guild.name}: open preview`}>
      <ServerCardView guild={guild} joined={joined} />
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
      <DiscoverBanner guild={guild} />
      <GuildIcon guild={guild} size={72} className="discover-preview-icon" />
      <h2 className="discover-preview-name">{guild.verified && <Verified />}{guild.name}</h2>
      <Counts guild={guild} />
      {guild.description && <p className="discover-preview-desc">{guild.description}</p>}
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

// ---------------- Apps: what you can already do together (all built in, nothing to install) ----------------
const ACTIVITIES = [
  { icon: IconScreen, title: 'Watch parties', text: 'Share your screen with sound in any voice channel and watch or play along together.', how: 'In a voice channel → screen share button' },
  { icon: IconSpeaker, title: 'Voice rooms', text: 'Drop-in voice channels for hanging out, studying side by side or running a game night.', how: 'Click any voice channel to join' },
  { icon: IconVideo, title: 'Video calls', text: 'Turn your camera on in a voice channel, or start a call straight from a direct message.', how: 'Voice channel camera, or a DM’s video call button' },
  { icon: IconMessage, title: 'Group chats', text: 'Group DMs for up to ten friends, with replies, pins, reactions and file sharing.', how: 'Direct Messages → + → pick friends' },
  { icon: IconSmile, title: 'Custom emoji', text: 'Upload your server’s own emoji and use them in messages and reactions.', how: 'Server Settings → Emoji' },
  { icon: IconUsers, title: 'Server templates', text: 'Start a gaming, study, club or creators server with channels already laid out.', how: 'Add a Server → pick a template' },
];

function AppsPage() {
  return (
    <div className="discover cat-home">
      <header className="chat-header discover-topbar">
        <MenuButton />
        <div className="chat-header-title"><IconApps size={22} className="header-icon" /><span className="header-name">Apps</span></div>
      </header>
      <div className="discover-scroll scroll-thin">
        <Hero title="Do more together" sub="Everything here is built into Huddle: no installs, no add-ons, nothing to sign up for." />
        <SectionTitle>Things to do together</SectionTitle>
        <div className="discover-grid">
          {ACTIVITIES.map(({ icon: Icon, title, text, how }, i) => (
            <div key={title} className="discover-activity" style={{ '--i': i } as CSSProperties}>
              <span className="discover-activity-icon"><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="discover-activity-how">{how}</span>
            </div>
          ))}
        </div>
        <div className="discover-apps-note">
          <p>Third-party apps and bots aren’t available on Huddle yet. Want a place to try these out?</p>
          <button className="btn btn-primary" onClick={() => openModal('createServer')}>Create a Server</button>
        </div>
      </div>
    </div>
  );
}
