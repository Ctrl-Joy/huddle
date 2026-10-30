// Voice channel main view: participant tile grid + call controls.
// The media engine (src/voice/) publishes MediaStreams via
//   useVoiceStore.getState().setStream(userId, 'camera' | 'screen', stream)
// and speaking flags via setSpeaking(userId, bool); the components below render them. Remote AUDIO
// playback is the engine's job (hidden <audio> elements), so tiles never render audio.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ChannelType, Permissions, has, type Channel, type VoiceState } from '@huddle/shared';
import { useVoiceStore, voiceActions } from '../../stores/voice';
import { useGuildStore, displayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useUIStore } from '../../stores/ui';
import { usePermissions } from '../../lib/permissions';
import { useMediaDiag } from '../../voice/mediaState';
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

type TileKind = 'camera' | 'screen' | 'ringing';
interface TileSpec { key: string; userId: string; kind: TileKind; state?: VoiceState }

/** Tile grid for everyone connected to channelId (voice channel or DM call). */
export function CallStage({ channelId, guildId, compact }: { channelId: string; guildId: string | null; compact?: boolean }) {
  const states = useVoiceStore((s) => s.states);
  const streams = useVoiceStore((s) => s.streams);
  const call = useVoiceStore((s) => (guildId ? undefined : s.calls[channelId]));
  // undefined = automatic (first screen share), null = user explicitly unfocused, string = tile key
  const [manualFocus, setManualFocus] = useState<string | null | undefined>(undefined);

  const participants = useMemo(() => Object.values(states).filter((v) => v.channel_id === channelId), [states, channelId]);
  const tiles = useMemo(() => {
    const out: TileSpec[] = [];
    for (const p of participants) out.push({ key: p.user_id + ':camera', userId: p.user_id, kind: 'camera', state: p });
    for (const p of participants) {
      if (p.self_stream || streams[p.user_id]?.screen) out.push({ key: p.user_id + ':screen', userId: p.user_id, kind: 'screen', state: p });
    }
    if (call) {
      const here = new Set(participants.map((p) => p.user_id));
      for (const id of call.ringing) if (!here.has(id)) out.push({ key: id + ':ringing', userId: id, kind: 'ringing' });
    }
    return out;
  }, [participants, streams, call]);

  const meId = useAuthStore((s) => s.user!.id);
  const shared = tiles.filter((t) => t.kind === 'screen' && streams[t.userId]?.screen);
  const autoFocus = (shared.find((t) => t.userId !== meId) ?? shared[0])?.key ?? null; // prefer someone else's screen
  const focusKey = manualFocus === undefined || (manualFocus && !tiles.some((t) => t.key === manualFocus)) ? autoFocus : manualFocus;
  const focused = focusKey ? tiles.find((t) => t.key === focusKey) : undefined;
  // a newly started screen share re-enables auto focus
  const lastAuto = useRef(autoFocus);
  useEffect(() => {
    if (autoFocus && autoFocus !== lastAuto.current) setManualFocus(undefined);
    lastAuto.current = autoFocus;
  }, [autoFocus]);

  if (!tiles.length) {
    return (
      <div className={'call-stage empty' + (compact ? ' compact' : '')}>
        <div className="empty-art" aria-hidden="true"><span /><span /><span /></div>
        <p className="muted">Nobody's here yet.</p>
      </div>
    );
  }
  const toggle = (key: string) => setManualFocus(focusKey === key ? null : key);
  const render = (t: TileSpec, isFocus = false) => t.kind === 'ringing'
    ? <RingingTile key={t.key} userId={t.userId} guildId={guildId} />
    : <VoiceTile key={t.key} state={t.state!} guildId={guildId} kind={t.kind} focused={isFocus} onSelect={() => toggle(t.key)} />;
  const rest = focused ? tiles.filter((t) => t !== focused) : tiles;
  return (
    <div className={'call-stage' + (compact ? ' compact' : '') + (focused ? ' has-focus' : '')}>
      {focused && <div className="focus-tile">{render(focused, true)}</div>}
      {rest.length > 0 && (
        <div className={focused ? 'tile-strip' : 'tile-grid n' + Math.min(rest.length, 9)}>
          {rest.map((t) => render(t))}
        </div>
      )}
    </div>
  );
}

export function VoiceTile({ state, guildId, kind, focused, onSelect }: {
  state: VoiceState; guildId: string | null; kind: 'camera' | 'screen'; focused?: boolean; onSelect?: () => void;
}) {
  const stream = useVoiceStore((s) => s.streams[state.user_id]?.[kind] ?? null);
  const speaking = useVoiceStore((s) => !!s.speaking[state.user_id]);
  const me = useAuthStore((s) => s.user!.id);
  const peerState = useMediaDiag((s) => s.peerStates[state.user_id]);
  const name = useGuildStore(() => displayName(state.user_id, guildId));
  useGuildStore((s) => (guildId ? s.members[guildId]?.[state.user_id] : s.users[state.user_id]));
  const ref = useRef<HTMLDivElement>(null);
  const muted = state.self_mute || state.mute;
  const deaf = state.self_deaf || state.deaf;
  const isMe = state.user_id === me;
  const connecting = !isMe && peerState && peerState !== 'connected';
  const onContext = (e: MouseEvent) => useUIStore.getState().openContextMenu(e, guildId ? buildMemberMenu(guildId, state.user_id, e.currentTarget) : buildUserMenu(state.user_id, e.currentTarget));
  const fullscreen = (e: MouseEvent) => {
    e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen?.().catch(() => {});
  };
  return (
    <div ref={ref} data-user={state.user_id} data-kind={kind}
      className={'voice-tile' + (speaking && kind === 'camera' ? ' speaking' : '') + (stream ? ' has-video' : '') + (kind === 'screen' ? ' screen' : '') + (focused ? ' focused' : '')}
      onClick={onSelect} onContextMenu={onContext} onDoubleClick={(e) => openUserPopoutAt(state.user_id, guildId, e.currentTarget)}
      role="button" tabIndex={0} aria-label={`${name}${kind === 'screen' ? "'s screen" : ''}${focused ? ' (focused)' : ''}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(); } }}>
      {stream ? <VideoSlot stream={stream} mirrored={kind === 'camera' && isMe} /> : kind === 'screen' ? (
        <div className="tile-placeholder"><IconScreen size={32} /><span>Loading stream…</span></div>
      ) : (
        <div className="tile-avatar"><Avatar userId={state.user_id} size={focused ? 112 : 72} speaking={speaking} /></div>
      )}
      <div className="tile-label">
        {kind === 'camera' && deaf && <IconHeadphonesOff size={14} className={state.deaf ? 'server-flag' : ''} aria-label={state.deaf ? 'Server deafened' : 'Deafened'} />}
        {kind === 'camera' && muted && !deaf && <IconMicOff size={14} className={state.mute ? 'server-flag' : ''} aria-label={state.mute ? 'Server muted' : 'Muted'} />}
        <span className="truncate">{name}{kind === 'screen' ? "'s screen" : ''}</span>
        {kind === 'camera' && state.self_video && !stream && <IconVideo size={14} aria-label="Camera on" />}
        {(kind === 'screen' || state.self_stream) && <span className="live-pill">LIVE</span>}
      </div>
      {connecting && <div className="tile-status">Connecting…</div>}
      {stream && (
        <button className="tile-fs" aria-label="Fullscreen" title="Fullscreen" onClick={fullscreen}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** A DM recipient who's being rung but hasn't joined yet. */
function RingingTile({ userId, guildId }: { userId: string; guildId: string | null }) {
  const name = useGuildStore(() => displayName(userId, guildId));
  return (
    <div className="voice-tile ringing-tile" aria-label={`Calling ${name}`}>
      <div className="tile-avatar"><Avatar userId={userId} size={72} className="ringing" /></div>
      <div className="tile-label"><span className="truncate">{name}</span><span className="muted small">Calling…</span></div>
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
  const me = useAuthStore((st) => st.user!.id);
  const mine = s.states[me];
  const listenOnly = useMediaDiag((d) => d.listenOnly);
  const channel = useGuildStore((st) => (conn ? st.channels[conn.channelId] : undefined));
  const perms = usePermissions(conn?.channelId);
  const isDM = channel?.type === ChannelType.DM || channel?.type === ChannelType.GROUP_DM;
  const canVideo = isDM || has(perms, Permissions.VIDEO);
  const canStream = isDM || has(perms, Permissions.STREAM);
  const serverMuted = !!mine?.mute;
  const serverDeaf = !!mine?.deaf;
  return (
    <div className="call-controls">
      <Tooltip label={!canVideo ? 'No permission to use video' : s.selfVideo ? 'Turn Off Camera' : 'Turn On Camera'}>
        <button className={'call-btn' + (s.selfVideo ? ' on' : '')} disabled={!canVideo} aria-pressed={s.selfVideo} aria-label="Toggle camera" onClick={() => voiceActions.toggleVideo()}>
          {s.selfVideo ? <IconVideo size={22} /> : <IconVideoOff size={22} />}
        </button>
      </Tooltip>
      <Tooltip label={!canStream ? 'No permission to stream' : s.selfStream ? 'Stop Streaming' : 'Share Your Screen'}>
        <button className={'call-btn' + (s.selfStream ? ' on' : '')} disabled={!canStream} aria-pressed={s.selfStream} aria-label="Toggle screen share" onClick={() => voiceActions.toggleScreen()}><IconScreen size={22} /></button>
      </Tooltip>
      <Tooltip label={serverMuted ? 'Server muted' : listenOnly ? 'No microphone — click to retry' : s.selfMute ? 'Unmute' : 'Mute'}>
        <button className={'call-btn' + (s.selfMute || serverMuted ? ' off' : '') + (serverMuted ? ' server' : '')} aria-pressed={s.selfMute} aria-label="Toggle mute" onClick={() => voiceActions.toggleMute()}>{s.selfMute || serverMuted ? <IconMicOff size={22} /> : <IconMic size={22} />}</button>
      </Tooltip>
      <Tooltip label={serverDeaf ? 'Server deafened' : s.selfDeaf ? 'Undeafen' : 'Deafen'}>
        <button className={'call-btn' + (s.selfDeaf || serverDeaf ? ' off' : '') + (serverDeaf ? ' server' : '')} aria-pressed={s.selfDeaf} aria-label="Toggle deafen" onClick={() => voiceActions.toggleDeafen()}>{s.selfDeaf || serverDeaf ? <IconHeadphonesOff size={22} /> : <IconHeadphones size={22} />}</button>
      </Tooltip>
      <Tooltip label="Disconnect">
        <button className="call-btn hangup" aria-label="Disconnect" onClick={() => voiceActions.leave()}><IconPhoneOff size={22} /></button>
      </Tooltip>
    </div>
  );
}
