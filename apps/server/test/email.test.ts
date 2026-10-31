import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ApiErrorCode, GatewayCloseCode, GatewayOp } from '@huddle/shared';
import { GatewayClient, client, expectStatus, startServer, type TestServer } from './helpers';
import { MemoryTransport } from '../src/services/mailer';
import { hashPassword } from '../src/auth';

const BIG = { capacity: 100_000, windowMs: 1000 };

let srv: TestServer;
let mail: MemoryTransport;

before(async () => {
  mail = new MemoryTransport();
  srv = await startServer({
    mailTransport: mail,
    requireEmailVerification: undefined, // derived: a transport is configured → verification on
    publicUrl: 'https://huddle.example',
    mailFrom: 'Huddle <no-reply@huddle.example>',
    rateLimits: { messages: BIG, writes: BIG, auth: BIG, codesPerIp: BIG, codesPerUser: BIG },
  });
});
after(async () => { await srv.close(); });

const codes = () => srv.app.huddle.codes;
const settle = () => srv.app.huddle.mail.settle();

/** The 6-digit code in the newest mail to `to`. */
async function codeFor(to: string): Promise<string> {
  await settle();
  const m = mail.last(to);
  assert.ok(m, `no mail to ${to}`);
  const match = /\b(\d{6})\b/.exec(m.text);
  assert.ok(match, 'mail has no code');
  return match[1];
}

/** Moves the code clock forward (cooldowns and expiry). */
function advance(ms: number) {
  const c = codes();
  const base = c.now();
  c.now = () => base + ms;
}
function resetClock() { codes().now = () => Date.now(); }

async function signUp(username: string) {
  const email = `${username}@mail.test`;
  const r = await client(srv).post('/auth/register', { email, username, password: 'password123' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { email, token: r.body.token as string, user: r.body.user, api: client(srv, r.body.token) };
}

async function signUpVerified(username: string) {
  const u = await signUp(username);
  expectStatus(await u.api.post('/auth/verify-email', { code: await codeFor(u.email) }), 200);
  return u;
}

test('sign-up creates an unverified account and emails a 6-digit code', async () => {
  const u = await signUp('newbie');
  assert.equal(u.user.verified, false);
  assert.equal(u.user.pending_email, null);
  await settle();
  const m = mail.last(u.email)!;
  assert.equal(m.from, 'Huddle <no-reply@huddle.example>');
  assert.match(m.subject, /^Your Huddle code: \d{6}$/);
  assert.match(m.text, /Verify your Huddle email/);
  assert.match(m.text, /\b\d{6}\b/);
  assert.match(m.text, /expires in 10 minutes/);
  assert.match(m.text, /ignore/i);
  assert.match(m.html, /Huddle/);
  assert.match(m.html, /\b\d{6}\b/);
  // stored hashed, never in the clear
  const row = srv.app.huddle.db.one<{ code_hash: string }>('SELECT code_hash FROM verification_codes WHERE user_id = ?', u.user.id)!;
  assert.ok(!row.code_hash.includes(await codeFor(u.email)));
  assert.equal(row.code_hash.length, 64);
});

test('verify: wrong code counts down, right code verifies once', async () => {
  const u = await signUp('verifyme');
  const code = await codeFor(u.email);
  const wrong = code === '000000' ? '111111' : '000000';
  const bad = await u.api.post('/auth/verify-email', { code: wrong });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, ApiErrorCode.VERIFICATION_CODE_INVALID);
  assert.match(bad.body.message, /4 tries left/);
  const ok = expectStatus(await u.api.post('/auth/verify-email', { code }), 200);
  assert.equal(ok.verified, true);
  const me = expectStatus(await u.api.get('/users/@me'), 200);
  assert.equal(me.verified, true);
  // already verified now
  assert.equal((await u.api.post('/auth/verify-email', { code })).status, 400);
  assert.equal((await u.api.post('/auth/verify-email/resend')).status, 400);
});

test('verify: codes expire after 10 minutes', async () => {
  const u = await signUp('slowpoke');
  const code = await codeFor(u.email);
  advance(10 * 60_000 + 1000);
  try {
    const r = await u.api.post('/auth/verify-email', { code });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, ApiErrorCode.VERIFICATION_CODE_EXPIRED);
  } finally { resetClock(); }
});

test('verify: 5 wrong attempts kill the code', async () => {
  const u = await signUp('guesser');
  const code = await codeFor(u.email);
  const wrong = code === '123456' ? '654321' : '123456';
  for (let i = 0; i < 4; i++) assert.equal((await u.api.post('/auth/verify-email', { code: wrong })).body.code, ApiErrorCode.VERIFICATION_CODE_INVALID);
  assert.equal((await u.api.post('/auth/verify-email', { code: wrong })).body.code, ApiErrorCode.VERIFICATION_CODE_EXHAUSTED);
  // even the right code is dead now
  const r = await u.api.post('/auth/verify-email', { code });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, ApiErrorCode.VERIFICATION_CODE_EXHAUSTED);
});

test('resend: 60 s cooldown, then a new code replaces the old one', async () => {
  const u = await signUp('resender');
  const first = await codeFor(u.email);
  const early = await u.api.post('/auth/verify-email/resend');
  assert.equal(early.status, 429);
  assert.ok(early.body.retry_after > 0 && early.body.retry_after <= 60);
  advance(61_000);
  try {
    const r = expectStatus(await u.api.post('/auth/verify-email/resend'), 200);
    assert.equal(r.email, u.email);
    assert.equal(r.resend_after, 60);
  } finally { resetClock(); }
  await settle();
  assert.equal(mail.to(u.email).length, 2);
  const second = await codeFor(u.email);
  if (second !== first) {
    assert.equal((await u.api.post('/auth/verify-email', { code: first })).status, 400);
  }
  expectStatus(await u.api.post('/auth/verify-email', { code: second }), 200);
});

test('unverified accounts may only verify, resend, read or change their email', async () => {
  const u = await signUp('lockedout');
  expectStatus(await u.api.get('/users/@me'), 200);
  for (const [method, p] of [['get', '/users/@me/guilds'], ['get', '/users/@me/channels'], ['post', '/guilds']] as const) {
    const r = await (u.api as any)[method](p, method === 'post' ? { name: 'Nope' } : undefined);
    assert.equal(r.status, 403, `${method} ${p}`);
    assert.equal(r.body.code, ApiErrorCode.EMAIL_NOT_VERIFIED);
  }
  // PATCH is limited to the email
  const bio = await u.api.patch('/users/@me', { bio: 'hi' });
  assert.equal(bio.status, 403);
  assert.equal(bio.body.code, ApiErrorCode.EMAIL_NOT_VERIFIED);

  // gateway refuses IDENTIFY
  const gc = await GatewayClient.open(srv);
  gc.send(GatewayOp.IDENTIFY, { token: u.token });
  assert.equal(await gc.waitClose(), GatewayCloseCode.EMAIL_NOT_VERIFIED);

  // after verifying, everything works
  expectStatus(await u.api.post('/auth/verify-email', { code: await codeFor(u.email) }), 200);
  expectStatus(await u.api.get('/users/@me/guilds'), 200);
  const live = await GatewayClient.connect(srv, u.token);
  await live.close();
});

test('wrong sign-up email: an unverified account changes it in place and gets a new code there', async () => {
  const u = await signUp('typo');
  const noPw = await u.api.patch('/users/@me', { email: 'typo-fixed@mail.test' });
  assert.equal(noPw.status, 400);
  const r = expectStatus(await u.api.patch('/users/@me', { email: 'typo-fixed@mail.test', password: 'password123' }), 200);
  assert.equal(r.email, 'typo-fixed@mail.test');
  assert.equal(r.verified, false);
  assert.equal(r.pending_email, null);
  const code = await codeFor('typo-fixed@mail.test');
  expectStatus(await u.api.post('/auth/verify-email', { code }), 200);
});

test('accounts that existed before verification are treated as verified', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'huddle-legacy-'));
  const dbPath = path.join(dir, 'legacy.db');
  // A database from before email verification: the original users table, one account.
  const raw = new DatabaseSync(dbPath);
  raw.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT, password_hash TEXT NOT NULL, avatar TEXT, banner_color TEXT, bio TEXT, custom_status TEXT,
    status TEXT NOT NULL DEFAULT 'online', bot INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`);
  raw.prepare('INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('1000', 'old@mail.test', 'oldtimer', await hashPassword('password123'), new Date().toISOString());
  raw.close();
  const legacy = await startServer({ dbPath, mailTransport: new MemoryTransport(), requireEmailVerification: true });
  try {
    const r = expectStatus(await client(legacy).post('/auth/login', { login: 'oldtimer', password: 'password123' }), 200);
    assert.equal(r.user.verified, true);
    expectStatus(await client(legacy, r.token).get('/users/@me/guilds'), 200);
    const gc = await GatewayClient.connect(legacy, r.token);
    await gc.close();
  } finally {
    await legacy.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('forgot password: same answer for unknown emails, code only to real accounts', async () => {
  const u = await signUpVerified('forgetful');
  const before = mail.sent.length;
  const anon = client(srv);
  const real = await anon.post('/auth/password/forgot', { email: u.email.toUpperCase() });
  const ghost = await anon.post('/auth/password/forgot', { email: 'nobody-here@mail.test' });
  assert.equal(real.status, 200);
  assert.equal(ghost.status, 200);
  assert.deepEqual(real.body, ghost.body);
  await settle();
  assert.equal(mail.to('nobody-here@mail.test').length, 0);
  assert.equal(mail.sent.length, before + 1);
  assert.match(mail.last(u.email)!.text, /Reset your Huddle password/);
  // asking again inside the cooldown still answers 200 but sends nothing new
  const again = await anon.post('/auth/password/forgot', { email: u.email });
  assert.deepEqual(again.body, real.body);
  await settle();
  assert.equal(mail.sent.length, before + 1);
});

test('reset password: bad/expired codes refused alike; success revokes old sessions and signs in', async () => {
  const u = await signUpVerified('resetter');
  const otherDevice = expectStatus(await client(srv).post('/auth/login', { login: 'resetter', password: 'password123' }), 200);
  const gc = await GatewayClient.connect(srv, otherDevice.token);
  const anon = client(srv);
  expectStatus(await anon.post('/auth/password/forgot', { email: u.email }), 200);
  const code = await codeFor(u.email);
  const wrong = code === '999999' ? '888888' : '999999';

  const bad = await anon.post('/auth/password/reset', { email: u.email, code: wrong, new_password: 'newpassword1' });
  assert.equal(bad.status, 400);
  const ghost = await anon.post('/auth/password/reset', { email: 'ghost@mail.test', code: wrong, new_password: 'newpassword1' });
  assert.equal(ghost.status, 400);
  assert.deepEqual(bad.body, ghost.body); // no account enumeration
  const short = await anon.post('/auth/password/reset', { email: u.email, code, new_password: 'short' });
  assert.equal(short.status, 400);
  assert.ok(short.body.errors.new_password);

  advance(11 * 60_000);
  try {
    const expired = await anon.post('/auth/password/reset', { email: u.email, code, new_password: 'newpassword1' });
    assert.equal(expired.status, 400);
    assert.deepEqual(expired.body, ghost.body);
  } finally { resetClock(); }

  // fresh code
  advance(61_000);
  try { expectStatus(await anon.post('/auth/password/forgot', { email: u.email }), 200); } finally { resetClock(); }
  const fresh = await codeFor(u.email);
  const ok = expectStatus(await anon.post('/auth/password/reset', { email: u.email, code: fresh, new_password: 'newpassword1' }), 200);
  assert.ok(ok.token);
  assert.equal(ok.user.verified, true);
  // code is single-use
  assert.equal((await anon.post('/auth/password/reset', { email: u.email, code: fresh, new_password: 'another-pass1' })).status, 400);

  // every earlier token is dead, REST and gateway
  assert.equal((await client(srv, u.token).get('/users/@me')).status, 401);
  assert.equal((await client(srv, otherDevice.token).get('/users/@me')).status, 401);
  assert.equal(await gc.waitClose(), GatewayCloseCode.SESSION_INVALIDATED);
  const stale = await GatewayClient.open(srv);
  stale.send(GatewayOp.IDENTIFY, { token: u.token });
  assert.equal(await stale.waitClose(), GatewayCloseCode.AUTHENTICATION_FAILED);

  expectStatus(await client(srv, ok.token).get('/users/@me'), 200);
  assert.equal((await anon.post('/auth/login', { login: 'resetter', password: 'password123' })).status, 401);
  expectStatus(await anon.post('/auth/login', { login: 'resetter', password: 'newpassword1' }), 200);
  await settle();
  assert.match(mail.last(u.email)!.subject, /password was changed/i);
});

test('password reset proves ownership of an unverified account', async () => {
  const u = await signUp('squatted');
  expectStatus(await client(srv).post('/auth/password/forgot', { email: u.email }), 200);
  const code = await codeFor(u.email);
  const ok = expectStatus(await client(srv).post('/auth/password/reset', { email: u.email, code, new_password: 'mine-now-123' }), 200);
  assert.equal(ok.user.verified, true);
  expectStatus(await client(srv, ok.token).get('/users/@me/guilds'), 200);
});

test('changing the password in settings revokes other sessions and returns a fresh token', async () => {
  const u = await signUpVerified('rotator');
  const phone = expectStatus(await client(srv).post('/auth/login', { login: 'rotator', password: 'password123' }), 200);
  const phoneGw = await GatewayClient.connect(srv, phone.token);

  const wrong = await u.api.patch('/users/@me', { password: 'nope-nope', new_password: 'rotated-pass1' });
  assert.equal(wrong.status, 400);
  const tooShort = await u.api.patch('/users/@me', { password: 'password123', new_password: 'short' });
  assert.equal(tooShort.status, 400);

  const r = expectStatus(await u.api.patch('/users/@me', { password: 'password123', new_password: 'rotated-pass1' }), 200);
  assert.ok(typeof r.token === 'string' && r.token !== u.token);
  assert.equal(r.username, 'rotator');
  assert.equal((await client(srv, phone.token).get('/users/@me')).status, 401);
  assert.equal((await client(srv, u.token).get('/users/@me')).status, 401);
  expectStatus(await client(srv, r.token).get('/users/@me'), 200);
  assert.equal(await phoneGw.waitClose(), GatewayCloseCode.SESSION_INVALIDATED);
  const again = await GatewayClient.connect(srv, r.token);
  await again.close();
  await settle();
  assert.match(mail.last(u.email)!.subject, /password was changed/i);
  // other profile edits don't issue tokens
  const plain = expectStatus(await client(srv, r.token).patch('/users/@me', { bio: 'hello' }), 200);
  assert.equal(plain.token, undefined);
});

test('email change stays pending until the new address confirms; old address is notified', async () => {
  const u = await signUpVerified('mover');
  const api = u.api;
  const r = expectStatus(await api.patch('/users/@me', { email: 'mover-new@mail.test', password: 'password123' }), 200);
  assert.equal(r.email, u.email);
  assert.equal(r.pending_email, 'mover-new@mail.test');
  assert.equal(r.verified, true);
  // still usable while pending
  expectStatus(await api.get('/users/@me/guilds'), 200);
  const code = await codeFor('mover-new@mail.test');
  assert.match(mail.last('mover-new@mail.test')!.text, /Confirm your new Huddle email/);

  // resend goes to the pending address (after the cooldown)
  assert.equal((await api.post('/auth/verify-email/resend')).status, 429);

  const done = expectStatus(await api.post('/auth/verify-email', { code }), 200);
  assert.equal(done.email, 'mover-new@mail.test');
  assert.equal(done.pending_email, null);
  await settle();
  const notice = mail.last(u.email)!;
  assert.match(notice.subject, /email was changed/i);
  assert.match(notice.text, /mover-new@mail\.test/);
  expectStatus(await client(srv).post('/auth/login', { login: 'mover-new@mail.test', password: 'password123' }), 200);

  // cancel flow
  const p = expectStatus(await api.patch('/users/@me', { email: 'mover-third@mail.test', password: 'password123' }), 200);
  assert.equal(p.pending_email, 'mover-third@mail.test');
  const cancelled = expectStatus(await api.del('/users/@me/pending-email'), 200);
  assert.equal(cancelled.pending_email, null);
  assert.equal(cancelled.email, 'mover-new@mail.test');
  const stale = await api.post('/auth/verify-email', { code: await codeFor('mover-third@mail.test') });
  assert.equal(stale.status, 400);

  // can't take an address that's in use
  const taken = await api.patch('/users/@me', { email: 'forgetful@mail.test', password: 'password123' });
  assert.equal(taken.status, 400);
});

test('hourly cap on codes per address', async () => {
  const anon = client(srv);
  const statuses: number[] = [];
  for (let i = 0; i < 6; i++) statuses.push((await anon.post('/auth/password/forgot', { email: 'capped@mail.test' })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});

test('verification is off without SMTP: accounts are created verified and nothing is mailed', async () => {
  const off = await startServer({ mailTransport: null, requireEmailVerification: undefined });
  try {
    const r = expectStatus(await client(off).post('/auth/register', { email: 'plain@mail.test', username: 'plain', password: 'password123' }), 200);
    assert.equal(r.user.verified, true);
    expectStatus(await client(off, r.token).get('/users/@me/guilds'), 200);
    // email changes apply directly, as before
    const p = expectStatus(await client(off, r.token).patch('/users/@me', { email: 'plain2@mail.test', password: 'password123' }), 200);
    assert.equal(p.email, 'plain2@mail.test');
    assert.equal(p.pending_email, null);
    assert.equal(off.app.huddle.cfg.requireEmailVerification, false);
  } finally { await off.close(); }
});

test('mail delivery failure on resend reports an error and doesn\'t start the cooldown', async () => {
  const u = await signUp('bounced');
  await codeFor(u.email);
  advance(61_000);
  mail.fail = new Error('smtp down');
  try {
    const r = await u.api.post('/auth/verify-email/resend');
    assert.equal(r.status, 503);
    assert.equal(r.body.code, ApiErrorCode.EMAIL_SEND_FAILED);
  } finally { mail.fail = null; }
  try {
    expectStatus(await u.api.post('/auth/verify-email/resend'), 200);
  } finally { resetClock(); }
});
