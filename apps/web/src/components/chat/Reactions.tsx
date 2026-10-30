import type { Message, Reaction } from '@huddle/shared';
import { displayName } from '../../stores/guilds';
import { toggleReaction } from '../../lib/actions';
import { Tooltip } from '../common/Avatar';
import { IconSmilePlus } from '../common/icons';

function reactorText(m: Message, r: Reaction): string {
  const ids = r.user_ids || [];
  const names = ids.slice(0, 6).map((id) => displayName(id, m.guild_id));
  const rest = r.count - names.length;
  if (!names.length) return `${r.count} reaction${r.count === 1 ? '' : 's'}`;
  let text = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + (rest > 0 ? ', ' + names[names.length - 1] : ' and ' + names[names.length - 1]);
  if (rest > 0) text += ` and ${rest} other${rest === 1 ? '' : 's'}`;
  return `${text} reacted with ${r.emoji}`;
}

export function Reactions({ message, canReact, onAdd }: { message: Message; canReact: boolean; onAdd: () => void }) {
  return (
    <div className="reactions">
      {message.reactions.map((r) => (
        <Tooltip key={r.emoji} label={<span className="reaction-tip"><span className="reaction-tip-emoji">{r.emoji}</span>{reactorText(message, r)}</span>}>
          <button
            className={'reaction' + (r.me ? ' me' : '')}
            disabled={!canReact && !r.me}
            onClick={() => void toggleReaction(message, r.emoji)}
            aria-pressed={r.me}
            aria-label={`${r.emoji} ${r.count}`}
          >
            <span className="reaction-emoji">{r.emoji}</span>
            <span key={r.count} className="reaction-count">{r.count}</span>
          </button>
        </Tooltip>
      ))}
      {canReact && (
        <Tooltip label="Add Reaction">
          <button className="reaction add" aria-label="Add Reaction" onClick={onAdd}><IconSmilePlus size={16} /></button>
        </Tooltip>
      )}
    </div>
  );
}
