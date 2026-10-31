import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_STICKERS, MessageType, Permissions, STICKER_LIMITS, WAVE_STICKER_ID, type GuildSticker, type Message,
} from '@huddle/shared';
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
  ({ guildId, generalId } = await setupGuild(alice, 'Sticker Land'));
  await joinGuild(alice, generalId, bob, carol);
});
after(async () => { await srv.close(); });

const fakeGif = () => Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(32)]);

/** PNG signature + IHDR + acTL chunk (enough for APNG sniffing). */
function fakeApng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0);
    b.write(type, 4, 'ascii');
    data.copy(b, 8);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(64, 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('acTL', Buffer.alloc(8)), chunk('IDAT', Buffer.alloc(4)),
  ]);
}

function stickerForm(fields: { name?: string; tags?: string; description?: string }, data: Buffer = fakePng(160, 160), filename = 'blob.png', type = 'image/png') {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) form.append(k, v);
  form.append('file', new Blob([data], { type }), filename);
  return form;
}

test('create, list, edit, delete + GUILD_STICKERS_UPDATE, guild payload and audit log', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const s = expectStatus<GuildSticker>(await alice.api.post(`/guilds/${guildId}/stickers`, stickerForm({ name: 'Happy Blob', tags: '😄', description: 'A very happy blob' })), 200);
    assert.equal(s.name, 'Happy Blob');
    assert.equal(s.format, 'png');
    assert.equal(s.tags, '😄');
    assert.equal(s.description, 'A very happy blob');
    assert.equal(s.creator_id, alice.user.id);
    assert.ok(s.url.startsWith('/uploads/stickers/') && s.url.endsWith('.png'));
    assert.equal((await fetch(srv.base + s.url)).status, 200);
    const ev = await bobGw.waitFor('GUILD_STICKERS_UPDATE', (d) => d.guild_id === guildId && d.stickers.some((x) => x.id === s.id));
    assert.equal(ev.stickers.length, 1);

    const gif = expectStatus<GuildSticker>(await alice.api.post(`/guilds/${guildId}/stickers`, stickerForm({ name: 'dance', tags: '💃' }, fakeGif(), 'd.gif', 'image/gif')), 200);
    assert.equal(gif.format, 'gif');
    assert.equal(gif.description, null);
    const apng = expectStatus<GuildSticker>(await alice.api.post(`/guilds/${guildId}/stickers`, stickerForm({ name: 'spin', tags: '🌀' }, fakeApng())), 200);
    assert.equal(apng.format, 'apng');
    assert.ok(apng.url.endsWith('.png'));

    // members can list; READY carries them too
    assert.deepEqual(expectStatus<GuildSticker[]>(await bob.api.get(`/guilds/${guildId}/stickers`), 200).map((x) => x.name), ['Happy Blob', 'dance', 'spin']);
    const carolGw = await GatewayClient.connect(srv, carol.token);
    try {
      const ready = carolGw.dispatches.find((f) => f.t === 'READY')!.d;
      assert.equal(ready.guilds.find((g: any) => g.id === guildId).stickers.length, 3);
    } finally { await carolGw.close(); }

    const edited = expectStatus<GuildSticker>(await alice.api.patch(`/guilds/${guildId}/stickers/${s.id}`, { name: 'Glad Blob', tags: '😊', description: '' }), 200);
    assert.equal(edited.name, 'Glad Blob');
    assert.equal(edited.tags, '😊');
    assert.equal(edited.description, null);
    await bobGw.waitFor('GUILD_STICKERS_UPDATE', (d) => d.stickers.some((x) => x.name === 'Glad Blob'));
    assert.equal((await alice.api.patch(`/guilds/${guildId}/stickers/${s.id}`, { name: 'DANCE' })).status, 400); // taken
    assert.equal((await alice.api.patch(`/guilds/${guildId}/stickers/${s.id}`, { tags: 'abc' })).status, 400);

    assert.equal((await alice.api.del(`/guilds/${guildId}/stickers/${apng.id}`)).status, 204);
    await bobGw.waitFor('GUILD_STICKERS_UPDATE', (d) => d.stickers.length === 2);
    assert.equal((await alice.api.del(`/guilds/${guildId}/stickers/${apng.id}`)).status, 404);

    const audit = expectStatus(await alice.api.get(`/guilds/${guildId}/audit-logs`), 200);
    const types = audit.audit_log_entries.map((x: any) => x.action_type);
    assert.ok(types.includes(90) && types.includes(91) && types.includes(92));
  } finally {
    await bobGw.close();
  }
});

test('MANAGE_EMOJIS (Manage Expressions) is required; granting it via a role works', async () => {
  assert.equal((await bob.api.post(`/guilds/${guildId}/stickers`, stickerForm({ name: 'nope', tags: '🙃' }))).status, 403);
  const [s] = (await alice.api.get(`/guilds/${guildId}/stickers`)).body as GuildSticker[];
  assert.equal((await bob.api.patch(`/guilds/${guildId}/stickers/${s.id}`, { name: 'hijack' })).status, 403);
  assert.equal((await bob.api.del(`/guilds/${guildId}/stickers/${s.id}`)).status, 403);
  const outsider = await register(srv, 'outsider');
  assert.equal((await outsider.api.get(`/guilds/${guildId}/stickers`)).status, 404);

  const role = expectStatus(await alice.api.post(`/guilds/${guildId}/roles`, {
    name: 'Sticker Smith', permissions: Permissions.MANAGE_EMOJIS.toString(),
  }), 200);
  expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { roles: [role.id] }), 200);
  const made = expectStatus<GuildSticker>(await bob.api.post(`/guilds/${guildId}/stickers`, stickerForm({ name: 'bobs sticker', tags: '🐝' })), 200);
  assert.equal(made.creator_id, bob.user.id);
  assert.equal((await bob.api.del(`/guilds/${guildId}/stickers/${made.id}`)).status, 204);
});

test('validation: name, related emoji, description, file type and size', async () => {
  const url = `/guilds/${guildId}/stickers`;
  assert.equal((await alice.api.post(url, stickerForm({ tags: '😀' }))).status, 400); // no name
  assert.equal((await alice.api.post(url, stickerForm({ name: 'x', tags: '😀' }))).status, 400);
  assert.equal((await alice.api.post(url, stickerForm({ name: 'a'.repeat(31), tags: '😀' }))).status, 400);
  assert.equal((await alice.api.post(url, stickerForm({ name: 'Glad Blob', tags: '😀' }))).status, 400); // taken
  assert.equal((await alice.api.post(url, stickerForm({ name: 'no emoji' }))).status, 400);
  assert.equal((await alice.api.post(url, stickerForm({ name: 'word tag', tags: 'smile' }))).status, 400);
  assert.equal((await alice.api.post(url, stickerForm({ name: 'long desc', tags: '😀', description: 'd'.repeat(101) }))).status, 400);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
  assert.equal((await alice.api.post(url, stickerForm({ name: 'jpeg', tags: '😀' }, jpeg, 'x.jpg', 'image/jpeg'))).status, 400);
  assert.equal((await alice.api.post(url, stickerForm({ name: 'svg', tags: '😀' }, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg', 'image/svg+xml'))).status, 400);
  const big = Buffer.concat([fakePng(64, 64), Buffer.alloc(STICKER_LIMITS.BYTES)]);
  assert.equal((await alice.api.post(url, stickerForm({ name: 'too big', tags: '😀' }, big))).status, 413);
});

test('per-server limit', async () => {
  const { guildId: gid } = await setupGuild(carol, 'Sticker Limit');
  for (let i = 0; i < STICKER_LIMITS.PER_GUILD; i++) {
    expectStatus(await carol.api.post(`/guilds/${gid}/stickers`, stickerForm({ name: `s${i}`, tags: '⭐' })), 200);
  }
  const r = await carol.api.post(`/guilds/${gid}/stickers`, stickerForm({ name: 'one more', tags: '⭐' }));
  assert.equal(r.status, 400);
  assert.match(r.body.message, /Maximum number of stickers/);
});

test('sending sticker messages: built-in and server stickers, scope rules, reactions, replies, forwards', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    // built-in, no text
    const hi = BUILTIN_STICKERS.find((s) => s.id === WAVE_STICKER_ID)!;
    const m = expectStatus<Message>(await alice.api.post(`/channels/${generalId}/messages`, { sticker_ids: [hi.id] }), 200);
    assert.equal(m.content, '');
    assert.equal(m.type, MessageType.DEFAULT);
    assert.deepEqual(m.sticker_items, [{ id: hi.id, name: hi.name, format: 'svg', url: hi.url }]);
    const live = await bobGw.waitFor('MESSAGE_CREATE', (d) => d.id === m.id);
    assert.equal(live.sticker_items![0].id, hi.id);

    // server sticker in its own server
    const [own] = (await alice.api.get(`/guilds/${guildId}/stickers`)).body as GuildSticker[];
    const m2 = expectStatus<Message>(await bob.api.post(`/channels/${generalId}/messages`, { sticker_ids: [own.id], content: 'look' }), 200);
    assert.equal(m2.sticker_items![0].url, own.url);
    assert.equal(m2.content, 'look');

    // refused: unknown, too many, other server, DM, wrong shape
    assert.equal((await alice.api.post(`/channels/${generalId}/messages`, { sticker_ids: ['999999'] })).status, 404);
    assert.equal((await alice.api.post(`/channels/${generalId}/messages`, { sticker_ids: ['hb_nope'] })).status, 404);
    assert.equal((await alice.api.post(`/channels/${generalId}/messages`, { sticker_ids: ['hb_gg', 'hb_lol'] })).status, 400);
    assert.equal((await alice.api.post(`/channels/${generalId}/messages`, { sticker_ids: 'hb_gg' })).status, 400);
    const other = await setupGuild(alice, 'Elsewhere');
    assert.equal((await alice.api.post(`/channels/${other.generalId}/messages`, { sticker_ids: [own.id] })).status, 400);
    const dm = expectStatus(await alice.api.post('/users/@me/channels', { recipient_id: bob.user.id }), 200);
    assert.equal((await alice.api.post(`/channels/${dm.id}/messages`, { sticker_ids: [own.id] })).status, 400);
    const dmMsg = expectStatus<Message>(await alice.api.post(`/channels/${dm.id}/messages`, { sticker_ids: ['hb_gg'] }), 200);
    assert.equal(dmMsg.sticker_items![0].name, 'GG');

    // reactions + replies work like any other message
    assert.equal((await bob.api.put(`/channels/${generalId}/messages/${m.id}/reactions/${encodeURIComponent('👋')}/@me`)).status, 204);
    const reply = expectStatus<Message>(await bob.api.post(`/channels/${generalId}/messages`, { sticker_ids: ['hb_yay'], reply_to_id: m.id }), 200);
    assert.equal(reply.type, MessageType.REPLY);
    assert.equal(reply.referenced_message!.sticker_items![0].id, hi.id);

    // forwarding keeps the sticker in the snapshot
    const [fwd] = expectStatus<Message[]>(await bob.api.post(`/channels/${generalId}/messages/${m.id}/forward`, { channel_ids: [dm.id] }), 200);
    assert.equal(fwd.forward!.sticker_items![0].id, hi.id);

    // the sent copy outlives the sticker; editing a sticker message to empty text is allowed
    assert.equal((await alice.api.del(`/guilds/${guildId}/stickers/${own.id}`)).status, 204);
    const after = expectStatus<Message>(await alice.api.get(`/channels/${generalId}/messages/${m2.id}`), 200);
    assert.equal(after.sticker_items![0].name, own.name);
    expectStatus(await bob.api.patch(`/channels/${generalId}/messages/${m2.id}`, { content: '' }), 200);
  } finally {
    await bobGw.close();
  }
});

test('wave to say hi: replying to a join message with the wave sticker', async () => {
  const dave = await register(srv, 'dave');
  await joinGuild(alice, generalId, dave);
  const history = expectStatus<Message[]>(await alice.api.get(`/channels/${generalId}/messages?limit=10`), 200);
  const join = history.find((x) => x.type === MessageType.GUILD_MEMBER_JOIN && x.author.id === dave.user.id)!;
  assert.ok(join);
  const wave = expectStatus<Message>(await alice.api.post(`/channels/${generalId}/messages`, { sticker_ids: [WAVE_STICKER_ID], reply_to_id: join.id }), 200);
  assert.equal(wave.type, MessageType.REPLY);
  assert.equal(wave.message_reference!.message_id, join.id);
  assert.ok(wave.mentions.includes(dave.user.id)); // the newcomer gets pinged
});
