import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { GatewayCloseCode, GatewayOp, MessageType, Permissions } from '@huddle/shared';
import {
  GatewayClient, expectStatus, joinGuild, register, setupGuild, sleep, startServer, type TestServer, type TestUser,
} from './helpers';

let srv: TestServer;
let alice: TestUser, bob: TestUser, carol: TestUser, dave: TestUser;
let guildId: string, generalId: string, voiceId: string;

before(async () => {
  srv = await startServer();
  alice = await register(srv, 'alice');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
  dave = await register(srv, 'dave');
  ({ guildId, generalId, voiceId } = await setupGuild(alice, 'GW'));
  await joinGuild(alice, generalId, bob, carol);
  expectStatus(await alice.api.post('/users/@me/relationships', { username: 'dave' }), 200);
  expectStatus(await dave.api.put(`/users/@me/relationships/${alice.user.id}`), 200);
});
after(async () => { await srv.close(); });

test('HELLO → IDENTIFY → READY shape; heartbeat ACK; sequence numbers', async () => {
  const gw = await GatewayClient.open(srv);
  const hello = gw.frames.find((f) => f.op === GatewayOp.HELLO)!;
  assert.equal(hello.d.heartbeat_interval, 30000);
  gw.send(GatewayOp.IDENTIFY, { token: alice.token });
  const ready = await gw.waitFor('READY');
  const readyFrame = gw.dispatches.find((f) => f.t === 'READY')!;
  assert.equal(readyFrame.s, 1);
  assert.equal(typeof ready.session_id, 'string');
  assert.equal(ready.user.id, alice.user.id);
  assert.equal(ready.user.email, 'alice@huddle.test');
  for (const k of ['guilds', 'private_channels', 'relationships', 'presences', 'read_states', 'user_guild_settings', 'voice_states']) {
    assert.ok(Array.isArray((ready as any)[k]), `READY.${k} is an array`);
  }
  const g = ready.guilds.find((x) => x.id === guildId)!;
  assert.ok(g);
  for (const k of ['roles', 'channels', 'members', 'presences', 'voice_states']) assert.ok(Array.isArray((g as any)[k]));
  assert.equal(g.member_count, 3);
  assert.ok(g.presences.some((p) => p.user_id === alice.user.id && p.status === 'online'));
  assert.ok(ready.relationships.some((r) => r.id === dave.user.id && r.type === 1));
  assert.ok(ready.presences.some((p) => p.user_id === dave.user.id && p.status === 'offline'));
  assert.ok(ready.user_guild_settings.some((s) => s.guild_id === guildId));

  gw.send(GatewayOp.HEARTBEAT, 1);
  await gw.waitFrame((f) => f.op === GatewayOp.HEARTBEAT_ACK);

  // next dispatch increments s
  expectStatus(await alice.api.post(`/channels/${generalId}/typing`), 204);
  await gw.waitFor('TYPING_START');
  const last = gw.dispatches[gw.dispatches.length - 1];
  assert.ok(last.s! >= 2);
  await gw.close();
});

test('bad token → 4004; ops before identify → 4003; bad JSON → 4002', async () => {
  const a = await GatewayClient.open(srv);
  a.send(GatewayOp.IDENTIFY, { token: 'nope' });
  assert.equal(await a.waitClose(), GatewayCloseCode.AUTHENTICATION_FAILED);
  const b = await GatewayClient.open(srv);
  b.send(GatewayOp.PRESENCE_UPDATE, { status: 'dnd' });
  assert.equal(await b.waitClose(), GatewayCloseCode.NOT_AUTHENTICATED);
  const c = await GatewayClient.open(srv);
  c.ws.send('{not json');
  assert.equal(await c.waitClose(), GatewayCloseCode.DECODE_ERROR);
});

test('heartbeat timeout closes with 4009', async () => {
  const quick = await startServer({ heartbeatInterval: 200 });
  try {
    const u = await register(quick, 'sleepy');
    const gw = await GatewayClient.connect(quick, u.token);
    assert.equal(gw.frames.find((f) => f.op === GatewayOp.HELLO)!.d.heartbeat_interval, 200);
    assert.equal(await gw.waitClose(3000), GatewayCloseCode.SESSION_TIMED_OUT);
  } finally {
    await quick.close();
  }
});

test('presence: online on connect, multi-socket, offline only after last socket closes; invisible', async () => {
  const watcher = await GatewayClient.connect(srv, alice.token);
  try {
    const b1 = await GatewayClient.connect(srv, bob.token);
    const on = await watcher.waitFor('PRESENCE_UPDATE', (p) => p.user_id === bob.user.id);
    assert.equal(on.status, 'online');
    const b2 = await GatewayClient.connect(srv, bob.token);
    assert.ok(await watcher.expectNone('PRESENCE_UPDATE', (p) => p.user_id === bob.user.id, 200));
    await b1.close();
    assert.ok(await watcher.expectNone('PRESENCE_UPDATE', (p) => p.user_id === bob.user.id, 200));

    // status change via op 3 is persisted and broadcast
    b2.send(GatewayOp.PRESENCE_UPDATE, { status: 'dnd', custom_status: 'busy' });
    const dnd = await watcher.waitFor('PRESENCE_UPDATE', (p) => p.user_id === bob.user.id);
    assert.equal(dnd.status, 'dnd');
    assert.equal(dnd.custom_status, 'busy');
    const self = await b2.waitFor('USER_UPDATE', (u) => u.id === bob.user.id);
    assert.equal((self as any).status, 'dnd');

    await b2.close();
    const off = await watcher.waitFor('PRESENCE_UPDATE', (p) => p.user_id === bob.user.id);
    assert.equal(off.status, 'offline');
    assert.equal(expectStatus(await bob.api.get('/users/@me'), 200).status, 'dnd');

    // invisible: others see offline
    const b3 = await GatewayClient.connect(srv, bob.token);
    await watcher.waitFor('PRESENCE_UPDATE', (p) => p.user_id === bob.user.id && p.status === 'dnd');
    b3.send(GatewayOp.PRESENCE_UPDATE, { status: 'invisible' });
    const inv = await watcher.waitFor('PRESENCE_UPDATE', (p) => p.user_id === bob.user.id);
    assert.equal(inv.status, 'offline');
    b3.send(GatewayOp.PRESENCE_UPDATE, { status: 'online', custom_status: null });
    await watcher.waitFor('PRESENCE_UPDATE', (p) => p.user_id === bob.user.id && p.status === 'online');
    await b3.close();
    await watcher.waitFor('PRESENCE_UPDATE', (p) => p.user_id === bob.user.id && p.status === 'offline');
  } finally {
    await watcher.close();
  }
});

const voicePayload = (channel_id: string | null, guild_id: string | null = guildId) => ({
  guild_id, channel_id, self_mute: false, self_deaf: false, self_video: false, self_stream: false,
});

test('voice: join broadcast, signal relay between participants, rejected for outsiders', async () => {
  const a = await GatewayClient.connect(srv, alice.token);
  const b = await GatewayClient.connect(srv, bob.token);
  const c = await GatewayClient.connect(srv, carol.token);
  try {
    a.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(voiceId));
    const vsA = await c.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === alice.user.id && v.channel_id === voiceId);
    assert.equal(vsA.guild_id, guildId);
    assert.equal(vsA.mute, false);
    assert.equal(typeof vsA.session_id, 'string');
    b.send(GatewayOp.VOICE_STATE_UPDATE, { ...voicePayload(voiceId), self_mute: true });
    const vsB = await a.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === voiceId);
    assert.equal(vsB.self_mute, true);

    // voice states appear in guild GET (full) and READY
    const full = expectStatus(await carol.api.get(`/guilds/${guildId}?full=1`), 200);
    assert.equal(full.voice_states.length, 2);

    // relay alice → bob
    a.send(GatewayOp.VOICE_SIGNAL, { channel_id: voiceId, target_user_id: bob.user.id, kind: 'offer', data: { sdp: 'x', type: 'offer' } });
    const sig = await b.waitFor('VOICE_SIGNAL');
    assert.deepEqual(sig, {
      channel_id: voiceId, target_user_id: bob.user.id, kind: 'offer', data: { sdp: 'x', type: 'offer' }, from_user_id: alice.user.id,
    });
    b.send(GatewayOp.VOICE_SIGNAL, { channel_id: voiceId, target_user_id: alice.user.id, kind: 'answer', data: { sdp: 'y' } });
    assert.equal((await a.waitFor('VOICE_SIGNAL')).from_user_id, bob.user.id);

    // carol is not in the channel: her signal to bob is dropped, and nobody can signal her
    c.send(GatewayOp.VOICE_SIGNAL, { channel_id: voiceId, target_user_id: bob.user.id, kind: 'ice', data: {} });
    assert.ok(await b.expectNone('VOICE_SIGNAL', () => true, 300));
    a.send(GatewayOp.VOICE_SIGNAL, { channel_id: voiceId, target_user_id: carol.user.id, kind: 'ice', data: {} });
    assert.ok(await c.expectNone('VOICE_SIGNAL', () => true, 300));

    // server mute (MUTE_MEMBERS) → VOICE_STATE_UPDATE with mute
    assert.equal((await carol.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { mute: true })).status, 403);
    expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { mute: true }), 200);
    const muted = await c.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.mute);
    assert.equal(muted.channel_id, voiceId);

    // move bob, then disconnect him
    const other = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'Lounge', type: 2 }), 200);
    expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { channel_id: other.id }), 200);
    await c.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === other.id);
    // signal across channels is rejected now
    a.send(GatewayOp.VOICE_SIGNAL, { channel_id: voiceId, target_user_id: bob.user.id, kind: 'ice', data: {} });
    assert.ok(await b.expectNone('VOICE_SIGNAL', () => true, 300));
    expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { channel_id: null }), 200);
    await c.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === null);
    const log = expectStatus(await alice.api.get(`/guilds/${guildId}/audit-logs`), 200);
    const acts = log.audit_log_entries.map((e: any) => e.action_type);
    assert.ok(acts.includes(26) && acts.includes(27) && acts.includes(24));
    expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { mute: false }), 200);

    // CONNECT denied → join ignored
    expectStatus(await alice.api.put(`/channels/${other.id}/permissions/${guildId}`, {
      type: 0, allow: '0', deny: Permissions.CONNECT.toString(),
    }), 204);
    c.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(other.id));
    assert.ok(await a.expectNone('VOICE_STATE_UPDATE', (v) => v.user_id === carol.user.id, 300));

    // closing the socket leaves voice
    await a.close();
    const left = await c.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === alice.user.id);
    assert.equal(left.channel_id, null);
  } finally {
    await a.close();
    await b.close();
    await c.close();
  }
});

test('one voice channel per user: joining another leaves the old', async () => {
  const other = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'Second', type: 2 }), 200);
  const b = await GatewayClient.connect(srv, bob.token);
  const c = await GatewayClient.connect(srv, carol.token);
  try {
    b.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(voiceId));
    await c.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === voiceId);
    b.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(other.id));
    await c.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === null);
    await c.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === other.id);
    b.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(null));
    await c.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.channel_id === null);
  } finally {
    await b.close();
    await c.close();
  }
});

test('DM call: ring → CALL_CREATE, CALL system message, join + signal, CALL_DELETE when empty', async () => {
  const dm = expectStatus(await alice.api.post('/users/@me/channels', { recipient_ids: [dave.user.id] }), 200);
  const a = await GatewayClient.connect(srv, alice.token);
  const d = await GatewayClient.connect(srv, dave.token);
  try {
    a.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(dm.id, null));
    const ring = expectStatus(await alice.api.post(`/channels/${dm.id}/call/ring`, {}), 200);
    assert.deepEqual(ring.ringing, [dave.user.id]);
    const cc = await d.waitFor('CALL_CREATE', (x) => x.channel_id === dm.id);
    assert.deepEqual(cc.ringing, [dave.user.id]);
    assert.equal(cc.initiator_id, alice.user.id);
    const sys = await d.waitFor('MESSAGE_CREATE', (m) => m.channel_id === dm.id);
    assert.equal(sys.type, MessageType.CALL);
    await d.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === alice.user.id && v.channel_id === dm.id && v.guild_id === null);

    d.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(dm.id, null));
    await a.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === dave.user.id && v.channel_id === dm.id);
    d.send(GatewayOp.VOICE_SIGNAL, { channel_id: dm.id, target_user_id: alice.user.id, kind: 'offer', data: 1 });
    assert.equal((await a.waitFor('VOICE_SIGNAL')).from_user_id, dave.user.id);

    // READY on a fresh socket includes DM voice states
    const d2 = await GatewayClient.connect(srv, dave.token);
    const ready = d2.dispatches.find((f) => f.t === 'READY')!.d;
    assert.equal(ready.voice_states.filter((v: any) => v.channel_id === dm.id).length, 2);
    await d2.close();

    // outsider can't join or ring
    const c = await GatewayClient.connect(srv, carol.token);
    c.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(dm.id, null));
    assert.ok(await a.expectNone('VOICE_STATE_UPDATE', (v) => v.user_id === carol.user.id, 300));
    assert.equal((await carol.api.post(`/channels/${dm.id}/call/ring`, {})).status, 404);
    await c.close();

    a.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(null, null));
    await d.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === alice.user.id && v.channel_id === null);
    assert.ok(await d.expectNone('CALL_DELETE', () => true, 200));
    d.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(null, null));
    await a.waitFor('CALL_DELETE', (x) => x.channel_id === dm.id);
  } finally {
    await a.close();
    await d.close();
  }
});

test('USER_UPDATE reaches co-members as PublicUser and self as User', async () => {
  const a = await GatewayClient.connect(srv, alice.token);
  const b = await GatewayClient.connect(srv, bob.token);
  try {
    expectStatus(await bob.api.patch('/users/@me', { display_name: 'Bobby' }), 200);
    const pub = await a.waitFor('USER_UPDATE', (u) => u.id === bob.user.id);
    assert.equal(pub.display_name, 'Bobby');
    assert.equal((pub as any).email, undefined);
    const priv = await b.waitFor('USER_UPDATE', (u) => u.id === bob.user.id);
    assert.equal((priv as any).email, 'bob@huddle.test');
  } finally {
    await a.close();
    await b.close();
  }
  await sleep(10);
});
