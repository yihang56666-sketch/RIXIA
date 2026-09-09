import { describe, expect, it } from "vitest";
import { migratePersistedState, validateBackup } from "./migrations";
import { isHabitDueToday } from "./habitSchedule";
import { focusMinutesByDay } from "./stats";

const createdAt = "2026-09-01T08:00:00.000Z";
const emptyBackup = { inbox: [], tasks: [], habits: [], notes: [], countdowns: [] };

describe("untrusted backup numeric and nested collection boundaries", () => {
  it("keeps very large finite settings within the same bounds as the editor", () => {
    const restored = migratePersistedState({ focusMinutes: 1e308, focusGoalMinutes: 1e308 }, 3);
    expect(restored.focusMinutes).toBe(120);
    expect(restored.focusGoalMinutes).toBe(600);
    const invalidRounds = migratePersistedState({ focusRounds: { workMinutes: NaN, shortBreakMinutes: NaN, longBreakMinutes: NaN, longBreakEvery: NaN } }, 3);
    expect(invalidRounds.focusRounds).toEqual({ workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 });
  });

  it.each(["constructor", "toString", "__proto__"])("does not resolve inherited mapping keys as a %s view or theme", (key) => {
    const restored = migratePersistedState({ view: key, theme: key }, 3);
    expect(restored.view).toBe("focus-dashboard");
    expect(restored.theme).toBe("porcelain");
  });

  it("rejects JSON numeric overflows before they reach timers and statistics", () => {
    const overflow = JSON.parse("1e309") as number;
    const restored = validateBackup({
      ...emptyBackup,
      focusMinutes: overflow,
      focusGoalMinutes: overflow,
      focusSessions: [
        { id: "bad", date: "2026-09-01", minutes: overflow, completedAt: createdAt },
        { id: "good", date: "2026-09-01", minutes: 25, completedAt: createdAt },
      ],
      resources: [{ id: "course", bvid: "BV1GJ411x7h7", title: "课程", addedAt: createdAt, progressSeconds: overflow, durationSeconds: overflow }],
      timestampNotes: [{ id: "bad-note", resourceId: "course", seconds: overflow, body: "时间点", createdAt }],
    });
    expect(restored.focusMinutes).toBe(25);
    expect(restored.focusGoalMinutes).toBe(120);
    expect(focusMinutesByDay(restored.focusSessions, ["2026-09-01"])).toEqual([25]);
    expect(restored.resources[0]?.progressSeconds).toBeUndefined();
    expect(restored.resources[0]?.durationSeconds).toBeUndefined();
    expect(restored.timestampNotes).toEqual([]);
  });

  it("filters invalid calendar entries without crashing a restored weekly habit", () => {
    const dates = ["2026-09-01", null, 123, { toString: null }, "2026-02-30", "2026-09-01", "2024-02-29"];
    const restored = validateBackup({
      ...emptyBackup,
      habits: [{ id: "habit", title: "阅读", createdAt, checkedDates: dates, frequency: { type: "weekly-count", target: 3 } }],
      studyUnits: [{ id: "unit", subjectId: "math", title: "极限", startDate: "2026-09-01", endDate: "2026-09-30", createdAt, completedDates: dates }],
    });
    expect(() => isHabitDueToday(restored.habits[0], "2026-09-02")).not.toThrow();
    expect(restored.habits[0].checkedDates).toEqual(["2026-09-01", "2024-02-29"]);
    expect(restored.studyUnits[0].completedDates).toEqual(["2026-09-01", "2024-02-29"]);
    expect(isHabitDueToday(restored.habits[0], "2026-09-02")).toBe(true);
  });

  it.each(["countdown", "countup"])("pauses a recovered %s timer when its running anchor is invalid", (mode) => {
    const restored = migratePersistedState({
      activeFocus: { mode, startedAt: createdAt, running: true, endsAtMs: Infinity, countupStartedAtMs: Infinity, remainingSeconds: 90 },
    }, 3);
    expect(restored.activeFocus).toMatchObject({ running: false, endsAtMs: null, countupStartedAtMs: null, remainingSeconds: 90 });
  });

  it("keeps frequency targets positive after rounding fractions", () => {
    const restored = migratePersistedState({ habits: [
      { id: "weekly", title: "周练习", createdAt, checkedDates: [], frequency: { type: "weekly-count", target: 0.1 } },
      { id: "interval", title: "隔日练习", createdAt, checkedDates: [], frequency: { type: "interval-days", interval: 0.1 } },
    ] }, 3);
    expect(restored.habits?.[0].frequency).toEqual({ type: "weekly-count", target: 1 });
    expect(restored.habits?.[1].frequency).toEqual({ type: "interval-days", interval: 1 });
  });
});
