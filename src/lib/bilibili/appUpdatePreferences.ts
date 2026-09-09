const STARTUP_UPDATE_CHECK_KEY = "rixia_focubili_startup_update_check_v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export interface AppUpdatePreferencesService {
  loadStartupCheckEnabled(): boolean;
  saveStartupCheckEnabled(enabled: boolean): boolean;
  checkAtStartup<T>(checker: () => Promise<T>): Promise<T | undefined>;
}

export function createAppUpdatePreferencesService(
  storage: StorageLike = localStorage,
): AppUpdatePreferencesService {
  return {
    loadStartupCheckEnabled() {
      try {
        return storage.getItem(STARTUP_UPDATE_CHECK_KEY) !== "false";
      } catch {
        return true;
      }
    },
    saveStartupCheckEnabled(enabled) {
      try {
        storage.setItem(STARTUP_UPDATE_CHECK_KEY, String(enabled));
        return true;
      } catch {
        // A blocked storage environment must not stop the app from loading.
        return false;
      }
    },
    async checkAtStartup(checker) {
      if (!this.loadStartupCheckEnabled()) return undefined;
      return checker();
    },
  };
}
