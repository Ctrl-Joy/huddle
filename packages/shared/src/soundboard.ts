// Voice soundboard.
//
// Anyone connected to a voice channel or DM call can play a sound for everyone else in it:
// POST /channels/:id/soundboard { sound_id } → SOUNDBOARD_SOUND_PLAY to the members connected to
// that call (the sender included). Each client plays it locally with Web Audio at its own
// "Soundboard volume" and skips the audio while deafened.
//
// sound_id is either a built-in id ("builtin:<key>", synthesized on the client — no audio files) or
// the id of an uploaded sound belonging to the voice channel's server. Uploaded sounds are managed
// with the MANAGE_EMOJIS permission (Server Settings → Soundboard), same as custom emoji.

export const SOUNDBOARD_LIMITS = {
  PER_GUILD: 16,
  BYTES: 512 * 1024,
  MAX_DURATION_MS: 5_000,
  NAME_MIN: 2,
  NAME_MAX: 32,
  /** Max length of the emoji field (one emoji, possibly with modifiers / ZWJ sequences). */
  EMOJI_MAX: 16,
  /** One sound per user per this many ms. */
  COOLDOWN_MS: 2_000,
} as const;

export interface SoundboardSound {
  id: string;
  guild_id: string;
  name: string;
  emoji: string | null;
  url: string;
  duration_ms: number;
  creator_id: string | null;
}

export interface BuiltinSound { id: string; name: string; emoji: string }

/** Built-in sounds; the web client synthesizes each one in code (voice/soundboard.ts). */
export const BUILTIN_SOUNDS: readonly BuiltinSound[] = [
  { id: 'builtin:fanfare', name: 'Fanfare', emoji: '📯' },
  { id: 'builtin:drumroll', name: 'Drum Roll', emoji: '🥁' },
  { id: 'builtin:applause', name: 'Applause', emoji: '👏' },
  { id: 'builtin:boing', name: 'Boing', emoji: '🦘' },
  { id: 'builtin:ding', name: 'Ding', emoji: '🔔' },
  { id: 'builtin:whoosh', name: 'Whoosh', emoji: '💨' },
  { id: 'builtin:womp', name: 'Womp Womp', emoji: '🎺' },
  { id: 'builtin:crickets', name: 'Crickets', emoji: '🦗' },
];

export const isBuiltinSound = (id: string): boolean => BUILTIN_SOUNDS.some((s) => s.id === id);

/** SOUNDBOARD_SOUND_PLAY payload. url is null for built-in sounds. */
export interface SoundboardPlayEvent {
  channel_id: string;
  guild_id: string | null;
  user_id: string;
  sound_id: string;
  name: string;
  emoji: string | null;
  url: string | null;
}
