import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Permissions, type ScheduledEvent } from '@huddle/shared';
import { advanceScheduledEvents } from '../src/services/scheduledEvents';
import {
  GatewayClient, expectStatus, fakePng, joinGuild, register, setupGuild, startServer, type TestServer, type TestUser,
} from './helpers';

let srv: TestServer;
let alice: TestUser, bob: TestUser, carol: TestUser;
let guildId: string, generalId: string, voiceId: string;

before(async () => {
  srv = await startServer();
  alice = await register(srv, 'alice');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
  ({ guildId, generalId, voiceId } = await setupGuild(alice, 'Event Hall'));
  await joinGuild(alice, generalId, bob, carol);
});
after(async () => { await srv.close(); });

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const base = `/guilds/:g/scheduled-events`;
const url = (p = '') => base.replace(':g', () => guildId) + p;

async function createExternal(u: TestUser, extra: Record<string, unknown> = {}) {
  return expectStatus<ScheduledEvent>(await u.api.post(url(), {
    name: 'Board game night', description: 'Bring snacks', start_time: inHours(2), end_time: inHours(4),
    location_type: 'external', location: 'The Cafe on 5th', ...extra,
  }), 200);
}

test('create / list / get / update / delete + gateway + audit', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const e = await createExternal(alice);
    assert.equal(e.status, 'scheduled');
    assert.equal(e.location_type, 'external');
    assert.equal(e.location, 'The Cafe on 5th');
    assert.equal(e.channel_id, null);
    assert.equal(e.creator_id, alice.user.id);
    assert.equal(e.creator?.username, 'alice');
    // the creator starts out interested
    assert.equal(e.user_count, 1);
    assert.equal(e.user_interested, true);
    const created = await bobGw.waitFor('SCHEDULED_EVENT_CREATE', (d) => d.id === e.id);
    assert.equal(created.user_interested, false);
    assert.equal(created.user_count, 1);

    const list = expectStatus<ScheduledEvent[]>(await bob.api.get(url()), 200);
    assert.deepEqual(list.map((x) => x.id), [e.id]);
    assert.equal(expectStatus<ScheduledEvent>(await bob.api.get(url(`/${e.id}`)), 200).name, 'Board game night');

    // edit: rename + move to a voice channel
    const edited = expectStatus<ScheduledEvent>(await alice.api.patch(url(`/${e.id}`), {
      name: 'Game night (voice)', location_type: 'voice', channel_id: voiceId,
    }), 200);
    assert.equal(edited.name, 'Game night (voice)');
    assert.equal(edited.channel_id, voiceId);
    assert.equal(edited.location, null);
    await bobGw.waitFor('SCHEDULED_EVENT_UPDATE', (d) => d.id === e.id && d.channel_id === voiceId);

    // validation
    assert.equal((await alice.api.patch(url(`/${e.id}`), { end_time: inHours(1) })).status, 400); // before start
    assert.equal((await alice.api.patch(url(`/${e.id}`), { start_time: inHours(-5) })).status, 400); // in the past
    assert.equal((await alice.api.patch(url(`/${e.id}`), { channel_id: generalId })).status, 400); // not voice
    assert.equal((await alice.api.patch(url(`/${e.id}`), { location_type: 'external' })).status, 400); // no location
    assert.equal((await alice.api.post(url(), { name: '', start_time: inHours(1), location_type: 'external', location: 'x' })).status, 400);
    assert.equal((await alice.api.post(url(), { name: 'x', location_type: 'external', location: 'x' })).status, 400);
    assert.equal((await alice.api.post(url(), { name: 'x', start_time: 'soon', location_type: 'external', location: 'x' })).status, 400);
    assert.equal((await alice.api.post(url(), { name: 'x', start_time: inHours(1), location_type: 'moon' })).status, 400);

    // cover image: images only, ≤ 2 MB
    const form = new FormData();
    form.append('file', new Blob([fakePng(64, 32)], { type: 'image/png' }), 'cover.png');
    const withCover = expectStatus<ScheduledEvent>(await alice.api.post(url(`/${e.id}/cover`), form), 200);
    assert.ok(withCover.image?.startsWith('/uploads/event-covers/'));
    assert.equal((await fetch(srv.base + withCover.image)).status, 200);
    const bad = new FormData();
    bad.append('file', new Blob([Buffer.from('not an image at all')], { type: 'image/png' }), 'x.png');
    assert.equal((await alice.api.post(url(`/${e.id}/cover`), bad)).status, 400);
    const big = new FormData();
    big.append('file', new Blob([Buffer.concat([fakePng(10, 10), Buffer.alloc(2 * 1024 * 1024)])], { type: 'image/png' }), 'big.png');
    assert.equal((await alice.api.post(url(`/${e.id}/cover`), big)).status, 413);
    assert.equal(expectStatus<ScheduledEvent>(await alice.api.del(url(`/${e.id}/cover`)), 200).image, null);

    // delete
    assert.equal((await alice.api.del(url(`/${e.id}`))).status, 204);
    await bobGw.waitFor('SCHEDULED_EVENT_DELETE', (d) => d.id === e.id && d.guild_id === guildId);
    assert.equal((await bob.api.get(url(`/${e.id}`))).status, 404);

    const types = expectStatus(await alice.api.get(`/guilds/${guildId}/audit-logs`), 200).audit_log_entries.map((x: any) => x.action_type);
    assert.ok(types.includes(100) && types.includes(101) && types.includes(102));
  } finally {
    await bobGw.close();
  }
});

test('MANAGE_EVENTS is required to create / edit / cancel; the creator may start and end', async () => {
  const e = await createExternal(alice);
  assert.equal((await bob.api.post(url(), { name: 'nope', start_time: inHours(1), location_type: 'external', location: 'x' })).status, 403);
  assert.equal((await bob.api.patch(url(`/${e.id}`), { name: 'hijack' })).status, 403);
  assert.equal((await bob.api.post(url(`/${e.id}/cancel`))).status, 403);
  assert.equal((await bob.api.post(url(`/${e.id}/start`))).status, 403);
  assert.equal((await bob.api.del(url(`/${e.id}`))).status, 403);

  // give bob a role with MANAGE_EVENTS
  const role = expectStatus(await alice.api.post(`/guilds/${guildId}/roles`, { name: 'Hosts', permissions: Permissions.MANAGE_EVENTS.toString() }), 200);
  expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { roles: [role.id] }), 200);
  const bobs = expectStatus<ScheduledEvent>(await bob.api.post(url(), {
    name: 'Bob hosts', start_time: inHours(1), location_type: 'voice', channel_id: voiceId,
  }), 200);
  assert.equal(expectStatus<ScheduledEvent>(await bob.api.patch(url(`/${e.id}`), { description: null }), 200).description, null);

  // without the permission any more, bob can still start / end his own event but not edit it
  expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${bob.user.id}`, { roles: [] }), 200);
  assert.equal((await bob.api.patch(url(`/${bobs.id}`), { name: 'x' })).status, 403);
  assert.equal(expectStatus<ScheduledEvent>(await bob.api.post(url(`/${bobs.id}/start`)), 200).status, 'active');
  assert.equal(expectStatus<ScheduledEvent>(await bob.api.post(url(`/${bobs.id}/end`)), 200).status, 'completed');
  await alice.api.del(url(`/${e.id}`));
});

test('voice events are only visible to members who can view the channel', async () => {
  // a private voice channel carol can't see
  const priv = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, {
    name: 'staff-voice', type: 2,
    permission_overwrites: [{ id: guildId, type: 0, allow: '0', deny: Permissions.VIEW_CHANNEL.toString() },
      { id: bob.user.id, type: 1, allow: Permissions.VIEW_CHANNEL.toString(), deny: '0' }],
  }), 200);
  const carolGw = await GatewayClient.connect(srv, carol.token);
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const e = expectStatus<ScheduledEvent>(await alice.api.post(url(), {
      name: 'Staff sync', start_time: inHours(3), location_type: 'voice', channel_id: priv.id,
    }), 200);
    await bobGw.waitFor('SCHEDULED_EVENT_CREATE', (d) => d.id === e.id);
    assert.ok(await carolGw.expectNone('SCHEDULED_EVENT_CREATE', (d) => d.id === e.id));
    assert.ok(!expectStatus<ScheduledEvent[]>(await carol.api.get(url()), 200).some((x) => x.id === e.id));
    assert.equal((await carol.api.get(url(`/${e.id}`))).status, 404);
    assert.equal((await carol.api.put(url(`/${e.id}/users/@me`))).status, 404);

    // moving it to a public channel shows it to carol; moving it back takes it away again
    expectStatus(await alice.api.patch(url(`/${e.id}`), { channel_id: voiceId }), 200);
    await carolGw.waitFor('SCHEDULED_EVENT_UPDATE', (d) => d.id === e.id);
    expectStatus(await alice.api.patch(url(`/${e.id}`), { channel_id: priv.id }), 200);
    await carolGw.waitFor('SCHEDULED_EVENT_DELETE', (d) => d.id === e.id);
    await bobGw.waitFor('SCHEDULED_EVENT_UPDATE', (d) => d.id === e.id && d.channel_id === priv.id);
    await alice.api.del(url(`/${e.id}`));
  } finally {
    await carolGw.close();
    await bobGw.close();
  }
});

test('status transitions: start, end, cancel and the rules between them', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const v = expectStatus<ScheduledEvent>(await alice.api.post(url(), {
      name: 'Listening party', start_time: inHours(1), location_type: 'voice', channel_id: voiceId,
    }), 200);
    assert.equal((await alice.api.post(url(`/${v.id}/end`))).status, 400); // not live yet
    const live = expectStatus<ScheduledEvent>(await alice.api.post(url(`/${v.id}/start`)), 200);
    assert.equal(live.status, 'active');
    await bobGw.waitFor('SCHEDULED_EVENT_UPDATE', (d) => d.id === v.id && d.status === 'active');
    assert.equal((await alice.api.post(url(`/${v.id}/start`))).status, 400);
    assert.equal((await alice.api.post(url(`/${v.id}/cancel`))).status, 400); // live events end instead
    assert.equal((await alice.api.patch(url(`/${v.id}`), { start_time: inHours(5) })).status, 400);
    expectStatus(await alice.api.patch(url(`/${v.id}`), { name: 'Listening party!' }), 200); // other edits are fine
    const done = expectStatus<ScheduledEvent>(await alice.api.post(url(`/${v.id}/end`)), 200);
    assert.equal(done.status, 'completed');
    await bobGw.waitFor('SCHEDULED_EVENT_UPDATE', (d) => d.id === v.id && d.status === 'completed');
    // ended events drop out of the list, can't be edited or joined, but can still be fetched
    assert.ok(!expectStatus<ScheduledEvent[]>(await alice.api.get(url()), 200).some((x) => x.id === v.id));
    assert.equal((await alice.api.patch(url(`/${v.id}`), { name: 'again' })).status, 400);
    assert.equal((await bob.api.put(url(`/${v.id}/users/@me`))).status, 400);
    assert.equal(expectStatus<ScheduledEvent>(await bob.api.get(url(`/${v.id}`)), 200).status, 'completed');

    const c = await createExternal(alice);
    assert.equal(expectStatus<ScheduledEvent>(await alice.api.post(url(`/${c.id}/cancel`)), 200).status, 'cancelled');
    await bobGw.waitFor('SCHEDULED_EVENT_UPDATE', (d) => d.id === c.id && d.status === 'cancelled');
    assert.equal((await alice.api.post(url(`/${c.id}/start`))).status, 400);
  } finally {
    await bobGw.close();
  }
});

test('timer: external events go live at start; events auto-complete after end (or 24h without one)', async () => {
  const ctx = srv.app.huddle;
  const ext = await createExternal(alice, { start_time: inHours(1), end_time: inHours(3) });
  const voice = expectStatus<ScheduledEvent>(await alice.api.post(url(), {
    name: 'Open mic', start_time: inHours(1), location_type: 'voice', channel_id: voiceId,
  }), 200);
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const at = (h: number) => Date.now() + h * 3600_000;
    advanceScheduledEvents(ctx, at(0.5)); // nothing due yet
    assert.equal(expectStatus<ScheduledEvent>(await alice.api.get(url(`/${ext.id}`)), 200).status, 'scheduled');

    advanceScheduledEvents(ctx, at(1.5));
    assert.equal(expectStatus<ScheduledEvent>(await alice.api.get(url(`/${ext.id}`)), 200).status, 'active');
    await bobGw.waitFor('SCHEDULED_EVENT_UPDATE', (d) => d.id === ext.id && d.status === 'active');
    // voice events wait for someone to press Start
    assert.equal(expectStatus<ScheduledEvent>(await alice.api.get(url(`/${voice.id}`)), 200).status, 'scheduled');

    advanceScheduledEvents(ctx, at(3.5)); // past ext's end
    assert.equal(expectStatus<ScheduledEvent>(await alice.api.get(url(`/${ext.id}`)), 200).status, 'completed');
    await bobGw.waitFor('SCHEDULED_EVENT_UPDATE', (d) => d.id === ext.id && d.status === 'completed');
    assert.equal(expectStatus<ScheduledEvent>(await alice.api.get(url(`/${voice.id}`)), 200).status, 'scheduled');

    expectStatus(await alice.api.post(url(`/${voice.id}/start`)), 200);
    advanceScheduledEvents(ctx, at(25.5)); // no end time: done a day after it was due to start (+1h)
    assert.equal(expectStatus<ScheduledEvent>(await alice.api.get(url(`/${voice.id}`)), 200).status, 'completed');
  } finally {
    await bobGw.close();
  }
});

test('interested: add / remove, counts, user list and gateway events', async () => {
  const e = await createExternal(alice);
  const aliceGw = await GatewayClient.connect(srv, alice.token);
  try {
    const r = expectStatus<ScheduledEvent>(await bob.api.put(url(`/${e.id}/users/@me`)), 200);
    assert.equal(r.user_interested, true);
    assert.equal(r.user_count, 2);
    const add = await aliceGw.waitFor('SCHEDULED_EVENT_INTEREST_ADD', (d) => d.event_id === e.id);
    assert.deepEqual(add, { event_id: e.id, guild_id: guildId, user_id: bob.user.id, user_count: 2 });
    // idempotent: no second event, same count
    assert.equal(expectStatus<ScheduledEvent>(await bob.api.put(url(`/${e.id}/users/@me`)), 200).user_count, 2);
    assert.ok(await aliceGw.expectNone('SCHEDULED_EVENT_INTEREST_ADD', (d) => d.event_id === e.id));

    expectStatus(await carol.api.put(url(`/${e.id}/users/@me`)), 200);
    const users = expectStatus<{ id: string }[]>(await bob.api.get(url(`/${e.id}/users`)), 200);
    assert.deepEqual(users.map((u) => u.id), [alice.user.id, bob.user.id, carol.user.id]);
    assert.equal(expectStatus<ScheduledEvent>(await alice.api.get(url(`/${e.id}`)), 200).user_count, 3);

    const off = expectStatus<ScheduledEvent>(await bob.api.del(url(`/${e.id}/users/@me`)), 200);
    assert.equal(off.user_interested, false);
    assert.equal(off.user_count, 2);
    const rem = await aliceGw.waitFor('SCHEDULED_EVENT_INTEREST_REMOVE', (d) => d.event_id === e.id);
    assert.equal(rem.user_id, bob.user.id);
    assert.equal(rem.user_count, 2);

    // list reflects the viewer's own flag
    const carolView = expectStatus<ScheduledEvent[]>(await carol.api.get(url()), 200).find((x) => x.id === e.id)!;
    assert.equal(carolView.user_interested, true);
    assert.equal(expectStatus<ScheduledEvent[]>(await bob.api.get(url()), 200).find((x) => x.id === e.id)!.user_interested, false);
  } finally {
    await aliceGw.close();
  }
});

test('hide muted channels is stored per user per server and synced', async () => {
  const gw = await GatewayClient.connect(srv, bob.token);
  try {
    const before = expectStatus(await bob.api.get('/users/@me/guild-settings'), 200).find((s: any) => s.guild_id === guildId);
    assert.equal(before.hide_muted_channels, false);
    const s = expectStatus(await bob.api.patch(`/users/@me/guilds/${guildId}/settings`, { hide_muted_channels: true }), 200);
    assert.equal(s.hide_muted_channels, true);
    const ev = await gw.waitFor('USER_GUILD_SETTINGS_UPDATE', (d) => d.guild_id === guildId);
    assert.equal(ev.hide_muted_channels, true);
    // other settings keep it; other users don't get it
    const s2 = expectStatus(await bob.api.patch(`/users/@me/guilds/${guildId}/settings`, { muted: true }), 200);
    assert.equal(s2.hide_muted_channels, true);
    assert.equal(expectStatus(await carol.api.get('/users/@me/guild-settings'), 200).find((x: any) => x.guild_id === guildId).hide_muted_channels, false);
    assert.equal((await bob.api.patch(`/users/@me/guilds/${guildId}/settings`, { hide_muted_channels: 'yes' })).status, 400);
    // and it comes back in READY
    const gw2 = await GatewayClient.connect(srv, bob.token);
    try {
      const ready = gw2.dispatches.find((f) => f.t === 'READY')!.d;
      assert.equal(ready.user_guild_settings.find((x: any) => x.guild_id === guildId).hide_muted_channels, true);
    } finally { await gw2.close(); }
  } finally {
    await gw.close();
  }
});
