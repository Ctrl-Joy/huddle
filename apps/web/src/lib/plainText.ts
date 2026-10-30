import { useGuildStore } from '../stores/guilds';

/** Turns raw message content into a short plain-text preview (mentions resolved, markdown stripped). */
export function stripMarkdownForPreview(content: string, guildId?: string | null): string {
  const s = useGuildStore.getState();
  return content
    .replace(/<@&(\d+)>/g, (_, id) => '@' + (guildId ? s.roles[guildId]?.[id]?.name ?? 'role' : 'role'))
    .replace(/<@(\d+)>/g, (_, id) => {
      const m = guildId ? s.members[guildId]?.[id] : undefined;
      const u = m?.user || s.users[id];
      return '@' + (m?.nick || u?.display_name || u?.username || 'user');
    })
    .replace(/<#(\d+)>/g, (_, id) => '#' + (s.channels[id]?.name ?? 'channel'))
    .replace(/```[a-z]*\n?([\s\S]*?)```/g, '$1')
    .replace(/\|\|([\s\S]+?)\|\|/g, '▒▒▒')
    .replace(/(\*\*|__|~~|\*|_|`)/g, '')
    .replace(/^>\s?/gm, '')
    .trim();
}
