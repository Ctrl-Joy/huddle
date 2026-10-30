import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLogAction, ChannelType, GatewayOp, Permissions } from '@huddle/shared';
import {
  GatewayClient, expectStatus, joinGuild, register, setupGuild, startServer, type TestServer, type TestUser,
} from './helpers';

// Multi-user scenarios that cross REST, the gateway, voice, and read state.

let srv: TestServer;
let owner: TestUser, bob: TestUser, carol: TestUser, dave: TestUser;

/** A 1x1 greyscale PNG (valid: IHDR, IDAT, IEND with correct CRCs). */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

before(async () => {
  srv = await startServer();
  owner = await register(srv, 'owner');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
  dave = await register(srv, 'dave');
});
after(async () => { await srv.close(); });

test('private channel: @everyone deny hides it from B (403, no MESSAGE_CREATE); role allow reveals it', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Private Visibility');
  await joinGuild(owner, generalId, bob);
  const ch = expectStatus(await owner.api.post(`/guilds/${guildId}/channels`, { name: 'secret', type: ChannelType.GUILD_TEXT }), 200);
  expectStatus(await owner.api.put(`/channels/${ch.id}/permissions/${guildId}`, {
    type: 0, allow: '0', deny: Permissions.VIEW_CHANNEL.toString(),
  }), 204);

  const bGw = await GatewayClient.connect(srv, bob.token);
  try {
    assert.equal((await bob.api.get(`/channels/${ch.id}/messages`)).status, 403);
    const hidden = expectStatus(await owner.api.post(`/channels/${ch.id}/messages`, { content: 'hidden one' }), 200);
    assert.ok(await bGw.expectNone('MESSAGE_CREATE', (m) => m.id === hidden.id, 300));

    const role = expectStatus(await owner.api.post(`/guilds/${guildId}/roles`, { name: 'Insiders' }), 200);
    expectStatus(await owner.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { roles: [role.id] }), 200);
    expectStatus(await owner.api.put(`/channels/${ch.id}/permissions/${role.id}`, {
      type: 0, allow: Permissions.VIEW_CHANNEL.toString(), deny: '0',
    }), 204);

    const msgs = expectStatus(await bob.api.get(`/channels/${ch.id}/messages`), 200);
    assert.ok(msgs.some((m: any) => m.id === hidden.id), 'B should now read the earlier message');
    const shown = expectStatus(await owner.api.post(`/channels/${ch.id}/messages`, { content: 'visible now' }), 200);
    const got = await bGw.waitFor('MESSAGE_CREATE', (m) => m.id === shown.id);
    assert.equal(got.channel_id, ch.id);
  } finally {
    await bGw.close();
  }
});

test('role lifecycle: create, update perms, reorder, delete; B receives GUILD_ROLE_* and loses the role', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Role Lifecycle');
  await joinGuild(owner, generalId, bob);
  const bGw = await GatewayClient.connect(srv, bob.token);
  try {
    const r = expectStatus(await owner.api.post(`/guilds/${guildId}/roles`, {
      name: 'Designers', color: 0x3498db, hoist: true, mentionable: true, permissions: '0',
    }), 200);
    assert.equal(r.color, 0x3498db);
    assert.equal(r.hoist, true);
    const created = await bGw.waitFor('GUILD_ROLE_CREATE', (x) => x.role.id === r.id);
    assert.equal(created.guild_id, guildId);
    assert.equal(created.role.name, 'Designers');

    const other = expectStatus(await owner.api.post(`/guilds/${guildId}/roles`, { name: 'Editors', permissions: '0' }), 200);

    const perms = Permissions.MANAGE_MESSAGES.toString();
    const upd = expectStatus(await owner.api.patch(`/guilds/${guildId}/roles/${r.id}`, { permissions: perms }), 200);
    assert.equal(upd.permissions, perms);
    const updEv = await bGw.waitFor('GUILD_ROLE_UPDATE', (x) => x.role.id === r.id && x.role.permissions === perms);
    assert.equal(updEv.role.hoist, true);

    // Reorder: push "Editors" to the bottom; "Designers" should move up.
    const reordered = expectStatus(await owner.api.patch(`/guilds/${guildId}/roles`, [{ id: other.id, position: 5 }]), 200);
    const byId = Object.fromEntries(reordered.map((x: any) => [x.id, x]));
    assert.ok(byId[r.id].position < byId[other.id].position, 'Designers should sit below Editors after reorder');
    await bGw.waitFor('GUILD_ROLE_UPDATE', (x) => x.role.id === other.id);

    // Assign to B, then delete the role.
    expectStatus(await owner.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { roles: [r.id] }), 200);
    expectStatus(await owner.api.del(`/guilds/${guildId}/roles/${r.id}`), 204);
    const del = await bGw.waitFor('GUILD_ROLE_DELETE', (x) => x.role_id === r.id);
    assert.equal(del.guild_id, guildId);
    const bobMember = expectStatus(await bob.api.get(`/guilds/${guildId}/members/${bob.user.id}`), 200);
    assert.ok(!bobMember.roles.includes(r.id), 'deleted role must be removed from member roles');
  } finally {
    await bGw.close();
  }
});

test('timeout: B gets 403 sending while timed out; clearing with null lets B send again', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Timeouts');
  await joinGuild(owner, generalId, bob);
  const until = new Date(Date.now() + 3600_000).toISOString();
  const m = expectStatus(await owner.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, {
    communication_disabled_until: until,
  }), 200);
  assert.equal(m.communication_disabled_until, until);

  assert.equal((await bob.api.post(`/channels/${generalId}/messages`, { content: 'blocked' })).status, 403);

  const cleared = expectStatus(await owner.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, {
    communication_disabled_until: null,
  }), 200);
  assert.equal(cleared.communication_disabled_until, null);
  expectStatus(await bob.api.post(`/channels/${generalId}/messages`, { content: 'free again' }), 200);
});

test('audit log: kick, ban, role create and channel update are recorded; B without VIEW_AUDIT_LOG gets 403', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Audit');
  await joinGuild(owner, generalId, bob, carol, dave);

  expectStatus(await owner.api.del(`/guilds/${guildId}/members/${carol.user.id}`), 204);
  expectStatus(await owner.api.put(`/guilds/${guildId}/bans/${dave.user.id}`, { reason: 'spam' }), 204);
  expectStatus(await owner.api.post(`/guilds/${guildId}/roles`, { name: 'Audited' }), 200);
  expectStatus(await owner.api.patch(`/channels/${generalId}`, { topic: 'audited' }), 200);

  const res = expectStatus(await owner.api.get(`/guilds/${guildId}/audit-logs?limit=100`), 200);
  const entries: any[] = res.audit_log_entries;
  const kick = entries.find((e) => e.action_type === AuditLogAction.MEMBER_KICK);
  const ban = entries.find((e) => e.action_type === AuditLogAction.MEMBER_BAN_ADD);
  const role = entries.find((e) => e.action_type === AuditLogAction.ROLE_CREATE);
  const chan = entries.find((e) => e.action_type === AuditLogAction.CHANNEL_UPDATE);
  assert.ok(kick, 'MEMBER_KICK entry missing');
  assert.ok(ban, 'MEMBER_BAN_ADD entry missing');
  assert.ok(role, 'ROLE_CREATE entry missing');
  assert.ok(chan, 'CHANNEL_UPDATE entry missing');
  assert.equal(kick.user_id, owner.user.id);
  assert.equal(kick.target_id, carol.user.id);
  assert.equal(ban.target_id, dave.user.id);

  const userIds = new Set(res.users.map((u: any) => u.id));
  for (const u of [owner, carol, dave]) assert.ok(userIds.has(u.user.id), `users should include ${u.user.username}`);

  assert.equal((await bob.api.get(`/guilds/${guildId}/audit-logs`)).status, 403);
});

test('search: B finds only the public hit for a word in both channels; author_id filter works', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Search');
  await joinGuild(owner, generalId, bob);
  const pub = expectStatus(await owner.api.post(`/guilds/${guildId}/channels`, { name: 'open', type: ChannelType.GUILD_TEXT }), 200);
  const priv = expectStatus(await owner.api.post(`/guilds/${guildId}/channels`, { name: 'vault', type: ChannelType.GUILD_TEXT }), 200);
  expectStatus(await owner.api.put(`/channels/${priv.id}/permissions/${guildId}`, {
    type: 0, allow: '0', deny: Permissions.VIEW_CHANNEL.toString(),
  }), 204);

  const ownerPub = expectStatus(await owner.api.post(`/channels/${pub.id}/messages`, { content: 'the quokka is public' }), 200);
  const ownerPriv = expectStatus(await owner.api.post(`/channels/${priv.id}/messages`, { content: 'the quokka is secret' }), 200);
  const bobPub = expectStatus(await bob.api.post(`/channels/${pub.id}/messages`, { content: 'quokka spotted too' }), 200);

  const bobView = expectStatus(await bob.api.get(`/guilds/${guildId}/messages/search?content=quokka`), 200);
  assert.equal(bobView.total_results, 2);
  assert.deepEqual(bobView.messages.map((m: any) => m.id).sort(), [ownerPub.id, bobPub.id].sort());
  assert.ok(bobView.messages.every((m: any) => m.channel_id === pub.id));
  assert.ok(!bobView.messages.some((m: any) => m.id === ownerPriv.id));

  const byBob = expectStatus(await bob.api.get(`/guilds/${guildId}/messages/search?content=quokka&author_id=${bob.user.id}`), 200);
  assert.equal(byBob.total_results, 1);
  assert.equal(byBob.messages[0].id, bobPub.id);

  const ownerView = expectStatus(await owner.api.get(`/guilds/${guildId}/messages/search?content=quokka`), 200);
  assert.equal(ownerView.total_results, 3);
});

test('invites: max_uses 1 is exhausted after one join; a deleted invite returns 404', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Invite Limits');
  const inv = expectStatus(await owner.api.post(`/channels/${generalId}/invites`, { max_uses: 1 }), 200);
  expectStatus(await bob.api.post(`/invites/${inv.code}`), 200);
  const second = await carol.api.post(`/invites/${inv.code}`);
  assert.equal(second.status, 404, 'second join on an exhausted invite should fail');

  const inv2 = expectStatus(await owner.api.post(`/channels/${generalId}/invites`, { max_uses: 0 }), 200);
  expectStatus(await carol.api.get(`/invites/${inv2.code}`), 200);
  expectStatus(await owner.api.del(`/invites/${inv2.code}`), 200);
  assert.equal((await carol.api.get(`/invites/${inv2.code}`)).status, 404);
  assert.equal((await carol.api.post(`/invites/${inv2.code}`)).status, 404);
});

test('avatar: uploaded PNG is served with 200; a non-image file is rejected with 400', async () => {
  const png = Buffer.from(TINY_PNG_B64, 'base64');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'avatar.png');
  const me = expectStatus(await bob.api.post('/users/@me/avatar', form), 200);
  assert.match(me.avatar, /^\/uploads\/avatars\//);

  const served = await fetch(srv.base + me.avatar);
  assert.equal(served.status, 200);
  assert.equal(Buffer.from(await served.arrayBuffer()).equals(png), true);

  const bad = new FormData();
  bad.append('file', new Blob([Buffer.from('definitely not an image')], { type: 'text/plain' }), 'notes.txt');
  assert.equal((await bob.api.post('/users/@me/avatar', bad)).status, 400);
});

test('voice: server mute and disconnect reach peers; closing the last socket while in voice clears B', async () => {
  const { guildId, generalId, voiceId } = await setupGuild(owner, 'Voice');
  await joinGuild(owner, generalId, bob);
  const aGw = await GatewayClient.connect(srv, owner.token);
  const bGw = await GatewayClient.connect(srv, bob.token);
  try {
    aGw.send(GatewayOp.VOICE_STATE_UPDATE, { channel_id: voiceId });
    await aGw.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === owner.user.id && v.channel_id === voiceId);
    bGw.send(GatewayOp.VOICE_STATE_UPDATE, { channel_id: voiceId });
    await aGw.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === voiceId);

    expectStatus(await owner.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { mute: true }), 200);
    const muted = await aGw.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.mute === true);
    assert.equal(muted.channel_id, voiceId);
    await bGw.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.mute === true);

    expectStatus(await owner.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { channel_id: null }), 200);
    await aGw.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === null);
    const full = expectStatus(await owner.api.get(`/guilds/${guildId}?full=true`), 200);
    assert.ok(!full.voice_states.some((v: any) => v.user_id === bob.user.id && v.channel_id), 'B should not be in voice');

    // B rejoins, then drops the connection while still in voice.
    bGw.send(GatewayOp.VOICE_STATE_UPDATE, { channel_id: voiceId });
    await aGw.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === voiceId);
    await bGw.close();
    const left = await aGw.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === null);
    assert.equal(left.guild_id, guildId);
  } finally {
    await aGw.close();
    await bGw.close();
  }
});

test('read state: two @mentions give mention_count 2 in READY; ack resets it and syncs B\'s other socket', async () => {
  const { generalId } = await setupGuild(owner, 'Read State');
  await joinGuild(owner, generalId, bob);
  const m1 = expectStatus(await owner.api.post(`/channels/${generalId}/messages`, { content: `<@${bob.user.id}> first` }), 200);
  const m2 = expectStatus(await owner.api.post(`/channels/${generalId}/messages`, { content: `hey <@${bob.user.id}> second` }), 200);
  assert.ok(m1.id && m2.id);

  const bobOther = await GatewayClient.connect(srv, bob.token);
  const fresh = await GatewayClient.connect(srv, bob.token);
  try {
    const ready = fresh.dispatches.find((f) => f.t === 'READY')!.d;
    const rs = ready.read_states.find((r: any) => r.channel_id === generalId);
    assert.equal(rs.mention_count, 2);

    expectStatus(await bob.api.post(`/channels/${generalId}/messages/${m2.id}/ack`, {}), 200);
    const ack = await bobOther.waitFor('MESSAGE_ACK', (a) => a.channel_id === generalId);
    assert.equal(ack.mention_count, 0);
    assert.equal(ack.last_read_message_id, m2.id);

    const again = await GatewayClient.connect(srv, bob.token);
    const readyAgain = again.dispatches.find((f) => f.t === 'READY')!.d;
    assert.equal(readyAgain.read_states.find((r: any) => r.channel_id === generalId).mention_count, 0);
    await again.close();
  } finally {
    await bobOther.close();
    await fresh.close();
  }
});

test('leave & delete: B leaving notifies B and owner; non-owner delete is 403; owner delete notifies the rest', async () => {
  const { guildId, generalId } = await setupGuild(owner, 'Leaving');
  await joinGuild(owner, generalId, bob, carol);
  const oGw = await GatewayClient.connect(srv, owner.token);
  const bGw = await GatewayClient.connect(srv, bob.token);
  const cGw = await GatewayClient.connect(srv, carol.token);
  try {
    expectStatus(await bob.api.del(`/users/@me/guilds/${guildId}`), 204);
    const gd = await bGw.waitFor('GUILD_DELETE', (g) => g.id === guildId);
    assert.equal(gd.id, guildId);
    const rm = await oGw.waitFor('GUILD_MEMBER_REMOVE', (m) => m.guild_id === guildId && m.user.id === bob.user.id);
    assert.equal(rm.user.id, bob.user.id);

    assert.equal((await carol.api.del(`/guilds/${guildId}`)).status, 403);

    expectStatus(await owner.api.del(`/guilds/${guildId}`), 204);
    await cGw.waitFor('GUILD_DELETE', (g) => g.id === guildId);
    assert.equal((await carol.api.get(`/guilds/${guildId}`)).status, 404);
  } finally {
    await oGw.close();
    await bGw.close();
    await cGw.close();
  }
});
