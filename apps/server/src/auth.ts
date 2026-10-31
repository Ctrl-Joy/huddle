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

export interface TokenClaims {
  userId: string;
  /** users.token_version when the token was issued (tokens from before versions existed count as 0). */
  version: number;
}

export class TokenService {
  constructor(readonly secret: Uint8Array) {}

  sign(userId: string, version = 0): Promise<string> {
    return new SignJWT({ ver: version })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(this.secret);
  }

  /** Signature + expiry only; callers must also compare the version with the user's (see services/accounts). */
  async verify(token: string | undefined | null): Promise<TokenClaims | null> {
    if (!token || typeof token !== 'string') return null;
    try {
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string') return null;
      const ver = payload.ver === undefined ? 0 : payload.ver;
      if (typeof ver !== 'number' || !Number.isInteger(ver) || ver < 0) return null;
      return { userId: payload.sub, version: ver };
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
