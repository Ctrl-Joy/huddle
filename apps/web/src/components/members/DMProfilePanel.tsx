import { ChannelType, type Channel } from '@huddle/shared';
import { useAuthStore } from '../../stores/auth';
import { useGuildStore } from '../../stores/guilds';
import { useStatus, useCustomStatus } from '../../stores/presences';
import { useUIStore } from '../../stores/ui';
import { Avatar } from '../common/Avatar';
import { Markdown } from '../../lib/markdown';
import { formatShortDate, colorFor } from '../../lib/format';
import { buildUserMenu, openUserPopoutAt } from '../menus/menus';
import { LogoMark } from '../common/icons';

/** Right-hand panel in DMs: the other user's profile, or the member list for group DMs. */
export function DMProfilePanel({ channel }: { channel: Channel }) {
  const me = useAuthStore((s) => s.user!);
  if (channel.type === ChannelType.GROUP_DM) {
    const members = [...(channel.recipients || [])];
    if (!members.some((m) => m.id === me.id)) members.push(me);
    return (
      <aside className="member-list scroll-thin">
        <h3 className="member-group">Members — {members.length}</h3>
        {members.map((u) => (
          <div key={u.id} className="member-row" onClick={(e) => openUserPopoutAt(u.id, null, e.currentTarget, 'left')}
            onContextMenu={(e) => useUIStore.getState().openContextMenu(e, buildUserMenu(u.id, e.currentTarget))}>
            <Avatar user={u} size={32} status="auto" ring="var(--bg-sidebar)" />
            <div className="member-text"><span className="member-name"><span className="truncate">{u.display_name || u.username}</span>{channel.owner_id === u.id && <span className="owner-crown">♛</span>}</span></div>
          </div>
        ))}
      </aside>
    );
  }
  const other = channel.recipients?.find((r) => r.id !== me.id);
  return other ? <Profile userId={other.id} /> : null;
}

function Profile({ userId }: { userId: string }) {
  const user = useGuildStore((s) => s.users[userId]);
  const status = useStatus(userId);
  const custom = useCustomStatus(userId);
  const guilds = useGuildStore((s) => s.guilds);
  const members = useGuildStore((s) => s.members);
  if (!user) return null;
  const mutual = Object.values(guilds).filter((g) => members[g.id]?.[userId]);
  return (
    <aside className="dm-profile scroll-thin">
      <div className="popout-banner" style={{ background: user.banner_color || colorFor(user.id) }}><span className="popout-banner-mark"><LogoMark size={46} /></span></div>
      <div className="popout-avatar"><Avatar user={user} size={80} status={status} ring="var(--bg-sidebar)" /></div>
      <div className="popout-body">
        <div className="popout-names">
          <h3>{user.display_name || user.username}</h3>
          <div className="popout-username">{user.username}</div>
          {custom && <div className="popout-custom">{custom}</div>}
        </div>
        <div className="popout-section card">
          {user.bio && <><h4>About Me</h4><div className="popout-bio"><Markdown content={user.bio} /></div></>}
          <h4>Member Since</h4>
          <div className="popout-since">{formatShortDate(user.created_at)}</div>
        </div>
        {mutual.length > 0 && (
          <div className="popout-section card">
            <h4>Mutual Servers — {mutual.length}</h4>
            {mutual.map((g) => <div key={g.id} className="mutual-row">{g.name}</div>)}
          </div>
        )}
      </div>
    </aside>
  );
}
