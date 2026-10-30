// UI state: modal stack, context menu, popouts, panels, theme.
import { create } from 'zustand';
import type { ReactNode } from 'react';

export type ModalType =
  | 'createServer' | 'joinServer' | 'createChannel' | 'createCategory' | 'invite' | 'userSettings'
  | 'serverSettings' | 'channelSettings' | 'notificationSettings' | 'confirm' | 'createGroupDM'
  | 'quickSwitcher' | 'nickname' | 'timeout' | 'ban' | 'lightbox' | 'customStatus'
  | 'createPoll' | 'forwardMessage';

export interface ModalEntry { key: number; type: ModalType; props: Record<string, any> }

export interface MenuItem {
  label?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  separator?: boolean;
  hint?: string;
  icon?: ReactNode;
  submenu?: MenuItem[];
  color?: string;
}

export interface ContextMenuState { x: number; y: number; items: MenuItem[]; tag?: string; width?: number }

export interface PopoutState {
  kind: 'user';
  userId: string;
  guildId: string | null;
  rect: { left: number; top: number; right: number; bottom: number };
  placement?: 'right' | 'left';
}

export type Theme = 'dark' | 'light';

interface UIState {
  modals: ModalEntry[];
  contextMenu: ContextMenuState | null;
  popout: PopoutState | null;
  memberListOpen: boolean;
  mobileNavOpen: boolean;
  /** phones: the members / search drawer that slides in from the right */
  mobileMembersOpen: boolean;
  searchOpen: boolean;
  searchQuery: string;
  searchGuildId: string | null;
  theme: Theme;
  collapsedCategories: Record<string, boolean>;
  replyTo: Record<string, string | null>; // channelId → messageId
  editing: { channelId: string; messageId: string } | null;
  toasts: { id: number; text: string; kind?: 'error' | 'success' | 'info' }[];

  openModal(type: ModalType, props?: Record<string, any>): void;
  closeModal(key?: number): void;
  closeAllModals(): void;
  openContextMenu(e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void }, items: MenuItem[], opts?: { tag?: string; width?: number }): void;
  closeContextMenu(): void;
  openPopout(p: PopoutState): void;
  closePopout(): void;
  toggleMemberList(): void;
  setMobileNav(open: boolean): void;
  setMobileMembers(open: boolean): void;
  openSearch(guildId: string, query: string): void;
  closeSearch(): void;
  setTheme(t: Theme): void;
  toggleCategory(id: string): void;
  setReplyTo(channelId: string, messageId: string | null): void;
  setEditing(e: { channelId: string; messageId: string } | null): void;
  toast(text: string, kind?: 'error' | 'success' | 'info'): void;
}

let modalKey = 1;
let toastId = 1;

function load<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }

export const useUIStore = create<UIState>()((set, get) => ({
  modals: [],
  contextMenu: null,
  popout: null,
  memberListOpen: load('huddle.memberList', true),
  mobileNavOpen: false,
  mobileMembersOpen: false,
  searchOpen: false,
  searchQuery: '',
  searchGuildId: null,
  theme: (() => { try { return (localStorage.getItem('huddle.theme') as Theme) || 'dark'; } catch { return 'dark'; } })(),
  collapsedCategories: load('huddle.collapsed', {}),
  replyTo: {},
  editing: null,
  toasts: [],

  openModal: (type, props = {}) => set((s) => ({ modals: [...s.modals, { key: modalKey++, type, props }], contextMenu: null, popout: null })),
  closeModal: (key) => set((s) => ({ modals: key === undefined ? s.modals.slice(0, -1) : s.modals.filter((m) => m.key !== key) })),
  closeAllModals: () => set({ modals: [] }),
  openContextMenu: (e, items, opts) => {
    e.preventDefault?.();
    e.stopPropagation?.();
    if (!items.length) return;
    set({ contextMenu: { x: e.clientX, y: e.clientY, items, ...opts }, popout: null });
  },
  closeContextMenu: () => set({ contextMenu: null }),
  openPopout: (p) => set({ popout: p, contextMenu: null }),
  closePopout: () => set({ popout: null }),
  toggleMemberList: () => { const v = !get().memberListOpen; save('huddle.memberList', v); set({ memberListOpen: v }); },
  setMobileNav: (open) => set(open ? { mobileNavOpen: true, mobileMembersOpen: false } : { mobileNavOpen: false }),
  setMobileMembers: (open) => set(open ? { mobileMembersOpen: true, mobileNavOpen: false } : { mobileMembersOpen: false }),
  openSearch: (guildId, query) => set({ searchOpen: true, searchQuery: query, searchGuildId: guildId, mobileMembersOpen: true, mobileNavOpen: false }),
  closeSearch: () => set({ searchOpen: false, mobileMembersOpen: false }),
  setTheme: (t) => {
    try { localStorage.setItem('huddle.theme', t); } catch { /* ignore */ }
    document.documentElement.setAttribute('data-theme', t);
    set({ theme: t });
  },
  toggleCategory: (id) => set((s) => {
    const next = { ...s.collapsedCategories, [id]: !s.collapsedCategories[id] };
    save('huddle.collapsed', next);
    return { collapsedCategories: next };
  }),
  setReplyTo: (channelId, messageId) => set((s) => ({ replyTo: { ...s.replyTo, [channelId]: messageId } })),
  setEditing: (editing) => set({ editing }),
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
  },
}));

export const toast = (text: string, kind?: 'error' | 'success' | 'info') => useUIStore.getState().toast(text, kind);
export const openModal = (type: ModalType, props?: Record<string, any>) => useUIStore.getState().openModal(type, props);

export function confirmDialog(opts: { title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<void> | void }) {
  openModal('confirm', opts);
}
