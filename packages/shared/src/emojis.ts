// Custom server emoji.
//
// Message syntax (stored in content; the composer converts typed ":name:" into these tokens):
//   <:NAME:ID>   static custom emoji
//   <a:NAME:ID>  animated (GIF) custom emoji
// Clients resolve ID against the emoji lists of the servers they belong to; an unknown or deleted ID
// renders as ":NAME:" text. The composer only converts emoji of the server the channel belongs to.
//
// Reactions keep a single string key per emoji: unicode reactions use the emoji itself, custom
// reactions use "c:ID" (stable across renames). Reaction routes also accept "NAME:ID" and tokens.

export const EMOJI_NAME_RE = /^[A-Za-z0-9_]{2,32}$/;
export const EMOJI_LIMITS = {
  PER_GUILD: 50,
  BYTES: 256 * 1024,
  NAME_MIN: 2,
  NAME_MAX: 32,
} as const;

/** Matches <:name:id> and <a:name:id>. Groups: 1 = "a" or "", 2 = name, 3 = id. */
export const CUSTOM_EMOJI_RE = /<(a?):([A-Za-z0-9_]{2,32}):(\d{1,20})>/g;

export interface CustomEmojiRef {
  id: string;
  name: string;
  animated: boolean;
  url: string;
}

export function emojiToken(e: { id: string; name: string; animated: boolean }): string {
  return `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;
}

/** Parses a single <:name:id> token (whole string). */
export function parseEmojiToken(s: string): { id: string; name: string; animated: boolean } | null {
  const m = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{1,20})>$/.exec(s);
  return m ? { id: m[3], name: m[2], animated: m[1] === 'a' } : null;
}

export const customReactionKey = (id: string): string => `c:${id}`;

/** Custom emoji id from a reaction key ("c:ID"), or null for unicode reactions. */
export function customReactionId(key: string): string | null {
  const m = /^c:(\d{1,20})$/.exec(key);
  return m ? m[1] : null;
}

/** Turns "c:ID", "NAME:ID", "a:NAME:ID" or a <:NAME:ID> token into "c:ID"; anything else is returned unchanged. */
export function normalizeReactionKey(raw: string): string {
  const tok = parseEmojiToken(raw);
  if (tok) return customReactionKey(tok.id);
  const m = /^(?:a:)?(?:c|[A-Za-z0-9_]{2,32}):(\d{1,20})$/.exec(raw);
  return m ? customReactionKey(m[1]) : raw;
}
