import { describe, expect, it } from "vitest";
import { createMediaCacheService } from "./mediaCacheService";

function storage(seed: Record<string, string>): Storage {
  const map = new Map(Object.entries(seed));
  return {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(key) { return map.get(key) ?? null; },
    key(index) { return [...map.keys()][index] ?? null; },
    removeItem(key) { map.delete(key); },
    setItem(key, value) { map.set(key, value); },
  };
}

describe("media cache service", () => {
  it("clears playback cache keys without touching Rixia data", () => {
    const target = storage({
      "focubili.playback-progress.v1:BV1:1": JSON.stringify({ positionSeconds: 20 }),
      "focubili.playback-progress.v1:BV2:2": JSON.stringify({ positionSeconds: 30 }),
      "rixia_tasks_v1": "keep me",
      "rixia_learning_list_v1": "keep me too",
    });
    const service = createMediaCacheService(target);

    expect(service.stats()).toEqual({ count: 2, bytes: expect.any(Number) });
    service.clear();
    expect(target.getItem("rixia_tasks_v1")).toBe("keep me");
    expect(target.getItem("rixia_learning_list_v1")).toBe("keep me too");
    expect(service.stats()).toEqual({ count: 0, bytes: 0 });
  });
});
