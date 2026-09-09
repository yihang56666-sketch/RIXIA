import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { frequencyAwareStreak } from "./habitSchedule";
import { habitStreak, lastNDates } from "./time";

describe("calendar days across daylight-saving changes", () => {
  beforeAll(() => vi.stubEnv("TZ", "America/New_York"));
  afterAll(() => vi.unstubAllEnvs());

  it("runs against a timezone with a short spring day", () => {
    expect(new Date("2026-03-08T00:00:00").getTimezoneOffset()).toBe(300);
    expect(new Date("2026-03-09T00:00:00").getTimezoneOffset()).toBe(240);
  });

  it("does not skip a calendar date in the heatmap", () => {
    expect(lastNDates(4, "2026-03-10")).toEqual([
      "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10",
    ]);
  });

  it("counts every checked calendar day in a daily streak", () => {
    expect(habitStreak([
      "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10",
    ], "2026-03-10")).toBe(4);
  });

  it("keeps the previous Monday-to-Sunday week when calculating weekly streaks", () => {
    expect(frequencyAwareStreak({
      id: "weekly", title: "阅读", createdAt: "2026-02-01T12:00:00Z",
      checkedDates: ["2026-03-02", "2026-03-08"],
      frequency: { type: "weekly-count", target: 2 },
    }, "2026-03-09")).toBe(1);
  });

  it("counts interval windows by calendar date rather than 24-hour blocks", () => {
    expect(frequencyAwareStreak({
      id: "interval", title: "阅读", createdAt: "2026-03-01T12:00:00Z",
      checkedDates: ["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"],
      frequency: { type: "interval-days", interval: 1 },
    }, "2026-03-10")).toBe(4);
  });
});
