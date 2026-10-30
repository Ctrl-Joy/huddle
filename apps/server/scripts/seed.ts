// Seeds demo data through the real API (in-process, no network). Idempotent: skips if "alice" exists.
// Usage: npm run seed -w @huddle/server   (respects HUDDLE_DB / HUDDLE_UPLOADS)
import { Permissions } from '@huddle/shared';
import { buildApp } from '../src/app';

const BIG = { capacity: 1_000_000, windowMs: 1000 };
const app = await buildApp({ rateLimits: { messages: BIG, writes: BIG, auth: BIG } });
const ctx = app.huddle;

async function call<T = any>(token: string | null, method: string, url: string, payload?: unknown): Promise<T> {
  const res = await app.inject({
    method: method as any,
    url: '/api' + url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload !== undefined ? { payload: payload as any } : {}),
  });
  if (res.statusCode >= 400) throw new Error(`${method} ${url} → ${res.statusCode} ${res.body}`);
  return (res.body ? JSON.parse(res.body) : undefined) as T;
}

try {
  if (ctx.db.one('SELECT id FROM users WHERE username = ?', 'alice')) {
    console.log('[seed] demo data already present (user "alice" exists) — skipping.');
  } else {
    const mk = async (username: string, display: string) => {
      const r = await call<{ token: string; user: { id: string } }>(null, 'POST', '/auth/register', {
        email: `${username}@huddle.test`, username, password: 'password123', display_name: display,
      });
      return { token: r.token, id: r.user.id };
    };
    const alice = await mk('alice', 'Alice');
    const bob = await mk('bob', 'Bob');
    const carol = await mk('carol', 'Carol');
    await call(alice.token, 'PATCH', '/users/@me', { bio: 'Founder of Huddle HQ.', banner_color: '#3ba55d', custom_status: 'Building things' });
    await call(bob.token, 'PATCH', '/users/@me', { bio: 'Keeping the peace.', banner_color: '#e67e22' });

    // friends
    await call(alice.token, 'POST', '/users/@me/relationships', { username: 'bob' });
    await call(bob.token, 'PUT', `/users/@me/relationships/${alice.id}`, {});

    // server
    const g = await call<any>(alice.token, 'POST', '/guilds', { name: 'Huddle HQ' });
    await call(alice.token, 'PATCH', `/guilds/${g.id}`, { description: 'The official demo server for Huddle.' });
    const general = g.channels.find((c: any) => c.name === 'general');
    const textCat = g.channels.find((c: any) => c.name === 'Text Channels');
    const inv = await call<any>(alice.token, 'POST', `/channels/${general.id}/invites`, { max_age: 0 });
    await call(bob.token, 'POST', `/invites/${inv.code}`);
    await call(carol.token, 'POST', `/invites/${inv.code}`);

    const modPerms = Permissions.MANAGE_MESSAGES | Permissions.KICK_MEMBERS | Permissions.MUTE_MEMBERS |
      Permissions.DEAFEN_MEMBERS | Permissions.MOVE_MEMBERS | Permissions.MANAGE_NICKNAMES | Permissions.VIEW_AUDIT_LOG |
      Permissions.MODERATE_MEMBERS;
    const mod = await call<any>(alice.token, 'POST', `/guilds/${g.id}/roles`, {
      name: 'Moderator', color: 0xe67e22, hoist: true, mentionable: true, permissions: modPerms.toString(),
    });
    await call(alice.token, 'PATCH', `/guilds/${g.id}/members/${bob.id}`, { roles: [mod.id] });

    const random = await call<any>(alice.token, 'POST', `/guilds/${g.id}/channels`, {
      name: 'random', type: 0, parent_id: textCat.id, topic: 'Anything goes.',
    });
    const mods = await call<any>(alice.token, 'POST', `/guilds/${g.id}/channels`, {
      name: 'mods', type: 0, parent_id: textCat.id, topic: 'Moderator-only discussion.',
      permission_overwrites: [
        { id: g.id, type: 0, allow: '0', deny: Permissions.VIEW_CHANNEL.toString() },
        { id: mod.id, type: 0, allow: Permissions.VIEW_CHANNEL.toString(), deny: '0' },
      ],
    });
    await call(alice.token, 'PATCH', `/channels/${general.id}`, { topic: 'Say hi! Be kind.' });

    const send = (u: { token: string }, channelId: string, content: string, extra: Record<string, unknown> = {}) =>
      call<any>(u.token, 'POST', `/channels/${channelId}/messages`, { content, ...extra });

    const welcome = await send(alice, general.id, 'Welcome to **Huddle HQ**! 👋 Introduce yourself below.');
    await send(bob, general.id, `Thanks <@${alice.id}>! Happy to help keep things tidy around here.`);
    const q = await send(carol, general.id, 'Hi everyone! Is there a voice channel for hanging out?');
    await send(alice, general.id, 'Yep — jump into **General** under Voice Channels any time.', { reply_to_id: q.id });
    await send(carol, random.id, 'Fun fact: octopuses have three hearts. 🐙');
    await send(bob, mods.id, `<@&${mod.id}> reminder: be friendly, be fair, write things in the audit log reason.`);
    await call(bob.token, 'PUT', `/channels/${general.id}/messages/${welcome.id}/reactions/${encodeURIComponent('🎉')}/@me`);
    await call(carol.token, 'PUT', `/channels/${general.id}/messages/${welcome.id}/reactions/${encodeURIComponent('🎉')}/@me`);
    await call(alice.token, 'PUT', `/channels/${general.id}/pins/${welcome.id}`);

    // DM alice ↔ bob
    const dm = await call<any>(alice.token, 'POST', '/users/@me/channels', { recipient_ids: [bob.id] });
    await send(alice, dm.id, 'Hey Bob, thanks for agreeing to moderate!');
    await send(bob, dm.id, 'Any time. Ping me if anything comes up.');

    console.log('[seed] created users alice / bob / carol (password: password123)');
    console.log(`[seed] server "Huddle HQ" (${g.id}) with #general, #random, #mods (Moderator only), invite code ${inv.code}`);
  }
} finally {
  await app.close();
}
