export type Block =
  | { t: 'p'; text: string }
  | { t: 'h2'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'quote'; text: string };

export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO
  tag: 'Company' | 'Design' | 'Guides' | 'Product';
  minutes: number;
  author: string;
  cover: [string, string, string];
  shape: 'rings' | 'bubbles' | 'stack' | 'wave';
  body: Block[];
}

export const POSTS: Post[] = [
  {
    slug: 'why-we-built-huddle',
    title: 'Why we built Huddle',
    excerpt: 'Group chats got crowded and calls got formal. We wanted a place that feels like the back room of your favourite café.',
    date: '2026-09-12', tag: 'Company', minutes: 3, author: 'The Huddle team',
    cover: ['#14b8a6', '#0f3b5f', '#fb7185'], shape: 'bubbles',
    body: [
      { t: 'p', text: 'Most of us belong to more groups than ever — a five-a-side team, a cousin chat, a reading circle, a project that might become a company one day. Yet the places those groups live online tend to fall into two camps: endless message threads where plans get buried, or scheduled video calls that feel like work even when they aren’t.' },
      { t: 'p', text: 'Huddle is our attempt at something in between. A server is your group’s place. Channels give conversations a home, so the recipe swap doesn’t trample the trip planning. Voice rooms stay open, so you can wander in the way you’d wander into a kitchen where friends are already chatting.' },
      { t: 'h2', text: 'Three things we care about' },
      { t: 'ul', items: [
        'Presence over pressure. Seeing who’s around should invite you in, never guilt you into replying.',
        'Structure that bends. Roles and channels should match the way your group already works — not the other way round.',
        'Quiet by default. Notifications are a privilege an app earns, so you decide exactly what can interrupt you.',
      ] },
      { t: 'p', text: 'Huddle runs in your browser today, and we’re building it in the open, one release at a time. If you have ideas, we’re all ears.' },
    ],
  },
  {
    slug: 'designing-the-speaking-ring',
    title: 'Designing the speaking ring',
    excerpt: 'A glowing outline seems simple. Getting it to feel calm, readable and fair in a ten-person call took a few tries.',
    date: '2026-09-28', tag: 'Design', minutes: 4, author: 'Design team',
    cover: ['#2dd4bf', '#1e1b4b', '#f59e0b'], shape: 'rings',
    body: [
      { t: 'p', text: 'When several people share a voice room, the most important question is also the simplest: who is talking right now? Our answer is the speaking ring — a soft teal outline that wraps someone’s avatar while their voice is coming through.' },
      { t: 'h2', text: 'What we tried first' },
      { t: 'p', text: 'Our first version pulsed in time with the speaker’s volume. It looked lively in a demo with one person, and like a disco in a room of eight. A flickering ring also made quieter voices look less important, which isn’t a message we ever want to send.' },
      { t: 'h2', text: 'Where we landed' },
      { t: 'ul', items: [
        'The ring fades in quickly and fades out a beat later, so short pauses between words don’t make it flicker.',
        'Its brightness doesn’t depend on loudness — a whisper and a shout get the same ring.',
        'It pairs with the mute icon, so you can always tell “quiet” from “muted” at a glance.',
      ] },
      { t: 'quote', text: 'Good motion in a call should help you follow the conversation, then get out of the way.' },
      { t: 'p', text: 'And if you’ve asked your device to reduce motion, the ring becomes a steady outline with no animation at all.' },
    ],
  },
  {
    slug: 'roles-explained-with-a-picnic',
    title: 'Roles, explained with a picnic',
    excerpt: 'Permissions sound intimidating. Imagine planning a big picnic instead — suddenly it all makes sense.',
    date: '2026-10-09', tag: 'Guides', minutes: 3, author: 'Community team',
    cover: ['#f59e0b', '#3b0f2a', '#2dd4bf'], shape: 'stack',
    body: [
      { t: 'p', text: 'Picture a picnic for sixty people. A couple of organisers hold the plan. A handful of helpers keep things running. Everyone else just wants to find the snacks and a good spot on the grass. A Huddle server works the same way.' },
      { t: 'h2', text: 'Start with three roles' },
      { t: 'ul', items: [
        'Organisers can change the server itself — channels, roles and settings.',
        'Helpers (moderators) can pin messages, time people out and keep conversations kind.',
        'Everyone else gets the default @everyone permissions: read, chat, react and join voice.',
      ] },
      { t: 'h2', text: 'Then use channel overrides for the exceptions' },
      { t: 'p', text: 'Want a #planning channel only organisers can see? Make it private and add the Organisers role. Want #announcements where only helpers can post? Deny “Send Messages” for @everyone in that one channel, and allow it for Helpers. The rest of the server stays exactly as it was.' },
      { t: 'p', text: 'That’s it: broad roles for the common case, overrides for the special ones. Your picnic — and your server — will run itself.' },
    ],
  },
  {
    slug: 'notifications-that-know-their-place',
    title: 'Notifications that know their place',
    excerpt: 'A busy community shouldn’t mean a buzzing phone. Here’s how to tune Huddle so only the right things reach you.',
    date: '2026-10-21', tag: 'Product', minutes: 2, author: 'Product team',
    cover: ['#fb7185', '#0b1530', '#8b5cf6'], shape: 'wave',
    body: [
      { t: 'p', text: 'Every server you join is another source of pings. Huddle gives you a few simple dials so that the noise stays low and the signal stays high.' },
      { t: 'ul', items: [
        'Per-server levels: all messages, only @mentions, or nothing at all.',
        'Suppress @everyone and @here when a big server gets announcement-happy.',
        'Mute a server completely when you need a quiet week — unread badges will be waiting when you’re back.',
        'Set your status to Do Not Disturb to silence desktop notifications everywhere.',
      ] },
      { t: 'p', text: 'Our favourite setup: “only @mentions” for large communities, “all messages” for your close-friends server, and desktop notifications on. Calm, but never out of the loop.' },
    ],
  },
];

export const findPost = (slug: string | undefined) => POSTS.find((p) => p.slug === slug);

export const fmtDate = (iso: string, locale = 'en-GB') =>
  new Date(iso + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
