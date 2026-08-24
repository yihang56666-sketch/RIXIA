import { describe, expect, it } from "vitest";
import { createPlaybackProgressStore } from "./playbackProgress";

describe("playback progress store", () => {
  it("keeps progress isolated by bvid and cid and restores it", () => {
    const storage = new Map<string, string>();
    const fakeStorage: Storage = {
      get length() { return storage.size; },
      clear() { storage.clear(); },
      getItem(key) { return storage.get(key) ?? null; },
      key(index) { return [...storage.keys()][index] ?? null; },
      removeItem(key) { storage.delete(key); },
      setItem(key, value) { storage.set(key, value); },
    };
    const store = createPlaybackProgressStore(fakeStorage);
    store.save("BV1", 10, 42, 600);
    store.save("BV1", 11, 88, 600);
    expect(store.load("BV1", 10)?.positionSeconds).toBe(42);
    expect(store.load("BV1", 11)?.positionSeconds).toBe(88);
  });

  it("resets positions within the final three seconds as completed", () => {
    const storage = new Map<string, string>();
    const fakeStorage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); },
    };
    const store = createPlaybackProgressStore(fakeStorage);
    store.save("BV2", 1, 598, 600);
    expect(store.load("BV2", 1)?.positionSeconds).toBe(0);
  });
});
