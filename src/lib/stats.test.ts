import { describe, expect, it } from "vitest";
import type { FocusSession, HabitItem, TaskItem } from "../types";
import { todayKey } from "./time";
import {
  focusMinutesByDay,
  habitCheckinsByDay,
  habitStrength,
  taskCompletionsByDay,
  trendSummary,
} from "./stats";

const task = (done: boolean, completedAt?: string): TaskItem => ({
  id: `${Math.random()}`,
  title: "任务",
  done,
  due: "2026-08-13",
  createdAt: "2026-08-13T08:00:00.000Z",
  completedAt: completedAt ?? null,
});

const habit = (dates: string[]): HabitItem => ({
  id: `${Math.random()}`,
  title: "习惯",
  createdAt: "2026-08-01T08:00:00.000Z",
  checkedDates: dates,
});

const session = (date: string, minutes: number): FocusSession => ({
  id: `${Math.random()}`,
  date,
  minutes,
  completedAt: `${date}T10:00:00.000Z`,
});

const DAYS = ["2026-08-11", "2026-08-12", "2026-08-13"];

describe("taskCompletionsByDay", () => {
  it("counts tasks by their completion timestamp", () => {
    const tasks = [
      // 用各时区都不会跨日的时间（本地时间归日）
      task(true, "2026-08-12T02:00:00.000Z"),
      task(true, "2026-08-12T04:00:00.000Z"),
      task(true, "2026-08-13T02:00:00.000Z"),
      task(false),
      task(true),
    ];
    expect(taskCompletionsByDay(tasks, DAYS)).toEqual([0, 2, 1]);
  });

  it("attributes completions to the local calendar day", () => {
    // 21:00Z 在 UTC+8 已是次日：应计入本地日期，而不是 UTC 切片的前一天
    const completedAt = "2026-08-12T21:00:00.000Z";
    const tasks = [task(true, completedAt)];
    const days = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"];
    const result = taskCompletionsByDay(tasks, days);
    const expected = new Array(days.length).fill(0);
    expected[days.indexOf(todayKey(new Date(completedAt)))] = 1;
    expect(result).toEqual(expected);
  });
});

describe("focusMinutesByDay", () => {
  it("sums session minutes per day", () => {
    const sessions = [
      session("2026-08-11", 25),
      session("2026-08-11", 50),
      session("2026-08-13", 25),
    ];
    expect(focusMinutesByDay(sessions, DAYS)).toEqual([75, 0, 25]);
  });
});

describe("habitCheckinsByDay", () => {
  it("counts check-ins across all habits per day", () => {
    const habits = [
      habit(["2026-08-11", "2026-08-12"]),
      habit(["2026-08-12", "2026-08-13"]),
    ];
    expect(habitCheckinsByDay(habits, DAYS)).toEqual([1, 2, 1]);
  });
});

describe("habitStrength", () => {
  it("computes the check-in rate over the recent window", () => {
    const days = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"];
    expect(habitStrength(["2026-08-01", "2026-08-03"], days, 4)).toBe(50);
    expect(habitStrength([], days, 4)).toBe(0);
    expect(habitStrength(["2026-01-01"], days, 4)).toBe(0);
  });
});

describe("trendSummary", () => {
  it("returns percentage change against the previous period", () => {
    expect(trendSummary(12, 10)).toEqual({ current: 12, previous: 10, deltaPercent: 20 });
    expect(trendSummary(8, 10)).toEqual({ current: 8, previous: 10, deltaPercent: -20 });
    expect(trendSummary(5, 5)).toEqual({ current: 5, previous: 5, deltaPercent: 0 });
  });

  it("handles a missing previous period", () => {
    expect(trendSummary(0, 0).deltaPercent).toBeNull();
    expect(trendSummary(3, 0).deltaPercent).toBe(100);
  });
});
