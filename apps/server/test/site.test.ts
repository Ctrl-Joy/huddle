import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { client, expectStatus, register, startServer, type TestServer, type TestUser } from './helpers';
import { MemoryTransport } from '../src/services/mailer';

const BIG = { capacity: 100_000, windowMs: 1000 };
const CONTACT = 'owner@contact.example';
const MSG = 'The voice room disconnects after a minute.';

describe('GET /api/status', () => {
  let srv: TestServer;
  const saved = process.env.HUDDLE_TURN_URL;
  before(async () => { srv = await startServer({ gifApiKey: null }); });
  after(async () => {
    if (saved === undefined) delete process.env.HUDDLE_TURN_URL; else process.env.HUDDLE_TURN_URL = saved;
    await srv.close();
  });

  test('public, only booleans and harmless values', async () => {
    process.env.HUDDLE_TURN_URL = 'turn:secret-relay.example:3478';
    const r = await client(srv).get('/status');
    const s = expectStatus(r, 200);
    assert.equal(s.ok, true);
    assert.equal(s.api, true);
    assert.equal(s.realtime, true);
    assert.equal(s.call_relay, true);
    assert.equal(s.email, false);
    assert.equal(s.gifs, false);
    assert.equal(typeof s.uptime_seconds, 'number');
    assert.equal(typeof s.version, 'string');
    assert.ok(!Number.isNaN(Date.parse(s.time)));
    assert.deepEqual(Object.keys(s).sort(), ['api', 'call_relay', 'email', 'gifs', 'ok', 'realtime', 'time', 'uptime_seconds', 'version']);
    assert.ok(!JSON.stringify(s).includes('secret-relay'), 'relay address must not leak');
  });

  test('relay off when HUDDLE_TURN_URL is empty', async () => {
    process.env.HUDDLE_TURN_URL = '';
    assert.equal(expectStatus(await client(srv).get('/status'), 200).call_relay, false);
  });
});

describe('POST /api/feedback', () => {
  let srv: TestServer;
  let mail: MemoryTransport;
  let alice: TestUser;
  before(async () => {
    mail = new MemoryTransport();
    srv = await startServer({
      mailTransport: mail, requireEmailVerification: false, contactEmail: CONTACT,
      rateLimits: { messages: BIG, writes: BIG, auth: BIG, feedbackPerIp: BIG, feedbackPerUser: BIG },
    });
    alice = await register(srv, 'alice');
  });
  after(async () => { await srv.close(); });

  const rows = () => srv.app.huddle.db.all<any>('SELECT * FROM feedback ORDER BY created_at, id');

  test('validates category, length and email', async () => {
    const api = client(srv);
    assert.equal((await api.post('/feedback', { category: 'nope', message: MSG })).status, 400);
    assert.equal((await api.post('/feedback', { message: MSG })).status, 400);
    assert.equal((await api.post('/feedback', { category: 'bug', message: 'too short' })).status, 400);
    assert.equal((await api.post('/feedback', { category: 'bug', message: 'x'.repeat(2001) })).status, 400);
    assert.equal((await api.post('/feedback', { category: 'bug', message: MSG, email: 'not-an-email' })).status, 400);
    assert.equal((await api.post('/feedback', { category: 'bug', message: MSG, include_username: 'yes' })).status, 400);
    assert.equal(rows().length, 0);
  });

  test('stores the message with a hashed IP, and emails the contact address', async () => {
    const r = await client(srv).post('/feedback', { category: 'idea', message: MSG, email: 'me@reply.example' });
    assert.deepEqual(expectStatus(r, 200), { ok: true });
    const [row] = rows();
    assert.equal(row.category, 'idea');
    assert.equal(row.message, MSG);
    assert.equal(row.email, 'me@reply.example');
    assert.equal(row.user_id, null);
    assert.match(row.ip_hash, /^[0-9a-f]{32}$/);
    assert.ok(!row.ip_hash.includes('127.0.0.1'));
    await srv.app.huddle.mail.settle();
    const m = mail.last(CONTACT);
    assert.ok(m, 'mail to the contact address');
    assert.match(m.subject, /Idea/);
    assert.ok(m.text.includes(MSG));
    assert.ok(m.html.includes('voice room'));
    assert.equal(m.replyTo, 'me@reply.example');
  });

  test('includes the username only when asked and signed in', async () => {
    mail.sent = [];
    expectStatus(await alice.api.post('/feedback', { category: 'bug', message: MSG + ' (1)' }), 200);
    expectStatus(await alice.api.post('/feedback', { category: 'bug', message: MSG + ' (2)', include_username: true }), 200);
    expectStatus(await client(srv).post('/feedback', { category: 'bug', message: MSG + ' (3)', include_username: true }), 200);
    const byMsg = (s: string) => rows().find((r) => r.message.endsWith(s));
    assert.equal(byMsg('(1)').user_id, null);
    assert.equal(byMsg('(2)').user_id, alice.user.id);
    assert.equal(byMsg('(3)').user_id, null);
    await srv.app.huddle.mail.settle();
    assert.ok(mail.sent.some((m) => m.text.includes('alice') && m.text.includes('(2)')));
    assert.ok(!mail.sent.some((m) => m.text.includes('(1)') && m.text.includes('Username: alice')));
  });

  test('honeypot: looks accepted, nothing stored or sent', async () => {
    const before = rows().length;
    mail.sent = [];
    expectStatus(await client(srv).post('/feedback', { category: 'other', message: MSG, website: 'http://spam.example' }), 200);
    assert.equal(rows().length, before);
    await srv.app.huddle.mail.settle();
    assert.equal(mail.sent.length, 0);
  });

  test('never exposes the contact address', async () => {
    const replies = [
      await client(srv).post('/feedback', { category: 'question', message: MSG }),
      await client(srv).post('/feedback', { category: 'bad', message: MSG }),
      await client(srv).get('/status'),
      await client(srv).get('/config'),
    ];
    for (const r of replies) assert.ok(!JSON.stringify(r.body).includes(CONTACT), JSON.stringify(r.body));
  });
});

describe('feedback without a contact address', () => {
  let srv: TestServer;
  let mail: MemoryTransport;
  before(async () => { mail = new MemoryTransport(); srv = await startServer({ mailTransport: mail, contactEmail: null }); });
  after(async () => { await srv.close(); });

  test('stores only', async () => {
    expectStatus(await client(srv).post('/feedback', { category: 'idea', message: MSG }), 200);
    await srv.app.huddle.mail.settle();
    assert.equal(mail.sent.length, 0);
    assert.equal(srv.app.huddle.db.all('SELECT id FROM feedback').length, 1);
  });
});

describe('feedback rate limit', () => {
  let srv: TestServer;
  let bob: TestUser;
  before(async () => {
    srv = await startServer({ contactEmail: null, rateLimits: { messages: BIG, writes: BIG, auth: BIG, feedbackPerIp: { capacity: 5, windowMs: 3_600_000 } } });
    bob = await register(srv, 'bob');
  });
  after(async () => { await srv.close(); });

  test('5 per hour per IP, then 429', async () => {
    for (let i = 0; i < 5; i++) expectStatus(await client(srv).post('/feedback', { category: 'idea', message: `${MSG} #${i}` }), 200);
    const r = await client(srv).post('/feedback', { category: 'idea', message: MSG });
    assert.equal(r.status, 429);
    assert.equal(srv.app.huddle.db.all('SELECT id FROM feedback').length, 5);
  });

  test('per-user limit applies to signed-in senders', async () => {
    srv.app.huddle.limiter.config.feedbackPerIp = BIG;
    srv.app.huddle.limiter.config.feedbackPerUser = { capacity: 2, windowMs: 3_600_000 };
    expectStatus(await bob.api.post('/feedback', { category: 'bug', message: MSG }), 200);
    expectStatus(await bob.api.post('/feedback', { category: 'bug', message: MSG }), 200);
    assert.equal((await bob.api.post('/feedback', { category: 'bug', message: MSG })).status, 429);
  });
});
