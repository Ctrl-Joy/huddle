import type { GuildTemplateId } from '@huddle/shared';

/** A category with its text and voice channels. The first text channel overall becomes the system channel. */
export interface TemplateCategory { name: string; text?: string[]; voice?: string[] }

/** "Create my own" layout. */
export const DEFAULT_LAYOUT: TemplateCategory[] = [
  { name: 'Text Channels', text: ['general'] },
  { name: 'Voice Channels', voice: ['General'] },
];

export const TEMPLATE_LAYOUTS: Record<GuildTemplateId, TemplateCategory[]> = {
  gaming: [
    { name: 'Lobby', text: ['welcome', 'chat', 'looking-for-group'] },
    { name: 'Highlights', text: ['clips', 'screenshots', 'patch-notes'] },
    { name: 'Squad Rooms', voice: ['Party Up', 'Ranked', 'AFK Corner'] },
  ],
  friends: [
    { name: 'Hangout', text: ['general', 'plans', 'memes', 'photo-dump'] },
    { name: 'Voice', voice: ['Couch', 'Late Night'] },
  ],
  study: [
    { name: 'Info', text: ['welcome', 'resources'] },
    { name: 'Study Hall', text: ['general', 'questions', 'notes', 'exam-prep'] },
    { name: 'Focus Rooms', voice: ['Quiet Study', 'Group Session'] },
  ],
  club: [
    { name: 'Club Info', text: ['announcements', 'events', 'introductions'] },
    { name: 'Members', text: ['general', 'ideas', 'off-topic'] },
    { name: 'Meetups', voice: ['Meeting Room', 'Hangout'] },
  ],
  creators: [
    { name: 'Start Here', text: ['welcome', 'updates'] },
    { name: 'Studio', text: ['general', 'show-your-work', 'feedback', 'collabs'] },
    { name: 'Live', voice: ['Co-working', 'Stream Room'] },
  ],
  local: [
    { name: 'Noticeboard', text: ['welcome', 'news', 'events'] },
    { name: 'Neighbourhood', text: ['general', 'buy-swap-share', 'recommendations', 'lost-and-found'] },
    { name: 'Town Hall', voice: ['Town Square'] },
  ],
};

export const isTemplateId = (v: unknown): v is GuildTemplateId =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(TEMPLATE_LAYOUTS, v);
