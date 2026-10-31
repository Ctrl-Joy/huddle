// Per-server custom stickers (filled from READY / GUILD_CREATE, replaced by GUILD_STICKERS_UPDATE) and the
// server capability flags from GET /api/config (GIF search on/off).
import { create } from 'zustand';
import type { ClientConfig, FullGuild, GuildSticker } from '@huddle/shared';
import { api } from '../api/client';

interface StickerState {
  byGuild: Record<string, GuildSticker[]>;
  load(guilds: FullGuild[]): void;
  set(guildId: string, stickers: GuildSticker[]): void;
}

export const useStickerStore = create<StickerState>((set) => ({
  byGuild: {},
  load: (guilds) => set({ byGuild: Object.fromEntries(guilds.map((g) => [g.id, g.stickers ?? []])) }),
  set: (guildId, stickers) => set((s) => ({ byGuild: { ...s.byGuild, [guildId]: stickers } })),
}));

interface ConfigState { config: ClientConfig | null; loading: boolean }

export const useServerConfig = create<ConfigState>(() => ({ config: null, loading: false }));

/** Fetches /api/config once (call from components that need a capability flag). */
export function ensureServerConfig(): void {
  const s = useServerConfig.getState();
  if (s.config || s.loading) return;
  useServerConfig.setState({ loading: true });
  api.get<ClientConfig>('/config')
    .then((config) => useServerConfig.setState({ config, loading: false }))
    .catch(() => useServerConfig.setState({ config: { gifs: false, gif_provider: null }, loading: false }));
}
