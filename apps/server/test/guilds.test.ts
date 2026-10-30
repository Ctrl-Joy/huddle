import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  AuditLogAction, ChannelType, DEFAULT_EVERYONE_PERMISSIONS, MessageType, Permissions,
} from '@huddle/shared';
import {
  GatewayClient, expectStatus, joinGuild, register, setupGuild, startServer, type TestServer, type TestUser,
} from './helpers';

let srv: TestServer;
let owner: TestUser, bob: TestUser, carol: TestUser, dave: TestUser;

before(async () => {
  srv = await startServer();
  owner = await register(srv, 'owner');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
  dave = await register(srv, 'dave');
});
after(async () => { await srv.close(); });

test('creating a guild seeds @everyone, categories, #general, voice, system channel', async () => {
  const { guild } = await setupGuild(owner, 'Seeded');
  assert.equal(guild.owner_id, owner.user.id);
  assert.equal(guild.roles.length, 1);
  const everyone = guild.roles[0];
  assert.equal(everyone.id, guild.id);
  assert.equal(everyone.position, 0);
  assert.equal(everyone.permissions, DEFAULT_EVERYONE_PERMISSIONS.toString());
  const byName = Object.fromEntries(guild.channels.map((c: any) => [c.name, c]));
  assert.equal(byName['Text Channels'].type, ChannelType.GUILD_CATEGORY);
  assert.equal(byName['Voice Channels'].type, ChannelType.GUILD_CATEGORY);
  assert.equal(byName.general.type, ChannelType.GUILD_TEXT);
  assert.equal(byName.general.parent_id, byName['Text Channels'].id);
  assert.equal(byName.General.type, ChannelType.GUILD_VOICE);
  assert.equal(byName.General.parent_id, byName['Voice Channels'].id);
  assert.equal(guild.system_channel_id, byName.general.id);
  assert.equal(guild.member_count, 1);
  assert.equal(guild.members[0].user.id, owner.user.id);
  assert.ok(Array.isArray(guild.presences) && Array.isArray(guild.voice_states));
});

test('invite join flow: uses, system message, GUILD_MEMBER_ADD + GUILD_CREATE over gateway', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Joinable');
  const ownerGw = await GatewayClient.connect(srv, owner.token);
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const inv = expectStatus(await owner.api.post(`/channels/${generalId}/invites`, { max_uses: 1, max_age: 3600 }), 200);
    assert.equal(inv.guild.id, guildId);
    assert.equal(inv.max_uses, 1);
    assert.ok(inv.expires_at);

    const preview = expectStatus(await bob.api.get(`/invites/${inv.code}`), 200);
    assert.equal(preview.approximate_member_count, 1);

    const joined = expectStatus(await bob.api.post(`/invites/${inv.code}`), 200);
    assert.equal(joined.id, guildId);
    assert.equal(joined.member_count, 2);

    const add = await ownerGw.waitFor('GUILD_MEMBER_ADD', (m) => m.guild_id === guildId);
    assert.equal(add.user.id, bob.user.id);
    assert.deepEqual(add.roles, []);
    const gc = await bobGw.waitFor('GUILD_CREATE', (g) => g.id === guildId);
    assert.ok(gc.channels.length >= 4 && gc.roles.length >= 1);
    const sys = await ownerGw.waitFor('MESSAGE_CREATE', (m) => m.channel_id === generalId);
    assert.equal(sys.type, MessageType.GUILD_MEMBER_JOIN);
    assert.equal(sys.author.id, bob.user.id);

    // max_uses = 1 → exhausted
    assert.equal((await carol.api.post(`/invites/${inv.code}`)).status, 404);
  } finally {
    await ownerGw.close();
    await bobGw.close();
  }
});

test('role hierarchy: MANAGE_ROLES cannot assign or edit roles at/above own top role', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Hierarchy');
  await joinGuild(owner, generalId, bob, carol);
  const high = expectStatus(await owner.api.post(`/guilds/${guildId}/roles`, { name: 'High', permissions: '0' }), 200);
  const mod = expectStatus(await owner.api.post(`/guilds/${guildId}/roles`, {
    name: 'Mod', permissions: (Permissions.MANAGE_ROLES | Permissions.KICK_MEMBERS).toString(), hoist: true, color: 0xff0000,
  }), 200);
  const low = expectStatus(await owner.api.post(`/guilds/${guildId}/roles`, { name: 'Low' }), 200);
  const roles = expectStatus(await owner.api.get(`/guilds/${guildId}/roles`), 200);
  const pos = Object.fromEntries(roles.map((r: any) => [r.name, r.position]));
  // new roles land at position 1 and push others up
  assert.ok(pos.High > pos.Mod && pos.Mod > pos.Low && pos.Low === 1);
  assert.equal(pos['@everyone'], 0);

  expectStatus(await owner.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { roles: [mod.id] }), 200);
  // bob (Mod) can give carol Low
  const m = expectStatus(await bob.api.patch(`/guilds/${guildId}/members/${carol.user.id}`, { roles: [low.id] }), 200);
  assert.deepEqual(m.roles, [low.id]);
  // but not High (above him) nor Mod (equal)
  assert.equal((await bob.api.patch(`/guilds/${guildId}/members/${carol.user.id}`, { roles: [low.id, high.id] })).status, 403);
  assert.equal((await bob.api.patch(`/guilds/${guildId}/members/${carol.user.id}`, { roles: [mod.id] })).status, 403);
  assert.equal((await bob.api.patch(`/guilds/${guildId}/roles/${high.id}`, { name: 'hacked' })).status, 403);
  assert.equal((await bob.api.patch(`/guilds/${guildId}/roles/${low.id}`, { name: 'Lowly' })).status, 200);
  // cannot grant perms he doesn't have
  assert.equal((await bob.api.patch(`/guilds/${guildId}/roles/${low.id}`, { permissions: Permissions.ADMINISTRATOR.toString() })).status, 403);
  // carol without MANAGE_ROLES cannot assign anything
  assert.equal((await carol.api.patch(`/guilds/${guildId}/members/${carol.user.id}`, { roles: [] })).status, 403);
  // bob cannot kick owner; can kick carol (only Low)
  assert.equal((await bob.api.del(`/guilds/${guildId}/members/${owner.user.id}`)).status, 403);
  assert.equal((await bob.api.del(`/guilds/${guildId}/members/${carol.user.id}`)).status, 204);
});

test('kick / ban / unban; banned user cannot rejoin; audit log records it', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Moderation');
  const code = await joinGuild(owner, generalId, bob, dave);
  const daveGw = await GatewayClient.connect(srv, dave.token);
  const ownerGw = await GatewayClient.connect(srv, owner.token);
  try {
    // kick dave
    assert.equal((await bob.api.del(`/guilds/${guildId}/members/${dave.user.id}`)).status, 403); // no perm
    expectStatus(await owner.api.del(`/guilds/${guildId}/members/${dave.user.id}`, { reason: 'bye' }), 204);
    await daveGw.waitFor('GUILD_DELETE', (d) => d.id === guildId);
    await ownerGw.waitFor('GUILD_MEMBER_REMOVE', (d) => d.user.id === dave.user.id);
    // dave can rejoin after a kick
    expectStatus(await dave.api.post(`/invites/${code}`), 200);

    // ban dave
    expectStatus(await owner.api.put(`/guilds/${guildId}/bans/${dave.user.id}`, { reason: 'spam' }), 204);
    await daveGw.waitFor('GUILD_DELETE', (d) => d.id === guildId);
    await ownerGw.waitFor('GUILD_BAN_ADD', (d) => d.user.id === dave.user.id);
    const bans = expectStatus(await owner.api.get(`/guilds/${guildId}/bans`), 200);
    assert.equal(bans.length, 1);
    assert.equal(bans[0].reason, 'spam');
    assert.equal(bans[0].user.id, dave.user.id);
    assert.equal((await dave.api.get(`/guilds/${guildId}`)).status, 404);
    const rejoin = await dave.api.post(`/invites/${code}`);
    assert.equal(rejoin.status, 403);
    assert.equal((await bob.api.get(`/guilds/${guildId}/bans`)).status, 403);
    assert.equal((await owner.api.put(`/guilds/${guildId}/bans/${owner.user.id}`, {})).status, 400);

    // unban → can rejoin
    expectStatus(await owner.api.del(`/guilds/${guildId}/bans/${dave.user.id}`), 204);
    expectStatus(await dave.api.post(`/invites/${code}`), 200);

    const log = expectStatus(await owner.api.get(`/guilds/${guildId}/audit-logs`), 200);
    const actions = log.audit_log_entries.map((e: any) => e.action_type);
    for (const a of [AuditLogAction.MEMBER_KICK, AuditLogAction.MEMBER_BAN_ADD, AuditLogAction.MEMBER_BAN_REMOVE, AuditLogAction.INVITE_CREATE]) {
      assert.ok(actions.includes(a), `audit log has ${a}`);
    }
    assert.ok(log.users.some((u: any) => u.id === dave.user.id));
    assert.equal((await bob.api.get(`/guilds/${guildId}/audit-logs`)).status, 403);
  } finally {
    await daveGw.close();
    await ownerGw.close();
  }
});

test('timeout, nicknames, guild update & channel CRUD', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Misc');
  await joinGuild(owner, generalId, bob);
  // self nick
  const me = expectStatus(await bob.api.patch(`/guilds/${guildId}/members/@me`, { nick: 'Bobby' }), 200);
  assert.equal(me.nick, 'Bobby');
  // others' nick needs MANAGE_NICKNAMES
  assert.equal((await bob.api.patch(`/guilds/${guildId}/members/${owner.user.id}`, { nick: 'x' })).status, 403);
  // timeout bob → he cannot send messages
  const until = new Date(Date.now() + 60_000).toISOString();
  const t = expectStatus(await owner.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { communication_disabled_until: until }), 200);
  assert.ok(t.communication_disabled_until);
  assert.equal((await bob.api.post(`/channels/${generalId}/messages`, { content: 'hi' })).status, 403);
  expectStatus(await owner.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { communication_disabled_until: null }), 200);
  expectStatus(await bob.api.post(`/channels/${generalId}/messages`, { content: 'hi' }), 200);

  // guild update
  assert.equal((await bob.api.patch(`/guilds/${guildId}`, { name: 'nope' })).status, 403);
  const g = expectStatus(await owner.api.patch(`/guilds/${guildId}`, { name: 'Renamed', description: 'desc' }), 200);
  assert.equal(g.name, 'Renamed');

  // channel CRUD
  const c = expectStatus(await owner.api.post(`/guilds/${guildId}/channels`, { name: 'Off Topic', type: 0, topic: 't' }), 200);
  assert.equal(c.name, 'off-topic');
  assert.equal((await bob.api.post(`/guilds/${guildId}/channels`, { name: 'x' })).status, 403);
  const u = expectStatus(await owner.api.patch(`/channels/${c.id}`, { topic: 'new', rate_limit_per_user: 5 }), 200);
  assert.equal(u.topic, 'new');
  assert.equal(u.rate_limit_per_user, 5);
  expectStatus(await owner.api.patch(`/guilds/${guildId}/channels`, [{ id: c.id, position: 7 }]), 204);
  expectStatus(await owner.api.del(`/channels/${c.id}`), 200);
  assert.equal((await owner.api.get(`/channels/${c.id}`)).status, 404);

  const log = expectStatus(await owner.api.get(`/guilds/${guildId}/audit-logs?limit=100`), 200);
  const actions = new Set(log.audit_log_entries.map((e: any) => e.action_type));
  for (const a of [AuditLogAction.GUILD_UPDATE, AuditLogAction.CHANNEL_CREATE, AuditLogAction.CHANNEL_UPDATE,
    AuditLogAction.CHANNEL_DELETE, AuditLogAction.MEMBER_UPDATE]) {
    assert.ok(actions.has(a), `audit has ${a}`);
  }
});

test('leave and delete guild', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Temp');
  await joinGuild(owner, generalId, bob);
  assert.equal((await owner.api.del(`/users/@me/guilds/${guildId}`)).status, 400); // owner can't leave
  expectStatus(await bob.api.del(`/users/@me/guilds/${guildId}`), 204);
  assert.equal((await bob.api.get(`/guilds/${guildId}`)).status, 404);
  assert.equal((await bob.api.del(`/guilds/${guildId}`)).status, 404);
  expectStatus(await owner.api.del(`/guilds/${guildId}`), 204);
  assert.equal((await owner.api.get(`/guilds/${guildId}`)).status, 404);
});

test('user guild settings', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Settings');
  const gw = await GatewayClient.connect(srv, owner.token);
  try {
    const s = expectStatus(await owner.api.patch(`/users/@me/guilds/${guildId}/settings`, {
      muted: true, message_notifications: 1, channel_overrides: [{ channel_id: generalId, muted: true }],
    }), 200);
    assert.equal(s.muted, true);
    assert.equal(s.message_notifications, 1);
    assert.deepEqual(s.channel_overrides, [{ channel_id: generalId, muted: true }]);
    const ev = await gw.waitFor('USER_GUILD_SETTINGS_UPDATE');
    assert.equal(ev.guild_id, guildId);
    const all = expectStatus(await owner.api.get('/users/@me/guild-settings'), 200);
    assert.ok(all.some((x: any) => x.guild_id === guildId && x.muted));
  } finally {
    await gw.close();
  }
});
