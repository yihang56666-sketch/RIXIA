import { describe, expect, it } from "vitest";
import type { HabitItem } from "../types";
import {
  frequencyAwareStreak,
  frequencyAwareStrength,
  isHabitDueToday,
  weekDatesContaining,
} from "./habitSchedule";

const DAY = 24 * 60 * 60 * 1000;

function day(offsetFromToday: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const pad = (n: number) => String(n).padStart(2, "0");
  const key = new Date(d.getTime() + offsetFromToday * DAY);
  return `${key.getFullYear()}-${pad(key.getMonth() + 1)}-${pad(key.getDate())}`;
}

function habit(partial: Partial<HabitItem>): HabitItem {
  return {
    id: "h1",
    title: "习惯",
    createdAt: "2026-01-01T00:00:00.000Z",
    checkedDates: [],
    ...partial,
  };
}

describe("weekDatesContaining", () => {
  it("returns a Monday-anchored week", () => {
    // 2026-08-19 是周三
    const week = weekDatesContaining("2026-08-19");
    expect(week).toHaveLength(7);
    expect(week[0]).toBe("2026-08-17"); // 周一
    expect(week[6]).toBe("2026-08-23"); // 周日
    expect(week).toContain("2026-08-19");
  });
});

describe("isHabitDueToday (daily)", () => {
  it("is due every day until checked", () => {
    const h = habit({ frequency: { type: "daily" }, checkedDates: [] });
    expect(isHabitDueToday(h, day(0))).toBe(true);
  });

  it("is not due again after checking today", () => {
    const h = habit({ frequency: { type: "daily" }, checkedDates: [day(0)] });
    expect(isHabitDueToday(h, day(0))).toBe(false);
  });
});

describe("isHabitDueToday (weekly-count)", () => {
  it("stays due until the weekly target is met", () => {
    const target3 = habit({ frequency: { type: "weekly-count", target: 3 }, checkedDates: [] });
    expect(isHabitDueToday(target3, day(0))).toBe(true);

    // 本周周一、周二已打卡（target=2）→ 本周不再提醒
    const monday = weekDatesContaining(day(0))[0];
    const met = habit({
      frequency: { type: "weekly-count", target: 2 },
      checkedDates: [monday, day(0)],
    });
    expect(isHabitDueToday(met, day(0))).toBe(false);
  });

  it("becomes due again next week even if last week was full", () => {
    // 上周打满（target=1）：本周一重新提醒
    const mondayThisWeek = weekDatesContaining(day(0))[0];
    const lastWeekAnyDay = `${mondayThisWeek.slice(0, 8)}${String(Number(mondayThisWeek.slice(8)) - 7).padStart(2, "0")}`;
    const checkedLastWeek = habit({
      frequency: { type: "weekly-count", target: 1 },
      checkedDates: [lastWeekAnyDay],
    });
    expect(isHabitDueToday(checkedLastWeek, mondayThisWeek)).toBe(true);
    expect(isHabitDueToday(checkedLastWeek, day(0))).toBe(true);
  });
});

describe("isHabitDueToday (interval-days)", () => {
  it("is due when the interval has elapsed", () => {
    const every2 = habit({ frequency: { type: "interval-days", interval: 2 }, checkedDates: [day(-2)] });
    expect(isHabitDueToday(every2, day(0))).toBe(true);

    const yesterday = habit({ frequency: { type: "interval-days", interval: 2 }, checkedDates: [day(-1)] });
    expect(isHabitDueToday(yesterday, day(0))).toBe(false);
  });

  it("never-checked habits are due immediately", () => {
    const h = habit({ frequency: { type: "interval-days", interval: 3 } });
    expect(isHabitDueToday(h, day(0))).toBe(true);
  });
});

describe("frequencyAwareStreak (daily)", () => {
  it("matches the calendar streak", () => {
    const h = habit({ frequency: { type: "daily" }, checkedDates: [day(-2), day(-1), day(0)] });
    expect(frequencyAwareStreak(h, day(0))).toBe(3);
  });
});

describe("frequencyAwareStreak (weekly-count)", () => {
  it("counts consecutive weeks meeting the target", () => {
    const dates = [
      "2026-08-03", "2026-08-05", // 上上周（周一、周三）：2 次 ✓
      "2026-08-10", "2026-08-12", // 上周：2 次 ✓
      "2026-08-19", // 本周（周三）：1 次 ✓（target=2 未达标不扣）
    ];
    const h = habit({ frequency: { type: "weekly-count", target: 2 }, checkedDates: dates });
    // 本周未达标 → 从上周起算：上周 + 上上周 = 2 周
    expect(frequencyAwareStreak(h, "2026-08-19")).toBe(2);
  });

  it("includes the current week when the target is already met", () => {
    const h = habit({
      frequency: { type: "weekly-count", target: 1 },
      checkedDates: ["2026-08-10", "2026-08-17"],
    });
    expect(frequencyAwareStreak(h, "2026-08-19")).toBe(2);
  });
});

describe("frequencyAwareStreak (interval-days)", () => {
  it("counts consecutive satisfied interval windows", () => {
    // 每 2 天一次，完美执行：今天打了，昨天窗口也覆盖
    const h = habit({
      frequency: { type: "interval-days", interval: 2 },
      checkedDates: [day(-4), day(-2), day(0)],
    });
    // 窗口 [-0..+0] ✓、[-2..-1] 含 -2 ✓、[-4..-3] 含 -4 ✓、[-6..-5] 空 ✗
    expect(frequencyAwareStreak(h, day(0))).toBe(3);
  });

  it("is zero when the latest window is missed and today is unchecked", () => {
    const h = habit({ frequency: { type: "interval-days", interval: 2 }, checkedDates: [day(-5)] });
    // 最近窗口 [-1..0] 与 [-3..-2] 都没有打卡
    expect(frequencyAwareStreak(h, day(0))).toBe(0);
  });
});

describe("frequencyAwareStrength", () => {
  it("rewards weekly-count habits that meet their target instead of penalizing rest days", () => {
    // 每周 3 次、执行两周共打 6 次 → 强度应为 100%，而不是按 30 天日历的 ~20%
    const dates = ["2026-08-03", "2026-08-05", "2026-08-07", "2026-08-10", "2026-08-12", "2026-08-14"];
    const h = habit({ frequency: { type: "weekly-count", target: 3 }, checkedDates: dates });
    const days14 = Array.from({ length: 14 }, (_, i) => day(i - 13, new Date(2026, 7, 16)));
    expect(frequencyAwareStrength(h, days14)).toBe(100);
  });

  it("rewards interval habits proportionally to their schedule", () => {
    // 每 2 天一次、30 天窗口内打了 15 次 → 100%
    const base = new Date(2026, 7, 24);
    const dates = Array.from({ length: 15 }, (_, i) => day(-i * 2, base));
    const h = habit({ frequency: { type: "interval-days", interval: 2 }, checkedDates: dates });
    const days30 = Array.from({ length: 30 }, (_, i) => day(i - 29, base));
    expect(frequencyAwareStrength(h, days30)).toBeGreaterThanOrEqual(90);
  });
});
