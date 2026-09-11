import { describe, expect, it } from "vitest";
import {
  exportCompanionBackup,
  importCompanionBackup,
  sanitizeCompanionBackup,
} from "./companionBackup";
import { ACTIVE_KEY, HISTORY_KEY as FOCUS_HISTORY_KEY } from "./bilibili/focusServices";
import { LEARNING_LIST_KEY, VIDEO_NOTES_KEY } from "./bilibili/services";

/** 极简内存 Storage，模拟 localStorage 行为（含配额失败路径）。 */
function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}

describe("companion backup", () => {
  it("exports all companion keys from device storage", () => {
    const storage = createMemoryStorage({
      [VIDEO_NOTES_KEY]: JSON.stringify([{ id: "n1", bvid: "BV1" }]),
      [LEARNING_LIST_KEY]: JSON.stringify([{ id: "BV1:1" }]),
      [FOCUS_HISTORY_KEY]: JSON.stringify([{ id: "f1" }]),
      [ACTIVE_KEY]: JSON.stringify({ id: "f-active", kind: "work" }),
      "focubili.playback-progress.v1:BV1:100": JSON.stringify({ positionSeconds: 42 }),
      "focubili.playback-progress.v1:BV2:200": JSON.stringify({ positionSeconds: 7 }),
      rixia_search_history_v1: JSON.stringify(["高数", "线代"]),
    });
    const exported = exportCompanionBackup(storage);
    expect(exported.videoNotes).toEqual([{ id: "n1", bvid: "BV1" }]);
    expect(exported.learningList).toEqual([{ id: "BV1:1" }]);
    expect(exported.focusHistory).toEqual([{ id: "f1" }]);
    expect(exported.focusActiveSession).toEqual({ id: "f-active", kind: "work" });
    expect(exported.watchHistory).toEqual([]);
    expect(exported.localWatchHistory).toEqual([]);
    expect(exported.playbackProgress).toEqual({
      "focubili.playback-progress.v1:BV1:100": JSON.stringify({ positionSeconds: 42 }),
      "focubili.playback-progress.v1:BV2:200": JSON.stringify({ positionSeconds: 7 }),
    });
    expect(exported.searchHistory).toEqual(["高数", "线代"]);
  });

  it("treats corrupt keys as empty instead of throwing", () => {
    const storage = createMemoryStorage({
      [VIDEO_NOTES_KEY]: "{not json",
      [FOCUS_HISTORY_KEY]: "just-a-string",
    });
    const exported = exportCompanionBackup(storage);
    expect(exported.videoNotes).toEqual([]);
    expect(exported.focusHistory).toEqual([]);
    expect(exported.focusActiveSession).toBeNull();
    expect(exported.playbackProgress).toEqual({});
    expect(exported.searchHistory).toEqual([]);
  });

  it("round-trips companion data through import", () => {
    const storage = createMemoryStorage();
    importCompanionBackup(
      {
        focusActiveSession: { id: "a1" },
        focusHistory: [{ id: "f1" }],
        videoNotes: [{ id: "n1" }],
        watchHistory: [],
        learningList: [{ id: "l1" }],
        localWatchHistory: [{ bvid: "BV1" }],
        playbackProgress: { "focubili.playback-progress.v1:BV1:100": '{"positionSeconds":42}' },
        searchHistory: ["考研英语"],
      },
      storage,
    );
    expect(JSON.parse(storage.getItem(VIDEO_NOTES_KEY) ?? "[]")).toEqual([{ id: "n1" }]);
    expect(JSON.parse(storage.getItem(LEARNING_LIST_KEY) ?? "[]")).toEqual([{ id: "l1" }]);
    expect(JSON.parse(storage.getItem(FOCUS_HISTORY_KEY) ?? "[]")).toEqual([{ id: "f1" }]);
    expect(JSON.parse(storage.getItem(ACTIVE_KEY) ?? "null")).toEqual({ id: "a1" });
    expect(storage.getItem("rixia_watch_history_v1")).toBe("[]");
    expect(storage.getItem("focubili.playback-progress.v1:BV1:100")).toBe('{"positionSeconds":42}');
    expect(storage.getItem("rixia_search_history_v1")).toBe('["考研英语"]');
  });

  it("removes the active-session key when the backup has no active session", () => {
    const storage = createMemoryStorage({ [ACTIVE_KEY]: '{"id":"stale"}' });
    importCompanionBackup(
      {
        focusActiveSession: null,
        focusHistory: [],
        videoNotes: [],
        watchHistory: [],
        learningList: [],
        localWatchHistory: [],
        playbackProgress: {},
        searchHistory: [],
      },
      storage,
    );
    expect(storage.getItem(ACTIVE_KEY)).toBeNull();
  });

  it("leaves existing playback progress untouched when restoring a legacy backup without the field", () => {
    const storage = createMemoryStorage({
      "focubili.playback-progress.v1:BV1:100": '{"positionSeconds":60}',
      rixia_search_history_v1: '["旧记录"]',
    });
    importCompanionBackup(
      {
        focusActiveSession: null,
        focusHistory: [],
        videoNotes: [],
        watchHistory: [],
        learningList: [],
        localWatchHistory: [],
        playbackProgress: null,
        searchHistory: null,
      },
      storage,
    );
    expect(storage.getItem("focubili.playback-progress.v1:BV1:100")).toBe('{"positionSeconds":60}');
    expect(storage.getItem("rixia_search_history_v1")).toBe('["旧记录"]');
  });

  it("import clears stale progress keys that are absent from the backup snapshot", () => {
    const storage = createMemoryStorage({
      "focubili.playback-progress.v1:BV1:100": '{"positionSeconds":60}',
      "focubili.playback-progress.v1:BV9:900": '{"positionSeconds":5}',
    });
    importCompanionBackup(
      {
        focusActiveSession: null,
        focusHistory: [],
        videoNotes: [],
        watchHistory: [],
        learningList: [],
        localWatchHistory: [],
        playbackProgress: { "focubili.playback-progress.v1:BV1:100": '{"positionSeconds":42}' },
        searchHistory: [],
      },
      storage,
    );
    expect(storage.getItem("focubili.playback-progress.v1:BV1:100")).toBe('{"positionSeconds":42}');
    expect(storage.getItem("focubili.playback-progress.v1:BV9:900")).toBeNull();
  });

  it("sanitize keeps valid shapes and drops malformed fields", () => {
    const sanitized = sanitizeCompanionBackup({
      focusActiveSession: { id: "a1" },
      focusHistory: "not-an-array",
      videoNotes: [{ id: "n1" }],
      watchHistory: 42,
      learningList: null,
      localWatchHistory: [],
      playbackProgress: {
        "focubili.playback-progress.v1:BV1:100": '{"positionSeconds":42}',
        "evil-key": "dropped",
        "focubili.playback-progress.v1:BV2:200": 42,
      },
      searchHistory: ["ok", 42],
    });
    expect(sanitized).toEqual({
      focusActiveSession: { id: "a1" },
      focusHistory: [],
      videoNotes: [{ id: "n1" }],
      watchHistory: [],
      learningList: [],
      localWatchHistory: [],
      playbackProgress: { "focubili.playback-progress.v1:BV1:100": '{"positionSeconds":42}' },
      searchHistory: ["ok"],
    });
  });

  it("sanitize maps missing new fields to null (legacy backups keep device data)", () => {
    const sanitized = sanitizeCompanionBackup({
      focusActiveSession: null,
      focusHistory: [],
      videoNotes: [],
      watchHistory: [],
      learningList: [],
      localWatchHistory: [],
    });
    expect(sanitized?.playbackProgress).toBeNull();
    expect(sanitized?.searchHistory).toBeNull();
  });

  it("sanitize returns null for non-object blocks (legacy backups)", () => {
    expect(sanitizeCompanionBackup(undefined)).toBeNull();
    expect(sanitizeCompanionBackup("junk")).toBeNull();
    expect(sanitizeCompanionBackup([1, 2])).toBeNull();
  });

  it("a single failing write does not block the remaining keys", () => {
    const storage = createMemoryStorage();
    let failed = false;
    const flaky: Storage = {
      ...storage,
      setItem: (key, value) => {
        if (key === FOCUS_HISTORY_KEY) {
          failed = true;
          throw new Error("QuotaExceededError");
        }
        storage.setItem(key, value);
      },
    };
    expect(() =>
      importCompanionBackup(
        {
          focusActiveSession: null,
          focusHistory: [{ id: "f1" }],
          videoNotes: [{ id: "n1" }],
          watchHistory: [],
          learningList: [],
          localWatchHistory: [],
          playbackProgress: {},
          searchHistory: [],
        },
        flaky,
      ),
    ).not.toThrow();
    expect(failed).toBe(true);
    expect(JSON.parse(storage.getItem(VIDEO_NOTES_KEY) ?? "[]")).toEqual([{ id: "n1" }]);
  });
});
