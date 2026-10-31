// Sticker + GIF actions and helpers (server stickers CRUD, sending, GIF search, the wave-back tracker).
import {
  BUILTIN_STICKERS, WAVE_STICKER_IDS, findBuiltinSticker, stickerItem, stickerLabel,
  type GifSearchResponse, type GuildSticker, type Message, type StickerItem,
} from '@huddle/shared';
import { api, errorMessage, uploadWithProgress } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { sendMessage } from '../stores/messages';
import { useStickerStore } from '../stores/stickers';
import { toast } from '../stores/ui';
import { ApiError } from '../api/client';

// ---- server stickers ----
export async function uploadSticker(guildId: string, f: { file: File; name: string; tags: string; description: string }) {
  const form = new FormData();
  form.append('name', f.name);
  form.append('tags', f.tags);
  if (f.description.trim()) form.append('description', f.description.trim());
  form.append('file', f.file);
  const s = await uploadWithProgress<GuildSticker>(`/guilds/${guildId}/stickers`, form).promise;
  const st = useStickerStore.getState();
  const list = st.byGuild[guildId] || [];
  if (s?.id && !list.some((x) => x.id === s.id)) st.set(guildId, [...list, s]);
  return s;
}

export async function updateSticker(guildId: string, stickerId: string, patch: Partial<Pick<GuildSticker, 'name' | 'tags' | 'description'>>) {
  const s = await api.patch<GuildSticker>(`/guilds/${guildId}/stickers/${stickerId}`, patch);
  const st = useStickerStore.getState();
  if (s?.id) st.set(guildId, (st.byGuild[guildId] || []).map((x) => (x.id === s.id ? s : x)));
  return s;
}

export async function deleteSticker(guildId: string, stickerId: string) {
  await api.del(`/guilds/${guildId}/stickers/${stickerId}`);
  const st = useStickerStore.getState();
  st.set(guildId, (st.byGuild[guildId] || []).filter((x) => x.id !== stickerId));
}

// ---- sending ----
export function sendSticker(channelId: string, sticker: StickerItem, replyToId?: string | null) {
  const me = useAuthStore.getState().user;
  if (!me) return Promise.resolve();
  return sendMessage(channelId, { content: '', sticker: stickerItem(sticker), replyToId }, me).catch((e) => {
    if (e instanceof ApiError && e.status === 429) toast('You are sending messages too quickly. Slow down!', 'error');
  });
}

/** Sends a picked GIF as its provider URL; the server turns it into an inline animated embed. */
export function sendGif(channelId: string, url: string, replyToId?: string | null) {
  const me = useAuthStore.getState().user;
  if (!me) return Promise.resolve();
  return sendMessage(channelId, { content: url, replyToId }, me).catch((e) => toast(errorMessage(e), 'error'));
}

export function searchGifs(q: string, offset = 0, signal?: AbortSignal) {
  return q.trim()
    ? api.get<GifSearchResponse>('/gifs/search', { q: q.trim(), offset: String(offset) }, signal)
    : api.get<GifSearchResponse>('/gifs/trending', { offset: String(offset) }, signal);
}

/** Case-insensitive match on name, related emoji or description. */
export function matchSticker(s: { name: string; tags: string; description: string | null }, q: string): boolean {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  return s.name.toLowerCase().includes(n) || s.tags.includes(q.trim()) || !!s.description?.toLowerCase().includes(n);
}

export const BUILTIN_PACK = BUILTIN_STICKERS;

// ---- "Wave to say hi!" ----
// Remembered per browser (the reply itself is the server-side record); also hidden when a wave reply
// from you is in the loaded history.
const WAVED_KEY = 'huddle.waved';
const MAX_WAVED = 300;

function readWaved(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(WAVED_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function hasWaved(messageId: string): boolean {
  return readWaved().includes(messageId);
}

/** Replies to a join message with a waving sticker (a random one from WAVE_STICKER_IDS unless given). */
export function waveAt(join: Message, sticker: StickerItem = findBuiltinSticker(WAVE_STICKER_IDS[Math.floor(Math.random() * WAVE_STICKER_IDS.length)])!) {
  try {
    localStorage.setItem(WAVED_KEY, JSON.stringify([...readWaved().filter((x) => x !== join.id), join.id].slice(-MAX_WAVED)));
  } catch { /* storage blocked: the button just comes back after a reload */ }
  return sendSticker(join.channel_id, sticker, join.id);
}

/** "[sticker] name" for previews when a message has no text. */
export function stickerPreview(m: Pick<Message, 'sticker_items'>): string {
  const s = m.sticker_items?.[0];
  return s ? stickerLabel(s) : '';
}
