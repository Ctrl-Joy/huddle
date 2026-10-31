import { useState } from 'react';
import { findBuiltinSticker, stickerLabel, type StickerItem } from '@huddle/shared';
import { usePrefs } from '../../stores/prefs';
import { Tooltip } from '../common/Avatar';

/** True when the app (or the OS, via the "auto" preference) asks for reduced motion. */
export function useReducedMotion(): boolean {
  usePrefs((s) => s.reduceMotion); // re-render when the preference changes
  return document.documentElement.classList.contains('reduce-motion');
}

/** Image URL for a sticker: built-in animated stickers swap to their still frame under reduced motion. */
export function stickerSrc(s: StickerItem, still: boolean): string {
  const b = still ? findBuiltinSticker(s.id) : undefined;
  return b?.still ?? s.url;
}

/** A sticker image; falls back to "[sticker] name" once the file is gone (e.g. the server sticker was deleted). */
export function StickerImage({ sticker, size = 160, className = '' }: { sticker: StickerItem; size?: number; className?: string }) {
  const still = useReducedMotion();
  const [broken, setBroken] = useState(false);
  if (broken) return <span className={'sticker-missing ' + className}>{stickerLabel(sticker)}</span>;
  return (
    <img className={'sticker-img ' + className} src={stickerSrc(sticker, still)} alt={sticker.name} title={sticker.name}
      width={size} height={size} loading="lazy" draggable={false} onError={() => setBroken(true)} />
  );
}

/** The stickers of a message (no bubble, just the image). */
export function MessageStickers({ items }: { items: StickerItem[] }) {
  return (
    <div className="message-stickers">
      {items.map((s) => (
        <Tooltip key={s.id} label={s.name}><span className="message-sticker"><StickerImage sticker={s} /></span></Tooltip>
      ))}
    </div>
  );
}
