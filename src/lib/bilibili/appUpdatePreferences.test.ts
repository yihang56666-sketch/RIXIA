import { describe, expect, it } from "vitest";
import { createAppUpdatePreferencesService } from "./appUpdatePreferences";

describe("createAppUpdatePreferencesService", () => {
  it("defaults to checking at startup and persists an explicit opt-out", () => {
    const storage = new Map<string, string>();
    const service = createAppUpdatePreferencesService({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
    });

    expect(service.loadStartupCheckEnabled()).toBe(true);
    service.saveStartupCheckEnabled(false);
    expect(service.loadStartupCheckEnabled()).toBe(false);
  });

  it("runs the supplied checker only when startup checks are enabled", async () => {
    const storage = new Map<string, string>();
    const service = createAppUpdatePreferencesService({
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
    });
    const check = async () => "checked";

    await expect(service.checkAtStartup(check)).resolves.toBe("checked");
    service.saveStartupCheckEnabled(false);
    await expect(service.checkAtStartup(check)).resolves.toBeUndefined();
  });
});
