import type { FastifyRequest } from 'fastify';
import { badRequest, invalidField, unauthorized, ApiErr, ErrorCode } from '../errors';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string | null;
  }
}

/** The authenticated user's id, or 401. */
export function uid(req: FastifyRequest): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}

export function body(req: FastifyRequest): Record<string, any> {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, any>) : {};
}

export function arrayBody(req: FastifyRequest): any[] {
  if (!Array.isArray(req.body)) throw badRequest('Expected a JSON array body');
  return req.body;
}

export interface StrOpts { min?: number; max?: number; trim?: boolean }

/** Optional string field: undefined if absent, null if explicitly null (when nullable). */
export function optStr(b: Record<string, any>, key: string, o: StrOpts & { nullable?: boolean } = {}): string | null | undefined {
  const v = b[key];
  if (v === undefined) return undefined;
  if (v === null) {
    if (o.nullable) return null;
    throw invalidField(key, `${key} must be a string`);
  }
  if (typeof v !== 'string') throw invalidField(key, `${key} must be a string`);
  const s = o.trim === false ? v : v.trim();
  if (o.nullable && s === '' && (o.min ?? 0) > 0) return null;
  if (o.min !== undefined && s.length < o.min) throw invalidField(key, `${key} must be at least ${o.min} characters`);
  if (o.max !== undefined && s.length > o.max) throw invalidField(key, `${key} must be at most ${o.max} characters`);
  return s;
}

export function reqStr(b: Record<string, any>, key: string, o: StrOpts = {}): string {
  const s = optStr(b, key, o);
  if (s === undefined || s === null) throw invalidField(key, `${key} is required`);
  return s;
}

export function optInt(b: Record<string, any>, key: string, min: number, max: number): number | undefined {
  const v = b[key];
  if (v === undefined || v === null) return undefined;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw invalidField(key, `${key} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function optBool(b: Record<string, any>, key: string): boolean | undefined {
  const v = b[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') throw invalidField(key, `${key} must be a boolean`);
  return v;
}

/** Permission bitfield as decimal string (or number). */
export function optPerms(b: Record<string, any>, key: string): bigint | undefined {
  const v = b[key];
  if (v === undefined || v === null) return undefined;
  try {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) return BigInt(v);
    if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  } catch { /* fall through */ }
  throw invalidField(key, `${key} must be a permission bitfield string`);
}

export const isSnowflake = (v: unknown): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v);

export function queryInt(q: unknown, key: string, def: number, min: number, max: number): number {
  const v = (q as Record<string, unknown> | undefined)?.[key];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw invalidField(key, `${key} must be an integer`);
  return Math.min(max, Math.max(min, n));
}

export function queryStr(q: unknown, key: string): string | undefined {
  const v = (q as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
}

export function auditReason(req: FastifyRequest, b?: Record<string, any>): string | null {
  const h = req.headers['x-audit-log-reason'];
  const fromHeader = typeof h === 'string' ? decodeURIComponent(h) : null;
  const fromBody = b && typeof b.reason === 'string' ? b.reason : null;
  return (fromBody || fromHeader || null)?.slice(0, 512) ?? null;
}

// ---------------- multipart ----------------

export interface UploadedFile { fieldname: string; filename: string; mimetype: string; data: Buffer }

export function isMultipart(req: FastifyRequest): boolean {
  return (req.headers['content-type'] ?? '').toLowerCase().startsWith('multipart/form-data');
}

/** Reads all parts into memory (bounded by the multipart plugin limits). */
export async function readMultipart(
  req: FastifyRequest, opts: { maxFiles: number; maxFileBytes: number },
): Promise<{ fields: Record<string, string>; files: UploadedFile[] }> {
  if (!isMultipart(req)) throw badRequest('Expected multipart/form-data');
  const fields: Record<string, string> = {};
  const files: UploadedFile[] = [];
  try {
    for await (const part of req.parts({ limits: { fileSize: opts.maxFileBytes, files: opts.maxFiles } })) {
      if (part.type === 'file') {
        const data = await part.toBuffer();
        if (!part.filename && data.length === 0) continue;
        files.push({ fieldname: part.fieldname, filename: part.filename, mimetype: part.mimetype, data });
      } else {
        fields[part.fieldname] = String(part.value ?? '');
      }
    }
  } catch (e: any) {
    if (e?.code === 'FST_REQ_FILE_TOO_LARGE' || e?.statusCode === 413) {
      throw new ApiErr(413, 'File too large', ErrorCode.PAYLOAD_TOO_LARGE);
    }
    if (e?.code === 'FST_FILES_LIMIT') throw badRequest(`Too many files (max ${opts.maxFiles})`);
    throw e;
  }
  return { fields, files };
}
