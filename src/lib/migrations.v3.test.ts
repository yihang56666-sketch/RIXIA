import { describe, expect, it } from "vitest";
import { migratePersistedState, validateBackup } from "./migrations";

describe("persisted state v3 migration", () => {
  it("redirects the removed server-side watch-history view to the local watch history view", () => {
    const result = migratePersistedState({ view: "watch-history" }, 2);
    expect(result.view).toBe("local-watch-history");
  });

  it("redirects the removed standalone app-update view to the about view", () => {
    const result = migratePersistedState({ view: "app-update" }, 2);
    expect(result.view).toBe("about");
  });

  it("keeps unrelated view keys unchanged", () => {
    const result = migratePersistedState({ view: "focus-dashboard" }, 2);
    expect(result.view).toBe("focus-dashboard");
  });

  it("defaults legacy habit frequency to daily", () => {
    const result = migratePersistedState(
      {
        habits: [
          { id: "h1", title: "运动", createdAt: "2026-01-01T00:00:00.000Z", checkedDates: [] },
        ],
      },
      2,
    );
    expect(result.habits?.[0]?.frequency).toEqual({ type: "daily" });
  });

  it("preserves weekly-count frequency with clamping", () => {
    const result = migratePersistedState(
      {
        habits: [
          {
            id: "h1",
            title: "运动",
            createdAt: "2026-01-01T00:00:00.000Z",
            checkedDates: [],
            frequency: { type: "weekly-count", target: 99 },
          },
        ],
      },
      3,
    );
    expect(result.habits?.[0]?.frequency).toEqual({ type: "weekly-count", target: 7 });
  });

  it("preserves interval-days frequency with clamping", () => {
    const result = migratePersistedState(
      {
        habits: [
          {
            id: "h2",
            title: "整理",
            createdAt: "2026-01-01T00:00:00.000Z",
            checkedDates: [],
            frequency: { type: "interval-days", interval: 9999 },
          },
        ],
      },
      3,
    );
    expect(result.habits?.[0]?.frequency).toEqual({ type: "interval-days", interval: 365 });
  });

  it("provides default focusRounds when missing", () => {
    const result = migratePersistedState({}, 2);
    expect(result.focusRounds).toEqual({
      workMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
    });
  });

  it("clamps malformed focusRounds", () => {
    const result = migratePersistedState(
      {
        focusRounds: { workMinutes: -3, shortBreakMinutes: 999, longBreakMinutes: -1, longBreakEvery: 99 },
      },
      3,
    );
    expect(result.focusRounds).toEqual({
      workMinutes: 1,
      shortBreakMinutes: 60,
      longBreakMinutes: 0,
      longBreakEvery: 12,
    });
  });

  it("migrates journal entries with required fields", () => {
    const result = migratePersistedState(
      {
        journals: [
          { date: "2026-08-17", body: "今天试试新流程", updatedAt: "2026-08-17T10:00:00.000Z" },
          { date: "", body: "无日期", updatedAt: "2026-08-17T10:00:00.000Z" },
          { date: "2026-08-16", body: "", updatedAt: "2026-08-16T10:00:00.000Z" },
        ],
      },
      3,
    );
    expect(result.journals).toHaveLength(1);
    expect(result.journals?.[0]?.date).toBe("2026-08-17");
  });

  it("validates a v3 backup round-trip", () => {
    const backup = {
      formatVersion: 3,
      theme: "graphite",
      density: "comfortable",
      enabledTools: ["tasks", "focus"],
      inbox: [],
      tasks: [],
      habits: [
        {
          id: "h1",
          title: "运动",
          createdAt: "2026-01-01T00:00:00.000Z",
          checkedDates: [],
          frequency: { type: "weekly-count", target: 3 },
        },
      ],
      notes: [],
      countdowns: [],
      subjects: [],
      studyUnits: [],
      focusSessions: [],
      focusGoalMinutes: 120,
      focusRounds: { workMinutes: 30, shortBreakMinutes: 5, longBreakMinutes: 20, longBreakEvery: 3 },
      resources: [],
      timestampNotes: [],
      journals: [{ date: "2026-08-17", body: "test", updatedAt: "2026-08-17T00:00:00.000Z" }],
    };
    const validated = validateBackup(backup);
    expect(validated.formatVersion).toBe(3);
    expect(validated.habits[0].frequency).toEqual({ type: "weekly-count", target: 3 });
    expect(validated.focusRounds).toEqual({ workMinutes: 30, shortBreakMinutes: 5, longBreakMinutes: 20, longBreakEvery: 3 });
    expect(validated.journals).toHaveLength(1);
  });

  it("preserves newer Kaoyan data when validating a v3 backup", () => {
    const backup = {
      formatVersion: 3,
      theme: "graphite",
      density: "standard",
      enabledTools: ["tasks", "focus"],
      inbox: [],
      tasks: [],
      habits: [],
      notes: [],
      countdowns: [],
      subjects: [],
      studyUnits: [],
      wrongQuestions: [
        {
          id: "wrong-1",
          subjectId: "math",
          title: "极限题",
          note: "注意夹逼",
          tags: ["计算错误"],
          wrongCount: 2,
          createdAt: "2026-08-20T00:00:00.000Z",
        },
      ],
      reviewItems: [
        {
          id: "review-1",
          sourceType: "wrong-question",
          sourceId: "wrong-1",
          subjectId: "math",
          title: "极限题",
          dueDate: "2026-08-24",
          stage: 1,
          history: [{ date: "2026-08-22", remembered: true }],
          createdAt: "2026-08-20T00:00:00.000Z",
        },
      ],
      mockExams: [
        {
          id: "exam-1",
          date: "2026-08-21",
          subject: "数学",
          paperName: "模拟卷一",
          score: 110,
          total: 150,
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      kaoyanWords: [],
      kaoyanExamDate: "2026-12-19",
      focusSessions: [],
      focusGoalMinutes: 120,
      focusRounds: { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
      resources: [],
      timestampNotes: [],
      journals: [],
    };

    const validated = validateBackup(backup);

    expect(validated.wrongQuestions).toEqual(backup.wrongQuestions);
    expect(validated.reviewItems).toEqual(backup.reviewItems);
    expect(validated.mockExams).toEqual(backup.mockExams);
    expect(validated.kaoyanExamDate).toBe("2026-12-19");
  });
});
