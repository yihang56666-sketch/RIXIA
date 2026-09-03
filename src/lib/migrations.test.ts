import { describe, expect, it } from "vitest";
import { migratePersistedState, validateBackup } from "./migrations";
import { THEMES, THEME_MIGRATION } from "../catalog";

describe("persisted state v2 migration", () => {
  it("maps v1 videos and themes without changing existing ids", () => {
    const result = migratePersistedState(
      {
        theme: "paper",
        videos: [{ id: "v1", bvid: "BV1", title: "课", addedAt: "2026-08-01T00:00:00.000Z" }],
        tasks: [
          { id: "t1", title: "读书", done: false, due: null, createdAt: "2026-08-01T00:00:00.000Z" },
        ],
      },
      1,
    );
    expect(result.theme).toBe("porcelain");
    expect(result.resources?.[0]).toMatchObject({ id: "v1", bvid: "BV1", status: "saved" });
    expect(result.tasks?.[0].id).toBe("t1");
    expect(result.activeFocus).toBeNull();
    expect(result.density).toBe("standard");
  });

  it("migrates all legacy theme keys to new skin keys", () => {
    const keys = Object.keys(THEME_MIGRATION);
    expect(keys).toEqual(
      expect.arrayContaining(["paper", "mist", "matcha", "sunset", "ink", "graphite", "dusk", "deep"]),
    );
    for (const legacy of keys) {
      const result = migratePersistedState({ theme: legacy }, 1);
      expect(result.theme, `legacy ${legacy}`).toBeTruthy();
    }
  });

  it("keeps already-v2 theme keys intact", () => {
    const result = migratePersistedState({ theme: "aurora", density: "compact" }, 2);
    expect(result.theme).toBe("aurora");
    expect(result.density).toBe("compact");
  });

  it("includes exactly 11 skin keys (10 skins + system)", () => {
    expect(THEMES).toHaveLength(11);
    expect(THEMES.map((t) => t.key)).toEqual(
      expect.arrayContaining([
        "porcelain", "graphite", "sage", "aurora", "rosewood",
        "mono", "ocean", "ember", "lavender", "ink", "system",
      ]),
    );
  });

  it("deduplicates resources by id when both legacy videos and new resources exist", () => {
    const result = migratePersistedState(
      {
        videos: [{ id: "r1", bvid: "BV1", title: "旧", addedAt: "2026-08-01T00:00:00.000Z" }],
        resources: [
          { id: "r1", bvid: "BV1", title: "新", status: "in-progress", addedAt: "2026-08-01T00:00:00.000Z" },
        ],
      },
      1,
    );
    expect(result.resources).toHaveLength(1);
    expect(result.resources?.[0]).toMatchObject({ id: "r1", title: "新", status: "in-progress" });
  });

  it("preserves supported external resource links during migration", () => {
    const result = migratePersistedState({
      resources: [{ id: "q1", bvid: "", url: "https://pan.quark.cn/s/abc", title: "网盘课", status: "saved", addedAt: "2026-08-01T00:00:00.000Z" }],
    }, 3);
    expect(result.resources?.[0]).toMatchObject({ id: "q1", source: "quark", url: "https://pan.quark.cn/s/abc" });
  });

  it("drops malformed timestamp notes and focus sessions", () => {
    const result = migratePersistedState(
      {
        timestampNotes: [
          { id: "n1", resourceId: "r1", seconds: 30, body: "ok", createdAt: "2026-08-01T00:00:00.000Z" },
          { id: "n2", resourceId: "r1", seconds: -1, body: "bad", createdAt: "2026-08-01T00:00:00.000Z" },
        ],
        focusSessions: [
          { id: "f1", date: "2026-08-01", minutes: 25, completedAt: "2026-08-01T00:00:00.000Z" },
          { id: "f2", date: "", minutes: 0, completedAt: "" },
        ],
      },
      1,
    );
    expect(result.timestampNotes).toHaveLength(1);
    expect(result.focusSessions).toHaveLength(1);
  });

  it("rejects backups without an array of tasks", () => {
    expect(() => validateBackup({ data: { notes: [] } })).toThrow("有效的 RIXIA");
  });

  it("rejects non-object backups", () => {
    expect(() => validateBackup("not an object")).toThrow("有效的 RIXIA");
    expect(() => validateBackup(null)).toThrow("有效的 RIXIA");
  });

  it("round-trips a complete backup object", () => {
    const backup = {
      formatVersion: 3,
      theme: "graphite",
      density: "comfortable",
      enabledTools: ["tasks", "focus"],
      inbox: [{ id: "i1", text: "想法", createdAt: "2026-08-01T00:00:00.000Z" }],
      tasks: [{ id: "t1", title: "读书", done: false, due: null, createdAt: "2026-08-01T00:00:00.000Z" }],
      habits: [],
      notes: [],
      countdowns: [],
      subjects: [],
      studyUnits: [],
      focusSessions: [],
      focusGoalMinutes: 90,
      resources: [{ id: "r1", bvid: "BV1", title: "课", status: "saved", addedAt: "2026-08-01T00:00:00.000Z" }],
      timestampNotes: [],
    };
    const validated = validateBackup(backup);
    expect(validated.theme).toBe("graphite");
    expect(validated.density).toBe("comfortable");
    expect(validated.tasks).toHaveLength(1);
    expect(validated.resources[0].bvid).toBe("BV1");
    expect(validated.companion).toBeNull();
  });

  it("validates the companion block and keeps legacy backups companion-free", () => {
    const withCompanion = validateBackup({
      data: {
        tasks: [],
        habits: [],
        notes: [],
        inbox: [],
        countdowns: [],
        companion: {
          focusActiveSession: { id: "a1" },
          focusHistory: [{ id: "f1" }],
          videoNotes: [{ id: "n1" }],
          watchHistory: "junk",
          learningList: [],
          localWatchHistory: [],
        },
      },
    });
    expect(withCompanion.companion).toEqual({
      focusActiveSession: { id: "a1" },
      focusHistory: [{ id: "f1" }],
      videoNotes: [{ id: "n1" }],
      watchHistory: [],
      learningList: [],
      localWatchHistory: [],
    });
  });

  it("caps oversized background data URLs instead of accepting persistence-breaking images", () => {
    const big = "data:image/png;base64," + "A".repeat(2_000_000);
    const rejected = validateBackup({ data: { tasks: [], habits: [], notes: [], inbox: [], countdowns: [], backgroundImage: big } });
    expect(rejected.backgroundImage).toBeNull();
    const accepted = validateBackup({ data: { tasks: [], habits: [], notes: [], inbox: [], countdowns: [], backgroundImage: "data:image/webp;base64,AAAA" } });
    expect(accepted.backgroundImage).toBe("data:image/webp;base64,AAAA");
  });
});
