import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, MessageType, RelationshipType } from '@huddle/shared';
import { GatewayClient, expectStatus, register, startServer, type TestServer, type TestUser } from './helpers';

let srv: TestServer;
let alice: TestUser, bob: TestUser, carol: TestUser, mallory: TestUser;

before(async () => {
  srv = await startServer();
  alice = await register(srv, 'alice');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
  mallory = await register(srv, 'mallory');
});
after(async () => { await srv.close(); });

test('friend request by username (case-insensitive) → accept, events on both sides', async () => {
  const aGw = await GatewayClient.connect(srv, alice.token);
  const bGw = await GatewayClient.connect(srv, bob.token);
  try {
    const out = expectStatus(await alice.api.post('/users/@me/relationships', { username: 'BOB' }), 200);
    assert.equal(out.type, RelationshipType.PENDING_OUTGOING);
    const inc = await bGw.waitFor('RELATIONSHIP_ADD', (r) => r.id === alice.user.id);
    assert.equal(inc.type, RelationshipType.PENDING_INCOMING);
    assert.equal(inc.user.username, 'alice');
    await aGw.waitFor('RELATIONSHIP_ADD', (r) => r.id === bob.user.id && r.type === RelationshipType.PENDING_OUTGOING);

    expectStatus(await bob.api.put(`/users/@me/relationships/${alice.user.id}`, {}), 200);
    await aGw.waitFor('RELATIONSHIP_ADD', (r) => r.id === bob.user.id && r.type === RelationshipType.FRIEND);
    await bGw.waitFor('RELATIONSHIP_ADD', (r) => r.id === alice.user.id && r.type === RelationshipType.FRIEND);
    const p = await aGw.waitFor('PRESENCE_UPDATE', (x) => x.user_id === bob.user.id);
    assert.equal(p.status, 'online');

    const rels = expectStatus(await alice.api.get('/users/@me/relationships'), 200);
    assert.deepEqual(rels.map((r: any) => [r.id, r.type]), [[bob.user.id, RelationshipType.FRIEND]]);
    assert.equal((await alice.api.post('/users/@me/relationships', { username: 'nobody-here' })).status, 404);
    assert.equal((await alice.api.post('/users/@me/relationships', { username: 'bob' })).status, 400);
  } finally {
    await aGw.close();
    await bGw.close();
  }
});

test('mutual requests auto-accept; decline/cancel removes both sides', async () => {
  expectStatus(await carol.api.post('/users/@me/relationships', { username: 'alice' }), 200);
  const r = expectStatus(await alice.api.post('/users/@me/relationships', { username: 'carol' }), 200);
  assert.equal(r.type, RelationshipType.FRIEND);
  expectStatus(await alice.api.del(`/users/@me/relationships/${carol.user.id}`), 204);
  assert.equal(expectStatus(await carol.api.get('/users/@me/relationships'), 200).length, 0);
  // cancel outgoing
  expectStatus(await carol.api.post('/users/@me/relationships', { username: 'bob' }), 200);
  expectStatus(await carol.api.del(`/users/@me/relationships/${bob.user.id}`), 204);
  assert.ok(!expectStatus(await bob.api.get('/users/@me/relationships'), 200).some((x: any) => x.id === carol.user.id));
});

test('DM: create reuses existing, CHANNEL_CREATE to recipient on first message, mention badge', async () => {
  const bGw = await GatewayClient.connect(srv, bob.token);
  try {
    const dm = expectStatus(await alice.api.post('/users/@me/channels', { recipient_ids: [bob.user.id] }), 200);
    assert.equal(dm.type, ChannelType.DM);
    assert.equal(dm.guild_id, null);
    assert.deepEqual(dm.recipients.map((u: any) => u.id), [bob.user.id]);
    const again = expectStatus(await alice.api.post('/users/@me/channels', { recipient_ids: [bob.user.id] }), 200);
    assert.equal(again.id, dm.id);
    // bob doesn't see the DM until the first message arrives
    assert.ok(await bGw.expectNone('CHANNEL_CREATE', (c) => c.id === dm.id, 200));
    const m = expectStatus(await alice.api.post(`/channels/${dm.id}/messages`, { content: 'hi bob' }), 200);
    assert.equal(m.guild_id, null);
    assert.equal(m.member, null);
    const created = await bGw.waitFor('CHANNEL_CREATE', (c) => c.id === dm.id);
    assert.deepEqual(created.recipients!.map((u: any) => u.id), [alice.user.id]);
    const got = await bGw.waitFor('MESSAGE_CREATE', (x) => x.id === m.id);
    assert.equal(got.content, 'hi bob');
    const fromBob = expectStatus(await bob.api.post('/users/@me/channels', { recipient_ids: [alice.user.id] }), 200);
    assert.equal(fromBob.id, dm.id);
    assert.deepEqual(fromBob.recipients.map((u: any) => u.id), [alice.user.id]);

    const gw2 = await GatewayClient.connect(srv, bob.token);
    const ready = gw2.dispatches.find((f) => f.t === 'READY')!.d;
    await gw2.close();
    const pc = ready.private_channels.find((c: any) => c.id === dm.id);
    assert.ok(pc);
    assert.deepEqual(pc.recipients.map((u: any) => u.id), [alice.user.id]);
    assert.equal(ready.read_states.find((r: any) => r.channel_id === dm.id).mention_count, 1);
    assert.ok(ready.presences.some((p: any) => p.user_id === alice.user.id));

    // strangers can't read it
    assert.equal((await carol.api.get(`/channels/${dm.id}/messages`)).status, 404);
  } finally {
    await bGw.close();
  }
});

test('group DM up to 10 and dispatches CHANNEL_CREATE to all', async () => {
  const cGw = await GatewayClient.connect(srv, carol.token);
  try {
    const g = expectStatus(await alice.api.post('/users/@me/channels', { recipient_ids: [bob.user.id, carol.user.id] }), 200);
    assert.equal(g.type, ChannelType.GROUP_DM);
    assert.equal(g.owner_id, alice.user.id);
    assert.equal(g.recipients.length, 2);
    const ev = await cGw.waitFor('CHANNEL_CREATE', (c) => c.id === g.id);
    assert.deepEqual(ev.recipients!.map((u: any) => u.id).sort(), [alice.user.id, bob.user.id].sort());
    const tooMany = Array.from({ length: 10 }, (_, i) => String(1000 + i));
    assert.equal((await alice.api.post('/users/@me/channels', { recipient_ids: tooMany })).status, 400);
    const renamed = expectStatus(await carol.api.patch(`/channels/${g.id}`, { name: 'Trio' }), 200);
    assert.equal(renamed.name, 'Trio');
    const sys = await cGw.waitFor('MESSAGE_CREATE', (m) => m.channel_id === g.id);
    assert.equal(sys.type, MessageType.CHANNEL_NAME_CHANGE);
  } finally {
    await cGw.close();
  }
});

test('blocking removes friendship and prevents DMs', async () => {
  const bGw = await GatewayClient.connect(srv, bob.token);
  try {
    const blocked = expectStatus(await alice.api.put(`/users/@me/relationships/${bob.user.id}`, { type: 2 }), 200);
    assert.equal(blocked.type, RelationshipType.BLOCKED);
    const rm = await bGw.waitFor('RELATIONSHIP_REMOVE', (r) => r.id === alice.user.id);
    assert.equal(rm.type, RelationshipType.FRIEND);
    assert.equal(expectStatus(await bob.api.get('/users/@me/relationships'), 200).length, 0);
    const dm = await bob.api.post('/users/@me/channels', { recipient_ids: [alice.user.id] });
    assert.equal(dm.status, 403);
    // existing DM channel: sends are refused
    const existing = expectStatus(await alice.api.get('/users/@me/channels'), 200).find((c: any) => c.type === ChannelType.DM);
    assert.equal((await bob.api.post(`/channels/${existing.id}/messages`, { content: 'hey?' })).status, 403);
    assert.equal((await bob.api.post('/users/@me/relationships', { username: 'alice' })).status, 400);
    // unblock
    expectStatus(await alice.api.del(`/users/@me/relationships/${bob.user.id}`), 204);
    expectStatus(await bob.api.post(`/channels/${existing.id}/messages`, { content: 'hey again' }), 200);
  } finally {
    await bGw.close();
  }
});

test('blocked by target: friend request refused; mallory cannot DM', async () => {
  expectStatus(await carol.api.put(`/users/@me/relationships/${mallory.user.id}`, { type: 2 }), 200);
  assert.equal((await mallory.api.post('/users/@me/relationships', { username: 'carol' })).status, 400);
  assert.equal((await mallory.api.post('/users/@me/channels', { recipient_ids: [carol.user.id] })).status, 403);
});
