import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length || KEYLEN);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** JWT secret: explicit > env > persisted file (generated on first boot) > ephemeral. */
export function resolveSecret(explicit: string | undefined, dataDir: string | null): Uint8Array {
  const fromEnv = explicit ?? process.env.HUDDLE_JWT_SECRET;
  if (fromEnv) return new TextEncoder().encode(fromEnv);
  if (dataDir) {
    const file = path.join(dataDir, 'secret.key');
    try {
      const s = fs.readFileSync(file, 'utf8').trim();
      if (s) return new TextEncoder().encode(s);
    } catch { /* generate below */ }
    const s = crypto.randomBytes(48).toString('base64url');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, s, { mode: 0o600 });
    return new TextEncoder().encode(s);
  }
  return new TextEncoder().encode(crypto.randomBytes(48).toString('base64url'));
}

export class TokenService {
  constructor(private secret: Uint8Array) {}

  sign(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(this.secret);
  }

  /** Returns the user id, or null when the token is invalid/expired. */
  async verify(token: string | undefined | null): Promise<string | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'] });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}

export function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1] : header.trim() || null;
}
