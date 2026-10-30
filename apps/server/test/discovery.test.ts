import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, GUILD_TEMPLATES, MessageType } from '@huddle/shared';
import {
  GatewayClient, expectStatus, joinGuild, register, setupGuild, sleep, startServer, type TestServer, type TestUser,
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
let owner: TestUser, bob: TestUser, carol: TestUser;

before(async () => {
  srv = await startServer();
  owner = await register(srv, 'owner');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
});
after(async () => { await srv.close(); });

async function listed(name: string, category: string, description: string) {
  const s = await setupGuild(owner, name);
  expectStatus(await owner.api.patch(`/guilds/${s.guildId}`, {
    description, category, discoverable: true, banner_color: '#22c55e',
  }), 200);
  return s;
}

test('discovery settings are validated and need a category + description', async () => {
  const { guildId } = await setupGuild(owner, 'Unlisted');
  const noCat = await owner.api.patch(`/guilds/${guildId}`, { discoverable: true, description: 'hi' });
  assert.equal(noCat.status, 400);
  assert.ok(noCat.body.errors.category);
  const noDesc = await owner.api.patch(`/guilds/${guildId}`, { discoverable: true, category: 'music' });
  assert.equal(noDesc.status, 400);
  assert.ok(noDesc.body.errors.description);
  assert.equal((await owner.api.patch(`/guilds/${guildId}`, { category: 'nope' })).status, 400);
  assert.equal((await owner.api.patch(`/guilds/${guildId}`, { banner_color: 'red' })).status, 400);
  assert.equal((await owner.api.patch(`/guilds/${guildId}`, { discoverable: 'yes' })).status, 400);

  // only people with MANAGE_GUILD can list a server (bob is not even a member)
  const g = expectStatus(await owner.api.patch(`/guilds/${guildId}`, { category: 'music', description: 'Tunes' }), 200);
  assert.equal(g.discoverable, false);
  assert.equal(g.category, 'music');
  assert.equal((await bob.api.patch(`/guilds/${guildId}`, { discoverable: true })).status, 404);

  const on = expectStatus(await owner.api.patch(`/guilds/${guildId}`, { discoverable: true }), 200);
  assert.equal(on.discoverable, true);
  // can't strip the description while listed
  assert.equal((await owner.api.patch(`/guilds/${guildId}`, { description: null })).status, 400);
  expectStatus(await owner.api.patch(`/guilds/${guildId}`, { discoverable: false }), 200);
});

test('discovery listing filters by category and text, with member + online counts', async () => {
  const gaming = await listed('Pixel Pals', 'gaming', 'Retro games and speedruns');
  const music = await listed('Synth Club', 'music', 'Modular synth nerds, pixel art covers welcome');
  await setupGuild(owner, 'Hidden Pixels'); // not discoverable

  const ownerGw = await GatewayClient.connect(srv, owner.token);
  try {
    const all = expectStatus(await bob.api.get('/discovery'), 200);
    const ids = all.guilds.map((g: any) => g.id);
    assert.ok(ids.includes(gaming.guildId) && ids.includes(music.guildId));
    assert.ok(!all.guilds.some((g: any) => g.name === 'Hidden Pixels'));
    assert.equal(all.total, all.guilds.length);
    const card = all.guilds.find((g: any) => g.id === gaming.guildId);
    assert.deepEqual(
      { name: card.name, category: card.category, banner_color: card.banner_color, member_count: card.member_count, online_count: card.online_count },
      { name: 'Pixel Pals', category: 'gaming', banner_color: '#22c55e', member_count: 1, online_count: 1 },
    );

    const onlyMusic = expectStatus(await bob.api.get('/discovery?category=music'), 200);
    assert.ok(onlyMusic.guilds.every((g: any) => g.category === 'music'));
    assert.ok(onlyMusic.guilds.some((g: any) => g.id === music.guildId));

    // q matches name or description, case-insensitively
    const pixel = expectStatus(await bob.api.get('/discovery?q=PIXEL'), 200).guilds.map((g: any) => g.id);
    assert.ok(pixel.includes(gaming.guildId) && pixel.includes(music.guildId));
    const both = expectStatus(await bob.api.get('/discovery?q=pixel&category=gaming'), 200).guilds.map((g: any) => g.id);
    assert.ok(both.includes(gaming.guildId) && !both.includes(music.guildId));
    assert.equal(expectStatus(await bob.api.get('/discovery?q=zzz_nothing'), 200).total, 0);
    assert.equal(expectStatus(await bob.api.get('/discovery?q=%25'), 200).total, 0); // % is literal

    assert.equal((await bob.api.get('/discovery?category=bogus')).status, 400);
  } finally {
    await ownerGw.close();
  }
  // owner went offline (the server notices the socket close asynchronously)
  let online = -1;
  for (let i = 0; i < 20 && online !== 0; i++) {
    if (i) await sleep(50);
    const after = expectStatus(await bob.api.get('/discovery?category=gaming'), 200);
    online = after.guilds.find((g: any) => g.id === gaming.guildId).online_count;
  }
  assert.equal(online, 0);
});

test('banner upload: served from /uploads, listed in discovery, replace + remove clean up', async () => {
  const { guildId } = await listed('Banner Bay', 'art', 'Big pictures');
  const ownerGw = await GatewayClient.connect(srv, owner.token);
  try {
    const g = expectStatus(await owner.api.post(`/guilds/${guildId}/banner`, fileForm(TINY_PNG, 'image/png', 'banner.png')), 200);
    assert.match(g.banner, /^\/uploads\/banners\/.+\.png$/);
    await ownerGw.waitFor('GUILD_UPDATE', (u) => u.id === guildId && u.banner === g.banner);
    const served = await fetch(srv.base + g.banner);
    assert.equal(served.status, 200);
    assert.ok(Buffer.from(await served.arrayBuffer()).equals(TINY_PNG));

    const card = expectStatus(await bob.api.get('/discovery?q=banner%20bay'), 200).guilds[0];
    assert.equal(card.banner, g.banner);
    assert.equal(card.verified, false);

    // replacing deletes the old file; DELETE clears it
    const g2 = expectStatus(await owner.api.post(`/guilds/${guildId}/banner`, fileForm(TINY_PNG, 'image/png', 'b2.png')), 200);
    assert.notEqual(g2.banner, g.banner);
    let gone = 0;
    for (let i = 0; i < 20 && gone !== 404; i++) { if (i) await sleep(25); gone = (await fetch(srv.base + g.banner)).status; }
    assert.equal(gone, 404);
    const cleared = expectStatus(await owner.api.del(`/guilds/${guildId}/banner`), 200);
    assert.equal(cleared.banner, null);
    assert.equal(expectStatus(await bob.api.get('/discovery?q=banner%20bay'), 200).guilds[0].banner, null);
    expectStatus(await owner.api.del(`/guilds/${guildId}/banner`), 200); // already empty: still fine
  } finally {
    await ownerGw.close();
  }
});

test('banner upload: content-sniffed type, size cap and MANAGE_GUILD are enforced', async () => {
  const { guildId, generalId } = await listed('Banner Rules', 'other', 'Checks');
  // the extension and declared type lie: content decides
  const fake = await owner.api.post(`/guilds/${guildId}/banner`, fileForm(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png', 'x.png'));
  assert.equal(fake.status, 400);
  assert.ok(fake.body.errors.file);
  const big = Buffer.concat([TINY_PNG, Buffer.alloc(2 * 1024 * 1024)]);
  assert.equal((await owner.api.post(`/guilds/${guildId}/banner`, fileForm(big, 'image/png', 'big.png'))).status, 413);
  assert.equal((await owner.api.post(`/guilds/${guildId}/banner`, new FormData())).status, 400);

  // a plain member can't change it; a non-member doesn't see the guild at all
  await joinGuild(owner, generalId, bob);
  assert.equal((await bob.api.post(`/guilds/${guildId}/banner`, fileForm(TINY_PNG, 'image/png', 'b.png'))).status, 403);
  assert.equal((await bob.api.del(`/guilds/${guildId}/banner`)).status, 403);
  assert.equal((await carol.api.post(`/guilds/${guildId}/banner`, fileForm(TINY_PNG, 'image/png', 'b.png'))).status, 404);
  assert.equal(expectStatus(await owner.api.get(`/guilds/${guildId}`), 200).banner, null);
});

test('verified can only be set outside the API (PATCH ignores it)', async () => {
  const { guildId } = await listed('Verified Maybe', 'community', 'Trust us');
  const g = expectStatus(await owner.api.patch(`/guilds/${guildId}`, { verified: true }), 200);
  assert.equal(g.verified, false);
  srv.app.huddle.db.run('UPDATE guilds SET verified = 1 WHERE id = ?', guildId);
  const card = expectStatus(await bob.api.get('/discovery?q=verified%20maybe'), 200).guilds[0];
  assert.equal(card.verified, true);
});

test('joining a discoverable guild fires the invite-join events; repeat join is a no-op', async () => {
  const { guildId, generalId } = await listed('Open Door', 'community', 'Everyone welcome');
  const ownerGw = await GatewayClient.connect(srv, owner.token);
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const joined = expectStatus(await bob.api.post(`/discovery/${guildId}/join`), 200);
    assert.equal(joined.id, guildId);
    assert.equal(joined.member_count, 2);
    const add = await ownerGw.waitFor('GUILD_MEMBER_ADD', (m) => m.guild_id === guildId);
    assert.equal(add.user.id, bob.user.id);
    await bobGw.waitFor('GUILD_CREATE', (g) => g.id === guildId);
    const sys = await ownerGw.waitFor('MESSAGE_CREATE', (m) => m.channel_id === generalId);
    assert.equal(sys.type, MessageType.GUILD_MEMBER_JOIN);

    const again = expectStatus(await bob.api.post(`/discovery/${guildId}/join`), 200);
    assert.equal(again.member_count, 2);
    assert.ok(await ownerGw.expectNone('GUILD_MEMBER_ADD', (m) => m.guild_id === guildId));
  } finally {
    await ownerGw.close();
    await bobGw.close();
  }
});

test('non-discoverable and unknown guilds cannot be joined from the directory', async () => {
  const { guildId } = await setupGuild(owner, 'Private Room');
  assert.equal((await carol.api.post(`/discovery/${guildId}/join`)).status, 404);
  assert.equal((await carol.api.post('/discovery/123456789/join')).status, 404);
  const listedThenHidden = await listed('Was Public', 'other', 'Not any more');
  expectStatus(await owner.api.patch(`/guilds/${listedThenHidden.guildId}`, { discoverable: false }), 200);
  assert.equal((await carol.api.post(`/discovery/${listedThenHidden.guildId}/join`)).status, 404);
  assert.equal((await carol.api.get(`/guilds/${guildId}`)).status, 404);
});

test('banned users cannot rejoin through the directory', async () => {
  const { guildId } = await listed('Strict Club', 'education', 'Rules matter');
  expectStatus(await carol.api.post(`/discovery/${guildId}/join`), 200);
  const ban = await owner.api.put(`/guilds/${guildId}/bans/${carol.user.id}`, {});
  assert.ok(ban.status === 200 || ban.status === 204, `ban failed: ${ban.status}`);
  const r = await carol.api.post(`/discovery/${guildId}/join`);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 40007);
});

test('create guild from a template builds its categories and channels; unknown template → 400', async () => {
  for (const t of GUILD_TEMPLATES) {
    const g = expectStatus(await owner.api.post('/guilds', { name: `${t.name} Test`, template: t.id }), 200);
    const cats = g.channels.filter((c: any) => c.type === ChannelType.GUILD_CATEGORY);
    const text = g.channels.filter((c: any) => c.type === ChannelType.GUILD_TEXT);
    const voice = g.channels.filter((c: any) => c.type === ChannelType.GUILD_VOICE);
    assert.ok(cats.length >= 2, `${t.id}: categories`);
    assert.ok(text.length >= 3, `${t.id}: text channels`);
    assert.ok(voice.length >= 1, `${t.id}: voice channels`);
    assert.ok(g.channels.every((c: any) => c.type === ChannelType.GUILD_CATEGORY || cats.some((k: any) => k.id === c.parent_id)));
    const sys = g.channels.find((c: any) => c.id === g.system_channel_id);
    assert.equal(sys?.type, ChannelType.GUILD_TEXT, `${t.id}: system channel`);
  }
  const gaming = expectStatus(await owner.api.post('/guilds', { name: 'Gamers', template: 'gaming' }), 200);
  const names = gaming.channels.map((c: any) => c.name);
  assert.ok(names.includes('looking-for-group') && names.includes('Party Up'));

  // explicit null / omitted = the default layout
  const plain = expectStatus(await owner.api.post('/guilds', { name: 'Plain', template: null }), 200);
  assert.deepEqual(plain.channels.map((c: any) => c.name).sort(), ['General', 'Text Channels', 'Voice Channels', 'general']);

  const before = expectStatus(await owner.api.get('/users/@me/guilds'), 200).length;
  const bad = await owner.api.post('/guilds', { name: 'Nope', template: 'castle' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.template);
  assert.equal((await owner.api.post('/guilds', { name: 'Nope', template: 7 })).status, 400);
  assert.equal(expectStatus(await owner.api.get('/users/@me/guilds'), 200).length, before);
});
