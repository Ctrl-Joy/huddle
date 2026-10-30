import { memo, useMemo, type MouseEvent } from 'react';
import { Permissions, has, type Member, type Role } from '@huddle/shared';
import { useGuildStore, sortedRoles, roleColorFor } from '../../stores/guilds';
import { usePresenceStore, normalize } from '../../stores/presences';
import { useUIStore } from '../../stores/ui';
import { channelPermissionsFor } from '../../lib/permissionsCore';
import { Avatar, Tooltip } from '../common/Avatar';
import { buildMemberMenu, openUserPopoutAt } from '../menus/menus';
import { useVoiceStore } from '../../stores/voice';
import { IconSpeaker } from '../common/icons';

interface Group { id: string; label: string; members: Member[] }

export function MemberList({ guildId, channelId }: { guildId: string; channelId: string }) {
  const members = useGuildStore((s) => s.members[guildId]);
  const roles = useGuildStore((s) => s.roles[guildId]);
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const channel = useGuildStore((s) => s.channels[channelId]);
  const presences = usePresenceStore((s) => s.presences);

  const groups = useMemo<Group[]>(() => {
    if (!members || !channel) return [];
    const visible = Object.values(members).filter((m) => has(channelPermissionsFor(channel, m.user.id), Permissions.VIEW_CHANNEL));
    const hoisted = sortedRoles(roles).filter((r) => r.hoist && r.id !== guildId);
    const byRole = new Map<string, Member[]>();
    const online: Member[] = [];
    const offline: Member[] = [];
    for (const m of visible) {
      const st = normalize(presences[m.user.id]?.status);
      if (st === 'offline') { offline.push(m); continue; }
      const top = hoisted.find((r) => m.roles.includes(r.id));
      if (top) { if (!byRole.has(top.id)) byRole.set(top.id, []); byRole.get(top.id)!.push(m); }
      else online.push(m);
    }
    const name = (m: Member) => (m.nick || m.user.display_name || m.user.username).toLowerCase();
    const sort = (l: Member[]) => l.sort((a, b) => name(a).localeCompare(name(b)));
    const out: Group[] = [];
    for (const r of hoisted) { const l = byRole.get(r.id); if (l?.length) out.push({ id: r.id, label: r.name, members: sort(l) }); }
    if (online.length) out.push({ id: 'online', label: 'Online', members: sort(online) });
    if (offline.length) out.push({ id: 'offline', label: 'Offline', members: sort(offline).slice(0, 200) });
    return out;
  }, [members, roles, channel, presences, guildId]);

  return (
    <aside className="member-list scroll-thin" aria-label="Members">
      {groups.map((g) => (
        <section key={g.id}>
          <h3 className="member-group">{g.label} — {g.id === 'offline' ? groups.find((x) => x.id === 'offline')!.members.length : g.members.length}</h3>
          {g.members.map((m) => <MemberRow key={m.user.id} member={m} roles={roles} ownerId={guild?.owner_id} offline={g.id === 'offline'} />)}
        </section>
      ))}
      {!groups.length && <div className="muted center-pad">Loading members…</div>}
    </aside>
  );
}

const MemberRow = memo(function MemberRow({ member, roles, ownerId, offline }: { member: Member; roles: Record<string, Role> | undefined; ownerId?: string; offline: boolean }) {
  const custom = usePresenceStore((s) => s.presences[member.user.id]?.custom_status);
  const inVoice = useVoiceStore((s) => !!s.states[member.user.id]?.channel_id && s.states[member.user.id]?.guild_id === member.guild_id);
  const color = roleColorFor(roles, member.roles);
  const name = member.nick || member.user.display_name || member.user.username;
  const timedOut = member.communication_disabled_until && Date.parse(member.communication_disabled_until) > Date.now();
  const open = (e: MouseEvent) => openUserPopoutAt(member.user.id, member.guild_id, e.currentTarget, 'left');
  return (
    <div
      className={'member-row' + (offline ? ' offline' : '')}
      onClick={open}
      onContextMenu={(e) => useUIStore.getState().openContextMenu(e, buildMemberMenu(member.guild_id, member.user.id, e.currentTarget))}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') openUserPopoutAt(member.user.id, member.guild_id, e.currentTarget, 'left'); }}
    >
      <Avatar user={member.user} size={32} status="auto" ring="var(--bg-sidebar)" />
      <div className="member-text">
        <span className="member-name">
          <span className="truncate" style={color ? { color } : undefined}>{name}</span>
          {member.user.id === ownerId && <Tooltip label="Server Owner"><span className="owner-crown" aria-label="Server Owner">♛</span></Tooltip>}
          {member.user.bot && <span className="bot-tag">BOT</span>}
          {timedOut && <Tooltip label="Timed out"><span className="timeout-tag">⏱</span></Tooltip>}
        </span>
        {custom && !offline && <span className="member-sub truncate">{custom}</span>}
      </div>
      {inVoice && <IconSpeaker size={14} className="member-voice" />}
    </div>
  );
});
