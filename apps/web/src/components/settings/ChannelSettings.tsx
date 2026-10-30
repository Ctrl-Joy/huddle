import { useEffect, useMemo, useState } from 'react';
import { ChannelType, PERMISSION_INFO, Permissions, TEXT_PERMISSIONS, VOICE_PERMISSIONS, type PermissionName, type PermissionOverwrite } from '@huddle/shared';
import { SettingsLayout, UnsavedBar } from './SettingsLayout';
import { useGuildStore, sortedRoles, intToHex, displayName } from '../../stores/guilds';
import { confirmDialog, toast } from '../../stores/ui';
import { updateChannel, deleteChannel, setOverwrite, deleteOverwrite } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { Field, Toggle } from '../modals/Modal';
import { Avatar } from '../common/Avatar';
import { IconCheck, IconClose, IconPlus, IconSlash, IconTrash, IconLock } from '../common/icons';

type Tab = 'overview' | 'permissions';

const SLOWMODE = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600];
function slowLabel(s: number) {
  if (!s) return 'Off';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${s / 60}m`;
  return `${s / 3600}h`;
}

export function ChannelSettings({ close, channelId }: { close: () => void; channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => { if (!channel) close(); }, [channel, close]);
  if (!channel) return null;
  const isCategory = channel.type === ChannelType.GUILD_CATEGORY;
  return (
    <SettingsLayout
      close={close}
      active={tab}
      onSelect={(id) => {
        if (id === 'delete') {
          confirmDialog({
            title: isCategory ? 'Delete Category' : 'Delete Channel', danger: true, confirmLabel: 'Delete',
            body: <>Are you sure you want to delete <strong>{isCategory ? channel.name : '#' + channel.name}</strong>? This cannot be undone.</>,
            onConfirm: async () => { await deleteChannel(channelId); close(); },
          });
        } else setTab(id as Tab);
      }}
      sections={[
        { header: <span className="inline-icon">{isCategory ? channel.name : `# ${channel.name}`}</span>, items: [{ id: 'overview', label: 'Overview' }, { id: 'permissions', label: 'Permissions' }] },
        { items: [{ id: 'delete', label: isCategory ? 'Delete Category' : 'Delete Channel', danger: true }] },
      ]}
    >
      {tab === 'overview' && <Overview channelId={channelId} />}
      {tab === 'permissions' && <PermissionsTab channelId={channelId} />}
    </SettingsLayout>
  );
}

function Overview({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId])!;
  const [name, setName] = useState(channel.name ?? '');
  const [topic, setTopic] = useState(channel.topic ?? '');
  const [slow, setSlow] = useState(channel.rate_limit_per_user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isText = channel.type === ChannelType.GUILD_TEXT;
  const dirty = name !== (channel.name ?? '') || topic !== (channel.topic ?? '') || slow !== channel.rate_limit_per_user;
  const reset = () => { setName(channel.name ?? ''); setTopic(channel.topic ?? ''); setSlow(channel.rate_limit_per_user); setError(''); };
  const save = async () => {
    const n = isText ? name.toLowerCase().replace(/\s+/g, '-') : name.trim();
    if (!n) { setError('Name is required'); return; }
    setBusy(true); setError('');
    try {
      await updateChannel(channelId, isText ? { name: n, topic: topic.trim() || null, rate_limit_per_user: slow } : { name: n });
      toast('Channel saved', 'success');
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <h1 className="settings-title">Overview</h1>
      <Field label={channel.type === ChannelType.GUILD_CATEGORY ? 'Category Name' : 'Channel Name'}>
        <input value={name} maxLength={100} onChange={(e) => setName(isText ? e.target.value.toLowerCase().replace(/\s+/g, '-') : e.target.value)} />
      </Field>
      {isText && (
        <>
          <Field label="Channel Topic" hint={`${1024 - topic.length} characters left`}>
            <textarea rows={3} maxLength={1024} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Let everyone know how to use this channel!" />
          </Field>
          <div className="field-label">Slowmode — {slowLabel(slow)}</div>
          <input className="range" type="range" min={0} max={SLOWMODE.length - 1} step={1} value={Math.max(0, SLOWMODE.indexOf(slow))} onChange={(e) => setSlow(SLOWMODE[Number(e.target.value)])} />
          <div className="range-ticks">{SLOWMODE.map((s) => <span key={s}>{slowLabel(s)}</span>)}</div>
          <p className="setting-desc">Members will be restricted to sending one message per this interval, unless they have Manage Channel or Manage Messages.</p>
        </>
      )}
      {dirty && <UnsavedBar onReset={reset} onSave={save} busy={busy} error={error} />}
    </div>
  );
}

function PermissionsTab({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId])!;
  const guildId = channel.guild_id!;
  const rolesMap = useGuildStore((s) => s.roles[guildId]);
  const members = useGuildStore((s) => s.members[guildId]);
  const [selected, setSelected] = useState<string>(guildId);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const overwrites = channel.permission_overwrites;
  const existing = overwrites.find((o) => o.id === selected);
  const [allow, setAllow] = useState(0n);
  const [deny, setDeny] = useState(0n);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setAllow(BigInt(existing?.allow ?? '0'));
    setDeny(BigInt(existing?.deny ?? '0'));
    setError('');
  }, [selected, existing?.allow, existing?.deny]); // eslint-disable-line react-hooks/exhaustive-deps

  const keys: PermissionName[] = channel.type === ChannelType.GUILD_VOICE ? VOICE_PERMISSIONS
    : channel.type === ChannelType.GUILD_CATEGORY ? [...new Set([...TEXT_PERMISSIONS, ...VOICE_PERMISSIONS])] : TEXT_PERMISSIONS;
  const info = useMemo(() => {
    const map = new Map<PermissionName, { label: string; description: string }>();
    for (const g of PERMISSION_INFO) for (const it of g.items) map.set(it.key, it);
    return map;
  }, []);

  const targets: { id: string; type: 0 | 1; label: string; color?: string; ow?: PermissionOverwrite }[] = [];
  const everyone = { id: guildId, type: 0 as const, label: '@everyone', ow: overwrites.find((o) => o.id === guildId) };
  targets.push(everyone);
  for (const r of sortedRoles(rolesMap)) {
    if (r.id === guildId) continue;
    const ow = overwrites.find((o) => o.id === r.id);
    if (ow || selected === r.id) targets.push({ id: r.id, type: 0, label: r.name, color: r.color ? intToHex(r.color) : undefined, ow });
  }
  for (const o of overwrites) if (o.type === 1) targets.push({ id: o.id, type: 1, label: displayName(o.id, guildId), ow: o });
  if (selected && !targets.some((t) => t.id === selected) && members?.[selected]) targets.push({ id: selected, type: 1, label: displayName(selected, guildId) });
  const target = targets.find((t) => t.id === selected) ?? everyone;
  const dirty = allow !== BigInt(existing?.allow ?? '0') || deny !== BigInt(existing?.deny ?? '0');

  const set = (flag: bigint, state: 'allow' | 'neutral' | 'deny') => {
    setAllow((a) => (state === 'allow' ? a | flag : a & ~flag));
    setDeny((d) => (state === 'deny' ? d | flag : d & ~flag));
  };
  const save = async () => {
    setBusy(true); setError('');
    try { await setOverwrite(channelId, target.id, target.type, allow, deny); toast('Permissions saved', 'success'); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    try { await deleteOverwrite(channelId, target.id); setSelected(guildId); } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const isPrivate = (BigInt(everyone.ow?.deny ?? '0') & Permissions.VIEW_CHANNEL) !== 0n;
  const togglePrivate = async (v: boolean) => {
    const a = BigInt(everyone.ow?.allow ?? '0') & ~Permissions.VIEW_CHANNEL;
    const d = v ? BigInt(everyone.ow?.deny ?? '0') | Permissions.VIEW_CHANNEL : BigInt(everyone.ow?.deny ?? '0') & ~Permissions.VIEW_CHANNEL;
    try { await setOverwrite(channelId, guildId, 0, a, d); } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const addable = [
    ...sortedRoles(rolesMap).filter((r) => r.id !== guildId && !targets.some((t) => t.id === r.id)).map((r) => ({ id: r.id, label: r.name, kind: 'Role', color: r.color ? intToHex(r.color) : undefined })),
    ...Object.values(members || {}).filter((m) => !targets.some((t) => t.id === m.user.id)).map((m) => ({ id: m.user.id, label: m.nick || m.user.display_name || m.user.username, kind: 'Member', color: undefined as string | undefined })),
  ].filter((x) => !q || x.label.toLowerCase().includes(q.toLowerCase())).slice(0, 30);

  return (
    <div>
      <h1 className="settings-title">Channel Permissions</h1>
      <div className="setting-row private-row">
        <div>
          <div className="setting-title"><IconLock size={14} /> Private {channel.type === ChannelType.GUILD_CATEGORY ? 'Category' : 'Channel'}</div>
          <div className="setting-desc">Only members and roles you allow below will be able to view this channel.</div>
        </div>
        <Toggle checked={isPrivate} onChange={(v) => void togglePrivate(v)} label="Private" />
      </div>
      <div className="perm-editor">
        <div className="perm-targets">
          <div className="row-between">
            <span className="field-label">Roles / Members</span>
            <button className="icon-btn tiny" aria-label="Add role or member" onClick={() => setAdding((v) => !v)}><IconPlus size={16} /></button>
          </div>
          {adding && (
            <div className="perm-add">
              <input autoFocus placeholder="Add members or roles" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="perm-add-list scroll-thin">
                {addable.map((x) => (
                  <button key={x.id} onClick={() => { setSelected(x.id); setAdding(false); setQ(''); }}>
                    {x.kind === 'Member' ? <Avatar userId={x.id} size={18} /> : <span className="role-dot" style={{ background: x.color || 'var(--text-faint)' }} />}
                    <span className="truncate" style={x.color ? { color: x.color } : undefined}>{x.label}</span>
                    <small>{x.kind}</small>
                  </button>
                ))}
                {!addable.length && <div className="muted small center-pad">No matches</div>}
              </div>
            </div>
          )}
          {targets.map((t) => (
            <button key={t.id} className={'perm-target' + (t.id === target.id ? ' active' : '')} onClick={() => setSelected(t.id)}>
              {t.type === 1 ? <Avatar userId={t.id} size={18} /> : <span className="role-dot" style={{ background: t.color || 'var(--text-faint)' }} />}
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="perm-list">
          <div className="row-between">
            <h3>{target.label}</h3>
            {existing && target.id !== guildId && <button className="btn btn-small btn-ghost danger-text" onClick={() => void remove()}><IconTrash size={14} /> Remove</button>}
          </div>
          {keys.map((k) => {
            const flag = Permissions[k];
            const state = (allow & flag) ? 'allow' : (deny & flag) ? 'deny' : 'neutral';
            const it = info.get(k);
            return (
              <div key={k} className="setting-row">
                <div><div className="setting-title">{it?.label ?? k}</div><div className="setting-desc">{it?.description}</div></div>
                <div className="tristate" role="radiogroup" aria-label={it?.label ?? k}>
                  <button className={'ts deny' + (state === 'deny' ? ' on' : '')} aria-label="Deny" onClick={() => set(flag, 'deny')}><IconClose size={14} strokeWidth={3} /></button>
                  <button className={'ts neutral' + (state === 'neutral' ? ' on' : '')} aria-label="Inherit" onClick={() => set(flag, 'neutral')}><IconSlash size={14} /></button>
                  <button className={'ts allow' + (state === 'allow' ? ' on' : '')} aria-label="Allow" onClick={() => set(flag, 'allow')}><IconCheck size={14} strokeWidth={3} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {dirty && <UnsavedBar onReset={() => { setAllow(BigInt(existing?.allow ?? '0')); setDeny(BigInt(existing?.deny ?? '0')); }} onSave={save} busy={busy} error={error} />}
    </div>
  );
}
