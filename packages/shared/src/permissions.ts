// Permission bitfield. Values are bigint so we can exceed 32 bits; serialised as decimal strings over the wire.

export const Permissions = {
  CREATE_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  CHANGE_NICKNAME: 1n << 26n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_EMOJIS: 1n << 30n,
  MODERATE_MEMBERS: 1n << 40n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_THREADS: 1n << 35n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  VIDEO: 1n << 41n,
} as const;

export type PermissionName = keyof typeof Permissions;

export const ALL_PERMISSIONS: bigint = Object.values(Permissions).reduce((a, b) => a | b, 0n);

/** Default permissions for a new server's @everyone role. */
export const DEFAULT_EVERYONE_PERMISSIONS: bigint =
  Permissions.CREATE_INVITE |
  Permissions.ADD_REACTIONS |
  Permissions.STREAM |
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.EMBED_LINKS |
  Permissions.ATTACH_FILES |
  Permissions.READ_MESSAGE_HISTORY |
  Permissions.MENTION_EVERYONE |
  Permissions.CONNECT |
  Permissions.SPEAK |
  Permissions.VIDEO |
  Permissions.CHANGE_NICKNAME |
  Permissions.CREATE_THREADS |
  Permissions.SEND_MESSAGES_IN_THREADS;

/** Added once to @everyone of servers created before threads existed (see the server's db migration). */
export const THREAD_DEFAULT_PERMISSIONS: bigint = Permissions.CREATE_THREADS | Permissions.SEND_MESSAGES_IN_THREADS;

/** Permissions that only make sense on text channels / voice channels (used by the overwrite editor). */
export const TEXT_PERMISSIONS: PermissionName[] = [
  'VIEW_CHANNEL', 'SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES', 'ADD_REACTIONS',
  'MENTION_EVERYONE', 'MANAGE_MESSAGES', 'READ_MESSAGE_HISTORY', 'CREATE_THREADS', 'SEND_MESSAGES_IN_THREADS', 'MANAGE_THREADS',
  'CREATE_INVITE', 'MANAGE_CHANNELS', 'MANAGE_ROLES',
];
export const VOICE_PERMISSIONS: PermissionName[] = [
  'VIEW_CHANNEL', 'CONNECT', 'SPEAK', 'VIDEO', 'STREAM', 'PRIORITY_SPEAKER',
  'MUTE_MEMBERS', 'DEAFEN_MEMBERS', 'MOVE_MEMBERS', 'CREATE_INVITE', 'MANAGE_CHANNELS', 'MANAGE_ROLES',
];

/** Human labels + descriptions for settings UIs, grouped. */
export const PERMISSION_INFO: { group: string; items: { key: PermissionName; label: string; description: string }[] }[] = [
  {
    group: 'General Server Permissions',
    items: [
      { key: 'VIEW_CHANNEL', label: 'View Channels', description: 'Allows members to view channels by default (excluding private channels).' },
      { key: 'MANAGE_CHANNELS', label: 'Manage Channels', description: 'Create, edit and delete channels.' },
      { key: 'MANAGE_ROLES', label: 'Manage Roles', description: 'Create roles and edit roles lower than their highest role.' },
      { key: 'MANAGE_EMOJIS', label: 'Manage Emoji', description: 'Upload, rename and remove custom emoji in this server.' },
      { key: 'VIEW_AUDIT_LOG', label: 'View Audit Log', description: 'View the record of who changed what in this server.' },
      { key: 'MANAGE_GUILD', label: 'Manage Server', description: "Change the server's name, icon and settings." },
    ],
  },
  {
    group: 'Membership Permissions',
    items: [
      { key: 'CREATE_INVITE', label: 'Create Invite', description: 'Invite new people to this server.' },
      { key: 'CHANGE_NICKNAME', label: 'Change Nickname', description: 'Change their own nickname.' },
      { key: 'MANAGE_NICKNAMES', label: 'Manage Nicknames', description: "Change other members' nicknames." },
      { key: 'KICK_MEMBERS', label: 'Kick Members', description: 'Remove members from the server.' },
      { key: 'BAN_MEMBERS', label: 'Ban Members', description: 'Permanently remove members and block them from rejoining.' },
      { key: 'MODERATE_MEMBERS', label: 'Timeout Members', description: 'Temporarily stop members from interacting.' },
    ],
  },
  {
    group: 'Text Channel Permissions',
    items: [
      { key: 'SEND_MESSAGES', label: 'Send Messages', description: 'Send messages in text channels.' },
      { key: 'EMBED_LINKS', label: 'Embed Links', description: 'Links show a preview.' },
      { key: 'ATTACH_FILES', label: 'Attach Files', description: 'Upload files and media.' },
      { key: 'ADD_REACTIONS', label: 'Add Reactions', description: 'Add new emoji reactions to messages.' },
      { key: 'MENTION_EVERYONE', label: 'Mention @everyone', description: 'Use @everyone to notify all members.' },
      { key: 'MANAGE_MESSAGES', label: 'Manage Messages', description: 'Delete and pin messages by other members, and post in announcement channels.' },
      { key: 'CREATE_THREADS', label: 'Create Threads', description: 'Start threads from messages and in text channels.' },
      { key: 'SEND_MESSAGES_IN_THREADS', label: 'Send Messages in Threads', description: 'Reply in threads and forum posts.' },
      { key: 'MANAGE_THREADS', label: 'Manage Threads', description: 'Rename, archive, unarchive and delete threads started by others.' },
      { key: 'READ_MESSAGE_HISTORY', label: 'Read Message History', description: 'Read messages sent before they joined.' },
    ],
  },
  {
    group: 'Voice Channel Permissions',
    items: [
      { key: 'CONNECT', label: 'Connect', description: 'Join voice channels.' },
      { key: 'SPEAK', label: 'Speak', description: 'Talk in voice channels.' },
      { key: 'VIDEO', label: 'Video', description: 'Share their camera.' },
      { key: 'STREAM', label: 'Screen Share', description: 'Share their screen.' },
      { key: 'PRIORITY_SPEAKER', label: 'Priority Speaker', description: 'Be heard more easily.' },
      { key: 'MUTE_MEMBERS', label: 'Mute Members', description: 'Server-mute other members.' },
      { key: 'DEAFEN_MEMBERS', label: 'Deafen Members', description: 'Server-deafen other members.' },
      { key: 'MOVE_MEMBERS', label: 'Move Members', description: 'Move or disconnect members between voice channels.' },
    ],
  },
  {
    group: 'Advanced',
    items: [
      { key: 'ADMINISTRATOR', label: 'Administrator', description: 'Every permission and bypasses channel overwrites. Dangerous.' },
    ],
  },
];

export const has = (perms: bigint, flag: bigint): boolean => (perms & flag) === flag;

export interface PermRole { id: string; permissions: string }
export interface PermOverwrite { id: string; type: 0 | 1; allow: string; deny: string } // 0 = role, 1 = member

export interface PermissionContext {
  guildId: string;
  ownerId: string;
  userId: string;
  /** All roles in the guild (must include @everyone whose id === guildId). */
  roles: PermRole[];
  /** Role ids assigned to the member (not including @everyone). */
  memberRoleIds: string[];
  /** ISO timestamp; if in the future the member is timed out. */
  communicationDisabledUntil?: string | null;
}

/** Guild-level permissions for a member. */
export function computeBasePermissions(ctx: PermissionContext): bigint {
  if (ctx.userId === ctx.ownerId) return ALL_PERMISSIONS;
  const everyone = ctx.roles.find((r) => r.id === ctx.guildId);
  let perms = everyone ? BigInt(everyone.permissions) : 0n;
  const memberRoles = new Set(ctx.memberRoleIds);
  for (const role of ctx.roles) if (memberRoles.has(role.id)) perms |= BigInt(role.permissions);
  if (has(perms, Permissions.ADMINISTRATOR)) return ALL_PERMISSIONS;
  return applyTimeout(perms, ctx);
}

/** Channel-level permissions for a member, applying overwrites. */
export function computePermissions(ctx: PermissionContext, overwrites: PermOverwrite[] = []): bigint {
  const base = computeBasePermissions(ctx);
  if (has(base, Permissions.ADMINISTRATOR)) return ALL_PERMISSIONS;
  let perms = base;

  const everyoneOw = overwrites.find((o) => o.type === 0 && o.id === ctx.guildId);
  if (everyoneOw) perms = (perms & ~BigInt(everyoneOw.deny)) | BigInt(everyoneOw.allow);

  const memberRoles = new Set(ctx.memberRoleIds);
  let allow = 0n, deny = 0n;
  for (const o of overwrites) {
    if (o.type === 0 && o.id !== ctx.guildId && memberRoles.has(o.id)) {
      allow |= BigInt(o.allow);
      deny |= BigInt(o.deny);
    }
  }
  perms = (perms & ~deny) | allow;

  const memberOw = overwrites.find((o) => o.type === 1 && o.id === ctx.userId);
  if (memberOw) perms = (perms & ~BigInt(memberOw.deny)) | BigInt(memberOw.allow);

  if (!has(perms, Permissions.VIEW_CHANNEL)) return 0n;
  return applyTimeout(perms, ctx);
}

// Channel type numbers (see ChannelType in models.ts; not imported to keep this module dependency-free).
const ANNOUNCEMENT = 5, THREAD = 11;

export const isThreadType = (type: number): boolean => type === THREAD;

/** Channel-type rules applied after overwrites (server and client): announcement channels only let MANAGE_MESSAGES holders post. */
export function applyChannelTypeRules(type: number, perms: bigint): bigint {
  if (type === ANNOUNCEMENT && !has(perms, Permissions.MANAGE_MESSAGES)) return perms & ~Permissions.SEND_MESSAGES;
  return perms;
}

/** A thread inherits its parent's permissions; posting in it is governed by SEND_MESSAGES_IN_THREADS. */
export function threadPermissions(parentPerms: bigint): bigint {
  const p = parentPerms & ~Permissions.SEND_MESSAGES;
  return has(parentPerms, Permissions.SEND_MESSAGES_IN_THREADS) ? p | Permissions.SEND_MESSAGES : p;
}

function applyTimeout(perms: bigint, ctx: PermissionContext): bigint {
  if (ctx.userId === ctx.ownerId) return perms;
  if (ctx.communicationDisabledUntil && Date.parse(ctx.communicationDisabledUntil) > Date.now()) {
    return perms & (Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY);
  }
  return perms;
}

/** Position of the member's highest role (@everyone = 0). Used for hierarchy checks. */
export function highestRolePosition(roles: { id: string; position: number }[], memberRoleIds: string[]): number {
  const set = new Set(memberRoleIds);
  return roles.reduce((max, r) => (set.has(r.id) && r.position > max ? r.position : max), 0);
}
