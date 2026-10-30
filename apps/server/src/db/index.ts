import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';
import { THREAD_DEFAULT_PERMISSIONS } from '@huddle/shared';

// node:sqlite still emits an ExperimentalWarning on load; silence just that one.
const origEmitWarning = process.emitWarning;
process.emitWarning = function (warning: string | Error, ...rest: unknown[]) {
  const msg = typeof warning === 'string' ? warning : warning?.message;
  if (msg && /SQLite/i.test(msg)) return;
  return (origEmitWarning as (...a: unknown[]) => void).call(process, warning, ...rest);
} as typeof process.emitWarning;
const { DatabaseSync: DatabaseSyncCtor } = await import('node:sqlite');

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');

export type Param = SQLInputValue;
export type Row = Record<string, any>;

export class Db {
  readonly raw: DatabaseSync;
  private cache = new Map<string, StatementSync>();
  private depth = 0;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.raw = new DatabaseSyncCtor(file);
    if (file !== ':memory:') this.raw.exec('PRAGMA journal_mode = WAL');
    this.raw.exec('PRAGMA foreign_keys = ON');
    this.raw.exec('PRAGMA busy_timeout = 5000');
    this.raw.exec(SCHEMA);
    this.migrate();
  }

  /** Columns added after a table first shipped (CREATE TABLE IF NOT EXISTS won't add them). */
  private migrate(): void {
    const addColumns = (table: string, cols: Record<string, string>) => {
      const have = new Set((this.raw.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
      for (const [name, def] of Object.entries(cols)) {
        if (!have.has(name)) this.raw.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
      }
    };
    addColumns('guilds', {
      discoverable: 'INTEGER NOT NULL DEFAULT 0', category: 'TEXT', banner_color: 'TEXT', banner: 'TEXT', verified: 'INTEGER NOT NULL DEFAULT 0',
    });
    this.raw.exec('CREATE INDEX IF NOT EXISTS idx_guilds_discoverable ON guilds(discoverable)');
    addColumns('users', { banner: 'TEXT', accent_color: 'TEXT', pronouns: 'TEXT' });
    addColumns('channels', {
      archived: 'INTEGER NOT NULL DEFAULT 0', archive_timestamp: 'TEXT', auto_archive_duration: 'INTEGER NOT NULL DEFAULT 4320',
      message_count: 'INTEGER NOT NULL DEFAULT 0', last_message_at: 'TEXT', starter_message_id: 'TEXT',
      applied_tags: "TEXT NOT NULL DEFAULT '[]'", available_tags: "TEXT NOT NULL DEFAULT '[]'",
    });
    this.raw.exec('CREATE INDEX IF NOT EXISTS idx_channels_parent ON channels(parent_id)');
    this.raw.exec('CREATE INDEX IF NOT EXISTS idx_channels_starter ON channels(starter_message_id)');
    // One-off data migrations, recorded by name so they never run twice.
    this.raw.exec('CREATE TABLE IF NOT EXISTS data_migrations (name TEXT PRIMARY KEY)');
    const once = (name: string, fn: () => void) => {
      if (this.raw.prepare('SELECT 1 AS x FROM data_migrations WHERE name = ?').get(name)) return;
      fn();
      this.raw.prepare('INSERT INTO data_migrations (name) VALUES (?)').run(name);
    };
    // Servers created before threads existed: give @everyone the new default thread permissions.
    once('everyone_thread_perms', () => {
      this.raw.prepare('UPDATE roles SET permissions = CAST((CAST(permissions AS INTEGER) | ?) AS TEXT) WHERE id = guild_id')
        .run(THREAD_DEFAULT_PERMISSIONS);
    });
    // message features: flags (suppress embeds / voice), link previews, forwarded snapshot
    addColumns('messages', { flags: 'INTEGER NOT NULL DEFAULT 0', embeds: 'TEXT', forward_json: 'TEXT' });
    // voice message metadata; snapshot = 1 marks a forwarded copy that reuses the original file
    addColumns('attachments', {
      flags: 'INTEGER NOT NULL DEFAULT 0', duration_secs: 'REAL', waveform: 'TEXT', snapshot: 'INTEGER NOT NULL DEFAULT 0',
    });
    this.raw.exec('CREATE INDEX IF NOT EXISTS idx_attachments_url ON attachments(url)');
  }

  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  one<T = Row>(sql: string, ...params: Param[]): T | undefined {
    return this.stmt(sql).get(...params) as T | undefined;
  }

  all<T = Row>(sql: string, ...params: Param[]): T[] {
    return this.stmt(sql).all(...params) as T[];
  }

  run(sql: string, ...params: Param[]): { changes: number } {
    const r = this.stmt(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  /** Runs fn in a transaction (nested calls join the outer one). */
  tx<T>(fn: () => T): T {
    if (this.depth > 0) {
      this.depth++;
      try { return fn(); } finally { this.depth--; }
    }
    this.raw.exec('BEGIN IMMEDIATE');
    this.depth = 1;
    try {
      const r = fn();
      this.raw.exec('COMMIT');
      return r;
    } catch (e) {
      try { this.raw.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      this.depth = 0;
    }
  }

  close(): void {
    try { this.raw.close(); } catch { /* already closed */ }
  }
}

/** "?, ?, ?" for an IN (...) list. */
export const placeholders = (n: number): string => (n <= 0 ? 'NULL' : new Array(n).fill('?').join(', '));

export const bool = (v: unknown): number => (v ? 1 : 0);
