// Voice channel main view: participant tile grid + call controls.
// WebRTC hook-up point: the media engine (src/voice/, added later) publishes MediaStreams via
//   useVoiceStore.getState().setStream(userId, 'camera' | 'screen', stream)
// and speaking flags via setSpeaking(userId, bool). <VideoSlot> below renders them — nothing else
// in the UI needs to change. Remote AUDIO playback is the engine's job (it can attach its own
// hidden <audio> elements), so tiles never render audio.
import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { ChannelType, Permissions, has, type Channel, type VoiceState } from '@huddle/shared';
import { useVoiceStore, voiceActions } from '../../stores/voice';
import { useGuildStore, displayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { usePermissions } from '../../lib/permissions';
import { Avatar, Tooltip } from '../common/Avatar';
import {
  IconHeadphones, IconHeadphonesOff, IconMenu, IconMic, IconMicOff, IconPhoneOff, IconScreen, IconSpeaker, IconVideo, IconVideoOff,
} from '../common/icons';
import { buildMemberMenu, buildUserMenu, openUserPopoutAt } from '../menus/menus';

export function VoiceView({ channel }: { channel: Channel }) {
  const conn = useVoiceStore((s) => s.connection);
  const connected = conn?.channelId === channel.id;
  const perms = usePermissions(channel.id);
  const canConnect = has(perms, Permissions.CONNECT);
  return (
    <div className="voice-view">
      <header className="chat-header voice-header">
        <button className="icon-btn mobile-only" aria-label="Open navigation" onClick={() => useUIStore.getState().setMobileNav(true)}><IconMenu size={22} /></button>
        <div className="chat-header-title"><IconSpeaker size={22} className="header-icon" /><span className="header-name">{channel.name}</span></div>
      </header>
      <CallStage channelId={channel.id} guildId={channel.guild_id} />
      {connected ? <CallControls /> : (
        <div className="voice-join">
          <h2>{channel.name}</h2>
          <p className="muted">{canConnect ? 'No one is forcing you, but it would be nice to say hi.' : "You don't have permission to connect to this channel."}</p>
          <button className="btn btn-primary btn-lg" disabled={!canConnect} onClick={() => voiceActions.join(channel.id, channel.guild_id)}>Join Voice</button>
        </div>
      )}
    </div>
  );
}

/** Tile grid for everyone connected to channelId (voice channel or DM call). */
export function CallStage({ channelId, guildId, compact }: { channelId: string; guildId: string | null; compact?: boolean }) {
  const states = useVoiceStore((s) => s.states);
  const streams = useVoiceStore((s) => s.streams);
  const participants = useMemo(() => Object.values(states).filter((v) => v.channel_id === channelId), [states, channelId]);
  const focused = participants.find((p) => streams[p.user_id]?.screen);
  if (!participants.length) {
    return (
      <div className={'call-stage empty' + (compact ? ' compact' : '')}>
        <div className="empty-art" aria-hidden="true"><span /><span /><span /></div>
        <p className="muted">Nobody's here yet.</p>
      </div>
    );
  }
  return (
    <div className={'call-stage' + (compact ? ' compact' : '') + (focused ? ' has-focus' : '')}>
      {focused && (
        <div className="focus-tile">
          <VoiceTile state={focused} guildId={guildId} kind="screen" />
        </div>
      )}
      <div className={'tile-grid n' + Math.min(participants.length, 9)}>
        {participants.map((p) => <VoiceTile key={p.user_id} state={p} guildId={guildId} kind="camera" />)}
      </div>
    </div>
  );
}

export function VoiceTile({ state, guildId, kind }: { state: VoiceState; guildId: string | null; kind: 'camera' | 'screen' }) {
  const stream = useVoiceStore((s) => s.streams[state.user_id]?.[kind] ?? null);
  const speaking = useVoiceStore((s) => !!s.speaking[state.user_id]);
  const me = useAuthStore((s) => s.user!.id);
  const name = useGuildStore(() => displayName(state.user_id, guildId));
  useGuildStore((s) => (guildId ? s.members[guildId]?.[state.user_id] : s.users[state.user_id]));
  const muted = state.self_mute || state.mute;
  const deaf = state.self_deaf || state.deaf;
  const onContext = (e: MouseEvent) => useUIStore.getState().openContextMenu(e, guildId ? buildMemberMenu(guildId, state.user_id, e.currentTarget) : buildUserMenu(state.user_id, e.currentTarget));
  return (
    <div className={'voice-tile' + (speaking ? ' speaking' : '') + (stream ? ' has-video' : '') + (kind === 'screen' ? ' screen' : '')}
      onContextMenu={onContext} onDoubleClick={(e) => openUserPopoutAt(state.user_id, guildId, e.currentTarget)}>
      {stream ? <VideoSlot stream={stream} mirrored={kind === 'camera' && state.user_id === me} /> : (
        <div className="tile-avatar"><Avatar userId={state.user_id} size={kind === 'screen' ? 96 : 72} speaking={speaking} /></div>
      )}
      <div className="tile-label">
        {muted && <IconMicOff size={14} />}
        {deaf && <IconHeadphonesOff size={14} />}
        <span className="truncate">{name}{kind === 'screen' ? "'s screen" : ''}</span>
        {state.self_stream && kind === 'camera' && <span className="live-pill">LIVE</span>}
      </div>
    </div>
  );
}

/** Renders a MediaStream into a muted <video> (audio is handled by the engine). */
export function VideoSlot({ stream, mirrored }: { stream: MediaStream; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => {});
  }, [stream]);
  return <video ref={ref} className={'tile-video' + (mirrored ? ' mirrored' : '')} autoPlay playsInline muted />;
}

export function CallControls() {
  const s = useVoiceStore();
  const conn = s.connection;
  const channel = useGuildStore((st) => (conn ? st.channels[conn.channelId] : undefined));
  const perms = usePermissions(conn?.channelId);
  const isDM = channel?.type === ChannelType.DM || channel?.type === ChannelType.GROUP_DM;
  const canVideo = isDM || has(perms, Permissions.VIDEO);
  const canStream = isDM || has(perms, Permissions.STREAM);
  return (
    <div className="call-controls">
      <Tooltip label={s.selfVideo ? 'Turn Off Camera' : 'Turn On Camera'}>
        <button className={'call-btn' + (s.selfVideo ? ' on' : '')} disabled={!canVideo} aria-label="Toggle camera" onClick={() => voiceActions.toggleVideo()}>
          {s.selfVideo ? <IconVideo size={22} /> : <IconVideoOff size={22} />}
        </button>
      </Tooltip>
      <Tooltip label={s.selfStream ? 'Stop Streaming' : 'Share Your Screen'}>
        <button className={'call-btn' + (s.selfStream ? ' on' : '')} disabled={!canStream} aria-label="Toggle screen share" onClick={() => voiceActions.toggleScreen()}><IconScreen size={22} /></button>
      </Tooltip>
      <Tooltip label={s.selfMute ? 'Unmute' : 'Mute'}>
        <button className={'call-btn' + (s.selfMute ? ' off' : '')} aria-label="Toggle mute" onClick={() => voiceActions.toggleMute()}>{s.selfMute ? <IconMicOff size={22} /> : <IconMic size={22} />}</button>
      </Tooltip>
      <Tooltip label={s.selfDeaf ? 'Undeafen' : 'Deafen'}>
        <button className={'call-btn' + (s.selfDeaf ? ' off' : '')} aria-label="Toggle deafen" onClick={() => voiceActions.toggleDeafen()}>{s.selfDeaf ? <IconHeadphonesOff size={22} /> : <IconHeadphones size={22} />}</button>
      </Tooltip>
      <Tooltip label="Disconnect">
        <button className="call-btn hangup" aria-label="Disconnect" onClick={() => voiceActions.leave()}><IconPhoneOff size={22} /></button>
      </Tooltip>
    </div>
  );
}
