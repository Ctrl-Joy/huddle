import type { ReactNode } from 'react';
import { useTypingStore } from '../../stores/typing';
import { displayName, useGuildStore } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';

export function TypingIndicator({ channelId, guildId }: { channelId: string; guildId: string | null }) {
  const typing = useTypingStore((s) => s.typing[channelId]);
  const me = useAuthStore((s) => s.user?.id);
  useGuildStore((s) => (guildId ? s.members[guildId] : s.users));
  const ids = Object.keys(typing || {}).filter((id) => id !== me);
  if (!ids.length) return <span className="typing" />;
  const names = ids.map((id) => displayName(id, guildId));
  let text: ReactNode;
  if (names.length === 1) text = <><strong>{names[0]}</strong> is typing…</>;
  else if (names.length === 2) text = <><strong>{names[0]}</strong> and <strong>{names[1]}</strong> are typing…</>;
  else if (names.length === 3) text = <><strong>{names[0]}</strong>, <strong>{names[1]}</strong> and <strong>{names[2]}</strong> are typing…</>;
  else text = <>Several people are typing…</>;
  return (
    <span className="typing" aria-live="polite">
      <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
      <span className="typing-text">{text}</span>
    </span>
  );
}
