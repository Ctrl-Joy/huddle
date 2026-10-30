import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EMOJI_LIMITS, Permissions, customReactionKey, emojiToken, type GuildEmoji } from '@huddle/shared';
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
  ({ guildId, generalId } = await setupGuild(alice, 'Emoji Land'));
  await joinGuild(alice, generalId, bob, carol);
});
after(async () => { await srv.close(); });

const fakeGif = () => Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(32)]);

function emojiForm(name: string | null, data: Buffer = fakePng(32, 32), filename = 'party.png', type = 'image/png') {
  const form = new FormData();
  if (name !== null) form.append('name', name);
  form.append('file', new Blob([data], { type }), filename);
  return form;
}

test('create, list, rename, delete + GUILD_EMOJIS_UPDATE and guild payload', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const e = expectStatus<GuildEmoji>(await alice.api.post(`/guilds/${guildId}/emojis`, emojiForm('party_blob')), 200);
    assert.equal(e.name, 'party_blob');
    assert.equal(e.guild_id, guildId);
    assert.equal(e.animated, false);
    assert.equal(e.creator_id, alice.user.id);
    assert.ok(e.url.startsWith('/uploads/emojis/') && e.url.endsWith('.png'));
    assert.equal((await fetch(srv.base + e.url)).status, 200);
    const ev = await bobGw.waitFor('GUILD_EMOJIS_UPDATE', (d) => d.guild_id === guildId && d.emojis.some((x) => x.id === e.id));
    assert.equal(ev.emojis.length, 1);

    const gif = expectStatus<GuildEmoji>(await alice.api.post(`/guilds/${guildId}/emojis`, emojiForm('dance', fakeGif(), 'dance.gif', 'image/gif')), 200);
    assert.equal(gif.animated, true);
    assert.ok(gif.url.endsWith('.gif'));

    // members can list; the full guild payload carries emojis too
    const list = expectStatus<GuildEmoji[]>(await bob.api.get(`/guilds/${guildId}/emojis`), 200);
    assert.deepEqual(list.map((x) => x.name), ['party_blob', 'dance']);
    const full = expectStatus(await bob.api.get(`/guilds/${guildId}?full=true`), 200);
    assert.equal(full.emojis.length, 2);
    const carolGw = await GatewayClient.connect(srv, carol.token);
    try {
      const ready = carolGw.dispatches.find((f) => f.t === 'READY')!.d;
      assert.equal(ready.guilds.find((g: any) => g.id === guildId).emojis.length, 2);
    } finally { await carolGw.close(); }

    // rename
    const renamed = expectStatus<GuildEmoji>(await alice.api.patch(`/guilds/${guildId}/emojis/${e.id}`, { name: 'blob_party' }), 200);
    assert.equal(renamed.name, 'blob_party');
    await bobGw.waitFor('GUILD_EMOJIS_UPDATE', (d) => d.emojis.some((x) => x.name === 'blob_party'));
    // name clash (case-insensitive) and bad names
    assert.equal((await alice.api.patch(`/guilds/${guildId}/emojis/${e.id}`, { name: 'DANCE' })).status, 400);
    assert.equal((await alice.api.patch(`/guilds/${guildId}/emojis/${e.id}`, { name: 'a' })).status, 400);
    assert.equal((await alice.api.patch(`/guilds/${guildId}/emojis/${e.id}`, { name: 'has space' })).status, 400);

    // delete
    assert.equal((await alice.api.del(`/guilds/${guildId}/emojis/${gif.id}`)).status, 204);
    await bobGw.waitFor('GUILD_EMOJIS_UPDATE', (d) => d.emojis.length === 1);
    assert.equal((await alice.api.del(`/guilds/${guildId}/emojis/${gif.id}`)).status, 404);
    assert.equal((await alice.api.get(`/guilds/${guildId}/emojis`)).body.length, 1);

    // audit trail
    const audit = expectStatus(await alice.api.get(`/guilds/${guildId}/audit-logs`), 200);
    const types = audit.audit_log_entries.map((x: any) => x.action_type);
    assert.ok(types.includes(80) && types.includes(81) && types.includes(82));
  } finally {
    await bobGw.close();
  }
});

test('MANAGE_EMOJIS is required; granting it via a role works', async () => {
  assert.equal((await bob.api.post(`/guilds/${guildId}/emojis`, emojiForm('nope'))).status, 403);
  const [e] = (await alice.api.get(`/guilds/${guildId}/emojis`)).body as GuildEmoji[];
  assert.equal((await bob.api.patch(`/guilds/${guildId}/emojis/${e.id}`, { name: 'hijack' })).status, 403);
  assert.equal((await bob.api.del(`/guilds/${guildId}/emojis/${e.id}`)).status, 403);
  // strangers can't even list
  const outsider = await register(srv, 'outsider');
  assert.equal((await outsider.api.get(`/guilds/${guildId}/emojis`)).status, 404);

  const role = expectStatus(await alice.api.post(`/guilds/${guildId}/roles`, {
    name: 'Emoji Wrangler', permissions: Permissions.MANAGE_EMOJIS.toString(),
  }), 200);
  expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { roles: [role.id] }), 200);
  const made = expectStatus<GuildEmoji>(await bob.api.post(`/guilds/${guildId}/emojis`, emojiForm('bobs_pick')), 200);
  assert.equal(made.creator_id, bob.user.id);
  assert.equal((await bob.api.del(`/guilds/${guildId}/emojis/${made.id}`)).status, 204);
});

test('bad name, bad type and oversized file are refused', async () => {
  const url = `/guilds/${guildId}/emojis`;
  assert.equal((await alice.api.post(url, emojiForm(null))).status, 400);
  assert.equal((await alice.api.post(url, emojiForm('x'))).status, 400);
  assert.equal((await alice.api.post(url, emojiForm('a'.repeat(33)))).status, 400);
  assert.equal((await alice.api.post(url, emojiForm('bad-dash'))).status, 400);
  assert.equal((await alice.api.post(url, emojiForm('blob_party'))).status, 400); // taken
  assert.equal((await alice.api.post(url, emojiForm('svgish', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg', 'image/svg+xml'))).status, 400);
  const big = Buffer.concat([fakePng(64, 64), Buffer.alloc(EMOJI_LIMITS.BYTES)]);
  assert.equal((await alice.api.post(url, emojiForm('too_big', big))).status, 413);
});

test('per-server limit', async () => {
  const { guildId: gid } = await setupGuild(carol, 'Limit Test');
  for (let i = 0; i < EMOJI_LIMITS.PER_GUILD; i++) {
    expectStatus(await carol.api.post(`/guilds/${gid}/emojis`, emojiForm(`e_${i}`)), 200);
  }
  const r = await carol.api.post(`/guilds/${gid}/emojis`, emojiForm('one_more'));
  assert.equal(r.status, 400);
  assert.match(r.body.message, /Maximum number of emoji/);
});

test('message token round-trip', async () => {
  const [e] = (await alice.api.get(`/guilds/${guildId}/emojis`)).body as GuildEmoji[];
  const content = `hi ${emojiToken(e)} and <a:gone:123>`;
  const m = expectStatus(await bob.api.post(`/channels/${generalId}/messages`, { content }), 200);
  assert.equal(m.content, content);
  const got = expectStatus(await alice.api.get(`/channels/${generalId}/messages/${m.id}`), 200);
  assert.equal(got.content, content);
});

test('custom emoji reactions: add/remove, aggregate, other-server refusal, cleanup on delete', async () => {
  const e = expectStatus<GuildEmoji>(await alice.api.post(`/guilds/${guildId}/emojis`, emojiForm('react_me')), 200);
  const key = customReactionKey(e.id);
  const m = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { content: 'react here' }), 200);
  const base = `/channels/${generalId}/messages/${m.id}/reactions`;
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    // "c:ID", "name:ID" and the full token all address the same reaction
    assert.equal((await alice.api.put(`${base}/${encodeURIComponent(key)}/@me`)).status, 204);
    const add = await bobGw.waitFor('MESSAGE_REACTION_ADD', (d) => d.message_id === m.id);
    assert.equal(add.emoji, key);
    assert.deepEqual(add.custom_emoji, { id: e.id, name: 'react_me', animated: false, url: e.url });
    assert.equal((await bob.api.put(`${base}/${encodeURIComponent(`react_me:${e.id}`)}/@me`)).status, 204);
    assert.equal((await carol.api.put(`${base}/${encodeURIComponent(emojiToken(e))}/@me`)).status, 204);
    assert.equal((await carol.api.put(`${base}/${encodeURIComponent('👍')}/@me`)).status, 204);

    let got = expectStatus(await bob.api.get(`/channels/${generalId}/messages/${m.id}`), 200);
    const r = got.reactions.find((x: any) => x.emoji === key);
    assert.equal(r.count, 3);
    assert.equal(r.me, true);
    assert.equal(r.custom_emoji.name, 'react_me');
    assert.equal(got.reactions.find((x: any) => x.emoji === '👍').custom_emoji, undefined);
    const users = expectStatus(await bob.api.get(`${base}/${encodeURIComponent(key)}`), 200);
    assert.equal(users.length, 3);

    assert.equal((await bob.api.del(`${base}/${encodeURIComponent(key)}/@me`)).status, 204);
    const rem = await bobGw.waitFor('MESSAGE_REACTION_REMOVE', (d) => d.message_id === m.id && d.user_id === bob.user.id);
    assert.equal(rem.emoji, key);
    got = expectStatus(await bob.api.get(`/channels/${generalId}/messages/${m.id}`), 200);
    assert.equal(got.reactions.find((x: any) => x.emoji === key).count, 2);

    // unknown emoji / emoji from another server
    assert.equal((await alice.api.put(`${base}/${encodeURIComponent('c:999999')}/@me`)).status, 404);
    const other = await setupGuild(alice, 'Elsewhere');
    const foreign = expectStatus<GuildEmoji>(await alice.api.post(`/guilds/${other.guildId}/emojis`, emojiForm('foreign')), 200);
    assert.equal((await alice.api.put(`${base}/${encodeURIComponent(customReactionKey(foreign.id))}/@me`)).status, 400);

    // deleting the emoji drops its reactions
    assert.equal((await alice.api.del(`/guilds/${guildId}/emojis/${e.id}`)).status, 204);
    got = expectStatus(await bob.api.get(`/channels/${generalId}/messages/${m.id}`), 200);
    assert.deepEqual(got.reactions.map((x: any) => x.emoji), ['👍']);
  } finally {
    await bobGw.close();
  }
});
