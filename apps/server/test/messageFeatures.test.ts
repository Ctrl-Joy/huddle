import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AttachmentFlags, MessageFlags, MessageType, Permissions } from '@huddle/shared';
import {
  GatewayClient, expectStatus, fakePng, joinGuild, register, setupGuild, startServer, type TestServer, type TestUser,
} from './helpers';
import { finalizeExpiredPolls } from '../src/services/polls';
import { extractUrls, isPrivateAddress, parsePreview, safeFetchHtml, type FetchedPage } from '../src/services/linkPreview';

let srv: TestServer;
let alice: TestUser, bob: TestUser, carol: TestUser;
let guildId: string, generalId: string;

// Stubbed link-preview fetcher: no network in tests.
const pages = new Map<string, string>();
const fetched: string[] = [];
async function fakeFetch(url: string): Promise<FetchedPage | null> {
  fetched.push(url);
  const html = pages.get(url);
  if (html === undefined) throw new Error('unreachable');
  return { url, html };
}

before(async () => {
  srv = await startServer({ fetchPage: fakeFetch });
  alice = await register(srv, 'alice');
  bob = await register(srv, 'bob');
  carol = await register(srv, 'carol');
  ({ guildId, generalId } = await setupGuild(alice, 'Features'));
  await joinGuild(alice, generalId, bob, carol);
});
after(async () => { await srv.close(); });

const poll = (extra: Record<string, unknown> = {}) => ({
  question: 'Lunch?', answers: [{ text: 'Pizza', emoji: '🍕' }, { text: 'Tacos' }, { text: 'Salad' }], duration: 24, ...extra,
});

// ---------------- polls ----------------

test('polls: create, vote, change, remove, realtime events', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const m = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { poll: poll() }), 200);
    assert.equal(m.content, '');
    assert.equal(m.poll.question, 'Lunch?');
    assert.deepEqual(m.poll.answers.map((a: any) => [a.answer_id, a.text, a.emoji, a.count]), [[1, 'Pizza', '🍕', 0], [2, 'Tacos', null, 0], [3, 'Salad', null, 0]]);
    assert.equal(m.poll.allow_multiselect, false);
    assert.equal(m.poll.ended, false);
    const hours = (Date.parse(m.poll.expires_at) - Date.now()) / 3600_000;
    assert.ok(hours > 23.9 && hours <= 24);
    const created = await bobGw.waitFor('MESSAGE_CREATE', (x) => x.id === m.id);
    assert.ok(created.poll);

    let v = expectStatus(await bob.api.put(`/channels/${generalId}/polls/${m.id}/votes`, { answer_ids: [2] }), 200);
    assert.deepEqual(v.poll.answers.map((a: any) => [a.count, a.me]), [[0, false], [1, true], [0, false]]);
    const add = await bobGw.waitFor('MESSAGE_POLL_VOTE_ADD', (x) => x.message_id === m.id);
    assert.deepEqual(add, { user_id: bob.user.id, channel_id: generalId, message_id: m.id, guild_id: guildId, answer_id: 2 });

    // change vote → one remove + one add
    v = expectStatus(await bob.api.put(`/channels/${generalId}/polls/${m.id}/votes`, { answer_ids: [1] }), 200);
    assert.deepEqual(v.poll.answers.map((a: any) => a.count), [1, 0, 0]);
    assert.equal((await bobGw.waitFor('MESSAGE_POLL_VOTE_REMOVE', (x) => x.message_id === m.id)).answer_id, 2);
    assert.equal((await bobGw.waitFor('MESSAGE_POLL_VOTE_ADD', (x) => x.message_id === m.id)).answer_id, 1);

    // alice's view counts bob but has me=false
    expectStatus(await carol.api.put(`/channels/${generalId}/polls/${m.id}/votes`, { answer_ids: [1] }), 200);
    const seen = expectStatus(await alice.api.get(`/channels/${generalId}/messages/${m.id}`), 200);
    assert.deepEqual(seen.poll.answers.map((a: any) => [a.count, a.me]), [[2, false], [0, false], [0, false]]);

    // remove vote
    v = expectStatus(await bob.api.del(`/channels/${generalId}/polls/${m.id}/votes`), 200);
    assert.deepEqual(v.poll.answers.map((a: any) => [a.count, a.me]), [[1, false], [0, false], [0, false]]);
    assert.equal((await bobGw.waitFor('MESSAGE_POLL_VOTE_REMOVE', (x) => x.message_id === m.id)).answer_id, 1);
  } finally {
    await bobGw.close();
  }
});

test('polls: single vs multi select, invalid answers and payloads', async () => {
  const single = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { poll: poll() }), 200);
  const r = await bob.api.put(`/channels/${generalId}/polls/${single.id}/votes`, { answer_ids: [1, 2] });
  assert.equal(r.status, 400);
  assert.equal((await bob.api.put(`/channels/${generalId}/polls/${single.id}/votes`, { answer_ids: [9] })).status, 400);
  assert.equal((await bob.api.put(`/channels/${generalId}/polls/${single.id}/votes`, { answer_ids: 'x' })).status, 400);

  const multi = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { poll: poll({ allow_multiselect: true, duration: 1 }) }), 200);
  assert.equal(multi.poll.allow_multiselect, true);
  const v = expectStatus(await bob.api.put(`/channels/${generalId}/polls/${multi.id}/votes`, { answer_ids: [1, 3, 3] }), 200);
  assert.deepEqual(v.poll.answers.map((a: any) => a.count), [1, 0, 1]);
  // one vote set per user: re-sending replaces, never duplicates
  const again = expectStatus(await bob.api.put(`/channels/${generalId}/polls/${multi.id}/votes`, { answer_ids: [1, 3] }), 200);
  assert.deepEqual(again.poll.answers.map((a: any) => a.count), [1, 0, 1]);

  // a plain message has no poll
  const plain = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { content: 'no poll' }), 200);
  assert.equal((await bob.api.put(`/channels/${generalId}/polls/${plain.id}/votes`, { answer_ids: [1] })).status, 400);

  const bad = async (p: unknown) => assert.equal((await alice.api.post(`/channels/${generalId}/messages`, { poll: p })).status, 400, JSON.stringify(p));
  await bad(poll({ answers: [{ text: 'only one' }] }));
  await bad(poll({ answers: Array.from({ length: 11 }, (_, i) => ({ text: `a${i}` })) }));
  await bad(poll({ answers: [{ text: '' }, { text: 'b' }] }));
  await bad(poll({ question: '' }));
  await bad(poll({ question: 'q'.repeat(301) }));
  await bad(poll({ answers: [{ text: 'x'.repeat(56) }, { text: 'b' }] }));
  await bad(poll({ duration: 5 }));
  await bad(poll({ allow_multiselect: 'yes' }));
  await bad('nope');
});

test('polls: expiry refuses votes, finalizer ends it and posts a result line', async () => {
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const m = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { poll: poll() }), 200);
    expectStatus(await bob.api.put(`/channels/${generalId}/polls/${m.id}/votes`, { answer_ids: [3] }), 200);
    srv.app.huddle.db.run('UPDATE polls SET expires_at = ? WHERE message_id = ?', new Date(Date.now() - 1000).toISOString(), m.id);

    const late = await carol.api.put(`/channels/${generalId}/polls/${m.id}/votes`, { answer_ids: [1] });
    assert.equal(late.status, 400);
    assert.match(late.body.message, /ended/);
    // even before the finalizer runs, readers see it as ended
    assert.equal(expectStatus(await carol.api.get(`/channels/${generalId}/messages/${m.id}`), 200).poll.ended, true);

    assert.ok(finalizeExpiredPolls(srv.app.huddle) >= 1);
    const upd = await bobGw.waitFor('MESSAGE_UPDATE', (x) => x.id === m.id);
    assert.equal(upd.poll!.ended, true);
    assert.equal(upd.poll!.answers[2].me, true); // per-viewer flags in the update
    const sys = await bobGw.waitFor('MESSAGE_CREATE', (x) => x.type === MessageType.POLL_RESULT);
    assert.equal(sys.message_reference?.message_id, m.id);
    assert.equal(sys.referenced_message?.poll?.question, 'Lunch?');
    assert.equal(finalizeExpiredPolls(srv.app.huddle), 0); // idempotent

    // only the author can end a poll early
    const m2 = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { poll: poll() }), 200);
    assert.equal((await bob.api.post(`/channels/${generalId}/polls/${m2.id}/expire`)).status, 403);
    const ended = expectStatus(await alice.api.post(`/channels/${generalId}/polls/${m2.id}/expire`), 200);
    assert.equal(ended.poll.ended, true);
    assert.equal((await alice.api.post(`/channels/${generalId}/polls/${m2.id}/expire`)).status, 400);
  } finally {
    await bobGw.close();
  }
});

// ---------------- forwarding ----------------

test('forward: copies content, reuses attachment files, respects permissions on both ends', async () => {
  const dm = expectStatus(await alice.api.post('/users/@me/channels', { recipient_ids: [bob.user.id] }), 200);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: 'see <@' + carol.user.id + '> pic' }));
  form.append('files[0]', new Blob([fakePng(4, 3)], { type: 'image/png' }), 'pic.png');
  const orig = expectStatus(await carol.api.post(`/channels/${generalId}/messages`, form), 200);

  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const out = expectStatus(await alice.api.post(`/channels/${generalId}/messages/${orig.id}/forward`, {
      channel_ids: [dm.id, generalId], content: 'look at this',
    }), 200);
    assert.equal(out.length, 2);
    const f = out[0];
    assert.equal(f.channel_id, dm.id);
    assert.equal(f.author.id, alice.user.id);
    assert.equal(f.content, 'look at this');
    assert.deepEqual(f.mentions, []); // the forwarded text doesn't ping anyone again
    assert.equal(f.attachments.length, 0);
    assert.equal(f.forward.message_id, orig.id);
    assert.equal(f.forward.channel_id, generalId);
    assert.equal(f.forward.guild_id, guildId);
    assert.equal(f.forward.author.id, carol.user.id);
    assert.equal(f.forward.content, orig.content);
    assert.equal(f.forward.created_at, orig.created_at);
    assert.equal(f.forward.attachments.length, 1);
    assert.equal(f.forward.attachments[0].url, orig.attachments[0].url); // same file, not a copy
    assert.notEqual(f.forward.attachments[0].id, orig.attachments[0].id);
    const got = await bobGw.waitFor('MESSAGE_CREATE', (x) => x.id === f.id);
    assert.equal(got.forward?.author.id, carol.user.id);

    const dir = path.join(srv.uploadsDir, 'attachments', generalId);
    assert.equal(fs.readdirSync(dir).filter((n) => n.endsWith('pic.png')).length, 1);

    // forwarding a forward carries the original along
    const again = expectStatus(await bob.api.post(`/channels/${dm.id}/messages/${f.id}/forward`, { channel_ids: [generalId] }), 200)[0];
    assert.equal(again.forward.message_id, orig.id);
    assert.equal(again.forward.author.id, carol.user.id);
    assert.equal(again.forward.attachments[0].url, orig.attachments[0].url);

    // deleting the original keeps the file while copies point at it
    expectStatus(await carol.api.del(`/channels/${generalId}/messages/${orig.id}`), 204);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await fetch(srv.base + orig.attachments[0].url)).status, 200);
    const still = expectStatus(await bob.api.get(`/channels/${dm.id}/messages/${f.id}`), 200);
    assert.equal(still.forward.attachments[0].url, orig.attachments[0].url);
  } finally {
    await bobGw.close();
  }

  // destination permissions: no SEND_MESSAGES / ATTACH_FILES / invisible channel
  const ro = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'read-only' }), 200);
  expectStatus(await alice.api.put(`/channels/${ro.id}/permissions/${guildId}`, { type: 0, allow: '0', deny: Permissions.SEND_MESSAGES.toString() }), 204);
  const noFiles = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, { name: 'no-files' }), 200);
  expectStatus(await alice.api.put(`/channels/${noFiles.id}/permissions/${guildId}`, { type: 0, allow: '0', deny: Permissions.ATTACH_FILES.toString() }), 204);
  const hidden = expectStatus(await alice.api.post(`/guilds/${guildId}/channels`, {
    name: 'hidden', permission_overwrites: [{ id: guildId, type: 0, allow: '0', deny: Permissions.VIEW_CHANNEL.toString() }],
  }), 200);
  const text = expectStatus(await bob.api.post(`/channels/${generalId}/messages`, { content: 'plain words' }), 200);
  const withFile = new FormData();
  withFile.append('files[0]', new Blob([fakePng(2, 2)], { type: 'image/png' }), 'x.png');
  const fileMsg = expectStatus(await bob.api.post(`/channels/${generalId}/messages`, withFile), 200);

  assert.equal((await bob.api.post(`/channels/${generalId}/messages/${text.id}/forward`, { channel_ids: [ro.id] })).status, 403);
  assert.equal((await bob.api.post(`/channels/${generalId}/messages/${text.id}/forward`, { channel_ids: [hidden.id] })).status, 403);
  expectStatus(await bob.api.post(`/channels/${generalId}/messages/${text.id}/forward`, { channel_ids: [noFiles.id] }), 200);
  assert.equal((await bob.api.post(`/channels/${generalId}/messages/${fileMsg.id}/forward`, { channel_ids: [noFiles.id] })).status, 403);
  // nothing is created when any destination fails
  const before = expectStatus(await bob.api.get(`/channels/${generalId}/messages?limit=1`), 200)[0].id;
  assert.equal((await bob.api.post(`/channels/${generalId}/messages/${text.id}/forward`, { channel_ids: [generalId, ro.id] })).status, 403);
  assert.equal(expectStatus(await bob.api.get(`/channels/${generalId}/messages?limit=1`), 200)[0].id, before);

  // source permissions: can't forward what you can't read
  const secretMsg = expectStatus(await alice.api.post(`/channels/${hidden.id}/messages`, { content: 'secret' }), 200);
  assert.equal((await bob.api.post(`/channels/${hidden.id}/messages/${secretMsg.id}/forward`, { channel_ids: [generalId] })).status, 403);
  // system messages and polls can't be forwarded; bad bodies are rejected
  const p = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, { poll: poll() }), 200);
  assert.equal((await alice.api.post(`/channels/${generalId}/messages/${p.id}/forward`, { channel_ids: [generalId] })).status, 400);
  assert.equal((await alice.api.post(`/channels/${generalId}/messages/${text.id}/forward`, { channel_ids: [] })).status, 400);
  assert.equal((await alice.api.post(`/channels/${generalId}/messages/${text.id}/forward`, { channel_ids: ['1', '2', '3', '4', '5', '6'] })).status, 400);
});

// ---------------- link previews ----------------

test('link previews: extracted, fetched via the stub, stored, dispatched; suppress embeds', async () => {
  pages.set('https://news.example/story', `<!doctype html><html><head>
    <title>Fallback title</title>
    <meta property="og:title" content="Big &amp; Bold News">
    <meta property="og:description" content="Something happened.">
    <meta property="og:site_name" content="Example News">
    <meta property="og:image" content="/img/cover.png">
    <meta name="theme-color" content="#ff8800">
  </head><body>hi</body></html>`);
  pages.set('https://plain.example/', '<html><head><title>Just a title</title><meta name="description" content="desc"></head></html>');
  const bobGw = await GatewayClient.connect(srv, bob.token);
  try {
    const m = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, {
      content: 'read https://news.example/story, and https://plain.example/ and <https://hidden.example/> `https://code.example/`',
    }), 200);
    assert.deepEqual(m.embeds, []);
    const upd = await bobGw.waitFor('MESSAGE_UPDATE', (x) => x.id === m.id && !!x.embeds?.length);
    assert.equal(upd.embeds!.length, 2);
    const e = upd.embeds![0];
    assert.equal(e.url, 'https://news.example/story');
    assert.equal(e.title, 'Big & Bold News');
    assert.equal(e.description, 'Something happened.');
    assert.equal(e.site_name, 'Example News');
    assert.equal(e.image?.url, 'https://news.example/img/cover.png');
    assert.equal(e.color, 0xff8800);
    assert.equal(upd.embeds![1].title, 'Just a title');
    assert.ok(!fetched.some((u) => u.includes('hidden.example') || u.includes('code.example')));

    // only the author (or a moderator) can suppress
    assert.equal((await bob.api.post(`/channels/${generalId}/messages/${m.id}/suppress-embeds`, { suppress: true })).status, 403);
    const s = expectStatus(await alice.api.post(`/channels/${generalId}/messages/${m.id}/suppress-embeds`, { suppress: true }), 200);
    assert.deepEqual(s.embeds, []);
    assert.equal(s.flags & MessageFlags.SUPPRESS_EMBEDS, MessageFlags.SUPPRESS_EMBEDS);
    const su = await bobGw.waitFor('MESSAGE_UPDATE', (x) => x.id === m.id && !x.embeds?.length);
    assert.equal(su.flags! & MessageFlags.SUPPRESS_EMBEDS, MessageFlags.SUPPRESS_EMBEDS);
    const back = expectStatus(await alice.api.post(`/channels/${generalId}/messages/${m.id}/suppress-embeds`, { suppress: false }), 200);
    assert.equal(back.embeds.length, 2);

    // editing the links away clears the previews
    expectStatus(await alice.api.patch(`/channels/${generalId}/messages/${m.id}`, { content: 'no links now' }), 200);
    await srv.app.huddle.previews.settle();
    assert.deepEqual(expectStatus(await alice.api.get(`/channels/${generalId}/messages/${m.id}`), 200).embeds, []);

    // at most 3 urls per message; failures just mean no preview
    fetched.length = 0;
    const many = expectStatus(await alice.api.post(`/channels/${generalId}/messages`, {
      content: 'https://a.example/1 https://a.example/2 https://a.example/3 https://a.example/4',
    }), 200);
    await srv.app.huddle.previews.settle();
    assert.deepEqual(fetched, ['https://a.example/1', 'https://a.example/2', 'https://a.example/3']);
    assert.deepEqual(expectStatus(await alice.api.get(`/channels/${generalId}/messages/${many.id}`), 200).embeds, []);
  } finally {
    await bobGw.close();
  }
});

test('link previews: parsing and url extraction edge cases', () => {
  assert.deepEqual(extractUrls('(see https://x.example/a_(b)) and https://y.example/q?x=1. ftp://z.example javascript:alert(1)'),
    ['https://x.example/a_(b)', 'https://y.example/q?x=1']);
  assert.equal(parsePreview('<html><head></head><body><h1>t</h1></body></html>', 'https://e.example/'), null);
  const p = parsePreview(`<head><meta content="Twitter T" name="twitter:title"><meta name='twitter:image' content='javascript:alert(1)'></head>`, 'https://e.example/x');
  assert.equal(p?.title, 'Twitter T');
  assert.equal(p?.image, null);
  assert.equal(p?.site_name, 'e.example');
});

test('SSRF: private, loopback, link-local, reserved addresses are refused (v4 + v6)', () => {
  for (const ip of [
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '198.18.0.1', '192.0.2.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '2001:db8::1', '2002:7f00:1::1', 'not-an-ip',
  ]) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111', '2a00:1450:4001::200e', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('SSRF: the real fetcher refuses private targets directly and via redirects', async () => {
  let hits = 0;
  const fixture = http.createServer((req, res) => {
    hits++;
    if (req.url === '/to-private') { res.writeHead(302, { location: 'http://internal.test/admin' }); res.end(); return; }
    if (req.url === '/to-loopback-literal') { res.writeHead(301, { location: 'http://127.0.0.2/' }); res.end(); return; }
    if (req.url?.startsWith('/loop')) { res.writeHead(302, { location: `/loop${Number(req.url.slice(5) || 0) + 1}` }); res.end(); return; }
    if (req.url === '/json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
    if (req.url === '/big') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><head><title>big</title></head>' + 'x'.repeat(2 * 1024 * 1024));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'a=b' });
    res.end(`<html><head><title>ok</title></head></html>cookie=${req.headers.cookie ?? ''}`);
  });
  await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', () => r()));
  const port = (fixture.address() as { port: number }).port;
  // Pretend public.test is a public host that happens to be our loopback fixture; everything else uses the real policy.
  const lookup = async (host: string) => {
    if (host === 'public.test') return [{ address: '127.0.0.1', family: 4 }];
    if (host === 'internal.test') return [{ address: '10.0.0.5', family: 4 }];
    if (host === 'mixed.test') return [{ address: '8.8.8.8', family: 4 }, { address: '192.168.0.10', family: 4 }];
    throw new Error('ENOTFOUND');
  };
  const opts = { lookup, isBlocked: (ip: string) => ip !== '127.0.0.1' && isPrivateAddress(ip) };
  const base = `http://public.test:${port}`;
  try {
    // with the real policy, loopback is refused before any connection
    await assert.rejects(safeFetchHtml(`http://127.0.0.1:${port}/`), /not a public address/);
    await assert.rejects(safeFetchHtml(`http://[::1]:${port}/`), /not a public address/);
    await assert.rejects(safeFetchHtml(`http://public.test:${port}/`, { lookup }), /not a public address/);
    assert.equal(hits, 0);

    const ok = await safeFetchHtml(`${base}/`, opts);
    assert.match(ok.html, /<title>ok<\/title>/);
    assert.match(ok.html, /cookie=$/); // never sends cookies

    await assert.rejects(safeFetchHtml(`${base}/to-private`, opts), /10\.0\.0\.5 is not a public address/);
    await assert.rejects(safeFetchHtml(`${base}/to-loopback-literal`, opts), /127\.0\.0\.2 is not a public address/);
    await assert.rejects(safeFetchHtml(`http://mixed.test:${port}/`, opts), /192\.168\.0\.10/); // any bad address → refuse
    await assert.rejects(safeFetchHtml(`${base}/loop0`, opts), /too many redirects/);
    await assert.rejects(safeFetchHtml(`${base}/json`, opts), /not an html page/);
    await assert.rejects(safeFetchHtml('file:///etc/passwd', opts), /only http/);
    await assert.rejects(safeFetchHtml(`http://user:pw@public.test:${port}/`, opts), /credentials/);
    const big = await safeFetchHtml(`${base}/big`, opts);
    assert.ok(big.html.length <= 1024 * 1024);
    assert.match(big.html, /<title>big<\/title>/);
  } finally {
    await new Promise<void>((r) => fixture.close(() => r()));
  }
});

// ---------------- voice messages ----------------

test('voice messages: flagged attachment with duration and waveform; validation', async () => {
  const wave = Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 4) % 256)).toString('base64');
  const send = (meta: unknown, files: [Buffer, string, string][]) => {
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ voice_message: meta }));
    files.forEach(([b, type, name], i) => form.append(`files[${i}]`, new Blob([b], { type }), name));
    return bob.api.post(`/channels/${generalId}/messages`, form);
  };
  const audio = Buffer.from('OggS fake opus data');
  const m = expectStatus(await send({ duration_secs: 3.456, waveform: wave }, [[audio, 'audio/webm;codecs=opus', 'voice-message.webm']]), 200);
  assert.equal(m.flags & MessageFlags.IS_VOICE_MESSAGE, MessageFlags.IS_VOICE_MESSAGE);
  const a = m.attachments[0];
  assert.equal(a.flags & AttachmentFlags.IS_VOICE_MESSAGE, AttachmentFlags.IS_VOICE_MESSAGE);
  assert.equal(a.duration_secs, 3.46);
  assert.equal(a.waveform, wave);
  assert.ok(a.content_type.startsWith('audio/'));
  // round-trips through history
  const hist = expectStatus(await alice.api.get(`/channels/${generalId}/messages/${m.id}`), 200);
  assert.equal(hist.attachments[0].waveform, wave);

  // a container-labelled webm is accepted as audio
  const v = expectStatus(await send({ duration_secs: 1 }, [[audio, 'video/webm', 'voice.webm']]), 200);
  assert.equal(v.attachments[0].content_type, 'audio/webm');
  assert.equal(v.attachments[0].waveform, undefined);

  assert.equal((await send({ duration_secs: 2 }, [[fakePng(2, 2), 'image/png', 'x.png']])).status, 400);
  assert.equal((await send({ duration_secs: 0 }, [[audio, 'audio/ogg', 'v.ogg']])).status, 400);
  assert.equal((await send({ duration_secs: 999 }, [[audio, 'audio/ogg', 'v.ogg']])).status, 400);
  assert.equal((await send({ duration_secs: 2, waveform: '***' }, [[audio, 'audio/ogg', 'v.ogg']])).status, 400);
  assert.equal((await send({ duration_secs: 2, waveform: Buffer.alloc(300).toString('base64') }, [[audio, 'audio/ogg', 'v.ogg']])).status, 400);
  assert.equal((await send({ duration_secs: 2 }, [[audio, 'audio/ogg', 'a.ogg'], [audio, 'audio/ogg', 'b.ogg']])).status, 400);
  assert.equal((await send({ duration_secs: 2 }, [])).status, 400);

  // forwarding a voice message keeps it a voice message and reuses the file
  const fw = expectStatus(await alice.api.post(`/channels/${generalId}/messages/${m.id}/forward`, { channel_ids: [generalId] }), 200)[0];
  assert.equal(fw.flags & MessageFlags.IS_VOICE_MESSAGE, MessageFlags.IS_VOICE_MESSAGE);
  assert.equal(fw.forward.attachments[0].waveform, wave);
  assert.equal(fw.forward.attachments[0].url, a.url);
});
