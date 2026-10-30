import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';

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
