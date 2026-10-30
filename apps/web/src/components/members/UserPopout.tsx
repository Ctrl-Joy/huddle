import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Permissions, RelationshipType, has, type PublicUser } from '@huddle/shared';
import { useUIStore, toast } from '../../stores/ui';
import { useGuildStore, sortedRoles, intToHex } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useRelationshipStore } from '../../stores/relationships';
import { useStatus, useCustomStatus, STATUS_LABEL } from '../../stores/presences';
import { api, errorMessage } from '../../api/client';
import { useGuildPermissions } from '../../lib/permissions';
import { myHighestPosition, canActOn } from '../../lib/permissionsCore';
import { openDM, sendFriendRequest, updateMember, acceptFriend } from '../../lib/actions';
import { formatShortDate, colorFor } from '../../lib/format';
import { Markdown } from '../../lib/markdown';
import { Avatar, Tooltip } from '../common/Avatar';
import { IconClose, IconMessage, IconMoreVertical, IconPlus, IconUserPlus, IconCheck, LogoMark } from '../common/icons';
import { buildMemberMenu, buildUserMenu } from '../menus/menus';
import { openModal } from '../../stores/ui';

export function UserPopout() {
  const popout = useUIStore((s) => s.popout);
  if (!popout) return null;
  return <PopoutCard key={popout.userId + (popout.guildId ?? '')} />;
}

function PopoutCard() {
  const popout = useUIStore((s) => s.popout)!;
  const { userId, guildId, rect, placement } = popout;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const cached = useGuildStore((s) => s.users[userId]);
  const member = useGuildStore((s) => (guildId ? s.members[guildId]?.[userId] : undefined));
  const roles = useGuildStore((s) => (guildId ? s.roles[guildId] : undefined));
  const meUser = useAuthStore((s) => s.user!);
  const rel = useRelationshipStore((s) => s.relationships[userId]);
  const status = useStatus(userId);
  const custom = useCustomStatus(userId);
  const perms = useGuildPermissions(guildId);
  const myCurrent = useAuthStore((s) => s.currentStatus);
  const [fetched, setFetched] = useState<PublicUser | null>(null);
  const [roleMenu, setRoleMenu] = useState(false);
  const isMe = userId === meUser.id;
  const user: PublicUser | undefined = isMe ? meUser : fetched ? { ...cached, ...fetched } : cached || member?.user;

  useEffect(() => {
    if (isMe) return;
    api.get<PublicUser>(`/users/${userId}`).then((u) => { setFetched(u); useGuildStore.getState().upsertUser(u); }).catch(() => {});
  }, [userId, isMe]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = placement === 'left' ? rect.left - w - 12 : rect.right + 12;
    if (left + w > window.innerWidth - 8) left = rect.left - w - 12;
    if (left < 8) left = Math.min(window.innerWidth - w - 8, rect.right + 12);
    let top = rect.top;
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [rect, placement, user?.bio, member?.roles.length]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (ref.current?.contains(t) || t.closest?.('.ctx-menu, .modal-backdrop')) return;
      useUIStore.getState().closePopout();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  if (!user) return null;
  const banner = user.banner_color || colorFor(user.id);
  const name = member?.nick || user.display_name || user.username;
  const canManageRoles = !!guildId && has(perms, Permissions.MANAGE_ROLES) && (isMe || canActOn(guildId, userId) || myHighestPosition(guildId) === Number.MAX_SAFE_INTEGER);
  const myPos = guildId ? myHighestPosition(guildId) : 0;
  const memberRoles = member ? sortedRoles(roles).filter((r) => member.roles.includes(r.id)) : [];
  const assignable = member && guildId ? sortedRoles(roles).filter((r) => r.id !== guildId && !member.roles.includes(r.id) && r.position < myPos) : [];

  const setRoles = (ids: string[]) => {
    if (!guildId) return;
    updateMember(guildId, userId, { roles: ids }).catch((e) => toast(errorMessage(e), 'error'));
  };

  const shownStatus = isMe ? (myCurrent === 'invisible' ? 'offline' : myCurrent) : status;

  return createPortal(
    <div ref={ref} className="user-popout" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }} role="dialog" aria-label={`${name} profile`}>
      <div className="popout-banner" style={{ background: banner }}>
        <span className="popout-banner-mark"><LogoMark size={46} /></span>
        <button className="icon-btn popout-more" aria-label="More" onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          useUIStore.getState().openContextMenu({ clientX: r.left, clientY: r.bottom + 4 }, guildId ? buildMemberMenu(guildId, userId) : buildUserMenu(userId));
        }}><IconMoreVertical size={18} /></button>
      </div>
      <div className="popout-avatar"><Avatar user={user} size={80} status={shownStatus} ring="var(--bg-elevated)" /></div>
      <div className="popout-body">
        <div className="popout-names">
          <h3>{name}</h3>
          <div className="popout-username">{user.username}{user.bot && <span className="bot-tag">BOT</span>}</div>
          {custom && <div className="popout-custom">{custom}</div>}
          {!custom && <div className="popout-status muted small">{STATUS_LABEL[shownStatus]}</div>}
        </div>
        {!isMe && (
          <div className="popout-actions">
            <button className="btn btn-primary btn-small" onClick={() => { useUIStore.getState().closePopout(); openDM([userId]).catch((e) => toast(errorMessage(e), 'error')); }}><IconMessage size={15} /> Message</button>
            {!rel && <button className="btn btn-secondary btn-small" onClick={() => sendFriendRequest(user.username).then(() => toast('Friend request sent', 'success')).catch((e) => toast(errorMessage(e), 'error'))}><IconUserPlus size={15} /> Add Friend</button>}
            {rel?.type === RelationshipType.PENDING_INCOMING && <button className="btn btn-secondary btn-small" onClick={() => acceptFriend(userId).catch((e) => toast(errorMessage(e), 'error'))}><IconCheck size={15} /> Accept</button>}
            {rel?.type === RelationshipType.PENDING_OUTGOING && <span className="chip static">Request sent</span>}
            {rel?.type === RelationshipType.FRIEND && <span className="chip static">Friend</span>}
          </div>
        )}
        {isMe && <button className="btn btn-secondary btn-small btn-block" onClick={() => { useUIStore.getState().closePopout(); openModal('userSettings', { tab: 'profile' }); }}>Edit Profile</button>}
        <div className="popout-section">
          {user.bio && <><h4>About Me</h4><div className="popout-bio"><Markdown content={user.bio} /></div></>}
          <h4>Member Since</h4>
          <div className="popout-since">
            <span title="Huddle"><LogoMark size={14} /> {formatShortDate(user.created_at)}</span>
            {member && <span title="This server">• {formatShortDate(member.joined_at)}</span>}
          </div>
          {member && guildId && (memberRoles.length > 0 || canManageRoles) && (
            <>
              <h4>{memberRoles.length ? `Roles — ${memberRoles.length}` : 'No Roles'}</h4>
              <div className="role-pills">
                {memberRoles.map((r) => (
                  <span key={r.id} className="role-pill">
                    {canManageRoles && r.position < myPos ? (
                      <button className="role-dot removable" style={{ background: r.color ? intToHex(r.color) : 'var(--text-faint)' }} aria-label={`Remove ${r.name}`}
                        onClick={() => setRoles(member.roles.filter((x) => x !== r.id))}><IconClose size={9} strokeWidth={4} /></button>
                    ) : <span className="role-dot" style={{ background: r.color ? intToHex(r.color) : 'var(--text-faint)' }} />}
                    {r.name}
                  </span>
                ))}
                {canManageRoles && assignable.length > 0 && (
                  <span className="role-add-wrap">
                    <Tooltip label="Add Role"><button className="role-pill add" aria-label="Add Role" onClick={() => setRoleMenu((v) => !v)}><IconPlus size={14} /></button></Tooltip>
                    {roleMenu && (
                      <div className="role-add-menu">
                        {assignable.map((r) => (
                          <button key={r.id} onClick={() => { setRoleMenu(false); setRoles([...member.roles, r.id]); }}>
                            <span className="role-dot" style={{ background: r.color ? intToHex(r.color) : 'var(--text-faint)' }} />{r.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
