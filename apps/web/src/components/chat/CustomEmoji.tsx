// Inline image for a custom server emoji.
import type { CustomEmojiRef } from '@huddle/shared';
import { useGuildStore } from '../../stores/guilds';

export function CustomEmojiImg({ emoji, className = 'custom-emoji' }: { emoji: Pick<CustomEmojiRef, 'name' | 'url'>; className?: string }) {
  return <img className={className} src={emoji.url} alt={`:${emoji.name}:`} title={`:${emoji.name}:`} draggable={false} loading="lazy" />;
}

/** A <:name:id> token in message text: the emoji if any joined server has it, else ":name:" text. */
export function CustomEmojiToken({ id, name }: { id: string; name: string }) {
  const emoji = useGuildStore((s) => {
    for (const list of Object.values(s.emojis)) {
      const e = list.find((x) => x.id === id);
      if (e) return e;
    }
    return undefined;
  });
  if (!emoji) return <>:{name}:</>;
  return <CustomEmojiImg emoji={emoji} className="custom-emoji md-emoji" />;
}
