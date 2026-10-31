import type { User } from '@huddle/shared';
import { gateway } from '../api/gateway';
import { onEmailNotVerified, onUnauthorized } from '../api/client';
import { refreshMe, useAuthStore } from '../stores/auth';
import { bindGateway, resetAllStores } from '../stores/gatewayBindings';
import { useUIStore } from '../stores/ui';
import { voiceActions } from '../stores/voice';
import { navigate } from './nav';
import { loadIceServers } from '../voice/config';
import { findAccount, listAccounts, removeAccount, upsertAccount } from './accounts';

export function startSession() {
  const token = useAuthStore.getState().token;
  if (!token) return;
  bindGateway();
  void loadIceServers();
  if (gateway.status === 'idle' || gateway.status === 'closed') gateway.connect(token);
}

/** Closes the gateway and empties every store (the auth store is left to the caller). */
function teardown() {
  try { voiceActions.leave(); } catch { /* ignore */ }
  gateway.disconnect();
  resetAllStores();
  const ui = useUIStore.getState();
  ui.closeAllModals();
  ui.closePopout();
  ui.closeContextMenu();
  useUIStore.setState({ replyTo: {}, editing: null, searchOpen: false, mobileNavOpen: false, mobileMembersOpen: false });
}

/** Swaps the live session for another token: tears down the gateway and connects again as that account. */
function enter(token: string, user: User | null) {
  teardown();
  useAuthStore.getState().switchTo(token, user);
  startSession();
  navigate('/channels/@me');
}

/** Switches to an account stored on this device. */
export function switchAccount(id: string) {
  const acc = findAccount(id);
  if (!acc || acc.token === useAuthStore.getState().token) return;
  enter(acc.token, null);
}

/** After signing in from "Add an account": remember the new account and make it the active one. */
export function adoptSession(token: string, user: User) {
  upsertAccount(user, token);
  if (useAuthStore.getState().user?.id === user.id && useAuthStore.getState().status === 'ready') {
    navigate('/channels/@me');
    return;
  }
  enter(token, user);
}

/** Opens the login page in add-account mode; the current session keeps running. */
export function addAccount() {
  useUIStore.getState().closeAllModals();
  navigate('/login?add=1');
}

/** Logs the active account out. If other accounts are remembered, the first one takes over. */
export function logout() {
  const me = useAuthStore.getState().user?.id;
  const token = useAuthStore.getState().token;
  const gone = listAccounts().find((a) => a.id === me || a.token === token);
  if (gone) removeAccount(gone.id);
  const next = listAccounts()[0];
  if (next) { enter(next.token, null); return; }
  teardown();
  useAuthStore.getState().clear();
  navigate('/login');
}

/** Forgets a non-active account (or logs out the active one). */
export function forgetAccount(id: string) {
  if (id === useAuthStore.getState().user?.id) logout();
  else removeAccount(id);
}

onUnauthorized(() => {
  if (useAuthStore.getState().token) logout();
});

// The server says this account must confirm its email first (REST 403 or gateway 4012): load the user, whose
// `verified: false` makes RequireAuth show the verify screen; the gateway stays down until it's verified.
let checkingVerification = false;
onEmailNotVerified(() => {
  if (!useAuthStore.getState().token || checkingVerification) return;
  checkingVerification = true;
  refreshMe()
    .then((u) => {
      if (u.verified !== false) return;
      teardown();
      useAuthStore.getState().setStatus('connecting');
    })
    .catch(() => { /* a 401 logs out via onUnauthorized */ })
    .finally(() => { checkingVerification = false; });
});

// Keep the remembered copy of the active account (token + name/avatar) current.
useAuthStore.subscribe((s, prev) => {
  if (s.user && s.token && (s.user !== prev.user || s.token !== prev.token)) upsertAccount(s.user, s.token);
});
