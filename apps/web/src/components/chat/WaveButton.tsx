import { useState } from 'react';
import { Permissions, WAVE_STICKER_IDS, findBuiltinSticker, type Message } from '@huddle/shared';
import { useAuthStore } from '../../stores/auth';
import { useMessageStore } from '../../stores/messages';
import { useCan } from '../../lib/permissions';
import { hasWaved, waveAt } from '../../lib/stickers';
import { stickerSrc, useReducedMotion } from './Sticker';

/** "Wave to say hi!" under a join message: replies with a random waving sticker, then hides for you. */
export function WaveButton({ m }: { m: Message }) {
  const me = useAuthStore((s) => s.user?.id);
  const canSend = useCan(m.channel_id, Permissions.SEND_MESSAGES);
  const still = useReducedMotion();
  // a wave reply from you in the loaded history also counts (e.g. sent from another device)
  const repliedHere = useMessageStore((s) => !!s.channels[m.channel_id]?.messages.some((x) =>
    x.author.id === me && x.message_reference?.message_id === m.id && !!x.sticker_items?.length));
  const [waved, setWaved] = useState(() => hasWaved(m.id));
  const [preview] = useState(() => findBuiltinSticker(WAVE_STICKER_IDS[Math.floor(Math.random() * WAVE_STICKER_IDS.length)])!);
  if (!me || m.author.id === me || !canSend || waved || repliedHere) return null;
  return (
    <button className="wave-btn" onClick={() => { setWaved(true); void waveAt(m, preview); }}>
      <img src={stickerSrc(preview, still)} alt="" width={28} height={28} />
      Wave to say hi!
    </button>
  );
}
