// Soundboard: per-server uploaded sounds (fetched lazily, kept fresh by GUILD_SOUNDBOARD_SOUNDS_UPDATE)
// and the short-lived "who just played what" bubbles shown over call tiles.
import { create } from 'zustand';
import type { SoundboardPlayEvent, SoundboardSound } from '@huddle/shared';
import { api, errorMessage, uploadWithProgress } from '../api/client';
import { playSoundboardAudio } from '../voice/soundboard';
import { useVoiceStore } from './voice';
import { useAuthStore } from './auth';
import { toast } from './ui';

export interface SoundPop { key: number; emoji: string | null; name: string }

interface SoundboardState {
  sounds: Record<string, SoundboardSound[]>;
  pops: Record<string, SoundPop>; // user id → latest sound they played
  setSounds(guildId: string, list: SoundboardSound[]): void;
  fetch(guildId: string): Promise<void>;
  showPop(userId: string, pop: Omit<SoundPop, 'key'>): void;
  reset(): void;
}

const POP_MS = 2600;
let popKey = 0;
const popTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();

export const useSoundboardStore = create<SoundboardState>()((set, get) => ({
  sounds: {},
  pops: {},
  setSounds: (guildId, list) => set((s) => ({ sounds: { ...s.sounds, [guildId]: list } })),
  fetch: (guildId) => {
    let p = inflight.get(guildId);
    if (!p) {
      p = api.get<SoundboardSound[]>(`/guilds/${guildId}/soundboard-sounds`)
        .then((list) => get().setSounds(guildId, list))
        .catch(() => {})
        .finally(() => inflight.delete(guildId));
      inflight.set(guildId, p);
    }
    return p;
  },
  showPop: (userId, pop) => {
    clearTimeout(popTimers.get(userId));
    set((s) => ({ pops: { ...s.pops, [userId]: { ...pop, key: ++popKey } } }));
    popTimers.set(userId, setTimeout(() => {
      popTimers.delete(userId);
      set((s) => { const pops = { ...s.pops }; delete pops[userId]; return { pops }; });
    }, POP_MS));
  },
  reset: () => set({ sounds: {}, pops: {} }),
}));

/** SOUNDBOARD_SOUND_PLAY: play it (unless deafened) and show who played it. */
export function handleSoundboardPlay(ev: SoundboardPlayEvent): void {
  const voice = useVoiceStore.getState();
  if (voice.connection?.channelId !== ev.channel_id) return;
  useSoundboardStore.getState().showPop(ev.user_id, { emoji: ev.emoji, name: ev.name });
  const me = useAuthStore.getState().user?.id;
  const serverDeaf = me ? !!voice.states[me]?.deaf : false;
  if (voice.selfDeaf || serverDeaf) return;
  void playSoundboardAudio(ev.sound_id, ev.url);
}

export async function playSound(channelId: string, soundId: string): Promise<boolean> {
  try {
    await api.post(`/channels/${channelId}/soundboard`, { sound_id: soundId });
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
}

export async function uploadSound(guildId: string, file: File, name: string, emoji: string): Promise<SoundboardSound> {
  const form = new FormData();
  form.append('name', name);
  if (emoji) form.append('emoji', emoji);
  form.append('file', file);
  const s = await uploadWithProgress<SoundboardSound>(`/guilds/${guildId}/soundboard-sounds`, form).promise;
  const st = useSoundboardStore.getState();
  const list = st.sounds[guildId] ?? [];
  if (!list.some((x) => x.id === s.id)) st.setSounds(guildId, [...list, s]);
  return s;
}

export async function updateSound(guildId: string, soundId: string, patch: { name?: string; emoji?: string | null }): Promise<void> {
  const s = await api.patch<SoundboardSound>(`/guilds/${guildId}/soundboard-sounds/${soundId}`, patch);
  const st = useSoundboardStore.getState();
  st.setSounds(guildId, (st.sounds[guildId] ?? []).map((x) => (x.id === s.id ? s : x)));
}

export async function deleteSound(guildId: string, soundId: string): Promise<void> {
  await api.del(`/guilds/${guildId}/soundboard-sounds/${soundId}`);
  const st = useSoundboardStore.getState();
  st.setSounds(guildId, (st.sounds[guildId] ?? []).filter((x) => x.id !== soundId));
}
