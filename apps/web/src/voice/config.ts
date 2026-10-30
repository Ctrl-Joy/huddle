// ICE configuration: public STUN plus an optional TURN relay from Vite env (see apps/web/.env.example).
export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const env = import.meta.env;
  const turn = (env.VITE_TURN_URL as string | undefined)?.trim();
  if (turn) {
    servers.push({
      urls: turn.split(',').map((u) => u.trim()).filter(Boolean),
      username: (env.VITE_TURN_USERNAME as string | undefined) || undefined,
      credential: (env.VITE_TURN_CREDENTIAL as string | undefined) || undefined,
    });
  }
  return servers;
}

/** Dev/test switch: synthesize mic/camera/screen instead of using real devices. */
export function fakeMediaEnabled(): boolean {
  try { return localStorage.getItem('huddle.fakeMedia') === '1'; } catch { return false; }
}
