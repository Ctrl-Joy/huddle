import { create } from 'zustand';
import type { PresenceStatus, User } from '@huddle/shared';
import { api, getToken, setToken } from '../api/client';

export type SessionStatus = 'loggedOut' | 'connecting' | 'ready';

interface AuthState {
  token: string | null;
  user: User | null;
  status: SessionStatus;
  /** Status the gateway currently reports for us (may be auto-idle). */
  currentStatus: PresenceStatus;
  setSession(token: string, user: User): void;
  /** Account switch: new token, user arrives with READY (or is already known). */
  switchTo(token: string, user: User | null): void;
  setUser(u: User): void;
  patchUser(u: Partial<User>): void;
  setStatus(s: SessionStatus): void;
  setCurrentStatus(s: PresenceStatus): void;
  clear(): void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: getToken(),
  user: null,
  status: getToken() ? 'connecting' : 'loggedOut',
  currentStatus: 'online',
  setSession: (token, user) => { setToken(token); set({ token, user, status: 'connecting' }); },
  switchTo: (token, user) => { setToken(token); set({ token, user, status: 'connecting', currentStatus: 'online' }); },
  setUser: (user) => set({ user, currentStatus: user.status }),
  patchUser: (u) => set((s) => (s.user ? { user: { ...s.user, ...u } } : {})),
  setStatus: (status) => set({ status }),
  setCurrentStatus: (currentStatus) => set({ currentStatus }),
  clear: () => { setToken(null); set({ token: null, user: null, status: 'loggedOut' }); },
}));

export const meId = (): string => useAuthStore.getState().user?.id ?? '';
export const useMe = () => useAuthStore((s) => s.user);

export interface AuthResponse { token: string; user: User }

// request* only talk to the server; login/register also make the result the active session.
export const requestLogin = (loginName: string, password: string) => api.post<AuthResponse>('/auth/login', { login: loginName, password });
export const requestRegister = (email: string, username: string, password: string) => api.post<AuthResponse>('/auth/register', { email, username, password });

export async function login(loginName: string, password: string) {
  const res = await requestLogin(loginName, password);
  useAuthStore.getState().setSession(res.token, res.user);
  return res;
}

export async function register(email: string, username: string, password: string) {
  const res = await requestRegister(email, username, password);
  useAuthStore.getState().setSession(res.token, res.user);
  return res;
}
