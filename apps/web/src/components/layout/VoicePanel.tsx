import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoiceStore, voiceActions } from '../../stores/voice';
import { useGuildStore, channelDisplayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { channelPath } from '../../lib/nav';
import { formatDuration } from '../../lib/format';
import { Tooltip } from '../common/Avatar';
import { IconPhoneOff, IconScreen, IconVideo, IconVideoOff } from '../common/icons';

/** "Voice Connected" panel shown above the user panel while in a voice channel or DM call. */
export function VoicePanel() {
  const conn = useVoiceStore((s) => s.connection);
  const selfVideo = useVoiceStore((s) => s.selfVideo);
  const selfStream = useVoiceStore((s) => s.selfStream);
  const channel = useGuildStore((s) => (conn ? s.channels[conn.channelId] : undefined));
  const guild = useGuildStore((s) => (conn?.guildId ? s.guilds[conn.guildId] : undefined));
  const me = useAuthStore((s) => s.user!.id);
  const nav = useNavigate();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!conn) return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [conn]);
  if (!conn) return null;
  const connected = conn.status === 'connected';
  return (
    <div className="voice-panel">
      <div className="voice-panel-top">
        <div className="voice-panel-info">
          <span className={'voice-status ' + (connected ? 'ok' : 'pending')}>
            <span className="signal" aria-hidden="true"><i /><i /><i /></span>
            {connected ? 'Voice Connected' : 'Connecting…'}
          </span>
          <button className="voice-panel-where truncate" onClick={() => channel && nav(channelPath(channel))}>
            {channel ? (guild ? `${channel.name} / ${guild.name}` : channelDisplayName(channel, me)) : 'Unknown channel'}
          </button>
        </div>
        <span className="voice-timer">{formatDuration(Date.now() - conn.since)}</span>
        <Tooltip label="Disconnect">
          <button className="icon-btn danger-hover" aria-label="Disconnect" onClick={() => voiceActions.leave()}><IconPhoneOff size={19} /></button>
        </Tooltip>
      </div>
      <div className="voice-panel-buttons">
        <button className={'vp-btn' + (selfVideo ? ' on' : '')} onClick={() => voiceActions.toggleVideo()} aria-pressed={selfVideo}>
          {selfVideo ? <IconVideo size={18} /> : <IconVideoOff size={18} />}<span>Video</span>
        </button>
        <button className={'vp-btn' + (selfStream ? ' on' : '')} onClick={() => voiceActions.toggleScreen()} aria-pressed={selfStream}>
          <IconScreen size={18} /><span>Screen</span>
        </button>
      </div>
    </div>
  );
}
