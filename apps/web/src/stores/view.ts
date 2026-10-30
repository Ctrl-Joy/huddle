// What the user is currently looking at — used for acks and notification suppression.
import { create } from 'zustand';

interface ViewState {
  guildId: string | null; // null = home/DMs
  channelId: string | null;
  atBottom: boolean;
  set(p: Partial<Omit<ViewState, 'set'>>): void;
}

export const useViewStore = create<ViewState>()((set) => ({
  guildId: null,
  channelId: null,
  atBottom: true,
  set: (p) => set(p),
}));
