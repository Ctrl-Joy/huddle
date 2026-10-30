import { create } from 'zustand';
import type { Presence, PresenceStatus } from '@huddle/shared';

interface PresenceState {
  presences: Record<string, Presence>;
  set(list: Presence[]): void;
  upsert(p: Presence): void;
  reset(): void;
}

export const usePresenceStore = create<PresenceState>()((set) => ({
  presences: {},
  set: (list) => set((s) => ({ presences: { ...s.presences, ...Object.fromEntries(list.map((p) => [p.user_id, p])) } })),
  upsert: (p) => set((s) => ({ presences: { ...s.presences, [p.user_id]: p } })),
  reset: () => set({ presences: {} }),
}));

export function useStatus(userId: string | undefined): PresenceStatus {
  return usePresenceStore((s) => (userId ? normalize(s.presences[userId]?.status) : 'offline'));
}
export function useCustomStatus(userId: string | undefined): string | null {
  return usePresenceStore((s) => (userId ? s.presences[userId]?.custom_status ?? null : null));
}
export function normalize(s: PresenceStatus | undefined): PresenceStatus {
  if (!s || s === 'invisible') return 'offline';
  return s;
}
export const STATUS_LABEL: Record<PresenceStatus, string> = {
  online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', invisible: 'Invisible', offline: 'Offline',
};
