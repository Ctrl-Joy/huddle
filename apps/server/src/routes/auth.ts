import type { FastifyInstance } from 'fastify';
import { LIMITS } from '@huddle/shared';
import { now, type Ctx } from '../context';
import { hashPassword, verifyPassword } from '../auth';
import { badRequest, ApiErr, ErrorCode } from '../errors';
import { privateUser, getUserRow, type UserRow } from '../serializers';
import { body } from './util';

export const USERNAME_RE = /^[A-Za-z0-9_.]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateUsername(u: unknown): string | null {
  if (typeof u !== 'string') return 'Username is required';
  const s = u.trim();
  if (s.length < LIMITS.USERNAME_MIN || s.length > LIMITS.USERNAME_MAX) {
    return `Username must be between ${LIMITS.USERNAME_MIN} and ${LIMITS.USERNAME_MAX} characters`;
  }
  if (!USERNAME_RE.test(s)) return 'Username may only contain letters, numbers, underscores and periods';
  return null;
}

export default function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.post('/auth/register', async (req) => {
    const b = body(req);
    const errors: Record<string, string> = {};
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    const username = typeof b.username === 'string' ? b.username.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'Enter a valid email address';
    const uErr = validateUsername(username);
    if (uErr) errors.username = uErr;
    if (password.length < LIMITS.PASSWORD_MIN) errors.password = `Password must be at least ${LIMITS.PASSWORD_MIN} characters`;
    else if (password.length > 128) errors.password = 'Password is too long';
    if (!errors.email && db.one('SELECT 1 AS x FROM users WHERE email = ?', email)) errors.email = 'Email is already registered';
    if (!errors.username && db.one('SELECT 1 AS x FROM users WHERE username = ?', username)) errors.username = 'Username is taken';
    if (Object.keys(errors).length) throw badRequest(Object.values(errors)[0], errors);

    const id = ctx.id();
    const display = typeof b.display_name === 'string' && b.display_name.trim() ? b.display_name.trim().slice(0, 32) : null;
    db.run(
      'INSERT INTO users (id, email, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id, email, username, display, await hashPassword(password), now(),
    );
    const user = getUserRow(db, id)!;
    return { token: await ctx.tokens.sign(id), user: privateUser(user) };
  });

  app.post('/auth/login', async (req) => {
    const b = body(req);
    const login = typeof b.login === 'string' ? b.login.trim() : typeof b.email === 'string' ? b.email.trim() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    if (!login || !password) throw badRequest('Login and password are required');
    const user = db.one<UserRow>('SELECT * FROM users WHERE email = ? OR username = ?', login, login);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new ApiErr(401, 'Invalid login or password', ErrorCode.UNAUTHORIZED, {
        login: 'Invalid login or password', password: 'Invalid login or password',
      });
    }
    return { token: await ctx.tokens.sign(user.id), user: privateUser(user) };
  });
}
