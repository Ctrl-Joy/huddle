import { NotificationLevel } from '@huddle/shared';
import { Modal, Toggle } from './Modal';
import { useGuildStore } from '../../stores/guilds';
import { useReadStateStore, defaultGuildSettings } from '../../stores/readStates';
import { updateGuildSettings } from '../../lib/actions';

const LEVELS = [
  { v: NotificationLevel.ALL_MESSAGES, l: 'All Messages', d: 'Get notified about everything (desktop alerts are still sent for mentions only).' },
  { v: NotificationLevel.ONLY_MENTIONS, l: 'Only @mentions', d: 'Only messages that mention you, your roles or @everyone.' },
  { v: NotificationLevel.NOTHING, l: 'Nothing', d: 'No notifications or unread indicators for this server.' },
];

export function NotificationSettingsModal({ close, guildId }: { close: () => void; guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const settings = useReadStateStore((s) => s.guildSettings[guildId]) || defaultGuildSettings(guildId);
  return (
    <Modal close={close} title="Notification Settings" subtitle={guild?.name}
      footer={<button className="btn btn-primary" onClick={close}>Done</button>}>
      <div className="setting-row">
        <div>
          <div className="setting-title">Mute {guild?.name}</div>
          <div className="setting-desc">Muting a server prevents unread indicators and notifications from appearing unless you are mentioned.</div>
        </div>
        <Toggle checked={settings.muted} onChange={(v) => void updateGuildSettings(guildId, { muted: v })} label="Mute server" />
      </div>
      <div className="field-label mt">Server Notification Settings</div>
      <div className="radio-list">
        {LEVELS.map((l) => (
          <button key={l.v} type="button" className={'radio-line' + (settings.message_notifications === l.v ? ' selected' : '')}
            onClick={() => void updateGuildSettings(guildId, { message_notifications: l.v })}>
            <span className="radio-dot" />
            <span><strong>{l.l}</strong><small>{l.d}</small></span>
          </button>
        ))}
      </div>
      <div className="setting-row">
        <div>
          <div className="setting-title">Suppress @everyone and @here</div>
          <div className="setting-desc">You won't be notified when someone mentions @everyone or @here.</div>
        </div>
        <Toggle checked={settings.suppress_everyone} onChange={(v) => void updateGuildSettings(guildId, { suppress_everyone: v })} label="Suppress everyone" />
      </div>
    </Modal>
  );
}
