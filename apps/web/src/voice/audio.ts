// One shared AudioContext for the media engine (speaking detection, fake media, UI sounds).
let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

/** Call from a user gesture (join / accept click) so later audio is allowed to start. */
export function unlockAudio(): void {
  try { audioContext(); } catch { /* audio unavailable */ }
}
