import { useRef, useState } from 'react';
import type { PresenceStatus } from '@huddle/shared';
import { useAuthStore } from '../../stores/auth';
import { useVoiceStore, voiceActions } from '../../stores/voice';
import { useUIStore, openModal, type MenuItem } from '../../stores/ui';
import { usePresenceStore, STATUS_LABEL } from '../../stores/presences';
import { gateway } from '../../api/gateway';
import { updateMe } from '../../lib/actions';
import { copyText } from '../../lib/format';
import { Avatar, StatusDot, Tooltip } from '../common/Avatar';
import { IconHeadphones, IconHeadphonesOff, IconMic, IconMicOff, IconSettings } from '../common/icons';
import { AccountSwitcherModal } from '../modals/AccountSwitcherModal';
import { listAccounts, accountAsUser } from '../../lib/accounts';
import { switchAccount } from '../../lib/session';

export function setMyStatus(status: PresenceStatus) {
  const user = useAuthStore.getState().user;
  if (!user) return;
  gateway.updatePresence({ status, custom_status: user.custom_status });
  useAuthStore.getState().patchUser({ status });
  useAuthStore.getState().setCurrentStatus(status);
  usePresenceStore.getState().upsert({ user_id: user.id, status: status === 'invisible' ? 'offline' : status, custom_status: user.custom_status });
}

export async function setCustomStatus(text: string | null) {
  const user = useAuthStore.getState().user;
  if (!user) return;
  await updateMe({ custom_status: text });
  gateway.updatePresence({ status: user.status, custom_status: text });
  usePresenceStore.getState().upsert({ user_id: user.id, status: user.status === 'invisible' ? 'offline' : user.status, custom_status: text });
}

const STATUS_HINTS: Partial<Record<PresenceStatus, string>> = {
  dnd: 'You will not receive desktop notifications',
  invisible: 'You will appear offline, but still have full access',
};

export function UserPanel() {
  const user = useAuthStore((s) => s.user!);
  const current = useAuthStore((s) => s.currentStatus);
  const selfMute = useVoiceStore((s) => s.selfMute);
  const selfDeaf = useVoiceStore((s) => s.selfDeaf);
  const ref = useRef<HTMLButtonElement>(null);
  const [switcher, setSwitcher] = useState(false);
  const shownStatus: PresenceStatus = current === 'invisible' ? 'offline' : current;

  const openStatus = () => {
    const r = ref.current!.getBoundingClientRect();
    const statuses: PresenceStatus[] = ['online', 'idle', 'dnd', 'invisible'];
    const items: MenuItem[] = [
      ...statuses.map((s) => ({
        label: STATUS_LABEL[s], hint: STATUS_HINTS[s], checked: user.status === s,
        icon: <StatusDot status={s === 'invisible' ? 'offline' : s} size={10} ring="var(--bg-elevated)" />,
        onClick: () => setMyStatus(s),
      })),
      { separator: true },
      { label: user.custom_status ? 'Edit Custom Status' : 'Set Custom Status', onClick: () => openModal('customStatus') },
      ...(user.custom_status ? [{ label: 'Clear Custom Status', onClick: () => void setCustomStatus(null) }] : []),
      { separator: true },
      { label: 'Copy Username', onClick: () => void copyText(user.username) },
      { separator: true },
      {
        label: 'Switch Accounts',
        submenu: [
          ...listAccounts().filter((a) => a.id !== user.id).map((a) => ({
            label: a.display_name || a.username, hint: a.username,
            icon: <Avatar user={accountAsUser(a)} size={20} />,
            onClick: () => switchAccount(a.id),
          })),
          { separator: true },
          { label: 'Manage Accounts', onClick: () => setSwitcher(true) },
        ],
      },
    ];
    useUIStore.getState().openContextMenu({ clientX: r.left, clientY: r.top - 8 }, items, { tag: 'status-picker', width: 240 });
  };

  return (
    <div className="user-panel">
      <button ref={ref} className="user-panel-id" onClick={openStatus} aria-label="Set status">
        <Avatar user={user} size={34} status={shownStatus} ring="var(--bg-panel)" />
        <span className="user-panel-names">
          <span className="user-panel-name truncate">{user.display_name || user.username}</span>
          <span className="user-panel-sub truncate">
            <span className="sub-a">{user.custom_status || STATUS_LABEL[shownStatus]}</span>
            <span className="sub-b">{user.username}</span>
          </span>
        </span>
      </button>
      <div className="user-panel-actions">
        <Tooltip label={selfMute ? 'Unmute' : 'Mute'}>
          <button className={'icon-btn' + (selfMute ? ' danger-active' : '')} aria-pressed={selfMute} aria-label={selfMute ? 'Unmute' : 'Mute'} onClick={() => voiceActions.toggleMute()}>
            {selfMute ? <IconMicOff size={19} /> : <IconMic size={19} />}
          </button>
        </Tooltip>
        <Tooltip label={selfDeaf ? 'Undeafen' : 'Deafen'}>
          <button className={'icon-btn' + (selfDeaf ? ' danger-active' : '')} aria-pressed={selfDeaf} aria-label={selfDeaf ? 'Undeafen' : 'Deafen'} onClick={() => voiceActions.toggleDeafen()}>
            {selfDeaf ? <IconHeadphonesOff size={19} /> : <IconHeadphones size={19} />}
          </button>
        </Tooltip>
        <Tooltip label="User Settings">
          <button className="icon-btn" aria-label="User Settings" onClick={() => openModal('userSettings')}><IconSettings size={19} /></button>
        </Tooltip>
      </div>
      {switcher && <AccountSwitcherModal close={() => setSwitcher(false)} />}
    </div>
  );
}
