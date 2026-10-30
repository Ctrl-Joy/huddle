// Messages per channel, with pagination flags and optimistic (nonce-keyed) pending messages.
import { create } from 'zustand';
import { LIMITS, MessageType, type CustomEmojiRef, type Message, type PublicUser } from '@huddle/shared';
import { api, errorMessage, uploadWithProgress } from '../api/client';
import { useGuildStore } from './guilds';

export interface PendingFile { id: string; file: File; spoiler?: boolean }

export interface ClientMessage extends Message {
  _state?: 'pending' | 'failed';
  _error?: string;
  _files?: PendingFile[];
  _progress?: number;
}

export interface ChannelMessages {
  messages: ClientMessage[]; // ascending by id
  hasMoreBefore: boolean;
  hasMoreAfter: boolean; // true when viewing a window into the past (after jump)
  loading: boolean;
  loaded: boolean;
  error?: string;
}

const EMPTY: ChannelMessages = { messages: [], hasMoreBefore: true, hasMoreAfter: false, loading: false, loaded: false };

interface MessageStore {
  channels: Record<string, ChannelMessages>;
  /** message to scroll to + highlight after a jump */
  jumpTarget: { channelId: string; messageId: string; ts: number } | null;
  reset(): void;
  get(channelId: string): ChannelMessages;
  patch(channelId: string, p: Partial<ChannelMessages>): void;
  fetchInitial(channelId: string, force?: boolean): Promise<void>;
  fetchBefore(channelId: string): Promise<void>;
  fetchAfter(channelId: string): Promise<void>;
  jumpTo(channelId: string, messageId: string): Promise<void>;
  clearJump(): void;
  add(m: Message): void;
  update(m: Partial<Message> & { id: string; channel_id: string }): void;
  remove(channelId: string, id: string): void;
  reaction(channelId: string, messageId: string, emoji: string, userId: string, add: boolean, meId: string, custom?: CustomEmojiRef | null): void;
  addPending(m: ClientMessage): void;
  setPendingState(channelId: string, nonce: string, p: Partial<ClientMessage>): void;
  removePending(channelId: string, nonce: string): void;
  dropChannel(channelId: string): void;
}

const cmp = (a: string, b: string) => { const x = BigInt(a), y = BigInt(b); return x < y ? -1 : x > y ? 1 : 0; };

function insertSorted(list: ClientMessage[], m: ClientMessage): ClientMessage[] {
  const idx = list.findIndex((x) => x.id === m.id);
  if (idx >= 0) { const next = list.slice(); next[idx] = { ...list[idx], ...m }; return next; }
  // pending messages always stay at the very end
  const next = list.slice();
  let i = next.length;
  while (i > 0 && (next[i - 1]._state || cmp(next[i - 1].id, m.id) > 0)) i--;
  next.splice(i, 0, m);
  return next;
}

function mergePages(existing: ClientMessage[], incoming: Message[]): ClientMessage[] {
  const map = new Map<string, ClientMessage>();
  for (const m of existing) if (!m._state) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  const pending = existing.filter((m) => m._state);
  return [...[...map.values()].sort((a, b) => cmp(a.id, b.id)), ...pending];
}

function cacheAuthors(ms: Message[]) {
  const users: PublicUser[] = [];
  for (const m of ms) { users.push(m.author); if (m.referenced_message) users.push(m.referenced_message.author); }
  useGuildStore.getState().upsertUsers(users);
}

export const useMessageStore = create<MessageStore>()((set, get) => ({
  channels: {},
  jumpTarget: null,

  reset: () => set({ channels: {}, jumpTarget: null }),
  get: (channelId) => get().channels[channelId] || EMPTY,
  patch: (channelId, p) => set((s) => ({ channels: { ...s.channels, [channelId]: { ...(s.channels[channelId] || EMPTY), ...p } } })),

  fetchInitial: async (channelId, force) => {
    const cur = get().get(channelId);
    if (!force && (cur.loading || cur.loaded)) return;
    get().patch(channelId, { loading: true, error: undefined });
    try {
      const msgs = await api.get<Message[]>(`/channels/${channelId}/messages`, { limit: LIMITS.MESSAGES_PAGE });
      cacheAuthors(msgs);
      const jt = get().jumpTarget;
      if (!force && jt && jt.channelId === channelId) { get().patch(channelId, { loading: false }); return; }
      const pending = get().get(channelId).messages.filter((m) => m._state);
      set((s) => ({
        channels: {
          ...s.channels,
          [channelId]: {
            messages: [...[...msgs].sort((a, b) => cmp(a.id, b.id)), ...pending],
            hasMoreBefore: msgs.length >= LIMITS.MESSAGES_PAGE,
            hasMoreAfter: false, loading: false, loaded: true,
          },
        },
      }));
    } catch (e) {
      get().patch(channelId, { loading: false, error: errorMessage(e) });
    }
  },

  fetchBefore: async (channelId) => {
    const cur = get().get(channelId);
    if (cur.loading || !cur.hasMoreBefore) return;
    const first = cur.messages.find((m) => !m._state);
    if (!first) return get().fetchInitial(channelId);
    get().patch(channelId, { loading: true });
    try {
      const msgs = await api.get<Message[]>(`/channels/${channelId}/messages`, { before: first.id, limit: LIMITS.MESSAGES_PAGE });
      cacheAuthors(msgs);
      const now = get().get(channelId);
      get().patch(channelId, { messages: mergePages(now.messages, msgs), hasMoreBefore: msgs.length >= LIMITS.MESSAGES_PAGE, loading: false });
    } catch (e) {
      get().patch(channelId, { loading: false, error: errorMessage(e) });
    }
  },

  fetchAfter: async (channelId) => {
    const cur = get().get(channelId);
    if (cur.loading || !cur.hasMoreAfter) return;
    const real = cur.messages.filter((m) => !m._state);
    const last = real[real.length - 1];
    if (!last) return;
    get().patch(channelId, { loading: true });
    try {
      const msgs = await api.get<Message[]>(`/channels/${channelId}/messages`, { after: last.id, limit: LIMITS.MESSAGES_PAGE });
      cacheAuthors(msgs);
      const now = get().get(channelId);
      get().patch(channelId, { messages: mergePages(now.messages, msgs), hasMoreAfter: msgs.length >= LIMITS.MESSAGES_PAGE, loading: false });
    } catch (e) {
      get().patch(channelId, { loading: false, error: errorMessage(e) });
    }
  },

  jumpTo: async (channelId, messageId) => {
    const cur = get().get(channelId);
    if (cur.messages.some((m) => m.id === messageId)) {
      set({ jumpTarget: { channelId, messageId, ts: Date.now() } });
      return;
    }
    get().patch(channelId, { loading: true });
    set({ jumpTarget: { channelId, messageId, ts: Date.now() } });
    try {
      const msgs = await api.get<Message[]>(`/channels/${channelId}/messages`, { around: messageId, limit: LIMITS.MESSAGES_PAGE });
      cacheAuthors(msgs);
      const sorted = [...msgs].sort((a, b) => cmp(a.id, b.id));
      const latestKnown = useGuildStore.getState().channels[channelId]?.last_message_id;
      const newest = sorted[sorted.length - 1];
      const hasMoreAfter = !!(latestKnown && newest && cmp(latestKnown, newest.id) > 0);
      set((s) => ({
        channels: { ...s.channels, [channelId]: { messages: sorted, hasMoreBefore: true, hasMoreAfter, loading: false, loaded: true } },
        jumpTarget: { channelId, messageId, ts: Date.now() },
      }));
    } catch (e) {
      set({ jumpTarget: null });
      get().patch(channelId, { loading: false, error: errorMessage(e) });
    }
  },

  clearJump: () => set({ jumpTarget: null }),

  add: (m) => {
    cacheAuthors([m]);
    set((s) => {
      const cur = s.channels[m.channel_id];
      if (!cur || !cur.loaded) return {};
      if (cur.hasMoreAfter) return {}; // viewing history; new message will be fetched on jump-to-present
      let list = cur.messages;
      if (m.nonce) {
        const pi = list.findIndex((x) => x._state && x.nonce === m.nonce);
        if (pi >= 0) list = [...list.slice(0, pi), ...list.slice(pi + 1)];
      }
      return { channels: { ...s.channels, [m.channel_id]: { ...cur, messages: insertSorted(list, m) } } };
    });
  },

  update: (m) => set((s) => {
    const cur = s.channels[m.channel_id];
    if (!cur) return {};
    let changed = false;
    const messages = cur.messages.map((x) => {
      let out = x;
      if (x.id === m.id) { changed = true; out = { ...x, ...m } as ClientMessage; }
      if (x.referenced_message?.id === m.id) { changed = true; out = { ...out, referenced_message: { ...x.referenced_message, ...m } as Message }; }
      return out;
    });
    return changed ? { channels: { ...s.channels, [m.channel_id]: { ...cur, messages } } } : {};
  }),

  remove: (channelId, id) => set((s) => {
    const cur = s.channels[channelId];
    if (!cur) return {};
    const messages = cur.messages
      .filter((x) => x.id !== id)
      .map((x) => (x.referenced_message?.id === id ? { ...x, referenced_message: null } : x));
    return { channels: { ...s.channels, [channelId]: { ...cur, messages } } };
  }),

  reaction: (channelId, messageId, emoji, userId, add, meId, custom) => set((s) => {
    const cur = s.channels[channelId];
    if (!cur) return {};
    const messages = cur.messages.map((m) => {
      if (m.id !== messageId) return m;
      const reactions = [...m.reactions];
      const i = reactions.findIndex((r) => r.emoji === emoji);
      if (add) {
        if (i >= 0) {
          const r = reactions[i];
          if (r.user_ids?.includes(userId)) return m;
          reactions[i] = { ...r, count: r.count + 1, me: r.me || userId === meId, user_ids: [...(r.user_ids || []), userId].slice(0, 25) };
        } else reactions.push({ emoji, count: 1, me: userId === meId, user_ids: [userId], ...(custom ? { custom_emoji: custom } : {}) });
      } else {
        if (i < 0) return m;
        const r = reactions[i];
        const count = r.count - 1;
        if (count <= 0) reactions.splice(i, 1);
        else reactions[i] = { ...r, count, me: userId === meId ? false : r.me, user_ids: (r.user_ids || []).filter((u) => u !== userId) };
      }
      return { ...m, reactions };
    });
    return { channels: { ...s.channels, [channelId]: { ...cur, messages } } };
  }),

  addPending: (m) => set((s) => {
    const cur = s.channels[m.channel_id] || { ...EMPTY, loaded: true };
    return { channels: { ...s.channels, [m.channel_id]: { ...cur, messages: [...cur.messages, m] } } };
  }),

  setPendingState: (channelId, nonce, p) => set((s) => {
    const cur = s.channels[channelId];
    if (!cur) return {};
    return { channels: { ...s.channels, [channelId]: { ...cur, messages: cur.messages.map((m) => (m._state && m.nonce === nonce ? { ...m, ...p } : m)) } } };
  }),

  removePending: (channelId, nonce) => set((s) => {
    const cur = s.channels[channelId];
    if (!cur) return {};
    return { channels: { ...s.channels, [channelId]: { ...cur, messages: cur.messages.filter((m) => !(m._state && m.nonce === nonce)) } } };
  }),

  dropChannel: (channelId) => set((s) => { const c = { ...s.channels }; delete c[channelId]; return { channels: c }; }),
}));

// ---- sending ----

let nonceCounter = 0;
export function makeNonce(): string {
  // snowflake-ish numeric nonce, unique per client
  return (BigInt(Date.now() - 1735689600000) * 4194304n + BigInt(nonceCounter++ % 4194304)).toString();
}

export interface SendOptions { content: string; replyToId?: string | null; files?: PendingFile[] }

export async function sendMessage(channelId: string, opts: SendOptions, author: PublicUser, existingNonce?: string): Promise<void> {
  const store = useMessageStore.getState();
  const nonce = existingNonce || makeNonce();
  const channel = useGuildStore.getState().channels[channelId];
  const replyMsg = opts.replyToId ? store.get(channelId).messages.find((m) => m.id === opts.replyToId) || null : null;

  if (!existingNonce) {
    store.addPending({
      id: nonce, nonce, channel_id: channelId, guild_id: channel?.guild_id ?? null, author,
      member: null, content: opts.content, type: opts.replyToId ? MessageType.REPLY : MessageType.DEFAULT,
      created_at: new Date().toISOString(), edited_at: null, pinned: false, mention_everyone: false,
      mentions: [], mention_roles: [], reactions: [],
      attachments: (opts.files || []).map((f) => ({
        id: f.id, filename: f.file.name, size: f.file.size, content_type: f.file.type || 'application/octet-stream',
        url: '', width: null, height: null,
      })),
      message_reference: opts.replyToId ? { message_id: opts.replyToId, channel_id: channelId } : null,
      referenced_message: replyMsg,
      _state: 'pending', _files: opts.files, _progress: opts.files?.length ? 0 : undefined,
    });
  } else {
    store.setPendingState(channelId, nonce, { _state: 'pending', _error: undefined, _progress: opts.files?.length ? 0 : undefined });
  }

  try {
    let msg: Message;
    const payload: Record<string, unknown> = { content: opts.content, nonce };
    if (opts.replyToId) payload.reply_to_id = opts.replyToId;
    if (opts.files && opts.files.length) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));
      opts.files.forEach((f, i) => {
        const name = f.spoiler && !f.file.name.startsWith('SPOILER_') ? `SPOILER_${f.file.name}` : f.file.name;
        form.append(`files[${i}]`, f.file, name);
      });
      const up = uploadWithProgress<Message>(`/channels/${channelId}/messages`, form, (p) =>
        useMessageStore.getState().setPendingState(channelId, nonce, { _progress: p }));
      msg = await up.promise;
    } else {
      msg = await api.post<Message>(`/channels/${channelId}/messages`, payload);
    }
    // gateway may have delivered it already; add() replaces the pending item by nonce either way
    useMessageStore.getState().add({ ...msg, nonce: msg.nonce ?? nonce });
    useMessageStore.getState().removePending(channelId, nonce);
    useGuildStore.getState().setLastMessageId(channelId, msg.id);
  } catch (e) {
    useMessageStore.getState().setPendingState(channelId, nonce, { _state: 'failed', _error: errorMessage(e), _progress: undefined });
    throw e;
  }
}

export function retryMessage(m: ClientMessage, author: PublicUser) {
  if (!m.nonce) return;
  return sendMessage(m.channel_id, { content: m.content, replyToId: m.message_reference?.message_id, files: m._files }, author, m.nonce).catch(() => {});
}
