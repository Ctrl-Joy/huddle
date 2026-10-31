import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { client, expectStatus, register, startServer, type TestServer, type TestUser } from './helpers';

// /api/ice reads HUDDLE_TURN_* per request, so each test sets the env it needs and restores it.
const KEYS = ['HUDDLE_TURN_URL', 'HUDDLE_TURN_SECRET', 'HUDDLE_TURN_USERNAME', 'HUDDLE_TURN_CREDENTIAL'] as const;
const saved: Record<string, string | undefined> = {};
function setEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
}

let srv: TestServer;
let alice: TestUser;

before(async () => {
  for (const k of KEYS) saved[k] = process.env[k];
  srv = await startServer();
  alice = await register(srv, 'alice');
});
after(async () => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  await srv.close();
});

test('no relay configured: empty list, no sign-in needed', async () => {
  setEnv({});
  const body = expectStatus(await client(srv).get('/ice'), 200);
  assert.deepEqual(body, { iceServers: [] });
});

test('relay configured: signed-out requests are refused', async () => {
  setEnv({ HUDDLE_TURN_URL: 'turn:relay.test:3478', HUDDLE_TURN_SECRET: 's3cret' });
  assert.equal((await client(srv).get('/ice')).status, 401);
});

test('shared secret: per-user credentials that coturn can verify and that expire in a day', async () => {
  setEnv({ HUDDLE_TURN_URL: 'turn:relay.test:3478?transport=udp, turn:relay.test:3478?transport=tcp', HUDDLE_TURN_SECRET: 's3cret' });
  const { iceServers } = expectStatus(await alice.api.get('/ice'), 200);
  assert.equal(iceServers.length, 1);
  const [ice] = iceServers;
  assert.deepEqual(ice.urls, ['turn:relay.test:3478?transport=udp', 'turn:relay.test:3478?transport=tcp']);
  const [expiry, userId] = ice.username.split(':');
  assert.equal(userId, alice.user.id);
  const ttl = Number(expiry) - Math.floor(Date.now() / 1000);
  assert.ok(ttl > 23 * 3600 && ttl <= 24 * 3600, `ttl ${ttl}`);
  // coturn's use-auth-secret check: base64(HMAC-SHA1(secret, username))
  assert.equal(ice.credential, crypto.createHmac('sha1', 's3cret').update(ice.username).digest('base64'));
});

test('no secret: falls back to the fixed username and credential', async () => {
  setEnv({ HUDDLE_TURN_URL: 'turn:relay.test:3478', HUDDLE_TURN_USERNAME: 'u', HUDDLE_TURN_CREDENTIAL: 'p' });
  const { iceServers } = expectStatus(await alice.api.get('/ice'), 200);
  assert.deepEqual(iceServers, [{ urls: ['turn:relay.test:3478'], username: 'u', credential: 'p' }]);
});
