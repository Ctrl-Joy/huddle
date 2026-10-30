import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Invite } from '@huddle/shared';
import { useAuthStore } from '../stores/auth';
import { useGuildStore, userDisplayName } from '../stores/guilds';
import { getInvite, joinInvite } from '../lib/actions';
import { errorMessage } from '../api/client';
import { startSession } from '../lib/session';
import { GuildIcon, Spinner } from '../components/common/Avatar';
import { LogoMark } from '../components/common/icons';

export function InvitePage() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const token = useAuthStore((s) => s.token);
  const status = useAuthStore((s) => s.status);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const alreadyIn = useGuildStore((s) => (invite ? !!s.guilds[invite.guild.id] : false));

  useEffect(() => { if (token) startSession(); }, [token]);
  useEffect(() => {
    getInvite(code).then(setInvite).catch((e) => setError(errorMessage(e)));
  }, [code]);

  const accept = async () => {
    if (!token) { nav(`/login?next=${encodeURIComponent(`/invite/${code}`)}`); return; }
    if (!invite) return;
    if (alreadyIn) { nav(`/channels/${invite.guild.id}`); return; }
    setJoining(true);
    try {
      await joinInvite(code);
      nav(`/channels/${invite.guild.id}`);
    } catch (e) { setError(errorMessage(e)); setJoining(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /></div>
      <div className="auth-card invite-card">
        <div className="auth-brand"><span className="auth-logo"><LogoMark size={34} /></span><span>Huddle</span></div>
        {error && !invite ? (
          <>
            <h1>Invite invalid</h1>
            <p className="auth-sub">{error}. This invite may have expired, or you might not have permission to join.</p>
            <button className="btn btn-primary btn-block btn-lg" onClick={() => nav('/channels/@me')}>Continue to Huddle</button>
          </>
        ) : !invite ? (
          <div className="center-pad"><Spinner /></div>
        ) : (
          <>
            <GuildIcon guild={invite.guild} size={80} className="invite-guild-icon" />
            <p className="invite-kicker">{invite.inviter ? `${userDisplayName(invite.inviter)} invited you to join` : 'You have been invited to join'}</p>
            <h1>{invite.guild.name}</h1>
            {invite.guild.description && <p className="auth-sub">{invite.guild.description}</p>}
            <div className="invite-counts">
              {invite.approximate_presence_count !== undefined && <span><i className="dot online" />{invite.approximate_presence_count} Online</span>}
              {invite.approximate_member_count !== undefined && <span><i className="dot" />{invite.approximate_member_count} Members</span>}
            </div>
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-block btn-lg" disabled={joining || (!!token && status !== 'ready')} onClick={accept}>
              {!token ? 'Log in to accept' : alreadyIn ? 'Go to server' : joining ? 'Joining…' : 'Accept Invite'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
