import { ChannelType } from '@huddle/shared';
import { IconForum, IconHash, IconMegaphone, IconSpeaker, IconThread } from './icons';

/** The glyph for a guild channel type (text #, voice, announcement megaphone, forum, thread). */
export function ChannelIcon({ type, size = 18, className }: { type: number; size?: number; className?: string }) {
  switch (type) {
    case ChannelType.GUILD_VOICE: return <IconSpeaker size={size} className={className} />;
    case ChannelType.GUILD_ANNOUNCEMENT: return <IconMegaphone size={size} className={className} />;
    case ChannelType.GUILD_FORUM: return <IconForum size={size} className={className} />;
    case ChannelType.PUBLIC_THREAD: return <IconThread size={size} className={className} />;
    default: return <IconHash size={size} className={className} />;
  }
}
