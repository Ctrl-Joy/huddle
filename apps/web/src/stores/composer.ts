// Per-channel composer drafts and pending (not yet sent) file attachments.
import { create } from 'zustand';
import type { PendingFile } from './messages';

interface ComposerState {
  drafts: Record<string, string>;
  files: Record<string, PendingFile[]>;
  setDraft(channelId: string, text: string): void;
  addFiles(channelId: string, files: File[]): void;
  removeFile(channelId: string, id: string): void;
  toggleSpoiler(channelId: string, id: string): void;
  clearFiles(channelId: string): void;
}

let fid = 1;

export const useComposerStore = create<ComposerState>()((set) => ({
  drafts: {},
  files: {},
  setDraft: (channelId, text) => set((s) => ({ drafts: { ...s.drafts, [channelId]: text } })),
  addFiles: (channelId, files) => set((s) => ({
    files: { ...s.files, [channelId]: [...(s.files[channelId] || []), ...files.map((file) => ({ id: `f${fid++}`, file }))].slice(0, 10) },
  })),
  removeFile: (channelId, id) => set((s) => ({ files: { ...s.files, [channelId]: (s.files[channelId] || []).filter((f) => f.id !== id) } })),
  toggleSpoiler: (channelId, id) => set((s) => ({ files: { ...s.files, [channelId]: (s.files[channelId] || []).map((f) => (f.id === id ? { ...f, spoiler: !f.spoiler } : f)) } })),
  clearFiles: (channelId) => set((s) => ({ files: { ...s.files, [channelId]: [] } })),
}));
