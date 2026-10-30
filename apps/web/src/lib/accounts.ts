// Accounts remembered on this device for quick switching (token + a little profile for the switcher list).
// The active one is always the token in 'huddle.token' (api/client); this list just remembers the others.
import { useSyncExternalStore } from 'react';
import type { PublicUser, User } from '@huddle/shared';

const KEY = 'huddle.accounts';
export const MAX_ACCOUNTS = 5;

export interface StoredAccount {
  id: string;
  username: string;
  display_name: string | null;
  avatar: string | null;
  token: string;
}

let cache: StoredAccount[] | null = null;
const listeners = new Set<() => void>();

function read(): StoredAccount[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    cache = Array.isArray(v) ? v.filter((a) => a && typeof a.id === 'string' && typeof a.token === 'string') : [];
  } catch { cache = []; }
  return cache!;
}

function write(list: StoredAccount[]) {
  cache = list;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  for (const l of listeners) l();
}

// another tab added/removed an account
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) { cache = null; for (const l of listeners) l(); } });
}

export function listAccounts(): StoredAccount[] { return read(); }

export function findAccount(id: string): StoredAccount | undefined { return read().find((a) => a.id === id); }

/** Adds or refreshes an account. Over the limit, the least recently added other account is forgotten. */
export function upsertAccount(user: User | PublicUser, token: string): void {
  const list = read();
  const entry: StoredAccount = { id: user.id, username: user.username, display_name: user.display_name, avatar: user.avatar, token };
  const i = list.findIndex((a) => a.id === user.id);
  if (i >= 0) {
    const cur = list[i];
    if (cur.token === token && cur.username === entry.username && cur.display_name === entry.display_name && cur.avatar === entry.avatar) return;
    write(list.map((a, j) => (j === i ? entry : a)));
    return;
  }
  const next = [...list, entry];
  while (next.length > MAX_ACCOUNTS) next.splice(next.findIndex((a) => a.id !== user.id), 1);
  write(next);
}

export function removeAccount(id: string): void {
  const list = read();
  if (list.some((a) => a.id === id)) write(list.filter((a) => a.id !== id));
}

export function useAccounts(): StoredAccount[] {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, read, read);
}

/** Enough of a PublicUser for <Avatar>. */
export function accountAsUser(a: StoredAccount): PublicUser {
  return { id: a.id, username: a.username, display_name: a.display_name, avatar: a.avatar, banner_color: null, bio: null, created_at: '' };
}
