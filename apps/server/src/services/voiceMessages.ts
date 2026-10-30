// Voice messages: a single recorded audio file plus client-computed duration and waveform.
import { LIMITS } from '@huddle/shared';
import { invalidField } from '../errors';
import { guessContentType } from '../uploads';
import type { UploadedFile } from '../routes/util';

export interface VoiceMeta { duration_secs: number; waveform: string | null; content_type: string }

/** Validates `voice_message: { duration_secs, waveform }` against the uploaded files; null when absent. */
export function parseVoiceMessage(raw: unknown, files: UploadedFile[]): VoiceMeta | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw invalidField('voice_message', 'voice_message must be an object');
  if (files.length !== 1) throw invalidField('voice_message', 'A voice message must have exactly one audio file');
  const f = files[0];
  let type = guessContentType(f.filename, f.mimetype).split(';')[0];
  if (type === 'video/webm') type = 'audio/webm'; // MediaRecorder output is often labelled by container
  if (!type.startsWith('audio/')) throw invalidField('voice_message', 'Voice messages must be audio');
  const v = raw as Record<string, unknown>;
  const duration = Number(v.duration_secs);
  if (!Number.isFinite(duration) || duration <= 0 || duration > LIMITS.VOICE_MESSAGE_SECS + 1) {
    throw invalidField('voice_message.duration_secs', `duration_secs must be between 0 and ${LIMITS.VOICE_MESSAGE_SECS}`);
  }
  let waveform: string | null = null;
  if (v.waveform !== undefined && v.waveform !== null) {
    if (typeof v.waveform !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(v.waveform)) {
      throw invalidField('voice_message.waveform', 'waveform must be base64');
    }
    if (Buffer.from(v.waveform, 'base64').length > LIMITS.VOICE_WAVEFORM_BYTES) {
      throw invalidField('voice_message.waveform', `waveform must be at most ${LIMITS.VOICE_WAVEFORM_BYTES} bytes`);
    }
    waveform = v.waveform || null;
  }
  return { duration_secs: Math.round(duration * 100) / 100, waveform, content_type: type };
}
