import { create } from 'zustand';
import type { ForgotPasswordResponse, PresenceStatus, User, UserUpdateResponse, VerificationSentResponse } from '@huddle/shared';
import { api, getToken, setToken } from '../api/client';
import { gateway } from '../api/gateway';

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
  /** Same account, new token (the old one was revoked, e.g. after changing the password). */
  replaceToken(token: string): void;
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
  replaceToken: (token) => { setToken(token); gateway.setToken(token); set({ token }); },
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
export const requestRegister = async (email: string, username: string, password: string) => {
  const res = await api.post<AuthResponse>('/auth/register', { email, username, password });
  if (res.user.verified === false) markCodeSent(res.user.email);
  return res;
};

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

// ---------- email verification & password reset ----------

const SENT_KEY = 'huddle.codeSentAt';

/** Remembers when a code was last sent to an address, so the resend countdown survives a reload. */
export function markCodeSent(email: string, resendAfterSecs = 60): void {
  try { sessionStorage.setItem(SENT_KEY, JSON.stringify({ email: email.toLowerCase(), until: Date.now() + resendAfterSecs * 1000 })); } catch { /* ignore */ }
}

/** Seconds left before another code may be requested for this address (0 if unknown). */
export function resendWait(email: string): number {
  try {
    const v = JSON.parse(sessionStorage.getItem(SENT_KEY) || 'null') as { email: string; until: number } | null;
    if (!v || v.email !== email.toLowerCase()) return 0;
    return Math.max(0, Math.ceil((v.until - Date.now()) / 1000));
  } catch { return 0; }
}

/** Re-reads the signed-in user (e.g. the server said the email isn't verified). */
export async function refreshMe(): Promise<User> {
  const u = await api.get<User>('/users/@me');
  useAuthStore.getState().setUser(u);
  return u;
}

export async function verifyEmail(code: string): Promise<User> {
  const u = await api.post<User>('/auth/verify-email', { code });
  useAuthStore.getState().setUser(u);
  return u;
}

export async function resendVerification(): Promise<VerificationSentResponse> {
  const r = await api.post<VerificationSentResponse>('/auth/verify-email/resend');
  markCodeSent(r.email, r.resend_after);
  return r;
}

/** Applies a PATCH /users/@me result: new token (password change) and the user. */
export function applyUserUpdate(r: UserUpdateResponse): User {
  const { token, ...user } = r;
  if (token) useAuthStore.getState().replaceToken(token);
  useAuthStore.getState().setUser(user);
  return user;
}

/** Changes the account email (needs the current password). With verification on it waits for a code. */
export async function changeEmail(email: string, password: string): Promise<User> {
  const u = applyUserUpdate(await api.patch<UserUpdateResponse>('/users/@me', { email, password }));
  const target = u.pending_email ?? (u.verified === false ? u.email : null);
  if (target) markCodeSent(target);
  return u;
}

export async function cancelEmailChange(): Promise<User> {
  return applyUserUpdate(await api.del<User>('/users/@me/pending-email'));
}

export async function changePassword(password: string, newPassword: string): Promise<User> {
  return applyUserUpdate(await api.patch<UserUpdateResponse>('/users/@me', { password, new_password: newPassword }));
}

export const requestPasswordReset = async (email: string) => {
  const r = await api.post<ForgotPasswordResponse>('/auth/password/forgot', { email });
  markCodeSent(email);
  return r;
};

export const requestResetPassword = (email: string, code: string, newPassword: string) =>
  api.post<AuthResponse>('/auth/password/reset', { email, code, new_password: newPassword });
