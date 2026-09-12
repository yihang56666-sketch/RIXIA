import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VIDEO_NOTES_KEY } from "../lib/bilibili/services";
import { useAppStore } from "./useAppStore";

const initialState = useAppStore.getInitialState();

describe("persisted state validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState(initialState, true);
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAppStore.setState(initialState, true);
    localStorage.clear();
  });

  it("validates current-version snapshots without replacing store actions", async () => {
    const task = {
      id: "valid-task", title: "保留有效任务", done: false,
      due: null, createdAt: "2026-09-05T12:00:00.000Z", completedAt: null,
    };
    localStorage.setItem("rixia-v1", JSON.stringify({
      version: 3,
      state: {
        tasks: [null, task, "invalid"], habits: "invalid", notes: {},
        view: "missing-page", focusMinutes: "invalid", addTask: "invalid",
      },
    }));

    await useAppStore.persist.rehydrate();

    const state = useAppStore.getState();
    expect(state.tasks).toEqual([task]);
    expect(state.habits).toEqual([]);
    expect(state.notes).toEqual([]);
    expect(state.view).toBe("focus-dashboard");
    expect(state.focusMinutes).toBe(25);
    expect(state.addTask).toBe(initialState.addTask);
  });

  it("preserves valid playback and focus recovery fields", async () => {
    const activeFocus = {
      startedAt: "2026-09-05T12:00:00.000Z", mode: "countdown", phase: "focus",
      running: false, remainingSeconds: 180, completedRounds: 2,
    };
    localStorage.setItem("rixia-v1", JSON.stringify({
      version: 3,
      state: {
        theme: "graphite", view: "bilibili-player", activeBilibiliBvid: "BV1abcdefg12",
        activeBilibiliPlaybackTarget: { cid: 42, seconds: 12.5 }, activeFocus,
      },
    }));

    await useAppStore.persist.rehydrate();

    expect(useAppStore.getState()).toMatchObject({
      theme: "graphite", view: "bilibili-player", activeBilibiliBvid: "BV1abcdefg12",
      activeBilibiliPlaybackTarget: { cid: 42, seconds: 12.5 }, activeFocus,
    });
  });

  it("does not replace fresh-install defaults when no snapshot exists", async () => {
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().theme).toBe("system");
    expect(useAppStore.getState().view).toBe("focus-dashboard");
  });

  it("reports a companion write failure rather than claiming the backup is restored", () => {
    const backup = useAppStore.getState().exportBackup();
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === VIDEO_NOTES_KEY) throw new DOMException("Storage full", "QuotaExceededError");
      write.call(this, key, value);
    });

    expect(() => useAppStore.getState().importBackup(backup)).toThrow(/未完整写入/);
  });

  it("reports a failed root snapshot write while preserving the in-memory recovery", () => {
    const backup = { ...useAppStore.getState().exportBackup(), theme: "graphite" };
    const write = Storage.prototype.setItem;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "rixia-v1") throw new DOMException("Storage full", "QuotaExceededError");
      write.call(this, key, value);
    });

    expect(() => useAppStore.getState().importBackup(backup)).toThrow(/未完整写入/);
    expect(useAppStore.getState().theme).toBe("graphite");
  });

  it("exposes a failed persist write as visible store state after a note is added", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const write = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === "rixia-v1") throw new DOMException("Storage full", "QuotaExceededError");
      write.call(this, key, value);
    });

    useAppStore.getState().addNote("只在内存里");
    await Promise.resolve();
    await Promise.resolve();

    expect(useAppStore.getState().notes[0]?.body).toBe("只在内存里");
    expect(useAppStore.getState().storageWriteFailed).toBe(true);
    expect(localStorage.getItem("rixia-v1")).toBeNull();
  });

  it("treats saving an empty journal body as deletion, matching the rehydrate contract", () => {
    useAppStore.getState().saveJournal("2026-09-12", "有内容的日记");
    expect(useAppStore.getState().journals.find((entry) => entry.date === "2026-09-12")?.body).toBe("有内容的日记");

    // 清空正文 = 删除该日日记（rehydrate 迁移本来就会丢弃空正文条目）。
    useAppStore.getState().saveJournal("2026-09-12", "   ");
    expect(useAppStore.getState().journals.find((entry) => entry.date === "2026-09-12")).toBeUndefined();

    // 不存在条目时写空正文是无操作，不会凭空创建一条注定被丢弃的数据。
    useAppStore.getState().saveJournal("2026-09-13", "");
    expect(useAppStore.getState().journals.find((entry) => entry.date === "2026-09-13")).toBeUndefined();
  });

  it("clears companion storage keys when resetting everything", () => {
    localStorage.setItem("rixia_focus_history", JSON.stringify([{ id: "f1" }]));
    localStorage.setItem("rixia_video_notes_v1", JSON.stringify([{ id: "n1" }]));
    localStorage.setItem("focubili.playback-progress.v1:BV1:100", '{"positionSeconds":42}');
    localStorage.setItem("focubili.local-watch-history.v1", "[]");
    localStorage.setItem("unrelated-app-key", "keep-me");

    useAppStore.getState().resetAll();

    expect(localStorage.getItem("rixia_focus_history")).toBeNull();
    expect(localStorage.getItem("rixia_video_notes_v1")).toBeNull();
    expect(localStorage.getItem("focubili.playback-progress.v1:BV1:100")).toBeNull();
    expect(localStorage.getItem("focubili.local-watch-history.v1")).toBeNull();
    expect(localStorage.getItem("unrelated-app-key")).toBe("keep-me");
  });
});
