// Lets non-React modules (gateway bindings, notifications, menus) navigate.
type NavFn = (to: string) => void;
let navFn: NavFn = (to) => { window.history.pushState(null, '', to); };
export function setNavigator(fn: NavFn) { navFn = fn; }
export function navigate(to: string) { navFn(to); }

const LAST_KEY = 'huddle.lastChannels';
export function getLastChannel(guildId: string): string | null {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}')[guildId] ?? null; } catch { return null; }
}
export function setLastChannel(guildId: string, channelId: string) {
  try {
    const all = JSON.parse(localStorage.getItem(LAST_KEY) || '{}');
    all[guildId] = channelId;
    localStorage.setItem(LAST_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}
export function channelPath(c: { id: string; guild_id: string | null }): string {
  return c.guild_id ? `/channels/${c.guild_id}/${c.id}` : `/channels/@me/${c.id}`;
}
