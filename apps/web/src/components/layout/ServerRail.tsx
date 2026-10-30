import { useMemo, useState, type CSSProperties, type DragEvent, type MouseEvent as RMouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LIMITS, type GuildFolder } from '@huddle/shared';
import { useGuildStore, channelDisplayName } from '../../stores/guilds';
import { computeGuildUnread, useGuildUnread, usePrivateUnread, useReadStateStore } from '../../stores/readStates';
import { usePendingIncomingCount } from '../../stores/relationships';
import { useAuthStore } from '../../stores/auth';
import { useUIStore, openModal, type MenuItem } from '../../stores/ui';
import { useUserSettingsStore, saveRailLayout } from '../../stores/userSettings';
import { getLastChannel } from '../../lib/nav';
import { markGuildRead } from '../../lib/actions';
import {
  FOLDER_COLORS, buildRail, dissolveFolder, folderOfGuild, moveFolder, moveGuild, newFolderWith, removeFromFolder, updateFolder,
  type DropTarget, type DropWhere, type RailEntry,
} from '../../lib/guildFolders';
import { Avatar, Badge, GuildIcon, Tooltip } from '../common/Avatar';
import { IconCheck, IconCompass, IconLink, IconPlus, LogoMark } from '../common/icons';
import { Field, Modal } from '../modals/Modal';
import { DISCOVER_PATH } from '../discover/Discover';
import { buildGuildMenu } from '../menus/menus';
import { useVoiceStore } from '../../stores/voice';
import { ChannelType } from '@huddle/shared';

type Dragging = { kind: 'guild'; id: string } | { kind: 'folder'; id: string };

const OPEN_KEY = 'huddle.openFolders';
function loadOpen(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '{}'); } catch { return {}; }
}

const folderLabel = (f: GuildFolder, guilds: Record<string, { name: string }>) =>
  f.name || f.guild_ids.slice(0, 3).map((id) => guilds[id]?.name).filter(Boolean).join(', ') || 'Server Folder';

export function ServerRail({ activeGuildId, discover }: { activeGuildId: string | null; discover?: boolean }) {
  const order = useGuildStore((s) => s.guildOrder);
  const guilds = useGuildStore((s) => s.guilds);
  const folders = useUserSettingsStore((s) => s.guildFolders);
  const nav = useNavigate();
  const pending = usePendingIncomingCount();
  const dmUnread = usePrivateUnread();
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [over, setOver] = useState<{ key: string; where: DropWhere } | null>(null);
  const [open, setOpen] = useState(loadOpen);
  const [editing, setEditing] = useState<string | null>(null); // folder id in the settings modal

  const entries = useMemo(() => buildRail(order, folders, guilds), [order, folders, guilds]);

  const toggleFolder = (id: string, value?: boolean) => setOpen((o) => {
    const next = { ...o, [id]: value ?? !o[id] };
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  // ---- drag & drop ----
  const dropWhere = (e: DragEvent, allowInto: boolean): DropWhere => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (!allowInto) return y < 0.5 ? 'before' : 'after';
    return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'into';
  };
  const dropProps = (key: string, target: Omit<DropTarget, 'where'>, opts: { canInto: boolean }) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragging) return;
      if (dragging.kind === 'guild' && target.guildId === dragging.id) return;
      if (dragging.kind === 'folder' && target.folderId === dragging.id) return;
      e.preventDefault();
      e.stopPropagation();
      const where = dropWhere(e, opts.canInto && dragging.kind === 'guild');
      if (over?.key !== key || over.where !== where) setOver({ key, where });
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o?.key === key ? null : o));
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragging || !over) return;
      const t: DropTarget = { ...target, where: over.where };
      const next = dragging.kind === 'guild' ? moveGuild(entries, dragging.id, t) : moveFolder(entries, dragging.id, t);
      if (t.where === 'into' && t.folderId) toggleFolder(t.folderId, true);
      void saveRailLayout(next);
      setDragging(null); setOver(null);
    },
  });
  const dragProps = (d: Dragging) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => { e.stopPropagation(); setDragging(d); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', d.id); },
    onDragEnd: () => { setDragging(null); setOver(null); },
  });
  const dropClass = (key: string) => (over?.key === key ? ' drop-' + over.where : '');

  // ---- menus (also the touch / keyboard path for everything drag & drop does) ----
  const guildMenu = (guildId: string): MenuItem[] => {
    const inFolder = folderOfGuild(entries, guildId);
    const others = entries.filter((e): e is Extract<RailEntry, { kind: 'folder' }> => e.kind === 'folder' && e.folder.id !== inFolder?.id);
    const items: MenuItem[] = [{
      label: 'Add to Folder',
      submenu: [
        ...others.map((e) => ({
          label: folderLabel(e.folder, guilds), color: e.folder.color ?? undefined,
          onClick: () => { toggleFolder(e.folder.id, true); void saveRailLayout(moveGuild(entries, guildId, { folderId: e.folder.id, where: 'into' })); },
        })),
        ...(others.length ? [{ separator: true }] : []),
        { label: 'New Folder…', onClick: () => { const r = newFolderWith(entries, guildId); toggleFolder(r.folderId, true); void saveRailLayout(r.settings); setEditing(r.folderId); } },
      ],
    }];
    if (inFolder) items.push({ label: 'Remove from Folder', onClick: () => void saveRailLayout(removeFromFolder(entries, guildId)) });
    return [...items, { separator: true }, ...buildGuildMenu(guildId)];
  };
  const folderMenu = (f: GuildFolder): MenuItem[] => [
    { label: 'Mark Folder As Read', onClick: () => f.guild_ids.forEach(markGuildRead) },
    { separator: true },
    { label: open[f.id] ? 'Collapse Folder' : 'Expand Folder', onClick: () => toggleFolder(f.id) },
    { label: 'Folder Settings…', onClick: () => setEditing(f.id) },
    {
      label: 'Folder Color',
      submenu: [
        ...FOLDER_COLORS.map((c) => ({ label: c, color: c, checked: f.color === c, onClick: () => void saveRailLayout(updateFolder(entries, f.id, { color: c })) })),
        { separator: true },
        { label: 'Default', checked: !f.color, onClick: () => void saveRailLayout(updateFolder(entries, f.id, { color: null })) },
      ],
    },
    { separator: true },
    { label: 'Ungroup Folder', danger: true, onClick: () => void saveRailLayout(dissolveFolder(entries, f.id)) },
  ];
  const openMenu = (e: RMouseEvent, items: MenuItem[]) => useUIStore.getState().openContextMenu(e, items);

  const editingFolder = editing ? folders.find((f) => f.id === editing) : undefined;

  return (
    <div
      className="server-rail" role="tree" aria-label="Servers"
      onDragOver={(e) => { if (dragging) e.preventDefault(); }}
      onDrop={(e) => {
        // dropped on empty rail space: move to the end (and out of any folder)
        e.preventDefault();
        if (dragging?.kind === 'guild') void saveRailLayout(moveGuild(entries, dragging.id, { guildId: '', where: 'after' }));
        setDragging(null); setOver(null);
      }}
    >
      <RailItem active={activeGuildId === null && !discover} label="Direct Messages" badge={pending} onClick={() => nav('/channels/@me')}>
        <span className="rail-home"><LogoMark size={30} /></span>
      </RailItem>
      {dmUnread.slice(0, 5).map(({ channelId, mentions }) => <DMUnreadItem key={channelId} channelId={channelId} mentions={mentions} />)}
      <div className="rail-sep" />
      {entries.map((e) => {
        if (e.kind === 'guild') {
          const key = 'g:' + e.id;
          return (
            <div key={key} className={'rail-drag' + dropClass(key) + (dragging?.id === e.id ? ' dragging' : '')} {...dragProps({ kind: 'guild', id: e.id })} {...dropProps(key, { guildId: e.id }, { canInto: true })}>
              <GuildRailItem guildId={e.id} active={activeGuildId === e.id} onContextMenu={(ev) => openMenu(ev, guildMenu(e.id))} />
            </div>
          );
        }
        const f = e.folder;
        const key = 'f:' + f.id;
        const isOpen = !!open[f.id];
        return (
          <div key={key} className={'rail-folder' + (isOpen ? ' open' : '') + (dragging?.id === f.id ? ' dragging' : '')} style={f.color ? { '--folder-color': f.color } as CSSProperties : undefined}>
            <div className={'rail-drag' + dropClass(key)} {...dragProps({ kind: 'folder', id: f.id })} {...dropProps(key, { folderId: f.id }, { canInto: true })}>
              <FolderButton folder={f} label={folderLabel(f, guilds)} open={isOpen} activeGuildId={activeGuildId}
                onClick={() => toggleFolder(f.id)} onContextMenu={(ev) => openMenu(ev, folderMenu(f))} />
            </div>
            {isOpen && f.guild_ids.map((id) => {
              const k = 'g:' + id;
              return (
                <div key={k} className={'rail-drag' + dropClass(k) + (dragging?.id === id ? ' dragging' : '')} {...dragProps({ kind: 'guild', id })} {...dropProps(k, { guildId: id }, { canInto: false })}>
                  <GuildRailItem guildId={id} active={activeGuildId === id} onContextMenu={(ev) => openMenu(ev, guildMenu(id))} />
                </div>
              );
            })}
          </div>
        );
      })}
      <RailItem label="Add a Server" className="rail-action" onClick={() => openModal('createServer')}>
        <span className="rail-action-icon"><IconPlus size={22} /></span>
      </RailItem>
      <RailItem label="Join a Server" className="rail-action" onClick={() => openModal('joinServer')}>
        <span className="rail-action-icon"><IconLink size={22} /></span>
      </RailItem>
      <RailItem active={discover} label="Discover Servers" className="rail-action" onClick={() => nav(DISCOVER_PATH)}>
        <span className="rail-action-icon"><IconCompass size={22} /></span>
      </RailItem>
      {editingFolder && (
        <FolderSettingsModal
          folder={editingFolder}
          close={() => setEditing(null)}
          onSave={(patch) => saveRailLayout(updateFolder(entries, editingFolder.id, patch))}
        />
      )}
    </div>
  );
}

function RailItem({ active, unread, label, badge, onClick, onContextMenu, children, className, expanded }: {
  active?: boolean; unread?: boolean; label: string; badge?: number; onClick: () => void;
  onContextMenu?: (e: RMouseEvent) => void; children: ReactNode; className?: string; expanded?: boolean;
}) {
  return (
    <div className={'rail-item' + (active ? ' active' : '') + (unread ? ' unread' : '') + (className ? ' ' + className : '')}>
      <span className="rail-pill" />
      <Tooltip label={label} side="right">
        <button className="rail-button" aria-label={label} aria-expanded={expanded} onClick={onClick} onContextMenu={onContextMenu}>
          {children}
          {badge ? <Badge count={badge} className="rail-badge" /> : null}
        </button>
      </Tooltip>
    </div>
  );
}

/** Unread / mention totals across several guilds (a collapsed folder's badge). */
function useGuildsUnread(ids: string[]): { unread: boolean; mentions: number } {
  useGuildStore((s) => s.channels);
  useGuildStore((s) => s.members);
  useReadStateStore((s) => s.readStates);
  useReadStateStore((s) => s.guildSettings);
  let unread = false;
  let mentions = 0;
  for (const id of ids) {
    const r = computeGuildUnread(id);
    unread ||= r.unread;
    mentions += r.mentions;
  }
  return { unread, mentions };
}

const FolderGlyph = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4.1c.6 0 1.2.25 1.6.7L12.6 6H18.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
  </svg>
);

function FolderButton({ folder, label, open, activeGuildId, onClick, onContextMenu }: {
  folder: GuildFolder; label: string; open: boolean; activeGuildId: string | null; onClick: () => void; onContextMenu: (e: RMouseEvent) => void;
}) {
  const guilds = useGuildStore((s) => s.guilds);
  const { unread, mentions } = useGuildsUnread(folder.guild_ids);
  const holdsActive = !!activeGuildId && folder.guild_ids.includes(activeGuildId);
  return (
    <RailItem
      className="rail-folder-item"
      active={!open && holdsActive}
      unread={!open && unread}
      badge={open ? 0 : mentions}
      label={label}
      expanded={open}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {open ? (
        <span className="folder-open-icon"><FolderGlyph /></span>
      ) : (
        <span className="folder-grid">
          {folder.guild_ids.slice(0, 4).map((id) => guilds[id] && <GuildIcon key={id} guild={guilds[id]} size={18} />)}
        </span>
      )}
    </RailItem>
  );
}

function FolderSettingsModal({ folder, close, onSave }: {
  folder: GuildFolder; close: () => void; onSave: (patch: { name: string | null; color: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState(folder.name ?? '');
  const [color, setColor] = useState(folder.color ?? '');
  const save = async () => { await onSave({ name: name.trim() || null, color: color || null }); close(); };
  return (
    <Modal close={close} title="Folder Settings" footer={
      <>
        <button className="btn btn-ghost" onClick={close}>Cancel</button>
        <button className="btn btn-primary" onClick={() => void save()}>Done</button>
      </>
    }>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field label="Folder Name">
          <input autoFocus value={name} maxLength={LIMITS.FOLDER_NAME} placeholder="Unnamed folder" onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
      <div className="field-label">Folder Color</div>
      <div className="swatches">
        {FOLDER_COLORS.map((c) => (
          <button key={c} type="button" className={'swatch' + (color === c ? ' selected' : '')} style={{ background: c }} aria-label={c} onClick={() => setColor(c)}>
            {color === c && <IconCheck size={14} strokeWidth={3} />}
          </button>
        ))}
        <label className="swatch custom" style={{ background: color || 'var(--bg-input)' }} title="Custom colour">
          <input type="color" value={color || '#14b8a6'} onChange={(e) => setColor(e.target.value)} />+
        </label>
        {color && <button type="button" className="btn-link" onClick={() => setColor('')}>Default</button>}
      </div>
    </Modal>
  );
}

function GuildRailItem({ guildId, active, onContextMenu }: { guildId: string; active: boolean; onContextMenu: (e: RMouseEvent) => void }) {
  const guild = useGuildStore((s) => s.guilds[guildId]);
  const { unread, mentions } = useGuildUnread(guildId);
  const inVoice = useVoiceStore((s) => s.connection?.guildId === guildId);
  const nav = useNavigate();
  if (!guild) return null;
  return (
    <RailItem
      active={active}
      unread={unread}
      label={guild.name}
      badge={mentions}
      onClick={() => { const last = getLastChannel(guildId); nav(`/channels/${guildId}${last ? '/' + last : ''}`); }}
      onContextMenu={onContextMenu}
    >
      <GuildIcon guild={guild} size={48} />
      {inVoice && <span className="rail-voice-dot" title="Connected to voice" />}
    </RailItem>
  );
}

function DMUnreadItem({ channelId, mentions }: { channelId: string; mentions: number }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  const me = useAuthStore((s) => s.user!.id);
  const nav = useNavigate();
  if (!channel) return null;
  const other = channel.recipients?.find((r) => r.id !== me);
  const name = channelDisplayName(channel, me);
  return (
    <RailItem label={name} badge={mentions} unread onClick={() => nav(`/channels/@me/${channelId}`)}>
      {channel.type === ChannelType.GROUP_DM || !other
        ? <GuildIcon guild={{ id: channel.id, name, icon: channel.icon ?? null }} size={48} />
        : <Avatar user={other} size={48} />}
    </RailItem>
  );
}
