// Public server directory and server templates.

export const GUILD_CATEGORIES = [
  { id: 'gaming', label: 'Gaming' },
  { id: 'music', label: 'Music' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'science_tech', label: 'Science & Tech' },
  { id: 'education', label: 'Education' },
  { id: 'community', label: 'Community' },
  { id: 'art', label: 'Art & Creators' },
  { id: 'other', label: 'Other' },
] as const;

export type GuildCategory = (typeof GUILD_CATEGORIES)[number]['id'];

export const isGuildCategory = (v: unknown): v is GuildCategory =>
  typeof v === 'string' && GUILD_CATEGORIES.some((c) => c.id === v);

/** GET /discovery?category&q&limit&offset — one card in the directory. */
export interface DiscoverableGuild {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  category: GuildCategory | null;
  banner_color: string | null;
  member_count: number;
  online_count: number;
}

export interface DiscoveryResponse {
  total: number;
  guilds: DiscoverableGuild[];
}

/** Starter layouts for POST /guilds { template }. The channel lists themselves live on the server. */
export const GUILD_TEMPLATES = [
  { id: 'gaming', name: 'Gaming', description: 'Squad up, share clips, plan game nights' },
  { id: 'friends', name: 'Friends', description: 'A cosy spot for your crew' },
  { id: 'study', name: 'Study Group', description: 'Notes, questions and focus rooms' },
  { id: 'club', name: 'School Club', description: 'Announcements, events and meetups' },
  { id: 'creators', name: 'Creators', description: 'Share work, get feedback, collaborate' },
  { id: 'local', name: 'Local Community', description: 'Neighbours, news and happenings' },
] as const;

export type GuildTemplateId = (typeof GUILD_TEMPLATES)[number]['id'];
