import { describe, expect, it } from "vitest";
import { chooseNextAction, buildTodaySummary } from "./today";
import type { ActiveFocus, CourseResource, HabitItem, InboxItem, TaskItem } from "../types";

const today = "2026-08-17";

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "t1",
    title: "读书",
    done: false,
    due: today,
    createdAt: "2026-08-01T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function makeResource(overrides: Partial<CourseResource> = {}): CourseResource {
  return {
    id: "r1",
    bvid: "BV1GJ411x7h7",
    title: "高数 第 3 讲",
    status: "in-progress",
    addedAt: "2026-08-10T00:00:00.000Z",
    lastOpenedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

function makeInbox(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "i1",
    text: "想看《深度学习》",
    createdAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

function makeHabit(overrides: Partial<HabitItem> = {}): HabitItem {
  return {
    id: "h1",
    title: "运动",
    createdAt: "2026-01-01T00:00:00.000Z",
    checkedDates: [],
    ...overrides,
  };
}

describe("chooseNextAction", () => {
  it("picks focus when activeFocus is set", () => {
    const activeFocus: ActiveFocus = { startedAt: "2026-08-17T08:00:00.000Z", mode: "countdown" };
    const action = chooseNextAction({
      today,
      activeFocus,
      tasks: [],
      habits: [],
      resources: [],
      inbox: [],
    });
    expect(action.kind).toBe("focus");
  });

  it("picks overdue task when one exists", () => {
    const action = chooseNextAction({
      today,
      activeFocus: null,
      tasks: [makeTask({ id: "t-overdue", title: "逾期任务", due: "2026-08-15" })],
      habits: [],
      resources: [],
      inbox: [],
    });
    expect(action.kind).toBe("task");
    expect(action).toMatchObject({ taskId: "t-overdue" });
  });

  it("picks today's open task if no overdue", () => {
    const action = chooseNextAction({
      today,
      activeFocus: null,
      tasks: [makeTask({ id: "t-today", title: "今日任务", due: today })],
      habits: [],
      resources: [],
      inbox: [],
    });
    expect(action.kind).toBe("task");
    expect(action).toMatchObject({ taskId: "t-today" });
  });

  it("skips completed tasks", () => {
    const action = chooseNextAction({
      today,
      activeFocus: null,
      tasks: [
        makeTask({ id: "t-done", title: "已完成", done: true, due: today, completedAt: "2026-08-17T08:00:00.000Z" }),
      ],
      habits: [],
      resources: [],
      inbox: [],
    });
    expect(action.kind).not.toBe("task");
  });

  it("picks recent unfinished resource if no tasks", () => {
    const action = chooseNextAction({
      today,
      activeFocus: null,
      tasks: [],
      habits: [],
      resources: [makeResource()],
      inbox: [],
    });
    expect(action.kind).toBe("resource");
    expect(action).toMatchObject({ resourceId: "r1" });
  });

  it("picks inbox if no tasks and no recent resources", () => {
    const action = chooseNextAction({
      today,
      activeFocus: null,
      tasks: [],
      habits: [],
      resources: [makeResource({ status: "completed", lastOpenedAt: undefined })],
      inbox: [makeInbox()],
    });
    expect(action.kind).toBe("inbox");
  });

  it("falls back to create-task when everything is empty", () => {
    const action = chooseNextAction({
      today,
      activeFocus: null,
      tasks: [],
      habits: [],
      resources: [],
      inbox: [],
    });
    expect(action.kind).toBe("create-task");
  });

  it("prioritizes focus over tasks, resources, inbox", () => {
    const action = chooseNextAction({
      today,
      activeFocus: { startedAt: "2026-08-17T08:00:00.000Z", mode: "countdown" },
      tasks: [makeTask({ id: "t-today", due: today })],
      habits: [],
      resources: [makeResource()],
      inbox: [makeInbox()],
    });
    expect(action.kind).toBe("focus");
  });

  it("prioritizes tasks over resources and inbox", () => {
    const action = chooseNextAction({
      today,
      activeFocus: null,
      tasks: [makeTask({ id: "t-today", due: today })],
      habits: [],
      resources: [makeResource()],
      inbox: [makeInbox()],
    });
    expect(action.kind).toBe("task");
  });

  it("skips resources older than 7 days since last opened", () => {
    const action = chooseNextAction({
      today,
      activeFocus: null,
      tasks: [],
      habits: [],
      resources: [makeResource({ lastOpenedAt: "2026-08-01T00:00:00.000Z" })],
      inbox: [],
    });
    expect(action.kind).not.toBe("resource");
  });
});

describe("buildTodaySummary", () => {
  it("reports zero state when nothing exists", () => {
    const summary = buildTodaySummary({
      today,
      tasks: [],
      habits: [],
      focusSessions: [],
      inbox: [],
      countdowns: [],
    });
    expect(summary.tasksDone).toBe(0);
    expect(summary.tasksTotal).toBe(0);
    expect(summary.habitsChecked).toBe(0);
    expect(summary.habitsTotal).toBe(0);
    expect(summary.focusMinutes).toBe(0);
    expect(summary.inboxCount).toBe(0);
    expect(summary.nextCountdown).toBeNull();
  });

  it("aggregates today's tasks and habits and focus minutes", () => {
    const summary = buildTodaySummary({
      today,
      tasks: [
        makeTask({ id: "t1", done: false, due: today }),
        makeTask({ id: "t2", done: true, due: today, completedAt: "2026-08-17T08:00:00.000Z" }),
      ],
      habits: [
        makeHabit({ id: "h1", checkedDates: [today] }),
        makeHabit({ id: "h2", checkedDates: [] }),
      ],
      focusSessions: [
        { id: "f1", date: today, minutes: 25, completedAt: "2026-08-17T08:25:00.000Z" },
        { id: "f2", date: today, minutes: 15, completedAt: "2026-08-17T09:00:00.000Z" },
      ],
      inbox: [makeInbox()],
      countdowns: [],
    });
    expect(summary.tasksDone).toBe(1);
    expect(summary.tasksTotal).toBe(2);
    expect(summary.habitsChecked).toBe(1);
    expect(summary.habitsTotal).toBe(2);
    expect(summary.focusMinutes).toBe(40);
    expect(summary.inboxCount).toBe(1);
  });

  it("picks the next upcoming countdown", () => {
    const summary = buildTodaySummary({
      today,
      tasks: [],
      habits: [],
      focusSessions: [],
      inbox: [],
      countdowns: [
        { id: "c1", title: "考研报名", date: "2026-10-15", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "c2", title: "生日", date: "2026-09-01", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    expect(summary.nextCountdown).toMatchObject({ id: "c2", title: "生日" });
    expect(summary.nextCountdownDays).toBe(15);
  });

  it("ignores past countdowns", () => {
    const summary = buildTodaySummary({
      today,
      tasks: [],
      habits: [],
      focusSessions: [],
      inbox: [],
      countdowns: [
        { id: "c1", title: "已过", date: "2026-08-10", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
    });
    expect(summary.nextCountdown).toBeNull();
  });
});
