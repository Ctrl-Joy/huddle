import { create } from 'zustand';
import { TYPING_TIMEOUT_MS } from '@huddle/shared';

interface TypingState {
  typing: Record<string, Record<string, number>>; // channelId → userId → expiresAt
  start(channelId: string, userId: string): void;
  stop(channelId: string, userId: string): void;
  prune(): void;
}

export const useTypingStore = create<TypingState>()((set, get) => ({
  typing: {},
  start: (channelId, userId) => set((s) => ({
    typing: { ...s.typing, [channelId]: { ...(s.typing[channelId] || {}), [userId]: Date.now() + TYPING_TIMEOUT_MS + 1000 } },
  })),
  stop: (channelId, userId) => set((s) => {
    if (!s.typing[channelId]?.[userId]) return {};
    const c = { ...s.typing[channelId] }; delete c[userId];
    return { typing: { ...s.typing, [channelId]: c } };
  }),
  prune: () => {
    const now = Date.now();
    const cur = get().typing;
    let changed = false;
    const next: TypingState['typing'] = {};
    for (const [cid, users] of Object.entries(cur)) {
      const kept: Record<string, number> = {};
      for (const [uid, exp] of Object.entries(users)) { if (exp > now) kept[uid] = exp; else changed = true; }
      next[cid] = kept;
    }
    if (changed) set({ typing: next });
  },
}));

setInterval(() => useTypingStore.getState().prune(), 1000);
