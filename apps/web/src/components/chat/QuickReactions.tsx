// One-click reactions in the message hover toolbar: the first three of the user's recent emoji.
// Hidden on phones (the long-press menu covers reacting there).
import { useMemo, useSyncExternalStore } from 'react';
import type { Message } from '@huddle/shared';
import { toggleReaction } from '../../lib/actions';
import { getQuickReactions, reactionEmojiInfo, recentEmojiVersion, subscribeRecentEmoji } from '../../lib/emoji';
import { Tooltip } from '../common/Avatar';
import { CustomEmojiImg } from './CustomEmoji';

export function QuickReactions({ message }: { message: Message }) {
  const version = useSyncExternalStore(subscribeRecentEmoji, recentEmojiVersion);
  const quick = useMemo(() => getQuickReactions(3), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {quick.map((e) => {
        const info = reactionEmojiInfo(e);
        const mine = message.reactions.some((r) => r.emoji === info.key && r.me);
        const label = mine ? `Remove reaction ${info.label}` : `React with ${info.label}`;
        return (
          <Tooltip key={e} label={label}>
            <button className={'tb-btn tb-quick' + (mine ? ' on' : '')} aria-label={label} aria-pressed={mine}
              onClick={() => void toggleReaction(message, e)}>
              {info.custom ? <CustomEmojiImg emoji={info.custom} className="custom-emoji tb-quick-img" /> : <span className="tb-quick-emoji">{e}</span>}
            </button>
          </Tooltip>
        );
      })}
      <span className="tb-sep tb-quick" aria-hidden="true" />
    </>
  );
}
