import { create } from 'zustand';
import { RelationshipType, type Relationship } from '@huddle/shared';

interface RelationshipState {
  relationships: Record<string, Relationship>;
  set(list: Relationship[]): void;
  upsert(r: Relationship): void;
  remove(id: string): void;
  reset(): void;
}

export const useRelationshipStore = create<RelationshipState>()((set) => ({
  relationships: {},
  set: (list) => set({ relationships: Object.fromEntries(list.map((r) => [r.id, r])) }),
  upsert: (r) => set((s) => ({ relationships: { ...s.relationships, [r.id]: r } })),
  remove: (id) => set((s) => { const next = { ...s.relationships }; delete next[id]; return { relationships: next }; }),
  reset: () => set({ relationships: {} }),
}));

export function usePendingIncomingCount(): number {
  return useRelationshipStore((s) => Object.values(s.relationships).filter((r) => r.type === RelationshipType.PENDING_INCOMING).length);
}
export function isBlocked(userId: string): boolean {
  return useRelationshipStore.getState().relationships[userId]?.type === RelationshipType.BLOCKED;
}
