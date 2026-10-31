import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { GatewayOp, type DispatchEventName, type DispatchEvents, type User } from '@huddle/shared';
import { buildApp, type BuildOptions, type HuddleApp } from '../src/app';

export interface TestServer {
  app: HuddleApp;
  base: string;
  wsUrl: string;
  uploadsDir: string;
  close: () => Promise<void>;
}

const BIG = { capacity: 100_000, windowMs: 1000 };

export async function startServer(opts: BuildOptions = {}): Promise<TestServer> {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huddle-test-'));
  const app = await buildApp({
    dbPath: ':memory:',
    uploadsDir,
    jwtSecret: 'test-secret',
    rateLimits: { messages: BIG, writes: BIG, auth: BIG },
    // No SMTP and no verification unless a test opts in (independent of the shell's environment).
    mailTransport: null,
    requireEmailVerification: false,
    ...opts,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  return {
    app,
    base: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/gateway`,
    uploadsDir,
    close: async () => {
      await app.close();
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    },
  };
}

export interface Res<T = any> { status: number; body: T }

export function client(srv: TestServer, token?: string) {
  const call = async <T = any>(method: string, p: string, body?: unknown): Promise<Res<T>> => {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = `Bearer ${token}`;
    let payload: FormData | string | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const r = await fetch(srv.base + '/api' + p, { method, headers, body: payload });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : undefined };
  };
  return {
    get: <T = any>(p: string) => call<T>('GET', p),
    post: <T = any>(p: string, b?: unknown) => call<T>('POST', p, b),
    put: <T = any>(p: string, b?: unknown) => call<T>('PUT', p, b),
    patch: <T = any>(p: string, b?: unknown) => call<T>('PATCH', p, b),
    del: <T = any>(p: string, b?: unknown) => call<T>('DELETE', p, b),
  };
}

export type Api = ReturnType<typeof client>;

export interface TestUser { token: string; user: User; api: Api }

export async function register(srv: TestServer, username: string): Promise<TestUser> {
  const r = await client(srv).post('/auth/register', { email: `${username}@huddle.test`, username, password: 'password123' });
  if (r.status !== 200) throw new Error(`register ${username} failed: ${JSON.stringify(r.body)}`);
  return { token: r.body.token, user: r.body.user, api: client(srv, r.body.token) };
}

export function expectStatus<T>(r: Res<T>, status: number): T {
  if (r.status !== status) throw new Error(`expected HTTP ${status}, got ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}

// ---------------- gateway client ----------------

interface Frame { op: number; d?: any; s?: number; t?: string }

export class GatewayClient {
  frames: Frame[] = [];
  dispatches: Frame[] = [];
  closeCode: number | null = null;
  private listeners = new Set<() => void>();

  constructor(readonly ws: WebSocket) {
    ws.on('message', (raw) => {
      const f = JSON.parse(raw.toString()) as Frame;
      this.frames.push(f);
      if (f.op === GatewayOp.DISPATCH) this.dispatches.push(f);
      for (const l of [...this.listeners]) l();
    });
    ws.on('close', (code) => {
      this.closeCode = code;
      for (const l of [...this.listeners]) l();
    });
  }

  static async open(srv: TestServer): Promise<GatewayClient> {
    const ws = new WebSocket(srv.wsUrl);
    const gc = new GatewayClient(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    await gc.waitFrame((f) => f.op === GatewayOp.HELLO);
    return gc;
  }

  /** Connects, identifies and waits for READY. */
  static async connect(srv: TestServer, token: string): Promise<GatewayClient> {
    const gc = await GatewayClient.open(srv);
    gc.send(GatewayOp.IDENTIFY, { token });
    await gc.waitFor('READY');
    return gc;
  }

  send(op: GatewayOp, d?: unknown): void {
    this.ws.send(JSON.stringify({ op, d }));
  }

  waitFrame(pred: (f: Frame) => boolean, timeout = 3000): Promise<Frame> {
    return new Promise((resolve, reject) => {
      const check = () => {
        const f = this.frames.find(pred);
        if (f) {
          cleanup();
          resolve(f);
        } else if (this.closeCode !== null) {
          cleanup();
          reject(new Error(`socket closed (${this.closeCode}) while waiting`));
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('timed out waiting for gateway frame'));
      }, timeout);
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      this.listeners.add(check);
      check();
    });
  }

  /** Waits for (and consumes) a dispatch of type t matching pred. */
  async waitFor<K extends DispatchEventName>(
    t: K, pred: (d: DispatchEvents[K]) => boolean = () => true, timeout = 3000,
  ): Promise<DispatchEvents[K]> {
    const f = await this.waitFrame((x) => x.op === GatewayOp.DISPATCH && x.t === t && pred(x.d), timeout).catch((e) => {
      throw new Error(`${e.message} (${t}); got: ${this.dispatches.map((x) => x.t).join(', ')}`);
    });
    this.frames.splice(this.frames.indexOf(f), 1);
    return f.d;
  }

  /** Resolves true if no matching dispatch arrives within ms. */
  async expectNone<K extends DispatchEventName>(t: K, pred: (d: DispatchEvents[K]) => boolean = () => true, ms = 300): Promise<boolean> {
    try {
      await this.waitFrame((x) => x.op === GatewayOp.DISPATCH && x.t === t && pred(x.d), ms);
      return false;
    } catch {
      return true;
    }
  }

  waitClose(timeout = 3000): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.closeCode !== null) return resolve(this.closeCode);
      const timer = setTimeout(() => reject(new Error('timed out waiting for close')), timeout);
      this.ws.once('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.CLOSED) return resolve();
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal PNG header (enough for dimension sniffing). */
export function fakePng(width: number, height: number): Buffer {
  const b = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

/** Creates a guild owned by `owner` and returns it with handy ids. */
export async function setupGuild(owner: TestUser, name = 'Test Server') {
  const g = expectStatus(await owner.api.post('/guilds', { name }), 200);
  const general = g.channels.find((c: any) => c.name === 'general');
  const voice = g.channels.find((c: any) => c.type === 2);
  return { guild: g, guildId: g.id as string, generalId: general.id as string, voiceId: voice.id as string };
}

export async function joinGuild(owner: TestUser, channelId: string, ...users: TestUser[]) {
  const inv = expectStatus(await owner.api.post(`/channels/${channelId}/invites`, {}), 200);
  for (const u of users) expectStatus(await u.api.post(`/invites/${inv.code}`), 200);
  return inv.code as string;
}
