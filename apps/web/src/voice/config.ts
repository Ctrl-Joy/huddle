import { getToken } from '../api/client';

// ICE configuration: public STUN plus an optional TURN relay. The relay comes from the server
// (/api/ice, set by HUDDLE_TURN_* on the host) or, failing that, from Vite env (see apps/web/.env.example).
let serverIce: RTCIceServer[] = [];
let loaded: Promise<void> | null = null;
const ICE_REFRESH_MS = 12 * 60 * 60 * 1000;

/** Fetches the server's relay config once; safe to call repeatedly. */
export function loadIceServers(): Promise<void> {
  const token = getToken();
  loaded ??= fetch('/api/ice', token ? { headers: { authorization: token } } : undefined)
    .then((r) => (r.ok ? r.json() : { iceServers: [] }))
    .then((d: { iceServers?: RTCIceServer[] }) => {
      serverIce = d.iceServers ?? [];
      // relay credentials expire after a day; fetch fresh ones well before that
      if (serverIce.length) setTimeout(() => { loaded = null; void loadIceServers(); }, ICE_REFRESH_MS);
    })
    .catch(() => { loaded = null; });
  return loaded;
}

export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (serverIce.length) return servers.concat(serverIce);
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
