// Audience queries used by the gateway fan-out helpers.
import type { Db } from '../db';

/** Users who should see this user's presence: guild co-members, friends, DM recipients (and self). */
export function presenceAudience(db: Db, userId: string): string[] {
  const rows = db.all<{ id: string }>(
    `SELECT m2.user_id AS id FROM members m1 JOIN members m2 ON m2.guild_id = m1.guild_id WHERE m1.user_id = ?
     UNION SELECT other_id AS id FROM relationships WHERE user_id = ? AND type = 1
     UNION SELECT r2.user_id AS id FROM channel_recipients r1 JOIN channel_recipients r2 ON r2.channel_id = r1.channel_id
            WHERE r1.user_id = ?
     UNION SELECT ? AS id`,
    userId, userId, userId, userId,
  );
  return rows.map((r) => r.id);
}

export function guildMemberIds(db: Db, guildId: string): string[] {
  return db.all<{ user_id: string }>('SELECT user_id FROM members WHERE guild_id = ?', guildId).map((r) => r.user_id);
}

/** Friends + DM recipients: the people whose presence goes into READY.presences. */
export function readyPresenceIds(db: Db, userId: string): string[] {
  return db.all<{ id: string }>(
    `SELECT other_id AS id FROM relationships WHERE user_id = ? AND type = 1
     UNION SELECT r2.user_id AS id FROM channel_recipients r1 JOIN channel_recipients r2 ON r2.channel_id = r1.channel_id
            WHERE r1.user_id = ? AND r2.user_id != ?`,
    userId, userId, userId,
  ).map((r) => r.id);
}
