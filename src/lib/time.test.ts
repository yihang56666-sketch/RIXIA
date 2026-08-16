import { describe, expect, it } from "vitest";
import {
  bestStreak,
  daysUntil,
  dueLabel,
  formatDateLabel,
  formatShortDate,
  formatTime,
  greeting,
  habitStreak,
  lastNDates,
  relativeTime,
  weekdayLabel,
} from "./time";

describe("daysUntil", () => {
  it("counts remaining days from a fixed today", () => {
    expect(daysUntil("2026-08-20", "2026-08-13")).toBe(7);
    expect(daysUntil("2026-08-13", "2026-08-13")).toBe(0);
    expect(daysUntil("2026-08-10", "2026-08-13")).toBe(-3);
  });
});

describe("habitStreak", () => {
  it("continues a streak through today", () => {
    expect(habitStreak(["2026-08-11", "2026-08-12", "2026-08-13"], "2026-08-13")).toBe(3);
  });

  it("keeps yesterday streak if today is not checked", () => {
    expect(habitStreak(["2026-08-11", "2026-08-12"], "2026-08-13")).toBe(2);
  });

  it("breaks when a day is missing", () => {
    expect(habitStreak(["2026-08-10", "2026-08-12"], "2026-08-13")).toBe(1);
  });
});

describe("formatTime", () => {
  it("formats mm:ss", () => {
    expect(formatTime(1500)).toBe("25:00");
    expect(formatTime(5)).toBe("00:05");
  });
});

describe("date and greeting labels", () => {
  it("formats Chinese date and weekday labels", () => {
    const date = new Date(2026, 7, 13, 9, 0, 0);
    expect(formatDateLabel("2026-08-13")).toBe("2026年8月13日");
    expect(formatShortDate("2026-08-13")).toBe("8月13日");
    expect(weekdayLabel(date)).toBe("周四");
    expect(greeting(date)).toBe("早上好");
  });
});

describe("bestStreak", () => {
  it("finds the longest run even when it is not current", () => {
    expect(bestStreak(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-10", "2026-08-11"])).toBe(3);
  });

  it("handles a single check-in", () => {
    expect(bestStreak(["2026-08-01"])).toBe(1);
    expect(bestStreak([])).toBe(0);
  });
});

describe("lastNDates", () => {
  it("returns n dates ending today, oldest first", () => {
    expect(lastNDates(3, "2026-08-13")).toEqual(["2026-08-11", "2026-08-12", "2026-08-13"]);
  });

  it("crosses month boundaries", () => {
    expect(lastNDates(2, "2026-09-01")).toEqual(["2026-08-31", "2026-09-01"]);
  });
});

describe("relativeTime", () => {
  it("labels fresh, today, and yesterday items", () => {
    const now = new Date(2026, 7, 13, 15, 0, 0);
    expect(relativeTime(new Date(2026, 7, 13, 14, 30, 0).toISOString(), now)).toBe("30 分钟前");
    expect(relativeTime(new Date(2026, 7, 13, 9, 5, 0).toISOString(), now)).toBe("今天 09:05");
    expect(relativeTime(new Date(2026, 7, 12, 9, 5, 0).toISOString(), now)).toBe("昨天 09:05");
  });

  it("counts days within a week and falls back to a date label", () => {
    const now = new Date(2026, 7, 20, 12, 0, 0);
    expect(relativeTime(new Date(2026, 7, 17, 9, 0, 0).toISOString(), now)).toBe("3 天前");
    expect(relativeTime(new Date(2026, 7, 13, 9, 0, 0).toISOString(), now)).toBe("8月13日 09:00");
  });
});

describe("dueLabel", () => {
  it("classifies due dates relative to today", () => {
    expect(dueLabel("2026-08-13", "2026-08-13")).toEqual({ text: "今天", tone: "today" });
    expect(dueLabel("2026-08-14", "2026-08-13")).toEqual({ text: "明天", tone: "soon" });
    expect(dueLabel("2026-08-16", "2026-08-13")).toEqual({ text: "周日", tone: "soon" });
    expect(dueLabel("2026-08-25", "2026-08-13")).toEqual({ text: "8月25日", tone: "later" });
    expect(dueLabel("2026-08-10", "2026-08-13")).toEqual({ text: "逾期 3 天", tone: "overdue" });
    expect(dueLabel(null, "2026-08-13")).toEqual({ text: "无日期", tone: "none" });
  });
});
