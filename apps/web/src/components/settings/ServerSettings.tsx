import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AuditLogAction, ChannelType, GUILD_CATEGORIES, PERMISSION_INFO, Permissions, has, type GuildCategory,
  type AuditLogEntry, type Invite, type Role, type PublicUser,
} from '@huddle/shared';
import { SettingsLayout, UnsavedBar } from './SettingsLayout';
import { useGuildStore, sortedRoles, intToHex, hexToInt, displayName, userDisplayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useBanStore } from '../../stores/bans';
import { confirmDialog, openModal, toast } from '../../stores/ui';
import { api, errorMessage } from '../../api/client';
import { useGuildPermissions } from '../../lib/permissions';
import { canActOn, myHighestPosition } from '../../lib/permissionsCore';
import { createRole, deleteGuild, deleteRole, kickMember, reorderRoles, updateMember, updateRole, uploadIcon, fetchMembers } from '../../lib/actions';
import { formatShortDate, formatTimestamp, relativeTime } from '../../lib/format';
import { Avatar, GuildIcon, Spinner, Tooltip } from '../common/Avatar';
import { Field, Modal, Toggle } from '../modals/Modal';
import { IconArrowDown, IconArrowUp, IconClose, IconPlus, IconSearch, IconTrash, IconShield } from '../common/icons';
import { inviteUrl } from '../modals/InviteModal';
import { EmojiTab } from './EmojiSettings';

type Tab = 'overview' | 'discovery' | 'roles' | 'emoji' |'members' | 'invites' | 'bans' | 'audit';

export function ServerSettings({ close, guildId, tab: initial }: { close: () => void; guildId: string; tab?: Tab }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const me = useAuthStore((s) => s.user!.id);
  const perms = useGuildPermissions(guildId);
  const can = (p: bigint) => has(perms, p);
  const [tab, setTab] = useState<Tab>(initial ?? (can(Permissions.MANAGE_GUILD) ? 'overview' : can(Permissions.MANAGE_ROLES) ? 'roles' : 'members'));
  useEffect(() => { if (!guild) close(); }, [guild, close]);
  if (!guild) return null;
  const isOwner = guild.owner_id === me;
  return (
    <SettingsLayout
      close={close}
      active={tab}
      onSelect={(id) => setTab(id as Tab)}
      sections={[
        {
          header: guild.name,
          items: [
            { id: 'overview', label: 'Overview', hidden: !can(Permissions.MANAGE_GUILD) },
            { id: 'roles', label: 'Roles', hidden: !can(Permissions.MANAGE_ROLES) },
            { id: 'emoji', label: 'Emoji' },
            { id: 'discovery', label: 'Discovery', hidden: !can(Permissions.MANAGE_GUILD) },
          ],
        },
        {
          header: 'User Management',
          items: [
            { id: 'members', label: 'Members' },
            { id: 'invites', label: 'Invites', hidden: !can(Permissions.MANAGE_GUILD) },
            { id: 'bans', label: 'Bans', hidden: !can(Permissions.BAN_MEMBERS) },
          ],
        },
        { header: 'Moderation', items: [{ id: 'audit', label: 'Audit Log', hidden: !can(Permissions.VIEW_AUDIT_LOG) }] },
        { items: [{ id: 'delete-server', label: 'Delete Server', danger: true, hidden: !isOwner }] },
      ]}
    >
      {tab === 'overview' && <OverviewTab guildId={guildId} />}
      {tab === 'roles' && <RolesTab guildId={guildId} />}
      {tab === 'emoji' && <EmojiTab guildId={guildId} />}
      {tab === 'discovery' && <DiscoveryTab guildId={guildId} />}
      {tab === 'members' && <MembersTab guildId={guildId} />}
      {tab === 'invites' && <InvitesTab guildId={guildId} />}
      {tab === 'bans' && <BansTab guildId={guildId} />}
      {tab === 'audit' && <AuditTab guildId={guildId} />}
      {(tab as string) === 'delete-server' && <DeleteServer guildId={guildId} onCancel={() => setTab('overview')} close={close} />}
    </SettingsLayout>
  );
}

// ---------------- Overview ----------------
function OverviewTab({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId])!;
  const channels = useGuildStore((s) => s.channels);
  const [name, setName] = useState(guild.name);
  const [description, setDescription] = useState(guild.description ?? '');
  const [systemChannel, setSystemChannel] = useState(guild.system_channel_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [iconBusy, setIconBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = name !== guild.name || description !== (guild.description ?? '') || systemChannel !== (guild.system_channel_id ?? '');
  const textChannels = Object.values(channels).filter((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_TEXT);

  const reset = () => { setName(guild.name); setDescription(guild.description ?? ''); setSystemChannel(guild.system_channel_id ?? ''); setError(''); };
  const save = async () => {
    if (!name.trim()) { setError('Server name is required'); return; }
    setBusy(true); setError('');
    try {
      const g = await api.patch<typeof guild>(`/guilds/${guildId}`, { name: name.trim(), description: description.trim() || null, system_channel_id: systemChannel || null });
      if (g?.id) useGuildStore.getState().updateGuild(g);
      toast('Server updated', 'success');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const onIcon = async (f?: File) => {
    if (!f) return;
    setIconBusy(true);
    try { await uploadIcon(guildId, f); toast('Icon updated', 'success'); } catch (e) { toast(errorMessage(e), 'error'); }
    finally { setIconBusy(false); }
  };

  return (
    <div>
      <h1 className="settings-title">Server Overview</h1>
      <div className="overview-grid">
        <div className="overview-icon">
          <button className="icon-upload has-image" onClick={() => fileRef.current?.click()} disabled={iconBusy}>
            <GuildIcon guild={guild} size={100} />
            <span className="icon-upload-hover">{iconBusy ? 'Uploading…' : 'Change Icon'}</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void onIcon(e.target.files?.[0]); e.target.value = ''; }} />
          <p className="muted small">We recommend an image of at least 512×512.</p>
        </div>
        <div className="overview-fields">
          <Field label="Server Name"><input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Description" hint="Shown on invite pages.">
            <textarea rows={3} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's your server about?" />
          </Field>
        </div>
      </div>
      <div className="divider" />
      <Field label="System Messages Channel" hint="Where we post welcome messages when someone joins.">
        <select value={systemChannel} onChange={(e) => setSystemChannel(e.target.value)}>
          <option value="">No System Messages</option>
          {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
        </select>
      </Field>
      {dirty && <UnsavedBar onReset={reset} onSave={save} busy={busy} error={error} />}
    </div>
  );
}

// ---------------- Discovery ----------------
const BANNER_COLORS = ['#14b8a6', '#22c55e', '#3b82f6', '#7c3aed', '#db2777', '#f43f5e', '#f97316', '#eab308', '#475569'];

function DiscoveryTab({ guildId }: { guildId: string }) {
  const guild = useGuildStore((s) => s.guilds[guildId])!;
  const [enabled, setEnabled] = useState(guild.discoverable);
  const [category, setCategory] = useState<GuildCategory | ''>(guild.category ?? '');
  const [description, setDescription] = useState(guild.description ?? '');
  const [banner, setBanner] = useState(guild.banner_color ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = enabled !== guild.discoverable || category !== (guild.category ?? '') ||
    description !== (guild.description ?? '') || banner !== (guild.banner_color ?? '');

  const reset = () => {
    setEnabled(guild.discoverable); setCategory(guild.category ?? ''); setDescription(guild.description ?? '');
    setBanner(guild.banner_color ?? ''); setError('');
  };
  const save = async () => {
    if (enabled && !category) { setError('Pick a category to list your server'); return; }
    if (enabled && !description.trim()) { setError('Add a description to list your server'); return; }
    setBusy(true); setError('');
    try {
      const g = await api.patch<typeof guild>(`/guilds/${guildId}`, {
        discoverable: enabled, category: category || null, description: description.trim() || null, banner_color: banner || null,
      });
      if (g?.id) useGuildStore.getState().updateGuild(g);
      toast(enabled ? 'Your server is listed in Discover' : 'Discovery settings saved', 'success');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="settings-title">Discovery</h1>
      <p className="setting-desc">List your server in Discover so anyone on Huddle can find it and join without an invite. Bans still apply.</p>
      <div className="setting-row">
        <div>
          <div className="setting-title">Show in Discover</div>
          <div className="setting-desc">Needs a category and a description.</div>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} label="Show in Discover" />
      </div>
      <div className="divider" />
      <Field label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value as GuildCategory | '')}>
          <option value="">Choose a category</option>
          {GUILD_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Description" hint="Shown on your Discover card and invite pages.">
        <textarea rows={3} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's your server about?" />
      </Field>
      <div className="field">
        <span className="field-label">Banner Colour</span>
        <div className="swatches" role="radiogroup" aria-label="Banner colour">
          <button type="button" role="radio" aria-checked={!banner} className={'swatch default' + (!banner ? ' selected' : '')} title="Category colour" onClick={() => setBanner('')} />
          {BANNER_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={banner === c} className={'swatch' + (banner === c ? ' selected' : '')} style={{ background: c }} title={c} onClick={() => setBanner(c)} />
          ))}
        </div>
      </div>
      <span className="field-label">Preview</span>
      <div className="discover-card discover-card-preview" aria-hidden="true">
        <div className={'discover-banner cat-' + (category || 'other')} style={banner ? { background: banner } : undefined} />
        <GuildIcon guild={guild} size={52} className="discover-card-icon" />
        <div className="discover-card-body">
          <div className="discover-card-name"><strong className="truncate">{guild.name}</strong></div>
          <p className="discover-card-desc">{description || 'Your description goes here.'}</p>
        </div>
      </div>
      {dirty && <UnsavedBar onReset={reset} onSave={save} busy={busy} error={error} />}
    </div>
  );
}

// ---------------- Roles ----------------
const ROLE_COLORS = ['#14b8a6', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#64748b', '#0d9488', '#15803d', '#1d4ed8', '#7e22ce', '#be185d', '#b91c1c', '#c2410c', '#a16207', '#334155'];

function RolesTab({ guildId }: { guildId: string }) {
  const rolesMap = useGuildStore((s) => s.roles[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const roles = sortedRoles(rolesMap);
  const [selected, setSelected] = useState<string | null>(null);
  const myPos = myHighestPosition(guildId);
  const role = selected ? rolesMap?.[selected] : undefined;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of Object.values(members || {})) for (const r of m.roles) c[r] = (c[r] || 0) + 1;
    return c;
  }, [members]);

  const move = async (r: Role, dir: -1 | 1) => {
    // dir -1 = up (higher position)
    const list = roles.filter((x) => x.id !== guildId); // highest first
    const i = list.findIndex((x) => x.id === r.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const other = list[j];
    if (other.position >= myPos || r.position >= myPos) return;
    const next = list.slice();
    [next[i], next[j]] = [next[j], next[i]];
    const total = next.length;
    const payload = next.map((x, idx) => ({ id: x.id, position: total - idx }));
    // optimistic
    for (const p of payload) { const rr = rolesMap?.[p.id]; if (rr) useGuildStore.getState().upsertRole(guildId, { ...rr, position: p.position }); }
    try { await reorderRoles(guildId, payload); } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const create = async () => {
    try { const r = await createRole(guildId, { name: 'new role', color: 0, permissions: '0' }); setSelected(r.id); }
    catch (e) { toast(errorMessage(e), 'error'); }
  };

  if (role) return <RoleEditor key={role.id} guildId={guildId} role={role} roles={roles} onBack={() => setSelected(null)} onSelect={setSelected} />;

  return (
    <div>
      <h1 className="settings-title">Roles</h1>
      <p className="setting-desc">Use roles to group your server members and assign permissions. Members use the colour of their highest coloured role.</p>
      <button className="everyone-card" onClick={() => setSelected(guildId)}>
        <span className="everyone-icon"><IconShield size={22} /></span>
        <span><strong>Default Permissions</strong><small>@everyone • applies to all server members</small></span>
      </button>
      <div className="row-between mt">
        <span className="field-label">Roles — {roles.length - 1}</span>
        <button className="btn btn-primary btn-small" onClick={create}><IconPlus size={14} /> Create Role</button>
      </div>
      <div className="roles-table">
        {roles.filter((r) => r.id !== guildId).map((r, idx, arr) => {
          const editable = r.position < myPos;
          return (
            <div key={r.id} className={'roles-row' + (editable ? '' : ' locked')}>
              <span className="role-reorder">
                <button className="icon-btn tiny" aria-label="Move up" disabled={!editable || idx === 0 || arr[idx - 1].position >= myPos} onClick={() => void move(r, -1)}><IconArrowUp size={14} /></button>
                <button className="icon-btn tiny" aria-label="Move down" disabled={!editable || idx === arr.length - 1} onClick={() => void move(r, 1)}><IconArrowDown size={14} /></button>
              </span>
              <button className="roles-row-main" onClick={() => setSelected(r.id)}>
                <span className="role-dot big" style={{ background: r.color ? intToHex(r.color) : 'var(--text-faint)' }} />
                <span className="truncate">{r.name}</span>
                {r.hoist && <span className="chip static tiny">Hoisted</span>}
              </button>
              <span className="muted small role-count">{counts[r.id] || 0} member{counts[r.id] === 1 ? '' : 's'}</span>
            </div>
          );
        })}
        {roles.length <= 1 && <div className="muted center-pad">No roles yet. Create one to get started.</div>}
      </div>
    </div>
  );
}

function RoleEditor({ guildId, role, roles, onBack, onSelect }: { guildId: string; role: Role; roles: Role[]; onBack: () => void; onSelect: (id: string) => void }) {
  const isEveryone = role.id === guildId;
  const myPos = myHighestPosition(guildId);
  const editable = isEveryone || role.position < myPos;
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [hoist, setHoist] = useState(role.hoist);
  const [mentionable, setMentionable] = useState(role.mentionable);
  const [permissions, setPermissions] = useState(BigInt(role.permissions));
  const [sub, setSub] = useState<'display' | 'permissions'>(isEveryone ? 'permissions' : 'display');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const dirty = name !== role.name || color !== role.color || hoist !== role.hoist || mentionable !== role.mentionable || permissions !== BigInt(role.permissions);

  const reset = () => { setName(role.name); setColor(role.color); setHoist(role.hoist); setMentionable(role.mentionable); setPermissions(BigInt(role.permissions)); setError(''); };
  const save = async () => {
    setBusy(true); setError('');
    try {
      await updateRole(guildId, role.id, isEveryone ? { permissions: permissions.toString() } : { name: name.trim() || 'role', color, hoist, mentionable, permissions: permissions.toString() });
      toast('Role saved', 'success');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const remove = () => confirmDialog({
    title: `Delete '${role.name}'`, danger: true, confirmLabel: 'Delete',
    body: 'Are you sure you want to delete this role? Members with it will lose its permissions.',
    onConfirm: async () => { await deleteRole(guildId, role.id); onBack(); },
  });
  const togglePerm = (flag: bigint, on: boolean) => setPermissions((p) => (on ? p | flag : p & ~flag));

  return (
    <div className="role-editor">
      <div className="role-editor-list">
        <button className="btn-link" onClick={onBack}>← Back</button>
        {roles.map((r) => (
          <button key={r.id} className={'role-editor-item' + (r.id === role.id ? ' active' : '')} onClick={() => onSelect(r.id)}>
            <span className="role-dot" style={{ background: r.color ? intToHex(r.color) : 'var(--text-faint)' }} />
            <span className="truncate">{r.id === guildId ? '@everyone' : r.name}</span>
          </button>
        ))}
      </div>
      <div className="role-editor-main">
        <div className="row-between">
          <h1 className="settings-title">Edit Role — {isEveryone ? '@everyone' : role.name}</h1>
          {!isEveryone && editable && <Tooltip label="Delete Role"><button className="icon-btn danger-hover" aria-label="Delete role" onClick={remove}><IconTrash size={18} /></button></Tooltip>}
        </div>
        {!editable && <div className="notice">You can only edit roles below your highest role.</div>}
        <div className="subtabs">
          {!isEveryone && <button className={'tab' + (sub === 'display' ? ' active' : '')} onClick={() => setSub('display')}>Display</button>}
          <button className={'tab' + (sub === 'permissions' ? ' active' : '')} onClick={() => setSub('permissions')}>Permissions</button>
        </div>
        <fieldset disabled={!editable} className="plain-fieldset">
          {sub === 'display' && !isEveryone && (
            <>
              <Field label="Role Name"><input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></Field>
              <div className="field-label">Role Colour</div>
              <p className="setting-desc">Members use the colour of the highest role they have.</p>
              <div className="swatches">
                <button className={'swatch default' + (color === 0 ? ' selected' : '')} onClick={() => setColor(0)} aria-label="Default colour" />
                {ROLE_COLORS.map((c) => <button key={c} className={'swatch' + (color === hexToInt(c) ? ' selected' : '')} style={{ background: c }} aria-label={c} onClick={() => setColor(hexToInt(c))} />)}
                <label className="swatch custom" style={{ background: color ? intToHex(color) : 'var(--bg-input)' }} title="Custom colour">
                  <input type="color" value={color ? intToHex(color) : '#14b8a6'} onChange={(e) => setColor(hexToInt(e.target.value))} />+
                </label>
              </div>
              <div className="setting-row">
                <div><div className="setting-title">Display role members separately from online members</div></div>
                <Toggle checked={hoist} onChange={setHoist} label="Hoist" />
              </div>
              <div className="setting-row">
                <div><div className="setting-title">Allow anyone to @mention this role</div><div className="setting-desc">Members with Mention @everyone can always ping all roles.</div></div>
                <Toggle checked={mentionable} onChange={setMentionable} label="Mentionable" />
              </div>
            </>
          )}
          {sub === 'permissions' && (
            <>
              <div className="search-field"><input placeholder="Search permissions" value={filter} onChange={(e) => setFilter(e.target.value)} /><IconSearch size={16} /></div>
              {PERMISSION_INFO.map((g) => {
                const items = g.items.filter((it) => !filter || it.label.toLowerCase().includes(filter.toLowerCase()));
                if (!items.length) return null;
                return (
                  <div key={g.group} className="perm-group">
                    <h3>{g.group}</h3>
                    {items.map((it) => {
                      const flag = Permissions[it.key];
                      return (
                        <div key={it.key} className="setting-row">
                          <div><div className="setting-title">{it.label}</div><div className="setting-desc">{it.description}</div></div>
                          <Toggle checked={has(permissions, flag)} onChange={(v) => togglePerm(flag, v)} label={it.label} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              <button className="btn btn-ghost btn-small" onClick={() => setPermissions(0n)}>Clear permissions</button>
            </>
          )}
        </fieldset>
      </div>
      {dirty && editable && <UnsavedBar onReset={reset} onSave={save} busy={busy} error={error} />}
    </div>
  );
}

// ---------------- Members ----------------
function MembersTab({ guildId }: { guildId: string }) {
  const members = useGuildStore((s) => s.members[guildId]);
  const rolesMap = useGuildStore((s) => s.roles[guildId]);
  const guild = useGuildStore((s) => s.guilds[guildId])!;
  const perms = useGuildPermissions(guildId);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  useEffect(() => { void fetchMembers(guildId); }, [guildId]);
  const myPos = myHighestPosition(guildId);
  const list = useMemo(() => Object.values(members || {})
    .filter((m) => !q || m.user.username.toLowerCase().includes(q.toLowerCase()) || (m.nick || '').toLowerCase().includes(q.toLowerCase()) || (m.user.display_name || '').toLowerCase().includes(q.toLowerCase()))
    .filter((m) => !roleFilter || m.roles.includes(roleFilter))
    .sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at)), [members, q, roleFilter]);
  const roles = sortedRoles(rolesMap).filter((r) => r.id !== guildId);

  const setRoles = (userId: string, ids: string[]) => updateMember(guildId, userId, { roles: ids }).catch((e) => toast(errorMessage(e), 'error'));

  return (
    <div>
      <h1 className="settings-title">Server Members</h1>
      <div className="row-between">
        <span className="field-label">{list.length} Members</span>
        <div className="row">
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="small-select">
            <option value="">All roles</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <div className="search-field small"><input placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} /><IconSearch size={14} /></div>
        </div>
      </div>
      <div className="members-table">
        {list.map((m) => {
          const actOn = canActOn(guildId, m.user.id);
          const canRoles = has(perms, Permissions.MANAGE_ROLES) && (actOn || m.user.id === useAuthStore.getState().user?.id);
          const assignable = roles.filter((r) => !m.roles.includes(r.id) && r.position < myPos);
          return (
            <div key={m.user.id} className="members-row">
              <Avatar user={m.user} size={36} status="auto" ring="var(--bg-chat)" />
              <div className="members-name">
                <strong>{m.nick || m.user.display_name || m.user.username}{m.user.id === guild.owner_id && <span className="owner-crown"> ♛</span>}</strong>
                <small>{m.user.username} · joined {formatShortDate(m.joined_at)}</small>
              </div>
              <div className="members-roles">
                {m.roles.map((rid) => rolesMap?.[rid]).filter(Boolean).sort((a, b) => b!.position - a!.position).map((r) => (
                  <span key={r!.id} className="role-pill small">
                    {canRoles && r!.position < myPos
                      ? <button className="role-dot removable" style={{ background: r!.color ? intToHex(r!.color) : 'var(--text-faint)' }} aria-label={`Remove ${r!.name}`} onClick={() => setRoles(m.user.id, m.roles.filter((x) => x !== r!.id))}><IconClose size={8} strokeWidth={4} /></button>
                      : <span className="role-dot" style={{ background: r!.color ? intToHex(r!.color) : 'var(--text-faint)' }} />}
                    {r!.name}
                  </span>
                ))}
                {canRoles && assignable.length > 0 && (
                  <span className="role-add-wrap">
                    <button className="role-pill add small" aria-label="Add role" onClick={() => setAdding(adding === m.user.id ? null : m.user.id)}><IconPlus size={12} /></button>
                    {adding === m.user.id && (
                      <div className="role-add-menu">
                        {assignable.map((r) => (
                          <button key={r.id} onClick={() => { setAdding(null); void setRoles(m.user.id, [...m.roles, r.id]); }}>
                            <span className="role-dot" style={{ background: r.color ? intToHex(r.color) : 'var(--text-faint)' }} />{r.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                )}
              </div>
              <div className="members-actions">
                {actOn && has(perms, Permissions.KICK_MEMBERS) && (
                  <button className="btn btn-small btn-ghost danger-text" onClick={() => confirmDialog({
                    title: `Kick ${displayName(m.user.id, guildId)}`, danger: true, confirmLabel: 'Kick',
                    body: `Kick ${displayName(m.user.id, guildId)} from ${guild.name}? They can rejoin with a new invite.`,
                    onConfirm: () => kickMember(guildId, m.user.id),
                  })}>Kick</button>
                )}
                {actOn && has(perms, Permissions.BAN_MEMBERS) && <button className="btn btn-small btn-danger" onClick={() => openModal('ban', { guildId, userId: m.user.id })}>Ban</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Invites ----------------
function InvitesTab({ guildId }: { guildId: string }) {
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState('');
  const load = () => api.get<Invite[]>(`/guilds/${guildId}/invites`).then(setInvites).catch((e) => setError(errorMessage(e)));
  useEffect(() => { void load(); }, [guildId]); // eslint-disable-line react-hooks/exhaustive-deps
  const revoke = async (code: string) => {
    try { await api.del(`/invites/${code}`); setInvites((l) => l?.filter((i) => i.code !== code) ?? null); toast('Invite revoked', 'success'); }
    catch (e) { toast(errorMessage(e), 'error'); }
  };
  return (
    <div>
      <h1 className="settings-title">Invites</h1>
      <p className="setting-desc">Here's a list of all active invite links. You can revoke any one.</p>
      {error && <div className="form-error">{error}</div>}
      {!invites ? <div className="center-pad"><Spinner /></div> : !invites.length ? <div className="muted center-pad">No active invites. Create one from a channel's menu.</div> : (
        <table className="data-table">
          <thead><tr><th>Inviter</th><th>Invite Code</th><th>Uses</th><th>Expires</th><th /></tr></thead>
          <tbody>
            {invites.map((i) => (
              <tr key={i.code}>
                <td>{i.inviter ? <span className="row"><Avatar user={i.inviter} size={22} />{userDisplayName(i.inviter)}</span> : '—'}<div className="muted small">#{i.channel?.name}</div></td>
                <td><code title={inviteUrl(i.code)}>{i.code}</code></td>
                <td>{i.uses}{i.max_uses ? ` / ${i.max_uses}` : ''}</td>
                <td>{i.expires_at ? relativeTime(i.expires_at).replace(' ago', '') : '∞'}</td>
                <td><Tooltip label="Revoke invite"><button className="icon-btn tiny danger-hover" aria-label="Revoke" onClick={() => void revoke(i.code)}><IconClose size={16} /></button></Tooltip></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Bans ----------------
function BansTab({ guildId }: { guildId: string }) {
  const bans = useBanStore((s) => s.bans[guildId]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { useBanStore.getState().fetch(guildId).catch((e) => setError(errorMessage(e))); }, [guildId]);
  const unban = (u: PublicUser) => confirmDialog({
    title: `Unban ${userDisplayName(u)}?`, confirmLabel: 'Revoke Ban', body: 'They will be able to rejoin with an invite.',
    onConfirm: async () => { await api.del(`/guilds/${guildId}/bans/${u.id}`); useBanStore.getState().remove(guildId, u.id); },
  });
  const list = (bans || []).filter((b) => !q || b.user.username.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <h1 className="settings-title">Server Ban List</h1>
      <div className="search-field"><input placeholder="Search bans by username" value={q} onChange={(e) => setQ(e.target.value)} /><IconSearch size={16} /></div>
      {error && <div className="form-error">{error}</div>}
      {!bans ? <div className="center-pad"><Spinner /></div> : !list.length ? <div className="muted center-pad">No bans. Hopefully it stays that way.</div> : (
        <div className="members-table">
          {list.map((b) => (
            <div key={b.user.id} className="members-row">
              <Avatar user={b.user} size={32} />
              <div className="members-name"><strong>{userDisplayName(b.user)}</strong><small>{b.user.username}{b.reason ? ` · ${b.reason}` : ''}</small></div>
              <div className="members-actions"><button className="btn btn-small btn-secondary" onClick={() => unban(b.user)}>Revoke Ban</button></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Audit log ----------------
const ACTION_TEXT: Record<number, string> = {
  [AuditLogAction.GUILD_UPDATE]: 'updated the server',
  [AuditLogAction.CHANNEL_CREATE]: 'created channel',
  [AuditLogAction.CHANNEL_UPDATE]: 'updated channel',
  [AuditLogAction.CHANNEL_DELETE]: 'deleted channel',
  [AuditLogAction.CHANNEL_OVERWRITE_UPDATE]: 'updated permissions on',
  [AuditLogAction.CHANNEL_OVERWRITE_DELETE]: 'removed a permission overwrite on',
  [AuditLogAction.MEMBER_KICK]: 'kicked',
  [AuditLogAction.MEMBER_BAN_ADD]: 'banned',
  [AuditLogAction.MEMBER_BAN_REMOVE]: 'unbanned',
  [AuditLogAction.MEMBER_UPDATE]: 'updated member',
  [AuditLogAction.MEMBER_ROLE_UPDATE]: 'updated roles for',
  [AuditLogAction.MEMBER_MOVE]: 'moved',
  [AuditLogAction.MEMBER_DISCONNECT]: 'disconnected',
  [AuditLogAction.ROLE_CREATE]: 'created role',
  [AuditLogAction.ROLE_UPDATE]: 'updated role',
  [AuditLogAction.ROLE_DELETE]: 'deleted role',
  [AuditLogAction.INVITE_CREATE]: 'created invite',
  [AuditLogAction.INVITE_DELETE]: 'deleted invite',
  [AuditLogAction.MESSAGE_DELETE]: 'deleted a message by',
  [AuditLogAction.MESSAGE_PIN]: 'pinned a message by',
  [AuditLogAction.MESSAGE_UNPIN]: 'unpinned a message by',
  [AuditLogAction.EMOJI_CREATE]: 'added emoji',
  [AuditLogAction.EMOJI_UPDATE]: 'renamed emoji',
  [AuditLogAction.EMOJI_DELETE]: 'removed emoji',
};

function targetName(guildId: string, e: AuditLogEntry, users: Record<string, PublicUser>): string {
  if (!e.target_id) return '';
  const s = useGuildStore.getState();
  const nameChange = e.changes.find((c) => c.key === 'name');
  if (e.action_type >= 10 && e.action_type < 20) { const c = s.channels[e.target_id]; return '#' + (c?.name ?? (nameChange?.old_value as string) ?? (nameChange?.new_value as string) ?? 'deleted-channel'); }
  if (e.action_type >= 30 && e.action_type < 40) { const r = s.roles[guildId]?.[e.target_id]; return '@' + (r?.name ?? (nameChange?.new_value as string) ?? (nameChange?.old_value as string) ?? 'deleted-role'); }
  if (e.action_type >= 40 && e.action_type < 50) return e.target_id;
  if (e.action_type >= 80 && e.action_type < 90) { const em = s.emojis[guildId]?.find((x) => x.id === e.target_id); return ':' + (em?.name ?? (nameChange?.new_value as string) ?? (nameChange?.old_value as string) ?? 'emoji') + ':'; }
  if (e.action_type === 1) return '';
  const u = users[e.target_id] || s.users[e.target_id];
  return u ? userDisplayName(u) : displayName(e.target_id, guildId);
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function AuditTab({ guildId }: { guildId: string }) {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [users, setUsers] = useState<Record<string, PublicUser>>({});
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    api.get<AuditLogEntry[] | { audit_log_entries: AuditLogEntry[]; users?: PublicUser[]; entries?: AuditLogEntry[] }>(`/guilds/${guildId}/audit-logs`, { limit: 100 })
      .then((res) => {
        const list = Array.isArray(res) ? res : res.audit_log_entries ?? res.entries ?? [];
        if (!Array.isArray(res) && res.users) { setUsers(Object.fromEntries(res.users.map((u) => [u.id, u]))); useGuildStore.getState().upsertUsers(res.users); }
        setEntries(list);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [guildId]);
  return (
    <div>
      <h1 className="settings-title">Audit Log</h1>
      {error && <div className="form-error">{error}</div>}
      {!entries ? !error && <div className="center-pad"><Spinner /></div> : !entries.length ? <div className="muted center-pad">Nothing has happened here yet.</div> : (
        <div className="audit-list">
          {entries.map((e) => {
            const actor = users[e.user_id] || useGuildStore.getState().users[e.user_id];
            const tgt = targetName(guildId, e, users);
            return (
              <div key={e.id} className={'audit-entry' + (open === e.id ? ' open' : '')}>
                <button className="audit-head" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <Avatar user={actor} userId={e.user_id} size={32} />
                  <span className="audit-text">
                    <strong>{actor ? userDisplayName(actor) : displayName(e.user_id, guildId)}</strong> {ACTION_TEXT[e.action_type] ?? `performed action ${e.action_type}`} {tgt && <strong>{tgt}</strong>}
                    <small>{formatTimestamp(e.created_at)}</small>
                  </span>
                  {(e.changes.length > 0 || e.reason) && <span className="muted small">{open === e.id ? '▲' : '▼'}</span>}
                </button>
                {open === e.id && (
                  <div className="audit-changes">
                    {e.changes.map((c, i) => <div key={i}><code>{c.key}</code>: {fmtVal(c.old_value)} → <strong>{fmtVal(c.new_value)}</strong></div>)}
                    {e.reason && <div>Reason: {e.reason}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- Delete ----------------
function DeleteServer({ guildId, onCancel, close }: { guildId: string; onCancel: () => void; close: () => void }) {
  const guild = useGuildStore((s) => s.guilds[guildId])!;
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (name !== guild.name) { setError("You didn't enter the server name correctly"); return; }
    setBusy(true);
    try { await deleteGuild(guildId); close(); } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return (
    <Modal close={onCancel} title={`Delete '${guild.name}'`} footer={<><button className="btn btn-ghost" onClick={onCancel}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={go}>Delete Server</button></>}>
      <div className="notice danger">Are you sure you want to delete <strong>{guild.name}</strong>? This action cannot be undone.</div>
      <Field label="Enter server name" error={error}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
    </Modal>
  );
}
