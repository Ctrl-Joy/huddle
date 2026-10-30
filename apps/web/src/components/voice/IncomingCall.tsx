import { useNavigate } from 'react-router-dom';
import { useVoiceStore, voiceActions } from '../../stores/voice';
import { useAuthStore } from '../../stores/auth';
import { useGuildStore, channelDisplayName } from '../../stores/guilds';
import { Avatar } from '../common/Avatar';
import { IconPhone, IconPhoneOff } from '../common/icons';

/** Ringing card for incoming DM calls (CALL_CREATE where we're in `ringing`). */
export function IncomingCall() {
  const calls = useVoiceStore((s) => s.calls);
  const conn = useVoiceStore((s) => s.connection);
  const me = useAuthStore((s) => s.user!.id);
  const channels = useGuildStore((s) => s.channels);
  const nav = useNavigate();
  const ringing = Object.values(calls).find((c) => c.ringing.includes(me) && c.initiatorId !== me && conn?.channelId !== c.channelId);
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
