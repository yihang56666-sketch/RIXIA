import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importCompanionBackup } from "../../lib/companionBackup";
import { createFocusSession, finishAt, FocusSessionStatus } from "../../lib/bilibili/focusSessionModel";
import { HISTORY_KEY } from "../../lib/bilibili/focusServices";
import { focusTimerController } from "./useFocusTimer";

describe("focus controller backup recovery", () => {
  beforeEach(async () => {
    await vi.waitFor(() => expect(focusTimerController.ready).toBe(true));
    await focusTimerController.endFocusEarly();
    await focusTimerController.clearHistory();
    localStorage.clear();
  });

  afterEach(async () => {
    await focusTimerController.endFocusEarly();
    await focusTimerController.clearHistory();
    localStorage.clear();
  });

  it("reloads restored history and does not overwrite it with the old singleton state", async () => {
    await focusTimerController.startFocus({ goal: "旧任务", durationMs: 60_000 });
    await focusTimerController.endFocusEarly();
    expect(focusTimerController.history).toHaveLength(1);
    const restored = finishAt(createFocusSession({
      id: "restored-session", goal: "已恢复任务", plannedDurationMs: 60_000,
      now: "2026-09-05T12:00:00.000Z",
    }), Date.parse("2026-09-05T12:01:00.000Z"), FocusSessionStatus.completed, "时间到");

    importCompanionBackup({
      focusActiveSession: null, focusHistory: [restored], videoNotes: [],
      watchHistory: [], learningList: [], localWatchHistory: [],
      playbackProgress: {}, searchHistory: [],
      danmakuPreferences: null, playbackPreferences: null,
      focusSessions: null, bilibiliCookie: null, bilibiliAuth: null,
    });

    await vi.waitFor(() => expect(focusTimerController.history.map((session) => session.id)).toEqual(["restored-session"]));
    expect(focusTimerController.lastFinishedSession).toBeNull();
    const deleted = await focusTimerController.deleteHistoryEntry("missing-session");
    expect(deleted).toBe(true);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]")).toEqual([restored]);
  });

  it("keeps history intact and reports failure when deleting an entry cannot be persisted", async () => {
    await focusTimerController.startFocus({ goal: "请勿删除", durationMs: 60_000 });
    await focusTimerController.endFocusEarly();
    const entry = focusTimerController.history[0]!;
    expect(focusTimerController.history).toHaveLength(1);

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const result = await focusTimerController.deleteHistoryEntry(entry.id);
    setItem.mockRestore();

    expect(result).toBe(false);
    expect(focusTimerController.history.map((session) => session.id)).toContain(entry.id);
  });

  it("keeps history intact and reports failure when clearing cannot be persisted", async () => {
    await focusTimerController.startFocus({ goal: "暂不清空", durationMs: 60_000 });
    await focusTimerController.endFocusEarly();
    expect(focusTimerController.history).toHaveLength(1);

    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    const result = await focusTimerController.clearHistory();
    setItem.mockRestore();

    expect(result).toBe(false);
    expect(focusTimerController.history).toHaveLength(1);
  });
});
