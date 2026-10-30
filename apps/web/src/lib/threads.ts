// REST actions for threads, forum posts and forum tags. Gateway THREAD_* events reconcile other clients.
import type { Channel, ForumTag, ThreadListResponse } from '@huddle/shared';
import { api } from '../api/client';
import { useGuildStore } from '../stores/guilds';
import { useThreadStore } from '../stores/threads';
import { useViewStore } from '../stores/view';
import { navigate } from './nav';

const upsert = (t: Channel) => { if (t?.id) useGuildStore.getState().upsertChannel(t); return t; };

export interface ThreadQuery { archived?: 'true' | 'false' | 'all'; q?: string; tag?: string; sort?: 'activity' | 'created'; limit?: number }

/** Lists threads of a channel and caches them (with forum starter messages) in the channel store. */
export async function fetchThreads(channelId: string, query: ThreadQuery = {}): Promise<ThreadListResponse> {
  const r = await api.get<ThreadListResponse>(`/channels/${channelId}/threads`, query as Record<string, string | number>);
  for (const t of r.threads) upsert(t);
  return r;
}

export async function createThread(channelId: string, name: string): Promise<Channel> {
  return upsert(await api.post<Channel>(`/channels/${channelId}/threads`, { name }));
}

export async function createThreadFromMessage(channelId: string, messageId: string, name: string): Promise<Channel> {
  return upsert(await api.post<Channel>(`/channels/${channelId}/messages/${messageId}/threads`, { name }));
}

export async function createForumPost(forumId: string, body: { name: string; content: string; applied_tags: string[] }): Promise<Channel> {
  return upsert(await api.post<Channel>(`/channels/${forumId}/threads`, {
    name: body.name, message: { content: body.content }, applied_tags: body.applied_tags,
  }));
}

export async function updateThread(threadId: string, body: { name?: string; archived?: boolean; applied_tags?: string[] }): Promise<Channel> {
  return upsert(await api.patch<Channel>(`/channels/${threadId}`, body));
}

export async function deleteThread(threadId: string): Promise<void> {
  await api.del(`/channels/${threadId}`);
  useGuildStore.getState().removeChannel(threadId);
  if (useThreadStore.getState().panel?.threadId === threadId) useThreadStore.getState().close();
}

export async function updateForumTags(forumId: string, tags: ForumTag[]): Promise<Channel> {
  return upsert(await api.patch<Channel>(`/channels/${forumId}`, { available_tags: tags }));
}

/** Opens a thread: in the panel if its parent is on screen, otherwise by navigating to the parent. */
export function openThread(thread: Pick<Channel, 'id' | 'guild_id' | 'parent_id'>) {
  if (!thread.parent_id) return;
  if (useViewStore.getState().channelId === thread.parent_id) useThreadStore.getState().open(thread.parent_id, thread.id);
  else navigate(`/channels/${thread.guild_id}/${thread.parent_id}?thread=${thread.id}`);
}
