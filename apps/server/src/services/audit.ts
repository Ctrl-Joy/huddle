import type { AuditLogAction } from '@huddle/shared';
import { now, type Ctx } from '../context';

export type Change = { key: string; old_value?: unknown; new_value?: unknown };

export function writeAudit(
  ctx: Ctx,
  guildId: string,
  userId: string,
  action: AuditLogAction,
  targetId: string | null,
  changes: Change[] = [],
  reason: string | null = null,
): void {
  ctx.db.run(
    `INSERT INTO audit_log (id, guild_id, user_id, target_id, action_type, changes, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ctx.id(), guildId, userId, targetId, action, JSON.stringify(changes), reason ? String(reason).slice(0, 512) : null, now(),
  );
}

/** Builds a change list from before/after objects for the given keys. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>, keys: string[]): Change[] {
  const out: Change[] = [];
  for (const k of keys) {
    if (!(k in after)) continue;
    const a = before[k], b = after[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ key: k, old_value: a, new_value: b });
  }
  return out;
}
