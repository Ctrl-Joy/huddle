// Synced per-user settings (server folders + rail order). READY / USER_SETTINGS_UPDATE fill it; edits are
// applied optimistically and PATCHed to /users/@me/settings so every device follows.
import { create } from 'zustand';
import type { GuildFolder, UserSettings } from '@huddle/shared';
import { api, errorMessage } from '../api/client';
import { useGuildStore } from './guilds';
import { toast } from './ui';

interface UserSettingsStore {
  guildFolders: GuildFolder[];
  apply(s: UserSettings): void;
  reset(): void;
}

export const useUserSettingsStore = create<UserSettingsStore>()((set) => ({
  guildFolders: [],
  apply: (s) => {
    set({ guildFolders: s.guild_folders });
    // server positions win; guilds it doesn't know yet (just joined) keep their local place at the end
    if (s.guild_positions.length) {
      const gs = useGuildStore.getState();
      const known = s.guild_positions.filter((id) => gs.guilds[id]);
      const rest = gs.guildOrder.filter((id) => !known.includes(id));
      gs.setGuildOrder([...known, ...rest]);
    }
  },
  reset: () => set({ guildFolders: [] }),
}));

let saveSeq = 0;

/** Optimistically applies + saves a new folder layout. Reverts (and toasts) if the server rejects it. */
export async function saveRailLayout(next: UserSettings): Promise<void> {
  const prev: UserSettings = { guild_folders: useUserSettingsStore.getState().guildFolders, guild_positions: useGuildStore.getState().guildOrder };
  useUserSettingsStore.getState().apply(next);
  const seq = ++saveSeq;
  try {
    await api.patch<UserSettings>('/users/@me/settings', next);
  } catch (e) {
    if (seq === saveSeq) useUserSettingsStore.getState().apply(prev);
    toast(errorMessage(e), 'error');
  }
}
