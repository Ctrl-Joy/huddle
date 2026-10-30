import { useEffect, useState } from 'react';
import { ChannelType } from '@huddle/shared';
import { gateway, type GatewayStatus } from '../../api/gateway';
import { useAuthStore } from '../../stores/auth';
import { useGuildStore } from '../../stores/guilds';
import { useReadStateStore, isUnread } from '../../stores/readStates';
import { useUIStore } from '../../stores/ui';
import { channelVisible } from '../../lib/permissionsCore';

const IDLE_MS = 10 * 60 * 1000;

/** Global effects: Ctrl+K, auto-idle presence, document title badge. */
export function useAppEffects() {
  // Ctrl/Cmd+K quick switcher, Esc closes layers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const ui = useUIStore.getState();
        const top = ui.modals[ui.modals.length - 1];
        if (top?.type === 'quickSwitcher') ui.closeModal(top.key);
        else ui.openModal('quickSwitcher');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auto idle after 10 minutes without input
  useEffect(() => {
    let last = Date.now();
    let idle = false;
    const preferred = () => useAuthStore.getState().user?.status ?? 'online';
    const activity = () => {
      last = Date.now();
      if (idle) {
        idle = false;
        const p = preferred();
        gateway.updatePresence({ status: p });
        useAuthStore.getState().setCurrentStatus(p);
      }
    };
    const tick = setInterval(() => {
      if (!idle && Date.now() - last > IDLE_MS && preferred() === 'online') {
        idle = true;
        gateway.updatePresence({ status: 'idle' });
        useAuthStore.getState().setCurrentStatus('idle');
      }
    }, 15_000);
    const evs = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'wheel'] as const;
    for (const ev of evs) window.addEventListener(ev, activity, { passive: true });
    return () => { clearInterval(tick); for (const ev of evs) window.removeEventListener(ev, activity); };
  }, []);

  // Document title "(N) Huddle"
  const channels = useGuildStore((s) => s.channels);
  const readStates = useReadStateStore((s) => s.readStates);
  const me = useAuthStore((s) => s.user?.id ?? '');
  useEffect(() => {
    let n = 0;
    for (const c of Object.values(channels)) {
      const rs = readStates[c.id];
      if (c.type === ChannelType.DM || c.type === ChannelType.GROUP_DM) {
        if (isUnread(c, readStates)) n += Math.max(1, rs?.mention_count ?? 0);
      } else if (rs?.mention_count && channelVisible(c, me)) n += rs.mention_count;
    }
    document.title = n > 0 ? `(${n}) Huddle` : 'Huddle';
  }, [channels, readStates, me]);
}

export function useGatewayStatus(): GatewayStatus {
  const [s, setS] = useState<GatewayStatus>(gateway.status);
  useEffect(() => gateway.onStatus((x) => setS(x)), []);
  return s;
}
