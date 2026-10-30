import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MessageType, Permissions } from '@huddle/shared';
import {
  GatewayClient, expectStatus, fakePng, joinGuild, register, setupGuild, startServer, type TestServer, type TestUser,
} from './helpers';

let srv: TestServer;
let alice: TestUser, bob: TestUser, carol: TestUser;
let guildId: string, generalId: string;

before(async () => {
  srv = await startServer();
  alice = await register(srv, 'alice');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
  ({ guildId, generalId } = await setupGuild(alice, 'Msgs'));
  await joinGuild(alice, generalId, bob, carol);
});
after(async () => { await srv.close(); });

test('create, nonce echo, edit own only, delete own or MANAGE_MESSAGES', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const m = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { content: 'hello world', nonce: 'n1' }), 200);
    assert.equal(m.content, 'hello world');
    assert.equal(m.nonce, 'n1');
    assert.equal(m.author.id, alice.user.id);
    assert.equal(m.guild_id, guildId);
    assert.equal(m.type, MessageType.DEFAULT);
    assert.deepEqual(m.member, { nick: null, roles: [] });
    const ev = await bobGw.waitFor('MESSAGE_CREATE', (x) => x.id === m.id);
    assert.equal(ev.content, 'hello world');

    const ch = expectStatus(await alice.api.get(`/channels/${generalId}`), 200);
    assert.equal(ch.last_message_id, m.id);

    assert.equal((await alice.api.post(`/channels/${generalId}/messages`, { content: '   ' })).status, 400);
    assert.equal((await alice.api.post(`/channels/${generalId}/messages`, { content: 'x'.repeat(4001) })).status, 400);

    assert.equal((await bob.api.patch(`/channels/${generalId}/messages/${m.id}`, { content: 'hax' })).status, 403);
    const ed = expectStatus(await alice.api.patch(`/channels/${generalId}/messages/${m.id}`, { content: 'edited' }), 200);
    assert.equal(ed.content, 'edited');
    assert.ok(ed.edited_at);
    const up = await bobGw.waitFor('MESSAGE_UPDATE', (x) => x.id === m.id);
    assert.equal(up.content, 'edited');

    // bob can't delete alice's; alice (owner) can delete bob's
    assert.equal((await bob.api.del(`/channels/${generalId}/messages/${m.id}`)).status, 403);
    const bm = expectStatus(await bob.api.post(`/channels/${generalId}/messages`, { content: 'from bob' }), 200);
    expectStatus(await alice.api.del(`/channels/${generalId}/messages/${bm.id}`), 204);
    await bobGw.waitFor('MESSAGE_DELETE', (x) => x.id === bm.id);
    expectStatus(await alice.api.del(`/channels/${generalId}/messages/${m.id}`), 204);
    assert.equal((await alice.api.get(`/channels/${generalId}/messages/${m.id}`)).status, 404);
    const log = expectStatus(await alice.api.get(`/guilds/${guildId}/audit-logs`), 200);
    assert.ok(log.audit_log_entries.some((e: any) => e.action_type === 72 && e.target_id === bob.user.id));
  } finally {
    await bobGw.close();
  }
});

test('reply sets message_reference + referenced_message', async () => {
  const orig = expectStatus(await bob.api.post(`/channels/${generalId}/messages`, { content: 'question?' }), 200);
  const rep = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { content: 'answer', reply_to_id: orig.id }), 200);
  assert.equal(rep.type, MessageType.REPLY);
  assert.deepEqual(rep.message_reference, { message_id: orig.id, channel_id: generalId });
  assert.equal(rep.referenced_message.id, orig.id);
  assert.equal(rep.referenced_message.referenced_message, null);
  assert.ok(rep.mentions.includes(bob.user.id));
  assert.equal((await alice.api.post(`/channels/${generalId}/messages`, { content: 'x', reply_to_id: '123' })).status, 400);
});

test('pagination before / after / around / limit (newest first)', async () => {
  const c = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'paging' }), 200);
  const ids: string[] = [];
  for (let i = 0; i < 12; i++) {
    ids.push(expectStatus(await alice.api.post(`/channels/${c.id}/messages`, { content: `m${i}` }), 200).id);
  }
  const latest = expectStatus(await alice.api.get(`/channels/${c.id}/messages?limit=5`), 200);
  assert.deepEqual(latest.map((m: any) => m.content), ['m11', 'm10', 'm9', 'm8', 'm7']);
  const older = expectStatus(await alice.api.get(`/channels/${c.id}/messages?limit=5&before=${ids[7]}`), 200);
  assert.deepEqual(older.map((m: any) => m.content), ['m6', 'm5', 'm4', 'm3', 'm2']);
  const after = expectStatus(await alice.api.get(`/channels/${c.id}/messages?limit=3&after=${ids[2]}`), 200);
  assert.deepEqual(after.map((m: any) => m.content), ['m5', 'm4', 'm3']);
  const around = expectStatus(await alice.api.get(`/channels/${c.id}/messages?limit=4&around=${ids[6]}`), 200);
  assert.deepEqual(around.map((m: any) => m.content), ['m8', 'm7', 'm6', 'm5']);
  const all = expectStatus(await alice.api.get(`/channels/${c.id}/messages`), 200);
  assert.equal(all.length, 12);
  assert.equal((await alice.api.get(`/channels/${c.id}/messages?before=abc`)).status, 400);
});

test('mentions increment read state; ack resets it; READY includes read_states', async () => {
  const c = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'mentions' }), 200);
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const m1 = expectStatus(await alice.api.post(`/channels/${c.id}/messages`, { content: `hey <@${bob.user.id}>` }), 200);
    assert.deepEqual(m1.mentions, [bob.user.id]);
    expectStatus(await alice.api.post(`/channels/${c.id}/messages`, { content: '@everyone party' }), 200);
    // role mention (mentionable)
    const role = expectStatus(await alice.api.post(`/guilds/${guildId}/roles`, { name: 'Ping', mentionable: true }), 200);
    expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { roles: [role.id] }), 200);
    const m3 = expectStatus(await alice.api.post(`/channels/${c.id}/messages`, { content: `<@&${role.id}> ping` }), 200);
    assert.deepEqual(m3.mention_roles, [role.id]);
    expectStatus(await alice.api.post(`/channels/${c.id}/messages`, { content: 'no mention' }), 200);

    const gw2 = await GatewayClient.connect(srv, bob.token);
    const ready = gw2.dispatches.find((f) => f.t === 'READY')!.d;
    await gw2.close();
    const rs = ready.read_states.find((r: any) => r.channel_id === c.id);
    assert.equal(rs.mention_count, 3);
    const crs = ready.read_states.find((r: any) => r.channel_id === c.id);
    assert.ok(crs);

    const ack = expectStatus(await bob.api.post(`/channels/${c.id}/messages/${m3.id}/ack`), 200);
    assert.deepEqual(ack, { channel_id: c.id, last_read_message_id: m3.id, mention_count: 0 });
    const ev = await bobGw.waitFor('MESSAGE_ACK', (x) => x.channel_id === c.id);
    assert.equal(ev.mention_count, 0);

    // @everyone without MENTION_EVERYONE does nothing
    const everyone = expectStatus(await alice.api.get(`/guilds/${guildId}/roles`), 200).find((r: any) => r.id === guildId);
    const stripped = (BigInt(everyone.permissions) & ~Permissions.MENTION_EVERYONE).toString();
    expectStatus(await alice.api.patch(`/guilds/${guildId}/roles/${guildId}`, { permissions: stripped }), 200);
    const m5 = expectStatus(await carol.api.post(`/channels/${c.id}/messages`, { content: '@everyone hi' }), 200);
    assert.equal(m5.mention_everyone, false);
    const gw3 = await GatewayClient.connect(srv, bob.token);
    const ready3 = gw3.dispatches.find((f) => f.t === 'READY')!.d;
    await gw3.close();
    assert.equal(ready3.read_states.find((r: any) => r.channel_id === c.id).mention_count, 0);
    expectStatus(await alice.api.patch(`/guilds/${guildId}/roles/${guildId}`, { permissions: everyone.permissions }), 200);
  } finally {
    await bobGw.close();
  }
});

test('multipart attachment upload, served from /uploads', async () => {
  const png = fakePng(32, 16);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: 'look', nonce: 'up1' }));
  form.append('files[0]', new Blob([png], { type: 'image/png' }), 'my pic.png');
  form.append('files[1]', new Blob([Buffer.from('hello text')], { type: 'text/plain' }), '../../evil.txt');
  const m = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, form), 200);
  assert.equal(m.content, 'look');
  assert.equal(m.nonce, 'up1');
  assert.equal(m.attachments.length, 2);
  const [img, txt] = m.attachments;
  assert.equal(img.filename, 'my_pic.png');
  assert.equal(img.content_type, 'image/png');
  assert.equal(img.size, png.length);
  assert.equal(img.width, 32);
  assert.equal(img.height, 16);
  assert.ok(img.url.startsWith(`/uploads/attachments/${generalId}/`));
  assert.equal(txt.filename, 'evil.txt');
  assert.equal(txt.width, null);

  const r = await fetch(srv.base + img.url);
  assert.equal(r.status, 200);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), png);
  const r2 = await fetch(srv.base + txt.url);
  assert.equal(await r2.text(), 'hello text');

  // files only, no content
  const form2 = new FormData();
  form2.append('files[]', new Blob([png], { type: 'image/png' }), 'a.png');
  const m2 = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, form2), 200);
  assert.equal(m2.content, '');
  assert.equal(m2.attachments.length, 1);

  // avatar upload
  const form3 = new FormData();
  form3.append('file', new Blob([png], { type: 'image/png' }), 'avatar.png');
  const u = expectStatus(await alice.api.post('/users/@me/avatar', form3), 200);
  assert.ok(u.avatar.startsWith('/uploads/avatars/'));
  assert.equal((await fetch(srv.base + u.avatar)).status, 200);
  const form4 = new FormData();
  form4.append('file', new Blob([Buffer.from('not an image')], { type: 'image/png' }), 'x.png');
  assert.equal((await alice.api.post('/users/@me/avatar', form4)).status, 400);
});

test('reactions aggregate per requesting user', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const m = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { content: 'react to me' }), 200);
    const e = encodeURIComponent('👍');
    expectStatus(await alice.api.put(`/channels/${generalId}/messages/${m.id}/reactions/${e}/@me`), 204);
    expectStatus(await bob.api.put(`/channels/${generalId}/messages/${m.id}/reactions/${e}/@me`), 204);
    expectStatus(await bob.api.put(`/channels/${generalId}/messages/${m.id}/reactions/${encodeURIComponent('🎉')}/@me`), 204);
    const add = await bobGw.waitFor('MESSAGE_REACTION_ADD', (x) => x.message_id === m.id && x.user_id === alice.user.id);
    assert.equal(add.emoji, '👍');

    const asCarol = expectStatus(await carol.api.get(`/channels/${generalId}/messages/${m.id}`), 200);
    assert.deepEqual(asCarol.reactions[0], { emoji: '👍', count: 2, me: false, user_ids: [alice.user.id, bob.user.id] });
    const asBob = expectStatus(await bob.api.get(`/channels/${generalId}/messages/${m.id}`), 200);
    assert.equal(asBob.reactions[0].me, true);
    assert.equal(asBob.reactions[1].emoji, '🎉');

    expectStatus(await bob.api.del(`/channels/${generalId}/messages/${m.id}/reactions/${e}/@me`), 204);
    await bobGw.waitFor('MESSAGE_REACTION_REMOVE', (x) => x.message_id === m.id);
    const after = expectStatus(await alice.api.get(`/channels/${generalId}/messages/${m.id}`), 200);
    assert.equal(after.reactions[0].count, 1);
    assert.equal(after.reactions[0].me, true);
  } finally {
    await bobGw.close();
  }
});

test('pins: MANAGE_MESSAGES required, system message, pins list', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const m = expectStatus(await bob.api.post(`/channels/${generalId}/messages`, { content: 'pin me' }), 200);
    assert.equal((await bob.api.put(`/channels/${generalId}/pins/${m.id}`)).status, 403);
    expectStatus(await alice.api.put(`/channels/${generalId}/pins/${m.id}`), 204);
    const upd = await bobGw.waitFor('MESSAGE_UPDATE', (x) => x.id === m.id);
    assert.equal(upd.pinned, true);
    await bobGw.waitFor('CHANNEL_PINS_UPDATE', (x) => x.channel_id === generalId);
    const sys = await bobGw.waitFor('MESSAGE_CREATE', (x) => x.type === MessageType.CHANNEL_PINNED_MESSAGE);
    assert.equal(sys.message_reference?.message_id, m.id);
    const pins = expectStatus(await bob.api.get(`/channels/${generalId}/pins`), 200);
    assert.equal(pins[0].id, m.id);
    expectStatus(await alice.api.del(`/channels/${generalId}/pins/${m.id}`), 204);
    assert.equal(expectStatus(await bob.api.get(`/channels/${generalId}/pins`), 200).length, 0);
  } finally {
    await bobGw.close();
  }
});

test('permission denial: SEND_MESSAGES overwrite → 403; private channel messages not dispatched', async () => {
  const quiet = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'announcements' }), 200);
  expectStatus(await alice.api.put(`/channels/${quiet.id}/permissions/${guildId}`, {
    type: 0, allow: '0', deny: Permissions.SEND_MESSAGES.toString(),
  }), 204);
  const denied = await bob.api.post(`/channels/${quiet.id}/messages`, { content: 'hi' });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 50013);
  expectStatus(await alice.api.post(`/channels/${quiet.id}/messages`, { content: 'owner can' }), 200);
  // bob can still read
  assert.equal(expectStatus(await bob.api.get(`/channels/${quiet.id}/messages`), 200).length, 1);

  // private channel: hidden from @everyone, visible to a role carol has
  const role = expectStatus(await alice.api.post(`/guilds/${guildId}/roles`, { name: 'Secret' }), 200);
  expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${carol.user.id}`, { roles: [role.id] }), 200);
  const secret = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, {
    name: 'secret',
    permission_overwrites: [
      { id: guildId, type: 0, allow: '0', deny: Permissions.VIEW_CHANNEL.toString() },
      { id: role.id, type: 0, allow: Permissions.VIEW_CHANNEL.toString(), deny: '0' },
    ],
  }), 200);
  const bobGw = await GatewayClient.connect(srv, bob.token);
  const carolGw = await GatewayClient.connect(srv, carol.token);
  try {
    const m = expectStatus(await alice.api.post(`/channels/${secret.id}/messages`, { content: 'top secret' }), 200);
    const got = await carolGw.waitFor('MESSAGE_CREATE', (x) => x.id === m.id);
    assert.equal(got.content, 'top secret');
    assert.ok(await bobGw.expectNone('MESSAGE_CREATE', (x) => x.channel_id === secret.id, 400));
    assert.equal((await bob.api.get(`/channels/${secret.id}/messages`)).status, 403);
    assert.equal((await bob.api.post(`/channels/${secret.id}/messages`, { content: 'x' })).status, 403);
    // typing in secret isn't leaked either
    expectStatus(await carol.api.post(`/channels/${secret.id}/typing`), 204);
    assert.ok(await bobGw.expectNone('TYPING_START', (x) => x.channel_id === secret.id, 300));
    expectStatus(await carol.api.post(`/channels/${generalId}/typing`), 204);
    const typing = await bobGw.waitFor('TYPING_START', (x) => x.channel_id === generalId);
    assert.equal(typing.user_id, carol.user.id);
    assert.equal(typing.member?.user.id, carol.user.id);
    // search excludes channels bob can't view
    const sBob = expectStatus(await bob.api.get(`/guilds/${guildId}/messages/search?content=SECRET`), 200);
    assert.equal(sBob.total_results, 0);
    const sCarol = expectStatus(await carol.api.get(`/guilds/${guildId}/messages/search?content=SECRET`), 200);
    assert.equal(sCarol.total_results, 1);
    assert.equal(sCarol.messages[0].id, m.id);
  } finally {
    await bobGw.close();
    await carolGw.close();
  }
});

test('search by author / channel with paging', async () => {
  const c = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'searchable' }), 200);
  for (let i = 0; i < 4; i++) expectStatus(await bob.api.post(`/channels/${c.id}/messages`, { content: `findme 100%_${i}` }), 200);
  expectStatus(await alice.api.post(`/channels/${c.id}/messages`, { content: 'FINDME by alice' }), 200);
  const r = expectStatus(await carol.api.get(`/guilds/${guildId}/messages/search?content=findme&channel_id=${c.id}&limit=2&offset=1`), 200);
  assert.equal(r.total_results, 5);
  assert.equal(r.messages.length, 2);
  const byBob = expectStatus(await carol.api.get(`/guilds/${guildId}/messages/search?content=findme&author_id=${bob.user.id}`), 200);
  assert.equal(byBob.total_results, 4);
  const lit = expectStatus(await carol.api.get(`/guilds/${guildId}/messages/search?content=${encodeURIComponent('100%_2')}`), 200);
  assert.equal(lit.total_results, 1);
});

test('slow-mode and message rate limit return 429 with retry_after', async () => {
  const c = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'slow', rate_limit_per_user: 30 }), 200);
  expectStatus(await bob.api.post(`/channels/${c.id}/messages`, { content: 'one' }), 200);
  const slow = await bob.api.post(`/channels/${c.id}/messages`, { content: 'two' });
  assert.equal(slow.status, 429);
  assert.ok(slow.body.retry_after > 0);
  // owner bypasses slow-mode
  expectStatus(await alice.api.post(`/channels/${c.id}/messages`, { content: 'a' }), 200);
  expectStatus(await alice.api.post(`/channels/${c.id}/messages`, { content: 'b' }), 200);

  // bucket: 5 messages / 5 s per channel with default limits
  const strict = await startServer({ rateLimits: undefined });
  try {
    const u = await register(strict, 'zed');
    const { generalId: gen } = await setupGuild(u, 'Rate');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await u.api.post(`/channels/${gen}/messages`, { content: `x${i}` })).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
    const r = await u.api.post(`/channels/${gen}/messages`, { content: 'again' });
    assert.equal(r.status, 429);
    assert.equal(typeof r.body.retry_after, 'number');
    assert.equal(typeof r.body.message, 'string');
  } finally {
    await strict.close();
  }
});
