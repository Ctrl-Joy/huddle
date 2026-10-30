import { create } from 'zustand';
import type { Ban } from '@huddle/shared';
import { api } from '../api/client';

interface BanState {
  bans: Record<string, Ban[] | undefined>;
  fetch(guildId: string): Promise<void>;
  add(guildId: string, b: Ban): void;
  remove(guildId: string, userId: string): void;
}

export const useBanStore = create<BanState>()((set, get) => ({
  bans: {},
  fetch: async (guildId) => {
    const list = await api.get<Ban[]>(`/guilds/${guildId}/bans`);
    set((s) => ({ bans: { ...s.bans, [guildId]: list } }));
  },
  add: (guildId, b) => {
    const cur = get().bans[guildId];
    if (!cur) return;
    set((s) => ({ bans: { ...s.bans, [guildId]: [...cur.filter((x) => x.user.id !== b.user.id), b] } }));
  },
  remove: (guildId, userId) => {
    const cur = get().bans[guildId];
    if (!cur) return;
    set((s) => ({ bans: { ...s.bans, [guildId]: cur.filter((x) => x.user.id !== userId) } }));
  },
}));
