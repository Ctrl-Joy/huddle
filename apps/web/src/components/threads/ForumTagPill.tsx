import type { ForumTag } from '@huddle/shared';

/** A forum tag (optional emoji + name); clickable when used as a filter / picker. */
export function ForumTagPill({ tag, active, onClick }: { tag: ForumTag; active?: boolean; onClick?: () => void }) {
  const cls = 'forum-tag' + (active ? ' active' : '') + (onClick ? ' clickable' : '');
  const body = <>{tag.emoji && <span className="forum-tag-emoji">{tag.emoji}</span>}{tag.name}</>;
  return onClick
    ? <button type="button" className={cls} aria-pressed={!!active} onClick={onClick}>{body}</button>
    : <span className={cls}>{body}</span>;
}
