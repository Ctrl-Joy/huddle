import { useAuthStore } from '../../stores/auth';
import { confirmDialog } from '../../stores/ui';
import { MAX_ACCOUNTS, accountAsUser, useAccounts } from '../../lib/accounts';
import { addAccount, forgetAccount, switchAccount } from '../../lib/session';
import { Avatar } from '../common/Avatar';
import { IconCheck, IconPlus } from '../common/icons';
import { Modal } from './Modal';

/** "Switch Accounts" from the user panel: every account remembered on this device. */
export function AccountSwitcherModal({ close }: { close: () => void }) {
  const accounts = useAccounts();
  const me = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.currentStatus);
  // the active account is listed even before it has been remembered (first READY after an upgrade)
  const list = me && !accounts.some((a) => a.id === me.id) ? [{ id: me.id, username: me.username, display_name: me.display_name, avatar: me.avatar, token: '' }, ...accounts] : accounts;

  const logOut = (id: string, name: string) => {
    if (id !== me?.id) { forgetAccount(id); return; }
    confirmDialog({
      title: 'Log Out', confirmLabel: 'Log Out', danger: true,
      body: <>Log out of <strong>{name}</strong>?{accounts.length > 1 ? ' Huddle will switch to another account on this device.' : ''}</>,
      onConfirm: () => { close(); forgetAccount(id); },
    });
  };

  return (
    <Modal close={close} title="Manage Accounts" subtitle={`Switch between up to ${MAX_ACCOUNTS} accounts on this device.`} className="account-switcher">
      <div className="account-list">
        {list.map((a) => {
          const active = a.id === me?.id;
          const name = a.display_name || a.username;
          return (
            <div key={a.id} className={'account-row' + (active ? ' active' : '')}>
              <button className="account-pick" disabled={active} onClick={() => { close(); switchAccount(a.id); }} aria-label={active ? `${name} (active)` : `Switch to ${name}`}>
                <Avatar user={accountAsUser(a)} size={40} status={active ? (status === 'invisible' ? 'offline' : status) : undefined} ring="var(--bg-elevated)" />
                <span className="account-names">
                  <span className="truncate">{name}</span>
                  <small className="truncate">{a.username}</small>
                </span>
                {active && <span className="account-active"><IconCheck size={14} strokeWidth={3} /> Active</span>}
              </button>
              <button className="btn-link danger" onClick={() => logOut(a.id, name)}>Log out</button>
            </div>
          );
        })}
      </div>
      <button className="btn btn-secondary btn-block account-add" disabled={list.length >= MAX_ACCOUNTS} onClick={() => { close(); addAccount(); }}>
        <IconPlus size={16} /> {list.length >= MAX_ACCOUNTS ? `Account limit reached (${MAX_ACCOUNTS})` : 'Add an account'}
      </button>
    </Modal>
  );
}
