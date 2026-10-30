import { create } from 'zustand';
import type { Message } from '@huddle/shared';
import { api } from '../api/client';

interface PinsState {
  pins: Record<string, { list: Message[] | null; stale: boolean; loading: boolean }>;
  fetch(channelId: string): Promise<void>;
  invalidate(channelId: string): void;
}

export const usePinsStore = create<PinsState>()((set, get) => ({
  pins: {},
  fetch: async (channelId) => {
    const cur = get().pins[channelId];
    if (cur?.loading) return;
    set((s) => ({ pins: { ...s.pins, [channelId]: { list: cur?.list ?? null, stale: false, loading: true } } }));
    try {
      const list = await api.get<Message[]>(`/channels/${channelId}/pins`);
      set((s) => ({ pins: { ...s.pins, [channelId]: { list, stale: false, loading: false } } }));
    } catch {
      set((s) => ({ pins: { ...s.pins, [channelId]: { list: cur?.list ?? [], stale: true, loading: false } } }));
    }
  },
  invalidate: (channelId) => set((s) => (s.pins[channelId] ? { pins: { ...s.pins, [channelId]: { ...s.pins[channelId], stale: true } } } : {})),
}));
