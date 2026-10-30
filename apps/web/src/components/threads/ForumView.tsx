import { useEffect, useMemo, useState } from 'react';
import { ChannelType, LIMITS, Permissions, type Channel } from '@huddle/shared';
import { errorMessage } from '../../api/client';
import { useGuildStore, displayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useReadStateStore, isUnread } from '../../stores/readStates';
import { useThreadPanel, useThreadStore } from '../../stores/threads';
import { useUIStore } from '../../stores/ui';
import { useCan } from '../../lib/permissions';
import { ackChannel } from '../../lib/actions';
import { createForumPost, fetchThreads } from '../../lib/threads';
import { stripMarkdownForPreview } from '../../lib/plainText';
import { pluralize, relativeTime } from '../../lib/format';
import { usePhone } from '../../lib/usePhone';
import { Avatar, Spinner } from '../common/Avatar';
import { IconForum, IconMessage, IconPlus, IconSearch, IconClose } from '../common/icons';
import { ChatHeader } from '../chat/ChatHeader';
import { MemberList } from '../members/MemberList';
import { ThreadPanelView } from './ThreadPanel';
import { ForumTagPill } from './ForumTagPill';
import { useThreadParam } from './useThreadParam';

type Sort = 'activity' | 'created';

/** A forum channel: post cards (each a thread), with search, sort and tag filters. Posts open in the thread panel. */
export function ForumView({ channel }: { channel: Channel }) {
  const phone = usePhone();
  const memberListOpen = useUIStore((s) => (phone ? s.mobileMembersOpen : s.memberListOpen));
  useThreadParam(channel.id);
  const panel = useThreadPanel(channel.id);
  const channels = useGuildStore((s) => s.channels);
  const readStates = useReadStateStore((s) => s.readStates);
  const canPost = useCan(channel.id, Permissions.SEND_MESSAGES);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('activity');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // posts newer than what you'd read when opening the forum get an unread dot until opened
  const [readMarker] = useState(() => useReadStateStore.getState().readStates[channel.id]?.last_read_message_id ?? null);
  const tags = channel.available_tags ?? [];

  useEffect(() => {
    let live = true;
    fetchThreads(channel.id, { archived: 'all', limit: 100 })
      .catch((e) => { if (live) setError(errorMessage(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [channel.id]);

  // seeing the list = seeing every new post
  useEffect(() => { if (!document.hidden) ackChannel(channel.id, channel.last_message_id); }, [channel.id, channel.last_message_id]);

  const posts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = Object.values(channels).filter((c) => c.type === ChannelType.PUBLIC_THREAD && c.parent_id === channel.id
      && (!needle || (c.name ?? '').toLowerCase().includes(needle))
      && (!tagFilter || (c.applied_tags ?? []).includes(tagFilter)));
    const key = (c: Channel) => BigInt(sort === 'created' ? c.id : c.last_message_id ?? c.id);
    return list.sort((a, b) => (key(b) > key(a) ? 1 : key(b) < key(a) ? -1 : 0));
  }, [channels, channel.id, q, tagFilter, sort]);

  const isNew = (t: Channel) => {
    const rs = readStates[t.id];
    if (rs) return isUnread(t, readStates);
    return t.owner_id !== useAuthStore.getState().user?.id && (readMarker === null || BigInt(t.id) > BigInt(readMarker));
  };

  const side = panel && !phone ? <ThreadPanelView panel={panel} parent={channel} />
    : memberListOpen && !panel ? <MemberList guildId={channel.guild_id!} channelId={channel.id} /> : null;

  return (
    <div className="chat-view forum-view">
      <ChatHeader channel={channel} />
      <div className="chat-body">
        <div className="chat-column forum-column scroll-thin">
          <div className="forum-inner">
            <div className="forum-toolbar">
              <div className="forum-search">
                <IconSearch size={16} />
                <input value={q} placeholder="Search posts by title" aria-label="Search posts" onChange={(e) => setQ(e.target.value)} />
                {q && <button className="search-clear" aria-label="Clear search" onClick={() => setQ('')}><IconClose size={14} /></button>}
              </div>
              <select className="small-select" value={sort} aria-label="Sort posts" onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="activity">Latest activity</option>
                <option value="created">Creation date</option>
              </select>
              {canPost && (
                <button className="btn btn-primary forum-new" onClick={() => setComposing(true)}><IconPlus size={16} /> New Post</button>
              )}
            </div>
            {tags.length > 0 && (
              <div className="forum-tag-filter" role="group" aria-label="Filter by tag">
                {tags.map((t) => <ForumTagPill key={t.id} tag={t} active={tagFilter === t.id} onClick={() => setTagFilter((v) => (v === t.id ? null : t.id))} />)}
                {tagFilter && <button className="btn-link small" onClick={() => setTagFilter(null)}>Clear</button>}
              </div>
            )}
            {composing && <NewPostForm forum={channel} close={() => setComposing(false)} />}
            {error && <div className="form-error">{error}</div>}
            {loading && !posts.length ? <div className="center-pad"><Spinner /></div>
              : !posts.length ? (
                <div className="empty-mini forum-empty">
                  <div className="empty-mini-icon"><IconForum size={28} /></div>
                  <h3>{q || tagFilter ? 'No posts match' : 'No posts yet'}</h3>
                  <p>{q || tagFilter ? 'Try another title or tag.' : canPost ? 'Start the first conversation with New Post.' : 'Check back soon.'}</p>
                </div>
              ) : (
                <div className="forum-posts">
                  {posts.map((t) => <PostCard key={t.id} post={t} forum={channel} unread={isNew(t)} active={panel?.threadId === t.id} />)}
                </div>
              )}
          </div>
        </div>
        {side}
      </div>
      {panel && phone && <ThreadPanelView panel={panel} parent={channel} />}
    </div>
  );
}

function PostCard({ post, forum, unread, active }: { post: Channel; forum: Channel; unread: boolean; active: boolean }) {
  const starter = post.starter_message;
  const authorId = starter?.author.id ?? post.owner_id ?? '';
  const author = useGuildStore((s) => s.users[authorId]) ?? starter?.author;
  const name = useGuildStore(() => displayName(authorId, forum.guild_id));
  const mentions = useReadStateStore((s) => s.readStates[post.id]?.mention_count ?? 0);
  const tags = (forum.available_tags ?? []).filter((t) => post.applied_tags?.includes(t.id));
  const preview = starter ? stripMarkdownForPreview(starter.content, forum.guild_id) || (starter.attachments.length ? 'Attachment' : '') : '';
  const replies = post.message_count ?? 0;
  const archived = !!post.thread_metadata?.archived;
  return (
    <button className={'post-card' + (active ? ' active' : '') + (unread ? ' unread' : '')} onClick={() => useThreadStore.getState().open(forum.id, post.id)}>
      <div className="post-card-top">
        {unread && <span className="post-unread-dot" aria-label="Unread" />}
        <span className="post-title">{post.name}</span>
        {archived && <span className="thread-archived-pill">Archived</span>}
        {mentions > 0 && <span className="badge">{mentions}</span>}
      </div>
      {tags.length > 0 && <div className="post-tags">{tags.map((t) => <ForumTagPill key={t.id} tag={t} />)}</div>}
      <div className="post-preview">
        {author && <Avatar user={author} size={18} />}
        <strong className="post-author">{name}</strong>
        {preview && <span className="post-snippet truncate">{preview}</span>}
      </div>
      <div className="post-meta">
        <span><IconMessage size={14} /> {pluralize(replies, 'reply', 'replies')}</span>
        {post.last_message_at && <span>{relativeTime(post.last_message_at)}</span>}
      </div>
    </button>
  );
}

function NewPostForm({ forum, close }: { forum: Channel; close: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tags = forum.available_tags ?? [];
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= LIMITS.TAGS_PER_POST ? p : [...p, id]));

  const submit = async () => {
    if (!title.trim() || !content.trim()) { setError('A post needs a title and a message.'); return; }
    setBusy(true); setError('');
    try {
      const t = await createForumPost(forum.id, { name: title.trim(), content: content.trim(), applied_tags: picked });
      close();
      useThreadStore.getState().open(forum.id, t.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <form className="new-post" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <input autoFocus className="new-post-title" value={title} maxLength={LIMITS.THREAD_NAME} placeholder="Post title" aria-label="Post title" onChange={(e) => setTitle(e.target.value)} />
      <textarea rows={4} value={content} maxLength={LIMITS.MESSAGE_LENGTH} placeholder="What's on your mind? Markdown works here." aria-label="Post message" onChange={(e) => setContent(e.target.value)} />
      {tags.length > 0 && (
        <div className="new-post-tags">
          <span className="field-label">Tags</span>
          {tags.map((t) => <ForumTagPill key={t.id} tag={t} active={picked.includes(t.id)} onClick={() => toggle(t.id)} />)}
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="new-thread-actions">
        <button type="button" className="btn btn-ghost" onClick={close}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !content.trim()}>Post</button>
      </div>
    </form>
  );
}
