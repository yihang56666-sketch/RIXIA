import { describe, expect, it } from "vitest";
import { daysUntil, formatDateLabel, formatTime, greeting, habitStreak, weekdayLabel } from "./time";

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
    expect(weekdayLabel(date)).toBe("周四");
    expect(greeting(date)).toBe("早上好");
  });
});
