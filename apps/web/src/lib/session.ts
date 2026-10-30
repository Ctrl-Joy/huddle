import { gateway } from '../api/gateway';
import { onUnauthorized } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { bindGateway, resetAllStores } from '../stores/gatewayBindings';
import { voiceActions } from '../stores/voice';
import { navigate } from './nav';

export function startSession() {
  const token = useAuthStore.getState().token;
  if (!token) return;
  bindGateway();
  if (gateway.status === 'idle' || gateway.status === 'closed') gateway.connect(token);
}

export function logout() {
  try { voiceActions.leave(); } catch { /* ignore */ }
  gateway.disconnect();
  resetAllStores();
  useAuthStore.getState().clear();
  navigate('/login');
}

onUnauthorized(() => {
  if (useAuthStore.getState().token) logout();
});
