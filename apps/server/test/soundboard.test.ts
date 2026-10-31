import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { GatewayOp, Permissions, SOUNDBOARD_LIMITS, type SoundboardSound } from '@huddle/shared';
import {
  GatewayClient, expectStatus, joinGuild, register, setupGuild, sleep, startServer, type TestServer, type TestUser,
} from './helpers';
import { audioDurationMs, sniffAudio } from '../src/uploads';

let srv: TestServer;
let alice: TestUser, bob: TestUser, carol: TestUser, dave: TestUser;
let guildId: string, generalId: string, voiceId: string;

before(async () => {
  srv = await startServer();
  alice = await register(srv, 'alice');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
  dave = await register(srv, 'dave');
  ({ guildId, generalId, voiceId } = await setupGuild(alice, 'Sound Land'));
  await joinGuild(alice, generalId, bob, carol);
});
after(async () => { await srv.close(); });

/** 8 kHz 8-bit mono PCM WAV of the given length (8000 bytes per second). */
function fakeWav(seconds: number): Buffer {
  const n = Math.round(8000 * seconds);
  const b = Buffer.alloc(44 + n, 0x80);
  b.write('RIFF', 0, 'latin1'); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8, 'latin1');
  b.write('fmt ', 12, 'latin1'); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write('data', 36, 'latin1'); b.writeUInt32LE(n, 40);
  return b;
}

/** MPEG1 Layer III, 128 kbps, 44.1 kHz frames (417 bytes, 1152 samples each). */
function fakeMp3(frames: number): Buffer {
  const frame = Buffer.alloc(417);
  frame[0] = 0xff; frame[1] = 0xfb; frame[2] = 0x90; frame[3] = 0x00;
  return Buffer.concat(Array.from({ length: frames }, () => frame));
}

function soundForm(name: string | null, data: Buffer = fakeWav(1), emoji?: string, filename = 'beep.wav', type = 'audio/wav') {
  const form = new FormData();
  if (name !== null) form.append('name', name);
  if (emoji !== undefined) form.append('emoji', emoji);
  form.append('file', new Blob([data], { type }), filename);
  return form;
}

const voicePayload = (channel_id: string | null, guild_id: string | null = guildId) => ({
  guild_id, channel_id, self_mute: false, self_deaf: false, self_video: false, self_stream: false,
});

async function joinVoice(gw: GatewayClient, watcher: GatewayClient, userId: string, channelId: string, gid: string | null = guildId) {
  gw.send(GatewayOp.VOICE_STATE_UPDATE, voicePayload(channelId, gid));
  await watcher.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === userId && v.channel_id === channelId);
}

test('audio sniffing + duration parsing', () => {
  assert.equal(sniffAudio(fakeWav(1)), 'wav');
  assert.ok(Math.abs(audioDurationMs(fakeWav(1.5), 'wav')! - 1500) < 1);
  assert.equal(sniffAudio(fakeMp3(10)), 'mp3');
  // 100 frames × 1152 / 44100 ≈ 2612 ms
  assert.ok(Math.abs(audioDurationMs(fakeMp3(100), 'mp3')! - 2612) < 2);
  const id3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 10]), Buffer.alloc(10), fakeMp3(5)]);
  assert.equal(sniffAudio(id3), 'mp3');
  assert.equal(sniffAudio(Buffer.from('definitely not audio')), null);
});

test('upload validation, permissions, limits + GUILD_SOUNDBOARD_SOUNDS_UPDATE', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const s = expectStatus<SoundboardSound>(await alice.api.post(`/guilds/${guildId}/soundboard-sounds`, soundForm('Beep Boop', fakeWav(1), '🤖')), 200);
    assert.equal(s.name, 'Beep Boop');
    assert.equal(s.emoji, '🤖');
    assert.equal(s.duration_ms, 1000);
    assert.ok(s.url.startsWith('/uploads/sounds/') && s.url.endsWith('.wav'));
    assert.equal((await fetch(srv.base + s.url)).status, 200);
    const ev = await bobGw.waitFor('GUILD_SOUNDBOARD_SOUNDS_UPDATE', (d) => d.guild_id === guildId);
    assert.deepEqual(ev.sounds.map((x) => x.id), [s.id]);

    const mp3 = expectStatus<SoundboardSound>(await alice.api.post(`/guilds/${guildId}/soundboard-sounds`, soundForm('Thud', fakeMp3(40), undefined, 'thud.mp3', 'audio/mpeg')), 200);
    assert.ok(mp3.url.endsWith('.mp3'));
    assert.equal(mp3.emoji, null);

    // validation
    const post = (form: FormData) => alice.api.post(`/guilds/${guildId}/soundboard-sounds`, form);
    assert.equal((await post(soundForm('Too long', fakeWav(6)))).status, 400);
    assert.equal((await post(soundForm('Not audio', Buffer.from('hello world, not audio at all')))).status, 400);
    assert.equal((await post(soundForm('x'))).status, 400); // name too short
    assert.equal((await post(soundForm(null))).status, 400);
    assert.equal((await post(soundForm('Bad emoji', fakeWav(1), 'abc'))).status, 400);
    const big = Buffer.concat([fakeWav(0.5), Buffer.alloc(SOUNDBOARD_LIMITS.BYTES)]);
    assert.equal((await post(soundForm('Huge', big))).status, 413);

    // permission: MANAGE_EMOJIS
    assert.equal((await bob.api.post(`/guilds/${guildId}/soundboard-sounds`, soundForm('Nope'))).status, 403);
    assert.equal((await bob.api.patch(`/guilds/${guildId}/soundboard-sounds/${s.id}`, { name: 'Mine' })).status, 403);
    assert.equal((await bob.api.del(`/guilds/${guildId}/soundboard-sounds/${s.id}`)).status, 403);
    assert.equal((await dave.api.get(`/guilds/${guildId}/soundboard-sounds`)).status, 404); // not a member
    const role = expectStatus(await alice.api.post(`/guilds/${guildId}/roles`, { name: 'DJ', permissions: String(Permissions.MANAGE_EMOJIS) }), 200);
    expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { roles: [role.id] }), 200);
    const edited = expectStatus<SoundboardSound>(await bob.api.patch(`/guilds/${guildId}/soundboard-sounds/${s.id}`, { name: 'Boop', emoji: '' }), 200);
    assert.equal(edited.name, 'Boop');
    assert.equal(edited.emoji, null);
    await bobGw.waitFor('GUILD_SOUNDBOARD_SOUNDS_UPDATE', (d) => d.sounds.some((x) => x.name === 'Boop'));
    expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { roles: [] }), 200);

    // members can list
    assert.equal(expectStatus<SoundboardSound[]>(await carol.api.get(`/guilds/${guildId}/soundboard-sounds`), 200).length, 2);

    // per-server limit
    for (let i = 2; i < SOUNDBOARD_LIMITS.PER_GUILD; i++) expectStatus(await post(soundForm(`Sound ${i}`, fakeWav(0.1))), 200);
    const full = await post(soundForm('One too many', fakeWav(0.1)));
    assert.equal(full.status, 400);
    assert.match(full.body.message, /Maximum/);

    // delete
    assert.equal((await alice.api.del(`/guilds/${guildId}/soundboard-sounds/${mp3.id}`)).status, 204);
    assert.equal((await alice.api.del(`/guilds/${guildId}/soundboard-sounds/${mp3.id}`)).status, 404);
    await bobGw.waitFor('GUILD_SOUNDBOARD_SOUNDS_UPDATE', (d) => !d.sounds.some((x) => x.id === mp3.id));
  } finally {
    await bobGw.close();
  }
});

test('play: must be connected, not server-muted, rate limited; event only reaches connected members', async () => {
  const a = await GatewayClient.connect(srv, alice.token);
  const b = await GatewayClient.connect(srv, bob.token);
  const c = await GatewayClient.connect(srv, carol.token);
  try {
    const sounds = expectStatus<SoundboardSound[]>(await alice.api.get(`/guilds/${guildId}/soundboard-sounds`), 200);
    // not connected anywhere
    assert.equal((await alice.api.post(`/channels/${voiceId}/soundboard`, { sound_id: 'builtin:ding' })).status, 403);
    // text channels are refused
    assert.equal((await alice.api.post(`/channels/${generalId}/soundboard`, { sound_id: 'builtin:ding' })).status, 400);

    await joinVoice(a, c, alice.user.id, voiceId);
    await joinVoice(b, c, bob.user.id, voiceId);

    // unknown sound ids
    assert.equal((await alice.api.post(`/channels/${voiceId}/soundboard`, { sound_id: 'builtin:nope' })).status, 404);
    assert.equal((await alice.api.post(`/channels/${voiceId}/soundboard`, { sound_id: '123' })).status, 404);

    assert.equal((await alice.api.post(`/channels/${voiceId}/soundboard`, { sound_id: 'builtin:ding' })).status, 204);
    const evA = await a.waitFor('SOUNDBOARD_SOUND_PLAY');
    const evB = await b.waitFor('SOUNDBOARD_SOUND_PLAY');
    assert.deepEqual(evB, evA);
    assert.deepEqual(evB, {
      channel_id: voiceId, guild_id: guildId, user_id: alice.user.id, sound_id: 'builtin:ding', name: 'Ding', emoji: '🔔', url: null,
    });
    // carol is in the server but not in the call
    assert.ok(await c.expectNone('SOUNDBOARD_SOUND_PLAY'));

    // a second play within the cooldown is refused
    const fast = await alice.api.post(`/channels/${voiceId}/soundboard`, { sound_id: 'builtin:boing' });
    assert.equal(fast.status, 429);
    assert.ok(fast.body.retry_after > 0);
    assert.ok(await b.expectNone('SOUNDBOARD_SOUND_PLAY', () => true, 100));

    // uploaded sound carries its url; bob has his own cooldown
    assert.equal((await bob.api.post(`/channels/${voiceId}/soundboard`, { sound_id: sounds[0].id })).status, 204);
    const up = await a.waitFor('SOUNDBOARD_SOUND_PLAY');
    assert.equal(up.user_id, bob.user.id);
    assert.equal(up.url, sounds[0].url);

    // connected to the call but playing into another channel
    const other = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'Other', type: 2 }), 200);
    await sleep(SOUNDBOARD_LIMITS.COOLDOWN_MS);
    assert.equal((await bob.api.post(`/channels/${other.id}/soundboard`, { sound_id: 'builtin:ding' })).status, 403);

    // server-muted members can't play
    expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { mute: true }), 200);
    await c.waitFor('VOICE_STATE_UPDATE', (v) => v.user_id === bob.user.id && v.mute);
    assert.equal((await bob.api.post(`/channels/${voiceId}/soundboard`, { sound_id: 'builtin:ding' })).status, 403);
    expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { mute: false }), 200);
  } finally {
    await Promise.all([a.close(), b.close(), c.close()]);
  }
});

test('play in a DM call: built-ins only, recipients in the call receive it', async () => {
  const dm = expectStatus(await alice.api.post('/users/@me/channels', { recipient_ids: [dave.user.id] }), 200);
  const a = await GatewayClient.connect(srv, alice.token);
  const d = await GatewayClient.connect(srv, dave.token);
  try {
    await joinVoice(a, d, alice.user.id, dm.id, null);
    await sleep(SOUNDBOARD_LIMITS.COOLDOWN_MS);
    // dave isn't in the call yet
    assert.equal((await alice.api.post(`/channels/${dm.id}/soundboard`, { sound_id: 'builtin:whoosh' })).status, 204);
    await a.waitFor('SOUNDBOARD_SOUND_PLAY', (e) => e.channel_id === dm.id);
    assert.ok(await d.expectNone('SOUNDBOARD_SOUND_PLAY'));
    assert.equal((await dave.api.post(`/channels/${dm.id}/soundboard`, { sound_id: 'builtin:whoosh' })).status, 403);

    await joinVoice(d, a, dave.user.id, dm.id, null);
    assert.equal((await dave.api.post(`/channels/${dm.id}/soundboard`, { sound_id: 'builtin:crickets' })).status, 204);
    const ev = await a.waitFor('SOUNDBOARD_SOUND_PLAY', (e) => e.user_id === dave.user.id);
    assert.equal(ev.guild_id, null);
    assert.equal(ev.name, 'Crickets');
    // server sounds don't play in DM calls
    const sounds = expectStatus<SoundboardSound[]>(await alice.api.get(`/guilds/${guildId}/soundboard-sounds`), 200);
    await sleep(SOUNDBOARD_LIMITS.COOLDOWN_MS);
    assert.equal((await alice.api.post(`/channels/${dm.id}/soundboard`, { sound_id: sounds[0].id })).status, 404);
  } finally {
    await Promise.all([a.close(), d.close()]);
  }
});
