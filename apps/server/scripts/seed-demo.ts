// Fills Discover with ~24 fictional public communities and ~40 demo members, through the real API (in-process, no network).
// Local/demo use only — never part of the base seed. Idempotent: existing demo users are reused and communities that
// already exist (by name) are skipped. Safe while `npm run dev` is up: SQLite runs in WAL mode with a busy timeout.
// Usage: npm run seed:demo -w @huddle/server   (respects HUDDLE_DB / HUDDLE_UPLOADS)
import crypto from 'node:crypto';
import type { GuildCategory, GuildTemplateId } from '@huddle/shared';
import { buildApp } from '../src/app';
import { issueToken } from '../src/services/accounts';
import { bannerPng, iconPng, rng, type Glyph, type Motif } from './demo-art';

const BIG = { capacity: 1_000_000, windowMs: 1000 };
// Demo accounts start verified (requireEmailVerification: false).
const app = await buildApp({
  rateLimits: { messages: BIG, writes: BIG, auth: BIG, codesPerEmail: BIG, codesPerIp: BIG, codesPerUser: BIG },
  requireEmailVerification: false,
});
const ctx = app.huddle;

async function call<T = any>(token: string | null, method: string, url: string, payload?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await app.inject({
    method: method as any,
    url: '/api' + url,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(payload !== undefined ? { payload: payload as any } : {}),
  });
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return (res.body ? JSON.parse(res.body) : undefined) as T;
}

/** POSTs one file as multipart/form-data (field "file"). */
function upload<T = any>(token: string, url: string, filename: string, data: Buffer): Promise<T> {
  const boundary = '----huddle-demo-' + crypto.randomBytes(8).toString('hex');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return call<T>(token, 'POST', url, body, { 'content-type': `multipart/form-data; boundary=${boundary}` });
}

// ---------- demo people (original names) ----------
const PEOPLE: [username: string, display: string][] = [
  ['juniper_vale', 'Juniper'], ['theo_marsh', 'Theo'], ['wren_okafor', 'Wren'], ['milo_quill', 'Milo'], ['saffi_reyes', 'Saffi'],
  ['oskar_lind', 'Oskar'], ['priya_lantern', 'Priya'], ['bram_holloway', 'Bram'], ['ines_cove', 'Inés'], ['kofi_tern', 'Kofi'],
  ['luna_parrish', 'Luna'], ['dex_marlowe', 'Dex'], ['hana_birch', 'Hana'], ['rafa_solano', 'Rafa'], ['clem_ashby', 'Clem'],
  ['noor_haddad', 'Noor'], ['felix_rowan', 'Felix'], ['ada_kestrel', 'Ada'], ['ezra_pike', 'Ezra'], ['mei_tanaka', 'Mei'],
  ['otto_fenwick', 'Otto'], ['tamsin_reed', 'Tamsin'], ['yusuf_dale', 'Yusuf'], ['lotte_brink', 'Lotte'], ['caspian_wilde', 'Caspian'],
  ['zara_moss', 'Zara'], ['nico_ferro', 'Nico'], ['elsie_thorn', 'Elsie'], ['amara_cole', 'Amara'], ['jude_harrow', 'Jude'],
  ['sol_navarro', 'Sol'], ['petra_vos', 'Petra'], ['rhys_calder', 'Rhys'], ['kaia_brook', 'Kaia'], ['hugo_lark', 'Hugo'],
  ['nell_sparrow', 'Nell'], ['arlo_finch', 'Arlo'], ['ivy_castell', 'Ivy'], ['tobi_adeyemi', 'Tobi'], ['maren_holt', 'Maren'],
];

// ---------- communities ----------
interface Community {
  name: string; category: GuildCategory; template: GuildTemplateId; description: string;
  colors: [string, string, string]; motif: Motif; glyph: Glyph;
  /** Rough share of the demo people who join (0..1). */
  reach: number;
  verified?: boolean;
  chat: string[];
}

const COMMUNITIES: Community[] = [
  // gaming
  { name: 'Pixel Lantern Co-op', category: 'gaming', template: 'gaming', reach: 0.8, verified: true, colors: ['#4c1d95', '#7c3aed', '#c4b5fd'], motif: 'dots', glyph: 'diamond',
    description: 'Friendly co-op nights for every skill level. We pick a game each week and nobody gets left behind.',
    chat: ['Who’s in for co-op tonight? Thinking 8pm.', 'Count me in, I finally fixed my headset.', 'Same! Can we try the harder difficulty this time?', 'Only if someone promises to carry me 😅'] },
  { name: 'Tabletop Tavern', category: 'gaming', template: 'friends', reach: 0.55, colors: ['#78350f', '#b45309', '#fde68a'], motif: 'rings', glyph: 'triangle',
    description: 'Board games, card games and dice-rolling campaigns. Find a table, run a one-shot, share your house rules.',
    chat: ['New one-shot this Saturday: haunted lighthouse mystery. Four seats left!', 'Ooh, I’ll take one. First time playing a rogue.', 'Bring snacks, the last session ran four hours 🎲'] },
  { name: 'Speedrun Sprouts', category: 'gaming', template: 'gaming', reach: 0.3, colors: ['#14532d', '#16a34a', '#bbf7d0'], motif: 'stripes', glyph: 'plus',
    description: 'A gentle place to learn speedrunning: route help, practice tips and cheering for every personal best.',
    chat: ['Got my first sub-30 run last night!!', 'Huge! What changed?', 'Practised the tricky jump 200 times. Worth it.', 'Post the split in #clips, we want to see it'] },
  // music
  { name: 'Lo-Fi Lighthouse', category: 'music', template: 'creators', reach: 0.7, verified: true, colors: ['#1e3a8a', '#db2777', '#fbcfe8'], motif: 'waves', glyph: 'wave',
    description: 'Producers and listeners making slow, cosy beats. Weekly sample flips, feedback threads and listening parties.',
    chat: ['This week’s sample flip pack is up in #updates 🎧', 'The rain loop in there is so good', 'Mine is going to be all vinyl crackle, no shame', 'Listening party Friday, bring your flips!'] },
  { name: 'Bedroom Choir', category: 'music', template: 'creators', reach: 0.35, colors: ['#831843', '#ec4899', '#fce7f3'], motif: 'bubbles', glyph: 'circle',
    description: 'Singers recording at home. Swap harmony parts, learn mic tricks and build virtual choir songs together.',
    chat: ['Alto part for the autumn song is posted!', 'Can someone share their pop filter setup?', 'A sock over the mic works in a pinch, honestly'] },
  { name: 'Vinyl Basement', category: 'music', template: 'friends', reach: 0.25, colors: ['#111827', '#374151', '#f59e0b'], motif: 'rings', glyph: 'ring',
    description: 'Record collectors trading finds, cleaning tips and turntable setups. Every genre, no snobbery.',
    chat: ['Found a jazz record at a car boot sale for 50p today.', 'Crazy find. What condition?', 'A few pops, which honestly adds character'] },
  // entertainment
  { name: 'Midnight Matinee', category: 'entertainment', template: 'club', reach: 0.6, verified: true, colors: ['#0f172a', '#7f1d1d', '#fca5a5'], motif: 'stripes', glyph: 'square',
    description: 'A film club with a weekly watch-along. Classics, oddities and hidden gems, with spoiler-tagged chat.',
    chat: ['This week’s pick: a 1950s monster movie. Watch-along Sunday!', 'The cardboard sets are half the fun', 'I’ll make popcorn and pretend it’s a drive-in 🍿'] },
  { name: 'Plot Twist Book Club', category: 'entertainment', template: 'club', reach: 0.45, colors: ['#3f6212', '#65a30d', '#ecfccb'], motif: 'peaks', glyph: 'bars',
    description: 'One book a month, spoiler-free channels by chapter, and a cosy video chat at the end of each read.',
    chat: ['Chapter 12 thread is open. Was anyone else shocked?', 'I did NOT see that coming', 'Next month’s vote is live in #events 📚'] },
  { name: 'Sunday Cartoon Club', category: 'entertainment', template: 'friends', reach: 0.3, colors: ['#c2410c', '#f97316', '#fed7aa'], motif: 'bubbles', glyph: 'moon',
    description: 'Fans of animation old and new. Rewatch threads, fan theories and a weekly breakfast cartoon hangout.',
    chat: ['Rewatching the first season from the start, who’s with me?', 'Always. The theme song still slaps', 'Cereal at the ready 🥣'] },
  // science & tech
  { name: 'Breadboard Labs', category: 'science_tech', template: 'creators', reach: 0.6, verified: true, colors: ['#064e3b', '#0d9488', '#99f6e4'], motif: 'dots', glyph: 'plus',
    description: 'Electronics tinkering for beginners and veterans. Show your circuits, debug together, share parts lists.',
    chat: ['My LED matrix finally works, after I plugged it in the right way round 😂', 'Classic. Post a photo in #show-your-work!', 'What resistor values did you end up using?'] },
  { name: 'Night Sky Watchers', category: 'science_tech', template: 'study', reach: 0.45, colors: ['#020617', '#1e3a8a', '#e0e7ff'], motif: 'dots', glyph: 'moon',
    description: 'Amateur astronomers sharing observing logs, beginner telescope advice and clear-sky alerts.',
    chat: ['Clear skies tonight. Saturn is lovely after 10pm', 'Got the rings in my little scope last week!', 'Remember to let your eyes adjust for 20 minutes 🔭'] },
  { name: 'Rubber Duck Debuggers', category: 'science_tech', template: 'study', reach: 0.7, colors: ['#1e293b', '#ca8a04', '#fef08a'], motif: 'stripes', glyph: 'square',
    description: 'Explain your bug out loud and someone (or the duck) will help. All languages, all levels, no question too small.',
    chat: ['Why does my loop run one extra time?', 'Paste the code? Probably a <= that should be <', 'It was the <=. Thank you, duck 🦆'] },
  // education
  { name: 'Polyglot Porch', category: 'education', template: 'study', reach: 0.65, verified: true, colors: ['#155e75', '#06b6d4', '#cffafe'], motif: 'bubbles', glyph: 'ring',
    description: 'Language exchange with daily prompts and voice practice rooms. Trade an hour of yours for an hour of theirs.',
    chat: ['Today’s prompt: describe your breakfast in the language you’re learning', 'Tostadas con tomate y café ☕', 'Very good! Small tip: “un café” sounds more natural here'] },
  { name: 'Calculus Café', category: 'education', template: 'study', reach: 0.35, colors: ['#3730a3', '#6366f1', '#e0e7ff'], motif: 'waves', glyph: 'wave',
    description: 'Maths help from limits to multivariable. Post a question, get hints rather than answers, celebrate the click.',
    chat: ['Can someone explain the chain rule like I’m five?', 'Think of it as gears turning other gears', 'Ohhh, that actually helps'] },
  { name: 'Time Travelers’ Study Hall', category: 'education', template: 'study', reach: 0.3, colors: ['#713f12', '#a16207', '#fef3c7'], motif: 'peaks', glyph: 'triangle',
    description: 'History students and enthusiasts. Essay feedback, primary-source deep dives and quiet focus sessions.',
    chat: ['Focus session at 7: 50 minutes on, 10 off', 'Joining, I have an essay on trade routes due', 'Good luck! Share your sources list after'] },
  // community
  { name: 'Green Thumb Collective', category: 'community', template: 'local', reach: 0.55, colors: ['#14532d', '#22c55e', '#dcfce7'], motif: 'peaks', glyph: 'drop',
    description: 'Gardeners of balconies, allotments and windowsills. Seed swaps, plant rescues and harvest show-and-tell.',
    chat: ['My tomatoes are finally turning red 🍅', 'Jealous! Mine are still very green', 'Seed swap thread is open for next spring'] },
  { name: 'The Quiet Corner', category: 'community', template: 'friends', reach: 0.5, colors: ['#334155', '#64748b', '#e2e8f0'], motif: 'waves', glyph: 'circle',
    description: 'A calm, low-pressure hangout for introverts. No pressure to talk; lurking is welcome and so are cat photos.',
    chat: ['Just here with my tea, saying hi quietly 👋', 'Hi! Same, with a blanket', 'This is the comfiest server'] },
  { name: 'Maple Street Neighbours', category: 'community', template: 'local', reach: 0.2, colors: ['#7c2d12', '#ea580c', '#ffedd5'], motif: 'stripes', glyph: 'diamond',
    description: 'A made-up neighbourhood noticeboard: street-party planning, lost cats and a very serious bin-day schedule.',
    chat: ['Reminder: bins go out Thursday night!', 'Has anyone seen a ginger cat with one white sock?', 'He’s on my porch eating ham, come get him 🐈'] },
  // art & creators
  { name: 'Ink & Coffee', category: 'art', template: 'creators', reach: 0.6, verified: true, colors: ['#292524', '#78716c', '#fafaf9'], motif: 'rings', glyph: 'drop',
    description: 'Daily sketch prompts and kind critique. Pencils, pens and tablets all welcome, as is coffee.',
    chat: ['Today’s prompt: “a teapot with a secret”', 'Mine has a tiny dragon living in it ☕🐉', 'Love it! Posting mine after lunch'] },
  { name: 'Clay Day', category: 'art', template: 'creators', reach: 0.3, colors: ['#9a3412', '#d97706', '#fef3c7'], motif: 'bubbles', glyph: 'circle',
    description: 'Pottery and sculpting at home or in the studio. Glaze results, wobbly first bowls and kiln-day nerves.',
    chat: ['First bowl out of the kiln and it only leans a little', 'Leaning bowls have character', 'Glaze colour turned out amazing though!'] },
  { name: 'Pocket Pixel Art', category: 'art', template: 'creators', reach: 0.45, colors: ['#4a044e', '#c026d3', '#f5d0fe'], motif: 'dots', glyph: 'square',
    description: 'Tiny canvases, big ideas. 32×32 challenges, palette swaps and animation tips for pixel artists.',
    chat: ['This week’s challenge: a 16-colour sunset', 'Dithering the sky is so satisfying', 'Show the animated version too!'] },
  // other
  { name: 'Sourdough Society', category: 'other', template: 'friends', reach: 0.4, colors: ['#78350f', '#d6a65a', '#fffbeb'], motif: 'bubbles', glyph: 'circle',
    description: 'Starter care, crumb shots and bake-day troubleshooting. Name your starter; we insist.',
    chat: ['Meet Bubbles, my new starter 🍞', 'Feed her twice a day and she’ll be ready in a week', 'Crumb shot from this morning in #photo-dump!'] },
  { name: 'Trail Mix Hikers', category: 'other', template: 'club', reach: 0.35, colors: ['#1c1917', '#15803d', '#bbf7d0'], motif: 'peaks', glyph: 'triangle',
    description: 'Weekend walkers and long-distance dreamers. Route ideas, gear swaps and photos from the top.',
    chat: ['Sunrise hike Saturday, meeting at 6', 'Bringing the good flask', 'Forecast says clear skies ⛰️'] },
  { name: 'Cat Tax Collectors', category: 'other', template: 'friends', reach: 0.75, colors: ['#be123c', '#fb7185', '#ffe4e6'], motif: 'dots', glyph: 'moon',
    description: 'Pet photos are the price of entry. Cats, dogs, rabbits, snails: all creatures welcome, all taxes accepted.',
    chat: ['Paying my tax: here is Biscuit asleep in a box', 'The box is too small and she does not care', 'Ten out of ten tax payment'] },
];

interface Person { id: string; token: string }

/** Registers a demo user, or reuses the existing account (minting a token in-process; the password is never needed). */
async function person(username: string, display: string): Promise<Person> {
  const existing = ctx.db.one<{ id: string; token_version: number }>('SELECT id, token_version FROM users WHERE username = ?', username);
  if (existing) return { id: existing.id, token: await issueToken(ctx, existing) };
  const r = await call<{ token: string; user: { id: string } }>(null, 'POST', '/auth/register', {
    email: `${username}@demo.huddle.test`, username, display_name: display,
    password: crypto.randomBytes(24).toString('base64url'), // unguessable and never shown: demo accounts aren't for logging in
  });
  return { id: r.user.id, token: r.token };
}

try {
  const people: Person[] = [];
  for (const [u, d] of PEOPLE) people.push(await person(u, d));
  console.log(`[seed:demo] ${people.length} demo members ready`);

  let created = 0, skipped = 0;
  for (const [i, c] of COMMUNITIES.entries()) {
    if (ctx.db.one('SELECT id FROM guilds WHERE name = ?', c.name)) { skipped++; continue; }
    const r = rng(c.name);
    // owner + a varied crowd: shuffle everyone else and take this community's share of them
    const owner = people[i % people.length];
    const others = people.filter((p) => p !== owner).map((p) => ({ p, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.p);
    const crowd = others.slice(0, Math.max(3, Math.round(others.length * c.reach * (0.8 + r() * 0.4))));

    const g = await call<any>(owner.token, 'POST', '/guilds', { name: c.name, template: c.template });
    await upload(owner.token, `/guilds/${g.id}/icon`, 'icon.png', iconPng(c.colors, c.glyph));
    await upload(owner.token, `/guilds/${g.id}/banner`, 'banner.png', bannerPng(c.name, c.colors, c.motif));
    await call(owner.token, 'PATCH', `/guilds/${g.id}`, {
      description: c.description, category: c.category, banner_color: c.colors[1], discoverable: true,
    });
    if (c.verified) ctx.db.run('UPDATE guilds SET verified = 1 WHERE id = ?', g.id); // no API for this on purpose
    for (const p of crowd) await call(p.token, 'POST', `/discovery/${g.id}/join`);

    // a little conversation in the main chat channel
    const main = g.channels.find((ch: any) => ch.type === 0 && (ch.name === 'general' || ch.name === 'chat'))
      ?? g.channels.find((ch: any) => ch.id === g.system_channel_id);
    const speakers = [owner, ...crowd];
    for (const [j, content] of c.chat.entries()) {
      await call(speakers[j % speakers.length].token, 'POST', `/channels/${main.id}/messages`, { content });
    }
    created++;
    console.log(`[seed:demo] ${c.name} (${c.category}) — ${crowd.length + 1} members${c.verified ? ', verified' : ''}`);
  }
  console.log(`[seed:demo] done: ${created} communities created, ${skipped} already existed`);
} finally {
  await app.close();
}
