import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, MessageType, Permissions } from '@huddle/shared';
import {
  GatewayClient, expectStatus, joinGuild, register, setupGuild, startServer, type TestServer, type TestUser,
} from './helpers';
import { archiveStaleThreads } from '../src/services/threads';

let srv: TestServer;
let alice: TestUser, bob: TestUser, carol: TestUser;
let guildId: string, generalId: string;

before(async () => {
  srv = await startServer();
  alice = await register(srv, 'alice');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
  ({ guildId, generalId } = await setupGuild(alice, 'Threads'));
  await joinGuild(alice, generalId, bob, carol);
});
after(async () => { await srv.close(); });

test('thread from a message: chip, system message, gateway events, thread messages', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const root = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { content: 'big plans\nsecond line' }), 200);
    const t = expectStatus(await bob.api.post(`/channels/${generalId}/messages/${root.id}/threads`, {}), 200);
    assert.equal(t.type, ChannelType.PUBLIC_THREAD);
    assert.equal(t.parent_id, generalId);
    assert.equal(t.guild_id, guildId);
    assert.equal(t.name, 'big plans'); // defaults to the first line
    assert.equal(t.owner_id, bob.user.id);
    assert.equal(t.starter_message_id, root.id);
    assert.equal(t.message_count, 0);
    assert.equal(t.thread_metadata.archived, false);
    assert.deepEqual(t.permission_overwrites, []);

    const created = await bobGw.waitFor('THREAD_CREATE', (x) => x.id === t.id);
    assert.equal(created.name, 'big plans');
    const sys = await bobGw.waitFor('MESSAGE_CREATE', (x) => x.type === MessageType.THREAD_CREATED);
    assert.equal(sys.channel_id, generalId);
    assert.equal(sys.content, 'big plans');
    assert.equal(sys.thread?.id, t.id);
    const upd = await bobGw.waitFor('MESSAGE_UPDATE', (x) => x.id === root.id);
    assert.equal(upd.thread?.id, t.id);

    // one thread per message; no threads from system messages
    assert.equal((await alice.api.post(`/channels/${generalId}/messages/${root.id}/threads`, { name: 'again' })).status, 400);
    assert.equal((await alice.api.post(`/channels/${generalId}/messages/${sys.id}/threads`, { name: 'x' })).status, 400);

    // normal message endpoints work inside the thread and bump its counters
    const m = expectStatus(await carol.api.post(`/channels/${t.id}/messages`, { content: `hey <@${alice.user.id}>` }), 200);
    assert.equal(m.channel_id, t.id);
    assert.equal(m.guild_id, guildId);
    const bumped = await bobGw.waitFor('THREAD_UPDATE', (x) => x.id === t.id && x.message_count === 1);
    assert.equal(bumped.last_message_id, m.id);
    await bobGw.waitFor('MESSAGE_CREATE', (x) => x.id === m.id);
    const hist = expectStatus(await bob.api.get(`/channels/${t.id}/messages`), 200);
    assert.deepEqual(hist.map((x: any) => x.id), [m.id]);

    // parent history carries the chip with live counts
    const parentHist = expectStatus(await bob.api.get(`/channels/${generalId}/messages?limit=5`), 200);
    const withChip = parentHist.find((x: any) => x.id === root.id);
    assert.equal(withChip.thread.id, t.id);
    assert.equal(withChip.thread.message_count, 1);

    // read states work per thread
    const ack = expectStatus(await alice.api.post(`/channels/${t.id}/messages/${m.id}/ack`), 200);
    assert.deepEqual(ack, { channel_id: t.id, last_read_message_id: m.id, mention_count: 0 });

    // deleting a thread message decrements the count
    expectStatus(await carol.api.del(`/channels/${t.id}/messages/${m.id}`), 204);
    await bobGw.waitFor('THREAD_UPDATE', (x) => x.id === t.id && x.message_count === 0);
  } finally {
    await bobGw.close();
  }
});

test('mentions inside a thread land on the thread read state (READY includes active threads)', async () => {
  const t = expectStatus(await alice.api.post(`/channels/${generalId}/threads`, { name: 'ping zone' }), 200);
  expectStatus(await bob.api.post(`/channels/${t.id}/messages`, { content: `<@${carol.user.id}> look` }), 200);
  const gw = await GatewayClient.connect(srv, carol.token);
  try {
    const f = gw.dispatches.find((x) => x.t === 'READY')!;
    const rs = f.d.read_states.find((r: any) => r.channel_id === t.id);
    assert.equal(rs?.mention_count, 1);
    const g = f.d.guilds.find((x: any) => x.id === guildId);
    assert.ok(g.threads.some((x: any) => x.id === t.id));
    assert.ok(!g.channels.some((x: any) => x.id === t.id), 'threads are not regular guild channels');
  } finally {
    await gw.close();
  }
});

test('create, list, archive / unarchive (owner or MANAGE_THREADS), auto-archive, delete', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const t = expectStatus(await carol.api.post(`/channels/${generalId}/threads`, { name: 'side quest', auto_archive_duration: 60 }), 200);
    assert.equal(t.thread_metadata.auto_archive_duration, 60);
    await bobGw.waitFor('THREAD_CREATE', (x) => x.id === t.id);
    assert.equal((await carol.api.post(`/channels/${generalId}/threads`, { name: 'x', auto_archive_duration: 7 })).status, 400);
    assert.equal((await carol.api.post(`/channels/${generalId}/threads`, {})).status, 400);

    let list = expectStatus(await bob.api.get(`/channels/${generalId}/threads`), 200);
    assert.ok(list.threads.some((x: any) => x.id === t.id));
    assert.equal(list.has_more, false);

    // bob (no MANAGE_THREADS, not owner) can't archive or rename
    assert.equal((await bob.api.patch(`/channels/${t.id}`, { archived: true })).status, 403);
    assert.equal((await bob.api.patch(`/channels/${t.id}`, { name: 'mine now' })).status, 403);
    // owner can
    const arch = expectStatus(await carol.api.patch(`/channels/${t.id}`, { archived: true }), 200);
    assert.equal(arch.thread_metadata.archived, true);
    await bobGw.waitFor('THREAD_UPDATE', (x) => x.id === t.id && x.thread_metadata?.archived === true);
    list = expectStatus(await bob.api.get(`/channels/${generalId}/threads`), 200);
    assert.ok(!list.threads.some((x: any) => x.id === t.id));
    list = expectStatus(await bob.api.get(`/channels/${generalId}/threads?archived=true`), 200);
    assert.ok(list.threads.some((x: any) => x.id === t.id));

    // server owner (MANAGE_THREADS) can unarchive; posting also unarchives
    expectStatus(await alice.api.patch(`/channels/${t.id}`, { archived: false }), 200);
    expectStatus(await carol.api.patch(`/channels/${t.id}`, { archived: true, name: 'side quest 2' }), 200);
    expectStatus(await bob.api.post(`/channels/${t.id}/messages`, { content: 'revive' }), 200);
    const revived = expectStatus(await bob.api.get(`/channels/${t.id}`), 200);
    assert.equal(revived.thread_metadata.archived, false);
    assert.equal(revived.name, 'side quest 2');

    // auto-archive after inactivity
    assert.ok(archiveStaleThreads(srv.app.huddle, Date.now() + 2 * 60 * 60_000) >= 1);
    await bobGw.waitFor('THREAD_UPDATE', (x) => x.id === t.id && x.thread_metadata?.archived === true);

    // delete: not bob; owner can
    assert.equal((await bob.api.del(`/channels/${t.id}`)).status, 403);
    expectStatus(await carol.api.del(`/channels/${t.id}`), 200);
    await bobGw.waitFor('THREAD_DELETE', (x) => x.id === t.id && x.parent_id === generalId);
    assert.equal((await bob.api.get(`/channels/${t.id}`)).status, 404);
  } finally {
    await bobGw.close();
  }
});

test('thread permissions inherit the parent; CREATE_THREADS / SEND_MESSAGES_IN_THREADS gate actions', async () => {
  const priv = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, {
    name: 'staff', permission_overwrites: [{ id: guildId, type: 0, deny: Permissions.VIEW_CHANNEL.toString(), allow: '0' }],
  }), 200);
  const hidden = expectStatus(await alice.api.post(`/channels/${priv.id}/threads`, { name: 'secret' }), 200);
  assert.equal((await bob.api.get(`/channels/${hidden.id}`)).status, 403);
  assert.equal((await bob.api.get(`/channels/${hidden.id}/messages`)).status, 403);
  assert.equal((await bob.api.post(`/channels/${hidden.id}/messages`, { content: 'hi' })).status, 403);

  // deny SEND_MESSAGES_IN_THREADS for @everyone in general: bob can still talk in general but not in its threads
  const t = expectStatus(await alice.api.post(`/channels/${generalId}/threads`, { name: 'quiet' }), 200);
  const ow = (allow: bigint, deny: bigint) => alice.api.put(`/channels/${generalId}/permissions/${guildId}`, {
    type: 0, allow: allow.toString(), deny: deny.toString(),
  });
  expectStatus(await ow(0n, Permissions.SEND_MESSAGES_IN_THREADS), 204);
  assert.equal((await bob.api.post(`/channels/${t.id}/messages`, { content: 'no' })).status, 403);
  expectStatus(await bob.api.post(`/channels/${generalId}/messages`, { content: 'yes' }), 200);
  // ...and SEND_MESSAGES denied in the parent doesn't stop thread replies when SEND_MESSAGES_IN_THREADS is allowed
  expectStatus(await ow(0n, Permissions.SEND_MESSAGES), 204);
  expectStatus(await bob.api.post(`/channels/${t.id}/messages`, { content: 'thread ok' }), 200);
  assert.equal((await bob.api.post(`/channels/${generalId}/messages`, { content: 'parent no' })).status, 403);
  // CREATE_THREADS denied
  expectStatus(await ow(0n, Permissions.CREATE_THREADS), 204);
  assert.equal((await bob.api.post(`/channels/${generalId}/threads`, { name: 'nope' })).status, 403);
  const msg = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { content: 'root' }), 200);
  assert.equal((await bob.api.post(`/channels/${generalId}/messages/${msg.id}/threads`, { name: 'nope' })).status, 403);
  expectStatus(await alice.api.del(`/channels/${generalId}/permissions/${guildId}`), 204);

  // threads can't nest, and voice channels can't have them
  assert.equal((await alice.api.post(`/channels/${t.id}/threads`, { name: 'nested' })).status, 400);
  const voice = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'Talk', type: ChannelType.GUILD_VOICE }), 200);
  assert.equal((await alice.api.post(`/channels/${voice.id}/threads`, { name: 'x' })).status, 400);

  // deleting the parent removes its threads
  const tmp = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'tmp' }), 200);
  const tt = expectStatus(await alice.api.post(`/channels/${tmp.id}/threads`, { name: 'goes away' }), 200);
  expectStatus(await alice.api.del(`/channels/${tmp.id}`), 200);
  assert.equal((await alice.api.get(`/channels/${tt.id}`)).status, 404);
});

test('forum channels: tags, posts with starter message, filters and sort', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const forum = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, {
      name: 'Help Desk', type: ChannelType.GUILD_FORUM, available_tags: [{ name: 'bug', emoji: '🐛' }, { name: 'idea' }],
    }), 200);
    assert.equal(forum.type, ChannelType.GUILD_FORUM);
    assert.equal(forum.name, 'help-desk');
    assert.equal(forum.available_tags.length, 2);
    const [bug, idea] = forum.available_tags;
    assert.equal(bug.emoji, '🐛');
    assert.equal(idea.emoji, null);

    // managers edit tags (ids are kept); members can't; max 10
    assert.equal((await bob.api.patch(`/channels/${forum.id}`, { available_tags: [] })).status, 403);
    const tooMany = Array.from({ length: 11 }, (_, i) => ({ name: `t${i}` }));
    assert.equal((await alice.api.patch(`/channels/${forum.id}`, { available_tags: tooMany })).status, 400);
    const edited = expectStatus(await alice.api.patch(`/channels/${forum.id}`, {
      available_tags: [bug, idea, { name: 'question', emoji: '❓' }],
    }), 200);
    assert.equal(edited.available_tags[0].id, bug.id);
    const question = edited.available_tags[2];

    // no direct messages in a forum
    assert.equal((await bob.api.post(`/channels/${forum.id}/messages`, { content: 'hi' })).status, 400);
    // a post needs a title and a message; tags must exist
    assert.equal((await bob.api.post(`/channels/${forum.id}/threads`, { name: 'empty' })).status, 400);
    assert.equal((await bob.api.post(`/channels/${forum.id}/threads`, { name: 'x', message: { content: 'y' }, applied_tags: ['1'] })).status, 400);

    const p1 = expectStatus(await bob.api.post(`/channels/${forum.id}/threads`, {
      name: 'Crash on login', message: { content: 'It crashes when I log in' }, applied_tags: [bug.id],
    }), 200);
    assert.equal(p1.type, ChannelType.PUBLIC_THREAD);
    assert.equal(p1.parent_id, forum.id);
    assert.deepEqual(p1.applied_tags, [bug.id]);
    assert.equal(p1.message_count, 0);
    assert.equal(p1.starter_message.content, 'It crashes when I log in');
    assert.equal(p1.starter_message.channel_id, p1.id);
    assert.equal(p1.starter_message_id, p1.starter_message.id);
    const ev = await bobGw.waitFor('THREAD_CREATE', (x) => x.id === p1.id);
    assert.equal(ev.starter_message?.content, 'It crashes when I log in');
    // the forum's last_message_id tracks new posts (for unread)
    assert.equal(expectStatus(await bob.api.get(`/channels/${forum.id}`), 200).last_message_id, p1.starter_message_id);
    // the starter message has no thread chip inside its own thread
    const inThread = expectStatus(await bob.api.get(`/channels/${p1.id}/messages`), 200);
    assert.equal(inThread[0].thread, undefined);

    const p2 = expectStatus(await carol.api.post(`/channels/${forum.id}/threads`, {
      name: 'Dark mode please', message: { content: 'pretty please' }, applied_tags: [idea.id, question.id],
    }), 200);
    const p3 = expectStatus(await carol.api.post(`/channels/${forum.id}/threads`, {
      name: 'Login 100% broken_again', message: { content: 'same here' },
    }), 200);
    // reply to p1 → p1 has the latest activity; replies count
    expectStatus(await alice.api.post(`/channels/${p1.id}/messages`, { content: 'looking into it' }), 200);

    const ids = (r: any) => r.threads.map((x: any) => x.id);
    const latest = expectStatus(await bob.api.get(`/channels/${forum.id}/threads?archived=all`), 200);
    assert.deepEqual(ids(latest), [p1.id, p3.id, p2.id]);
    assert.equal(latest.threads[0].message_count, 1);
    assert.equal(latest.threads[0].starter_message.content, 'It crashes when I log in');
    const created = expectStatus(await bob.api.get(`/channels/${forum.id}/threads?archived=all&sort=created`), 200);
    assert.deepEqual(ids(created), [p3.id, p2.id, p1.id]);
    const byTitle = expectStatus(await bob.api.get(`/channels/${forum.id}/threads?q=login`), 200);
    assert.deepEqual(ids(byTitle).sort(), [p1.id, p3.id].sort());
    const literal = expectStatus(await bob.api.get(`/channels/${forum.id}/threads?q=${encodeURIComponent('100%')}`), 200);
    assert.deepEqual(ids(literal), [p3.id]);
    const byTag = expectStatus(await bob.api.get(`/channels/${forum.id}/threads?tag=${idea.id}`), 200);
    assert.deepEqual(ids(byTag), [p2.id]);
    const paged = expectStatus(await bob.api.get(`/channels/${forum.id}/threads?limit=2`), 200);
    assert.equal(paged.threads.length, 2);
    assert.equal(paged.has_more, true);

    // post owner retags; others can't
    assert.equal((await bob.api.patch(`/channels/${p2.id}`, { applied_tags: [] })).status, 403);
    const retag = expectStatus(await carol.api.patch(`/channels/${p2.id}`, { applied_tags: [question.id] }), 200);
    assert.deepEqual(retag.applied_tags, [question.id]);
    await bobGw.waitFor('THREAD_UPDATE', (x) => x.id === p2.id && x.applied_tags?.length === 1);
    // tags only on forum posts
    const t = expectStatus(await alice.api.post(`/channels/${generalId}/threads`, { name: 'plain' }), 200);
    assert.equal((await alice.api.patch(`/channels/${t.id}`, { applied_tags: [] })).status, 400);

    // forum post creation is gated by SEND_MESSAGES on the forum
    expectStatus(await alice.api.put(`/channels/${forum.id}/permissions/${guildId}`, {
      type: 0, allow: '0', deny: Permissions.SEND_MESSAGES.toString(),
    }), 204);
    assert.equal((await bob.api.post(`/channels/${forum.id}/threads`, { name: 'x', message: { content: 'y' } })).status, 403);
    // ...but replying in posts still works (SEND_MESSAGES_IN_THREADS)
    expectStatus(await bob.api.post(`/channels/${p1.id}/messages`, { content: 'thanks' }), 200);
  } finally {
    await bobGw.close();
  }
});

test('announcement channels: only MANAGE_MESSAGES holders post; threads still open to members', async () => {
  const ann = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'News Feed', type: ChannelType.GUILD_ANNOUNCEMENT }), 200);
  assert.equal(ann.type, ChannelType.GUILD_ANNOUNCEMENT);
  assert.equal(ann.name, 'news-feed');
  const post = expectStatus(await alice.api.post(`/channels/${ann.id}/messages`, { content: 'v2 is out' }), 200);
  assert.equal((await bob.api.post(`/channels/${ann.id}/messages`, { content: 'me too' })).status, 403);
  assert.equal((await bob.api.post(`/channels/${ann.id}/typing`)).status, 403);
  expectStatus(await bob.api.get(`/channels/${ann.id}/messages`), 200);

  // a role with MANAGE_MESSAGES can post
  const role = expectStatus(await alice.api.post(`/guilds/${guildId}/roles`, {
    name: 'Mods', permissions: Permissions.MANAGE_MESSAGES.toString(),
  }), 200);
  expectStatus(await alice.api.patch(`/guilds/${guildId}/members/${carol.user.id}`, { roles: [role.id] }), 200);
  expectStatus(await carol.api.post(`/channels/${ann.id}/messages`, { content: 'mod note' }), 200);

  // discussion threads on announcements are open to everyone
  const t = expectStatus(await bob.api.post(`/channels/${ann.id}/messages/${post.id}/threads`, { name: 'v2 talk' }), 200);
  expectStatus(await bob.api.post(`/channels/${t.id}/messages`, { content: 'nice' }), 200);
});
