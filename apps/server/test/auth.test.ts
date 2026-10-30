import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { client, register, startServer, expectStatus, type TestServer } from './helpers';

let srv: TestServer;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

test('health endpoint', async () => {
  const r = await fetch(srv.base + '/health');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

test('register returns token + private user', async () => {
  const anon = client(srv);
  const r = await anon.post('/auth/register', { email: 'Dana@huddle.test', username: 'dana', password: 'password123' });
  assert.equal(r.status, 200);
  assert.ok(typeof r.body.token === 'string');
  assert.equal(r.body.user.username, 'dana');
  assert.equal(r.body.user.email, 'Dana@huddle.test');
  assert.equal(r.body.user.status, 'online');
  assert.match(r.body.user.id, /^\d+$/);
  assert.equal(r.body.user.password_hash, undefined);
});

test('register validation and duplicates', async () => {
  const anon = client(srv);
  const bad = await anon.post('/auth/register', { email: 'nope', username: 'x', password: 'short' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.email && bad.body.errors.username && bad.body.errors.password);
  assert.equal(typeof bad.body.code, 'number');
  const dup = await anon.post('/auth/register', { email: 'other@huddle.test', username: 'DANA', password: 'password123' });
  assert.equal(dup.status, 400);
  assert.ok(dup.body.errors.username);
});

test('login by username or email; bad password rejected', async () => {
  const anon = client(srv);
  const a = await anon.post('/auth/login', { login: 'dana', password: 'password123' });
  assert.equal(a.status, 200);
  const b = await anon.post('/auth/login', { login: 'dana@huddle.test', password: 'password123' });
  assert.equal(b.status, 200);
  const bad = await anon.post('/auth/login', { login: 'dana', password: 'wrongpassword' });
  assert.equal(bad.status, 401);
  assert.ok(bad.body.message);
  const me = expectStatus(await client(srv, a.body.token).get('/users/@me'), 200);
  assert.equal(me.username, 'dana');
});

test('auth required + invalid token', async () => {
  assert.equal((await client(srv).get('/users/@me')).status, 401);
  assert.equal((await client(srv, 'garbage').get('/users/@me')).status, 401);
  const nf = await client(srv).get('/does-not-exist');
  assert.equal(nf.status, 404);
  assert.equal(typeof nf.body.code, 'number');
});

test('profile update', async () => {
  const u = await register(srv, 'erin');
  const r = expectStatus(await u.api.patch('/users/@me', { display_name: 'Erin E', bio: 'hi', banner_color: '#112233' }), 200);
  assert.equal(r.display_name, 'Erin E');
  assert.equal(r.banner_color, '#112233');
  assert.equal((await u.api.patch('/users/@me', { banner_color: 'red' })).status, 400);
  const pub = expectStatus(await u.api.get(`/users/${u.user.id}`), 200);
  assert.equal(pub.email, undefined);
  assert.deepEqual(pub.mutual_guild_ids, []);
});

test('production mode serves web dist with SPA fallback', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'huddle-dist-'));
  fs.mkdirSync(path.join(dist, 'assets'));
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Huddle</title>');
  fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
  const prod = await startServer({ production: true, webDist: dist });
  try {
    const root = await fetch(prod.base + '/');
    assert.equal(root.status, 200);
    assert.match(await root.text(), /<title>Huddle/);
    const deep = await fetch(prod.base + '/channels/123/456');
    assert.equal(deep.status, 200);
    assert.match(deep.headers.get('content-type') ?? '', /html/);
    assert.equal(await (await fetch(prod.base + '/assets/app.js')).text(), 'console.log(1)');
    const api404 = await fetch(prod.base + '/api/nope');
    assert.equal(api404.status, 404);
    assert.equal(((await api404.json()) as { code: number }).code, 10404);
    assert.equal((await fetch(prod.base + '/health')).status, 200);
    const u = await register(prod, 'produser');
    assert.equal((await u.api.get('/users/@me')).status, 200);
  } finally {
    await prod.close();
    fs.rmSync(dist, { recursive: true, force: true });
  }
});
