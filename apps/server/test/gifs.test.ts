import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { ClientConfig, GifSearchResponse, Message } from '@huddle/shared';
import { client, expectStatus, register, setupGuild, startServer, type TestServer, type TestUser } from './helpers';
import { gifEmbedFor, type GifFetch } from '../src/services/gifs';

const KEY = 'test-provider-key-123';

/** A fake GIPHY: records requested URLs and answers with two results (one with an off-domain URL). */
function fakeProvider() {
  const calls: string[] = [];
  let fail = false;
  const fetcher: GifFetch = async (url) => {
    calls.push(url);
    if (fail) return { status: 500, json: null };
    const u = new URL(url);
    const offset = Number(u.searchParams.get('offset'));
    const tag = u.pathname.endsWith('/trending') ? 'trend' : u.searchParams.get('q');
    return {
      status: 200,
      json: {
        data: [
          {
            id: `${tag}1`, title: `${tag} one`, rating: 'g', username: 'someone', url: 'https://giphy.com/gifs/x',
            images: {
              original: { url: `https://media2.giphy.com/media/${tag}1/giphy.gif?cid=abc&rid=giphy.gif`, width: '480', height: '270', mp4: 'https://media2.giphy.com/media/x/giphy.mp4' },
              downsized: { url: `https://media2.giphy.com/media/${tag}1/giphy-downsized-medium.gif?cid=abc`, width: '400', height: '225' },
              fixed_width_small: { url: `https://media2.giphy.com/media/${tag}1/200w.gif?cid=abc`, webp: `https://media2.giphy.com/media/${tag}1/200w.webp?cid=abc`, width: '200', height: '113' },
            },
          },
          { id: 'evil', title: 'evil', images: { original: { url: 'https://evil.example/x.gif', width: '1', height: '1' } } },
        ],
        pagination: { total_count: 100, count: 2, offset },
      },
    };
  };
  return { calls, fetcher, setFail: (v: boolean) => { fail = v; } };
}

let srv: TestServer;
let alice: TestUser, bob: TestUser;
const provider = fakeProvider();

before(async () => {
  srv = await startServer({ gifApiKey: KEY, fetchGifs: provider.fetcher });
  alice = await register(srv, 'alice');
  bob = await register(srv, 'bob');
});
after(async () => { await srv.close(); });

test('config reports GIF support; search + trending return trimmed results and never leak the key', async () => {
  const cfg = expectStatus<ClientConfig>(await client(srv).get('/config'), 200);
  assert.deepEqual(cfg, { gifs: true, gif_provider: 'GIPHY' });

  const r = await alice.api.get<GifSearchResponse>('/gifs/search?q=cats');
  const body = expectStatus(r, 200);
  assert.equal(body.results.length, 1); // the off-domain result is dropped
  assert.deepEqual(body.results[0], {
    id: 'cats1', title: 'cats one',
    url: 'https://media.giphy.com/media/cats1/giphy-downsized-medium.gif',
    preview: 'https://media.giphy.com/media/cats1/200w.webp',
    width: 400, height: 225,
  });
  assert.equal(body.next, 2);
  assert.ok(!JSON.stringify(body).includes(KEY));
  const sent = new URL(provider.calls.at(-1)!);
  assert.equal(sent.origin + sent.pathname, 'https://api.giphy.com/v1/gifs/search');
  assert.equal(sent.searchParams.get('api_key'), KEY);
  assert.equal(sent.searchParams.get('q'), 'cats');
  assert.equal(sent.searchParams.get('rating'), 'pg-13');
  assert.equal(sent.searchParams.get('lang'), 'en');

  const trending = expectStatus<GifSearchResponse>(await alice.api.get('/gifs/trending'), 200);
  assert.equal(trending.results[0].id, 'trend1');
  assert.ok(provider.calls.at(-1)!.includes('/trending?'));
});

test('results are cached briefly (case-insensitive query)', async () => {
  const before = provider.calls.length;
  expectStatus(await bob.api.get('/gifs/search?q=Dogs'), 200);
  expectStatus(await bob.api.get('/gifs/search?q=dogs'), 200);
  assert.equal(provider.calls.length, before + 1);
  expectStatus(await bob.api.get('/gifs/search?q=dogs&offset=2'), 200);
  assert.equal(provider.calls.length, before + 2);
});

test('validation, auth and provider failures', async () => {
  assert.equal((await client(srv).get('/gifs/search?q=cats')).status, 401);
  assert.equal((await alice.api.get('/gifs/search')).status, 400);
  assert.equal((await alice.api.get(`/gifs/search?q=${'x'.repeat(51)}`)).status, 400);
  provider.setFail(true);
  try {
    const r = await alice.api.get('/gifs/search?q=uncached-query');
    assert.equal(r.status, 502);
    assert.ok(!JSON.stringify(r.body).includes(KEY));
  } finally {
    provider.setFail(false);
  }
});

test('per-user rate limit', async () => {
  const carol = await register(srv, 'carol');
  let limited = 0;
  for (let i = 0; i < 25; i++) if ((await carol.api.get('/gifs/trending')).status === 429) limited++;
  assert.ok(limited >= 1, 'expected some requests to be rate limited');
  // other users are unaffected
  assert.equal((await alice.api.get('/gifs/trending')).status, 200);
});

test('a sent GIF URL gets an inline gifv embed without fetching the page', async () => {
  const { generalId } = await setupGuild(alice, 'Gif Town');
  let pageFetches = 0;
  srv.app.huddle.previews.fetcher = async () => { pageFetches++; return null; };
  const url = 'https://media.giphy.com/media/cats1/giphy-downsized-medium.gif';
  const m = expectStatus<Message>(await alice.api.post(`/channels/${generalId}/messages`, { content: url }), 200);
  assert.equal(m.embeds![0]?.type, 'gifv'); // attached before the response, no MESSAGE_UPDATE race
  await srv.app.huddle.previews.settle();
  const got = expectStatus<Message>(await alice.api.get(`/channels/${generalId}/messages/${m.id}`), 200);
  assert.equal(got.embeds!.length, 1);
  assert.equal(got.embeds![0].type, 'gifv');
  assert.equal(got.embeds![0].image!.url, url);
  assert.equal(pageFetches, 0);

  assert.equal(gifEmbedFor('https://media.giphy.com/media/abc/giphy.mp4')!.video!.url, 'https://media.giphy.com/media/abc/giphy.mp4');
  assert.equal(gifEmbedFor('https://giphy.com/gifs/funny-cat-AbCdEf123')!.image!.url, 'https://media.giphy.com/media/AbCdEf123/giphy.gif');
  assert.equal(gifEmbedFor('https://evil.example/giphy.gif'), null);
  assert.equal(gifEmbedFor('https://media2.giphy.com/media/abc/giphy.gif'), null); // only media. / i. hosts
  assert.equal(gifEmbedFor('http://media.giphy.com/media/abc/giphy.gif'), null);
});

test('without a key: config says no GIFs and the endpoints answer 501', async () => {
  const bare = await startServer({ gifApiKey: null });
  try {
    const u = await register(bare, 'nokey');
    assert.deepEqual(expectStatus<ClientConfig>(await client(bare).get('/config'), 200), { gifs: false, gif_provider: null });
    assert.equal((await u.api.get('/gifs/search?q=cats')).status, 501);
    assert.equal((await u.api.get('/gifs/trending')).status, 501);
  } finally {
    await bare.close();
  }
});
