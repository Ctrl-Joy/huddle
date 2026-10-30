import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoiceStore, voiceActions } from '../../stores/voice';
import { useAuthStore } from '../../stores/auth';
import { useGuildStore, channelDisplayName } from '../../stores/guilds';
import { startRing } from '../../voice/sounds';
import { Avatar } from '../common/Avatar';
import { IconPhone, IconPhoneOff } from '../common/icons';

const RINGBACK_MAX_MS = 45_000;

/** Ringing card for incoming DM calls (CALL_CREATE where we're in `ringing`), plus the caller's ringback tone. */
export function IncomingCall() {
  const calls = useVoiceStore((s) => s.calls);
  const conn = useVoiceStore((s) => s.connection);
  const states = useVoiceStore((s) => s.states);
  const me = useAuthStore((s) => s.user!.id);
  const channels = useGuildStore((s) => s.channels);
  const nav = useNavigate();
  const ringing = Object.values(calls).find((c) => c.ringing.includes(me) && c.initiatorId !== me && conn?.channelId !== c.channelId);

  // Outgoing: we're in a DM call, someone is being rung, and nobody else has joined yet.
  const outgoingCall = conn && !conn.guildId ? calls[conn.channelId] : undefined;
  const othersHere = conn ? Object.values(states).some((v) => v.channel_id === conn.channelId && v.user_id !== me) : false;
  const ringingBack = !!outgoingCall && outgoingCall.ringing.some((id) => id !== me) && !othersHere;

  const incomingKey = ringing?.channelId;
  useEffect(() => {
    if (!incomingKey) return;
    return startRing('incoming');
  }, [incomingKey]);

  useEffect(() => {
    if (!ringingBack) return;
    const stop = startRing('outgoing');
    const t = setTimeout(stop, RINGBACK_MAX_MS);
    return () => { clearTimeout(t); stop(); };
  }, [ringingBack]);

  if (!ringing) return null;
  const channel = channels[ringing.channelId];
  return (
    <div className="incoming-call" role="alertdialog" aria-label="Incoming call">
      <Avatar userId={ringing.initiatorId} size={80} className="ringing" />
      <div className="incoming-name">{channel ? channelDisplayName(channel, me) : 'Incoming call'}</div>
      <div className="muted small">Incoming call…</div>
      <div className="incoming-actions">
        <button className="call-btn hangup" aria-label="Decline" onClick={() => voiceActions.declineCall(ringing.channelId)}><IconPhoneOff size={22} /></button>
        <button className="call-btn accept" aria-label="Accept" onClick={() => { voiceActions.acceptCall(ringing.channelId); nav(`/channels/@me/${ringing.channelId}`); }}><IconPhone size={22} /></button>
      </div>
    </div>
  );
}
