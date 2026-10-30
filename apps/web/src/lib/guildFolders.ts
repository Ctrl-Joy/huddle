// Server rail layout: a flat guild order + folders → rail entries, and the pure edits drag & drop and the
// context menus make to it. Everything returns a fresh UserSettings ready for saveRailLayout().
import type { GuildFolder, UserSettings } from '@huddle/shared';

export type RailEntry = { kind: 'guild'; id: string } | { kind: 'folder'; folder: GuildFolder };
export type DropWhere = 'before' | 'after' | 'into';
/** Where something was dropped: on a guild (top level or inside an open folder) or on a folder. */
export interface DropTarget { guildId?: string; folderId?: string; where: DropWhere }

export const FOLDER_COLORS = ['#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#64748b'];

/** Folder ids are client-made; the server only checks [A-Za-z0-9_-]{1,32}. */
export const newFolderId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function buildRail(order: string[], folders: GuildFolder[], known: Record<string, unknown>): RailEntry[] {
  const folderOf = new Map<string, GuildFolder>();
  for (const f of folders) for (const id of f.guild_ids) folderOf.set(id, f);
  const out: RailEntry[] = [];
  const emitted = new Set<string>();
  for (const id of order) {
    if (!known[id]) continue;
    const f = folderOf.get(id);
    if (!f) { out.push({ kind: 'guild', id }); continue; }
    if (emitted.has(f.id)) continue;
    emitted.add(f.id);
    const ids = f.guild_ids.filter((g) => known[g]);
    if (ids.length) out.push({ kind: 'folder', folder: { ...f, guild_ids: ids } });
  }
  return out;
}

export function toSettings(entries: RailEntry[]): UserSettings {
  const positions: string[] = [];
  const folders: GuildFolder[] = [];
  for (const e of entries) {
    if (e.kind === 'guild') positions.push(e.id);
    else if (e.folder.guild_ids.length) { positions.push(...e.folder.guild_ids); folders.push(e.folder); }
  }
  return { guild_folders: folders, guild_positions: positions };
}

export function folderOfGuild(entries: RailEntry[], guildId: string): GuildFolder | null {
  for (const e of entries) if (e.kind === 'folder' && e.folder.guild_ids.includes(guildId)) return e.folder;
  return null;
}

function withoutGuild(entries: RailEntry[], guildId: string): RailEntry[] {
  return entries.flatMap((e): RailEntry[] => {
    if (e.kind === 'guild') return e.id === guildId ? [] : [e];
    if (!e.folder.guild_ids.includes(guildId)) return [e];
    const ids = e.folder.guild_ids.filter((g) => g !== guildId);
    return ids.length ? [{ kind: 'folder', folder: { ...e.folder, guild_ids: ids } }] : [];
  });
}

const topIndex = (entries: RailEntry[], t: DropTarget) => entries.findIndex((e) =>
  (t.folderId && e.kind === 'folder' && e.folder.id === t.folderId) || (t.guildId && e.kind === 'guild' && e.id === t.guildId));

/** Moves a guild: reorder, drop into a folder, onto another guild (makes a folder) or out of a folder. */
export function moveGuild(entries: RailEntry[], guildId: string, t: DropTarget): UserSettings {
  if (t.guildId === guildId) return toSettings(entries);
  const next = withoutGuild(entries, guildId);
  const holder = t.guildId ? folderOfGuild(next, t.guildId) : t.folderId ? next.find((e): e is Extract<RailEntry, { kind: 'folder' }> => e.kind === 'folder' && e.folder.id === t.folderId)?.folder ?? null : null;
  if (t.where === 'into') {
    if (holder) return toSettings(replaceFolder(next, { ...holder, guild_ids: [...holder.guild_ids, guildId] }));
    const i = topIndex(next, t);
    if (i < 0 || !t.guildId) return toSettings([...next, { kind: 'guild', id: guildId }]);
    next[i] = { kind: 'folder', folder: { id: newFolderId(), name: null, color: null, guild_ids: [t.guildId, guildId] } };
    return toSettings(next);
  }
  if (holder && t.guildId) {
    // reorder within (or into) an open folder
    const ids = holder.guild_ids.slice();
    ids.splice(ids.indexOf(t.guildId) + (t.where === 'after' ? 1 : 0), 0, guildId);
    return toSettings(replaceFolder(next, { ...holder, guild_ids: ids }));
  }
  const i = topIndex(next, t);
  if (i < 0) return toSettings([...next, { kind: 'guild', id: guildId }]);
  next.splice(i + (t.where === 'after' ? 1 : 0), 0, { kind: 'guild', id: guildId });
  return toSettings(next);
}

/** Moves a whole folder before/after another top-level entry (a guild inside a folder counts as that folder). */
export function moveFolder(entries: RailEntry[], folderId: string, t: DropTarget): UserSettings {
  const self = entries.find((e) => e.kind === 'folder' && e.folder.id === folderId);
  if (!self) return toSettings(entries);
  const next = entries.filter((e) => e !== self);
  const holder = t.guildId ? folderOfGuild(next, t.guildId) : null;
  const target: DropTarget = holder ? { folderId: holder.id, where: t.where } : t;
  if (target.folderId === folderId) return toSettings(entries);
  const i = topIndex(next, target);
  if (i < 0) return toSettings([...next, self]);
  next.splice(i + (target.where === 'before' ? 0 : 1), 0, self);
  return toSettings(next);
}

function replaceFolder(entries: RailEntry[], f: GuildFolder): RailEntry[] {
  return entries.map((e) => (e.kind === 'folder' && e.folder.id === f.id ? { kind: 'folder', folder: f } : e));
}

export function updateFolder(entries: RailEntry[], folderId: string, patch: Partial<Pick<GuildFolder, 'name' | 'color'>>): UserSettings {
  return toSettings(entries.map((e) => (e.kind === 'folder' && e.folder.id === folderId ? { kind: 'folder', folder: { ...e.folder, ...patch } } : e)));
}

/** Ungroups a folder: its servers stay where the folder was. */
export function dissolveFolder(entries: RailEntry[], folderId: string): UserSettings {
  return toSettings(entries.flatMap((e): RailEntry[] =>
    e.kind === 'folder' && e.folder.id === folderId ? e.folder.guild_ids.map((id) => ({ kind: 'guild', id })) : [e]));
}

/** Wraps a top-level guild in a new folder of its own (the "New Folder" menu item). */
export function newFolderWith(entries: RailEntry[], guildId: string): { settings: UserSettings; folderId: string } {
  const folderId = newFolderId();
  const inFolder = folderOfGuild(entries, guildId);
  let next = entries;
  let at = entries.findIndex((e) => e.kind === 'guild' && e.id === guildId);
  if (inFolder) {
    // pull it out first; the new folder goes right after the old one
    next = withoutGuild(entries, guildId);
    at = next.findIndex((e) => e.kind === 'folder' && e.folder.id === inFolder.id) + 1;
    next = next.slice();
    next.splice(at, 0, { kind: 'guild', id: guildId });
  }
  next = next.slice();
  next[at] = { kind: 'folder', folder: { id: folderId, name: null, color: null, guild_ids: [guildId] } };
  return { settings: toSettings(next), folderId };
}

/** "Remove from Folder": the guild lands right after its old folder. */
export function removeFromFolder(entries: RailEntry[], guildId: string): UserSettings {
  const f = folderOfGuild(entries, guildId);
  if (!f) return toSettings(entries);
  if (f.guild_ids.length === 1) return dissolveFolder(entries, f.id);
  return moveGuild(entries, guildId, { folderId: f.id, where: 'after' });
}
