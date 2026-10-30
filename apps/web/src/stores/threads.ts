// The open thread: shown beside the parent channel / forum on desktop, full screen on phones.
import { create } from 'zustand';

export interface ThreadPanel {
  parentId: string;
  /** null = the "new thread" form */
  threadId: string | null;
  /** new thread started from this message (in the parent channel) */
  starterMessageId?: string | null;
}

interface ThreadStore {
  panel: ThreadPanel | null;
  open(parentId: string, threadId: string): void;
  startNew(parentId: string, starterMessageId?: string | null): void;
  close(): void;
}

export const useThreadStore = create<ThreadStore>()((set) => ({
  panel: null,
  open: (parentId, threadId) => set({ panel: { parentId, threadId } }),
  startNew: (parentId, starterMessageId = null) => set({ panel: { parentId, threadId: null, starterMessageId } }),
  close: () => set({ panel: null }),
}));

/** The panel if it belongs to this parent channel. */
export function useThreadPanel(parentId: string): ThreadPanel | null {
  return useThreadStore((s) => (s.panel?.parentId === parentId ? s.panel : null));
}
