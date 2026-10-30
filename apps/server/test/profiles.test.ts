import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LIMITS, Permissions } from '@huddle/shared';
import {
  GatewayClient, expectStatus, joinGuild, register, setupGuild, startServer, type TestServer, type TestUser,
} from './helpers';

/** A 1x1 PNG (valid: IHDR, IDAT, IEND with correct CRCs). */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const fileForm = (data: Buffer, type: string, name: string) => {
  const form = new FormData();
  form.append('file', new Blob([data], { type }), name);
  return form;
};

let srv: TestServer;
let alice: TestUser, bob: TestUser, carol: TestUser, dave: TestUser;

before(async () => {
  srv = await startServer();
  alice = await register(srv, 'alice');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
  dave = await register(srv, 'dave');
});
after(async () => { await srv.close(); });

test('profile fields: pronouns + accent colour are validated, saved and broadcast to people who share a server', async () => {
  const { generalId } = await setupGuild(alice, 'Profile Club');
  await joinGuild(alice, generalId, bob);
  const gwBob = await GatewayClient.connect(srv, bob.token);
  const gwDave = await GatewayClient.connect(srv, dave.token);
  try {
    assert.equal((await alice.api.patch('/users/@me', { accent_color: 'teal' })).status, 400);
    assert.equal((await alice.api.patch('/users/@me', { pronouns: 'x'.repeat(LIMITS.PRONOUNS + 1) })).status, 400);
    assert.equal((await alice.api.patch('/users/@me', { pronouns: 42 })).status, 400);
    assert.equal((await alice.api.patch('/users/@me', { bio: 'y'.repeat(LIMITS.BIO + 1) })).status, 400);

    const me = expectStatus(await alice.api.patch('/users/@me', { pronouns: ' she/her ', accent_color: '#ff8800', bio: 'Hello there' }), 200);
    assert.equal(me.pronouns, 'she/her');
    assert.equal(me.accent_color, '#ff8800');
    assert.equal(me.bio, 'Hello there');
    assert.equal(me.banner, null);

    const upd = await gwBob.waitFor('USER_UPDATE', (u) => u.id === alice.user.id);
    assert.equal(upd.pronouns, 'she/her');
    assert.equal(upd.accent_color, '#ff8800');
    assert.ok(!('email' in upd), 'others get the public user only');
    assert.ok(await gwDave.expectNone('USER_UPDATE', (u) => u.id === alice.user.id), 'strangers get nothing');

    const pub = expectStatus(await bob.api.get(`/users/${alice.user.id}`), 200);
    assert.equal(pub.pronouns, 'she/her');
    assert.equal(pub.accent_color, '#ff8800');

    // clearing
    const cleared = expectStatus(await alice.api.patch('/users/@me', { pronouns: '', accent_color: null }), 200);
    assert.equal(cleared.pronouns, null);
    assert.equal(cleared.accent_color, null);
  } finally {
    await gwBob.close();
    await gwDave.close();
  }
});

test('profile banner upload: content-sniffed, ≤2 MB, replace + remove clean up the file', async () => {
  const gw = await GatewayClient.connect(srv, carol.token);
  try {
    // a .png name/type that isn't an image is rejected by content
    const bogus = await carol.api.post('/users/@me/banner', fileForm(Buffer.from('not really a png'), 'image/png', 'b.png'));
    assert.equal(bogus.status, 400);
    assert.ok(bogus.body.errors.file);
    const big = Buffer.concat([TINY_PNG, Buffer.alloc(LIMITS.USER_BANNER_BYTES + 10)]);
    assert.equal((await carol.api.post('/users/@me/banner', fileForm(big, 'image/png', 'big.png'))).status, 413);
    assert.equal((await carol.api.post('/users/@me/banner', {})).status, 400); // not multipart

    // a PNG declared as text still works: the bytes decide
    const u1 = expectStatus(await carol.api.post('/users/@me/banner', fileForm(TINY_PNG, 'text/plain', 'x.txt')), 200);
    assert.match(u1.banner, /^\/uploads\/profile-banners\/\d+-\d+\.png$/);
    const ev = await gw.waitFor('USER_UPDATE', (u) => u.id === carol.user.id && !!u.banner);
    assert.equal(ev.banner, u1.banner);
    const file1 = path.join(srv.uploadsDir, u1.banner.slice('/uploads/'.length));
    assert.ok(fs.existsSync(file1));
    const served = await fetch(srv.base + u1.banner);
    assert.equal(served.status, 200);

    const u2 = expectStatus(await carol.api.post('/users/@me/banner', fileForm(TINY_PNG, 'image/png', 'y.png')), 200);
    assert.notEqual(u2.banner, u1.banner);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(!fs.existsSync(file1), 'old banner removed');

    const u3 = expectStatus(await carol.api.patch('/users/@me', { banner: null }), 200);
    assert.equal(u3.banner, null);
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(!fs.existsSync(path.join(srv.uploadsDir, u2.banner.slice('/uploads/'.length))));
    assert.equal((await alice.api.get(`/users/${carol.user.id}`)).body.banner, null);
  } finally {
    await gw.close();
  }
});

test('user settings: folders + positions persist, sync to other sessions and are validated', async () => {
  const a = await register(srv, 'folderfan');
  const g1 = await setupGuild(a, 'One');
  const g2 = await setupGuild(a, 'Two');
  const g3 = await setupGuild(a, 'Three');
  const other = await setupGuild(bob, 'Not Mine');

  assert.deepEqual(expectStatus(await a.api.get('/users/@me/settings'), 200), { guild_folders: [], guild_positions: [] });

  const gw1 = await GatewayClient.connect(srv, a.token);
  const gw2 = await GatewayClient.connect(srv, a.token);
  try {
    const bad = [
      { guild_folders: 'nope' },
      { guild_folders: [{ id: 'has space', name: null, color: null, guild_ids: [g1.guildId] }] },
      { guild_folders: [{ id: 'f1', name: 'x'.repeat(LIMITS.FOLDER_NAME + 1), color: null, guild_ids: [g1.guildId] }] },
      { guild_folders: [{ id: 'f1', name: null, color: 'red', guild_ids: [g1.guildId] }] },
      { guild_folders: [{ id: 'f1', name: null, color: null, guild_ids: 'x' }] },
      { guild_folders: [{ id: 'f1', guild_ids: [g1.guildId] }, { id: 'f1', guild_ids: [g2.guildId] }] },
      { guild_folders: [{ id: 'f1', guild_ids: [g1.guildId] }, { id: 'f2', guild_ids: [g1.guildId] }] },
      { guild_positions: [1, 2] },
      { guild_folders: new Array(LIMITS.GUILD_FOLDERS + 1).fill(0).map((_, i) => ({ id: 'f' + i, guild_ids: [] })) },
    ];
    for (const b of bad) assert.equal((await a.api.patch('/users/@me/settings', b)).status, 400, JSON.stringify(b).slice(0, 80));

    const saved = expectStatus(await a.api.patch('/users/@me/settings', {
      guild_folders: [
        { id: 'f1', name: '  Games  ', color: '#22c55e', guild_ids: [g2.guildId, g1.guildId, other.guildId] },
        { id: 'empty', name: 'Nothing', color: null, guild_ids: [] },
      ],
      guild_positions: [g3.guildId, g2.guildId, g1.guildId, other.guildId],
    }), 200);
    // guilds you're not in and empty folders are dropped; names trimmed
    assert.deepEqual(saved, {
      guild_folders: [{ id: 'f1', name: 'Games', color: '#22c55e', guild_ids: [g2.guildId, g1.guildId] }],
      guild_positions: [g3.guildId, g2.guildId, g1.guildId],
    });
    for (const gw of [gw1, gw2]) assert.deepEqual(await gw.waitFor('USER_SETTINGS_UPDATE'), saved);

    // partial patch keeps the other field
    const renamed = expectStatus(await a.api.patch('/users/@me/settings', {
      guild_folders: [{ id: 'f1', name: 'Fun', color: null, guild_ids: [g1.guildId, g2.guildId] }],
    }), 200);
    assert.deepEqual(renamed.guild_positions, [g3.guildId, g2.guildId, g1.guildId]);

    // persisted + delivered in READY on another device
    const gw3 = await GatewayClient.connect(srv, a.token);
    const ready = gw3.dispatches.find((f) => f.t === 'READY')!.d;
    assert.deepEqual(ready.user_settings, renamed);
    await gw3.close();

    // leaving a server drops it from folders and positions
    await joinGuild(bob, other.generalId, a);
    expectStatus(await a.api.patch('/users/@me/settings', { guild_positions: [other.guildId, g3.guildId] }), 200);
    assert.equal((await a.api.del(`/users/@me/guilds/${other.guildId}`)).status, 204);
    const after = expectStatus(await a.api.get('/users/@me/settings'), 200);
    assert.deepEqual(after.guild_positions, [g3.guildId]);

    // settings are private to each user
    assert.deepEqual(expectStatus(await bob.api.get('/users/@me/settings'), 200).guild_folders, []);
  } finally {
    await gw1.close();
    await gw2.close();
  }
});

test('mentions inbox: direct, role and @everyone mentions, filtered by what you can still read', async () => {
  const owner = await register(srv, 'inboxowner');
  const reader = await register(srv, 'inboxreader');
  const { guildId, generalId } = await setupGuild(owner, 'Inbox Town');
  await joinGuild(owner, generalId, reader);
  const secret = expectStatus(await owner.api.post(`/guilds/${guildId}/channels`, { name: 'secret', type: 0 }), 200);
  const role = expectStatus(await owner.api.post(`/guilds/${guildId}/roles`, { name: 'Helpers', mentionable: true }), 200);
  expectStatus(await owner.api.patch(`/guilds/${guildId}/members/${reader.user.id}`, { roles: [role.id] }), 200);

  const send = async (channelId: string, content: string) =>
    expectStatus(await owner.api.post(`/channels/${channelId}/messages`, { content }), 200).id as string;
  const direct = await send(generalId, `hey <@${reader.user.id}>`);
  await send(generalId, 'no mention here');
  const viaRole = await send(generalId, `ping <@&${role.id}>`);
  const everyone = await send(generalId, '@everyone meeting');
  const hidden = await send(secret.id, `psst <@${reader.user.id}>`);
  // reader's own mention of themselves doesn't count
  expectStatus(await reader.api.post(`/channels/${generalId}/messages`, { content: `me <@${reader.user.id}>` }), 200);

  let ids = expectStatus(await reader.api.get('/users/@me/mentions'), 200).map((m: any) => m.id);
  assert.deepEqual(ids, [hidden, everyone, viaRole, direct], 'newest first');

  // hide #secret from @everyone → its mention disappears
  expectStatus(await owner.api.put(`/channels/${secret.id}/permissions/${guildId}`, {
    type: 0, allow: '0', deny: String(Permissions.VIEW_CHANNEL),
  }), 204);
  ids = expectStatus(await reader.api.get('/users/@me/mentions'), 200).map((m: any) => m.id);
  assert.deepEqual(ids, [everyone, viaRole, direct]);

  // filters + pagination
  assert.deepEqual(expectStatus(await reader.api.get('/users/@me/mentions?everyone=false&roles=false'), 200).map((m: any) => m.id), [direct]);
  const page1 = expectStatus(await reader.api.get('/users/@me/mentions?limit=2'), 200).map((m: any) => m.id);
  assert.deepEqual(page1, [everyone, viaRole]);
  const page2 = expectStatus(await reader.api.get(`/users/@me/mentions?limit=2&before=${page1[1]}`), 200).map((m: any) => m.id);
  assert.deepEqual(page2, [direct]);
  assert.equal((await reader.api.get('/users/@me/mentions?before=abc')).status, 400);

  // dismiss one
  assert.equal((await reader.api.del(`/users/@me/mentions/${viaRole}`)).status, 204);
  ids = expectStatus(await reader.api.get('/users/@me/mentions'), 200).map((m: any) => m.id);
  assert.deepEqual(ids, [everyone, direct]);

  // @everyone from someone without MENTION_EVERYONE isn't stored as a mention, so it never shows up
  const third = await register(srv, 'inboxthird');
  await joinGuild(owner, generalId, third);
  expectStatus(await owner.api.patch(`/guilds/${guildId}/roles/${guildId}`, {
    permissions: String(BigInt((await owner.api.get(`/guilds/${guildId}/roles`)).body.find((r: any) => r.id === guildId).permissions) & ~Permissions.MENTION_EVERYONE),
  }), 200);
  expectStatus(await third.api.post(`/channels/${generalId}/messages`, { content: '@everyone hi' }), 200);
  ids = expectStatus(await reader.api.get('/users/@me/mentions'), 200).map((m: any) => m.id);
  assert.deepEqual(ids, [everyone, direct]);

  // leaving the server removes everything from it
  assert.equal((await reader.api.del(`/users/@me/guilds/${guildId}`)).status, 204);
  assert.deepEqual(expectStatus(await reader.api.get('/users/@me/mentions'), 200), []);
});
