import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconBell, IconClose, IconLink, IconSearch, IconShield, IconSpeaker, IconUsers, IconSettings } from '../components/common/icons';
import { Accordion, Reveal, useTitle } from './common';
import { Blobs } from './art';

type Cat = 'start' | 'servers' | 'roles' | 'voice' | 'notifications' | 'account';

const CATS: { id: Cat; name: string; desc: string; icon: ReactNode; tone: string }[] = [
  { id: 'start', name: 'Getting started', desc: 'Accounts, your first server, finding your way around.', icon: <IconSettings size={22} />, tone: 'teal' },
  { id: 'servers', name: 'Servers & invites', desc: 'Channels, categories and bringing people in.', icon: <IconLink size={22} />, tone: 'coral' },
  { id: 'roles', name: 'Roles & permissions', desc: 'Who can see, post, speak and moderate.', icon: <IconShield size={22} />, tone: 'amber' },
  { id: 'voice', name: 'Voice & video', desc: 'Calls, cameras, screen sharing and devices.', icon: <IconSpeaker size={22} />, tone: 'violet' },
  { id: 'notifications', name: 'Notifications', desc: 'Mentions, muting and keeping things calm.', icon: <IconBell size={22} />, tone: 'sky' },
  { id: 'account', name: 'Friends & account', desc: 'Profiles, friends, DMs and blocking.', icon: <IconUsers size={22} />, tone: 'lime' },
];

interface Article { cat: Cat; q: string; text: string; a: ReactNode }

const ARTICLES: Article[] = [
  { cat: 'start', q: 'How do I create an account?', text: 'register sign up email username password',
    a: <p>Head to <Link to="/register">Create an account</Link>, enter your email, pick a username (letters, numbers, underscores and periods) and a password. You’ll land straight in your Friends home, ready to join or create a server.</p> },
  { cat: 'start', q: 'How do I create a server?', text: 'new server create add plus rail name',
    a: <ol><li>Click the <b>+</b> button at the bottom of the server list on the left.</li><li>Choose to create a new server and give it a name — you can change it later.</li><li>Your server starts with a text and a voice channel. Add more from the <b>+</b> next to any category.</li></ol> },
  { cat: 'start', q: 'Is there a quick way to jump between channels?', text: 'quick switcher keyboard shortcut ctrl k cmd k search',
    a: <p>Press <kbd>Ctrl</kbd> + <kbd>K</kbd> (or <kbd>⌘</kbd> + <kbd>K</kbd> on a Mac) to open the quick switcher. Start with <kbd>#</kbd> for channels, <kbd>@</kbd> for people or <kbd>*</kbd> for servers, then press Enter.</p> },
  { cat: 'servers', q: 'How do I invite people to my server?', text: 'invite link share friends expire uses',
    a: <><p>Open the server menu (click the server name) and choose <b>Invite People</b>. Copy the link and share it anywhere.</p><p>Under the link you can set it to expire after 30 minutes, an hour, a day, seven days or never, and cap how many times it can be used. Anyone opening the link sees a preview of the server and can join in one click.</p></> },
  { cat: 'servers', q: 'How do I organise channels into categories?', text: 'category categories channels organise reorder private',
    a: <p>Use <b>Create Category</b> from the server menu, then create channels inside it. Categories can be made private, and channels inside them inherit those permissions unless you change them.</p> },
  { cat: 'servers', q: 'Can I pin important messages?', text: 'pin pins pinned messages',
    a: <p>Yes. Hover a message, open the <b>More</b> menu and choose <b>Pin Message</b>. Everyone can find pinned messages from the pin icon in the channel header.</p> },
  { cat: 'roles', q: 'What are roles and how do I create one?', text: 'roles create role colour permissions hoist mentionable',
    a: <><p>Roles bundle permissions and a colour. Open <b>Server Settings → Roles</b>, click <b>Add Role</b>, name it and pick a colour. You can display members with the role separately in the member list and allow anyone to @mention it.</p><p>Assign roles from a member’s profile or from the Members page in Server Settings.</p></> },
  { cat: 'roles', q: 'How do channel permission overrides work?', text: 'override overrides channel permissions allow deny inherit',
    a: <p>In a channel’s settings, open <b>Permissions</b> and add a role or member. Each permission can be set to <b>Allow</b>, <b>Deny</b> or <b>Inherit</b> (use the server-wide role setting). Member-specific overrides win over role overrides.</p> },
  { cat: 'roles', q: 'How do I moderate someone?', text: 'moderate timeout kick ban member reason',
    a: <p>Right-click a member (or open their profile menu) and choose <b>Timeout</b>, <b>Kick</b> or <b>Ban</b>. You need the matching permission, and your highest role must sit above theirs. Bans can include a reason that moderators can review later.</p> },
  { cat: 'voice', q: 'How do I join a voice channel?', text: 'voice join channel talk speaker microphone',
    a: <p>Click any voice channel in the channel list — that’s it. Your browser will ask for microphone access the first time. Use the controls at the bottom of the sidebar to mute, deafen or disconnect.</p> },
  { cat: 'voice', q: 'Can I share my screen or turn on my camera?', text: 'screen share video camera webcam',
    a: <p>Yes. While in a call, use the camera and screen-share buttons in the call controls. Screen sharing is available in desktop browsers; your browser will ask which window or screen to share.</p> },
  { cat: 'voice', q: 'My microphone isn’t working. What should I check?', text: 'microphone not working audio input device permission',
    a: <ul><li>Make sure the browser has permission to use your microphone (look for the icon in the address bar).</li><li>Pick the right input device in <b>User Settings → Voice &amp; Video</b> and watch the input level meter while you talk.</li><li>Check you aren’t muted — the microphone icon in the sidebar will be crossed out if you are.</li></ul> },
  { cat: 'notifications', q: 'How do I control notifications for a server?', text: 'notifications mute server mentions everyone here suppress',
    a: <p>Right-click the server icon (or open the server menu) and choose <b>Notification Settings</b>. Pick all messages, only @mentions, or nothing — and optionally suppress @everyone and @here, or mute the server entirely.</p> },
  { cat: 'notifications', q: 'How do I turn on desktop notifications?', text: 'desktop notifications sounds browser permission',
    a: <p>Go to <b>User Settings → Notifications</b> and switch on desktop notifications. Your browser will ask for permission once. You can turn notification sounds on or off on the same page.</p> },
  { cat: 'account', q: 'How do I add a friend?', text: 'friend add friend request username',
    a: <p>Open your Friends home (the Huddle logo at the top of the server list), choose <b>Add Friend</b> and type their username. They’ll see your request under <b>Pending</b>.</p> },
  { cat: 'account', q: 'How do I change my profile or status?', text: 'profile avatar display name bio status online idle do not disturb invisible',
    a: <p>Click your avatar in the bottom-left corner to set your status (Online, Idle, Do Not Disturb or Invisible) or a custom status. Edit your display name, avatar and About Me in <b>User Settings → Profile</b>.</p> },
  { cat: 'account', q: 'How do I block someone?', text: 'block blocked user harassment unblock',
    a: <p>Open their profile menu and choose <b>Block</b>. Blocked people can’t send you friend requests or direct messages. Manage the list from the <b>Blocked</b> tab in Friends. See the <Link to="/safety#controls">Safety centre</Link> for more.</p> },
];

export default function SupportPage() {
  useTitle('Support centre — Huddle');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Cat | null>(null);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return ARTICLES.filter((a) => {
      if (cat && a.cat !== cat) return false;
      if (!words.length) return true;
      const hay = `${a.q} ${a.text}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [query, cat]);

  const activeCat = CATS.find((c) => c.id === cat);

  return (
    <>
      <section className="lp-pagehero lp-support-hero">
        <Blobs variant="b" />
        <div className="lp-wrap lp-center">
          <Reveal><span className="lp-eyebrow">Support centre</span></Reveal>
          <Reveal delay={80}><h1 className="lp-h1">How can we help?</h1></Reveal>
          <Reveal delay={160}>
            <form className="lp-search" role="search" onSubmit={(e) => { e.preventDefault(); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' }); }}>
              <IconSearch size={20} />
              <label htmlFor="lp-help-q" className="lp-sr">Search help articles</label>
              <input id="lp-help-q" type="search" placeholder="Search for invites, roles, voice…" value={query} onChange={(e) => { setQuery(e.target.value); setCat(null); }} autoComplete="off" />
              {query && <button type="button" className="lp-search-clear" aria-label="Clear search" onClick={() => setQuery('')}><IconClose size={16} /></button>}
            </form>
          </Reveal>
          <Reveal delay={220}>
            <p className="lp-search-hint">Popular: {['invite', 'roles', 'screen share', 'notifications'].map((t, i) => (
              <span key={t}>{i > 0 && ' · '}<button type="button" className="lp-linkbtn" onClick={() => { setQuery(t); setCat(null); }}>{t}</button></span>
            ))}</p>
          </Reveal>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="cats-h">
        <div className="lp-wrap">
          <h2 id="cats-h" className="lp-sr">Browse by topic</h2>
          <div className="lp-card-grid three">
            {CATS.map((c, i) => {
              const count = ARTICLES.filter((a) => a.cat === c.id).length;
              return (
                <Reveal key={c.id} delay={(i % 3) * 70}>
                  <button type="button" className={`lp-card lp-cat tone-${c.tone}${cat === c.id ? ' active' : ''}`} aria-pressed={cat === c.id}
                    onClick={() => { setCat(cat === c.id ? null : c.id); setQuery(''); document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                    <span className={`lp-cat-ic bg-soft-${c.tone}`}>{c.icon}</span>
                    <span className="lp-cat-t"><b>{c.name}</b><span>{c.desc}</span><small>{count} articles</small></span>
                  </button>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="lp-section lp-section-alt" id="faq" aria-labelledby="faq-h">
        <div className="lp-wrap lp-faq-wrap">
          <div className="lp-faq-head">
            <h2 id="faq-h" className="lp-h2">{activeCat ? activeCat.name : query ? 'Search results' : 'Popular articles'}</h2>
            <p className="lp-results" aria-live="polite">
              {results.length} {results.length === 1 ? 'article' : 'articles'}{query && <> for “{query}”</>}
              {(cat || query) && <button type="button" className="lp-linkbtn" onClick={() => { setCat(null); setQuery(''); }}>Show all</button>}
            </p>
          </div>
          {results.length
            ? <Accordion key={`${cat}|${query}`} items={results} />
            : (
              <div className="lp-empty">
                <b>No articles match that just yet.</b>
                <p>Try a shorter word, browse a topic above, or get in touch below.</p>
              </div>
            )}
        </div>
      </section>

      <section className="lp-section" id="contact" aria-labelledby="contact-h">
        <div className="lp-wrap">
          <Reveal className="lp-card lp-contact">
            <div>
              <h2 id="contact-h" className="lp-h3">Still stuck?</h2>
              <p className="lp-body">Our small team reads every message. Tell us what you were trying to do, what happened instead, and which browser you’re using — screenshots help a lot.</p>
            </div>
            <div className="lp-contact-actions">
              <Link to="/safety" className="lp-btn lp-btn-ghost">Safety centre</Link>
              <Link to="/blog" className="lp-btn lp-btn-primary">Product updates</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
