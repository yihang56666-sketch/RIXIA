import { describe, expect, it } from "vitest";
import { dateKeysInRange, subjectProgress, unitProgress } from "./kaoyan";

describe("Kaoyan progress", () => {
  it("includes both start and end dates in a study period", () => {
    expect(dateKeysInRange("2026-08-01", "2026-08-03")).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("counts only check-ins that fall inside the current study period", () => {
    expect(
      unitProgress({
        startDate: "2026-08-01",
        endDate: "2026-08-03",
        completedDates: ["2026-08-01", "2026-08-03", "2026-08-04"],
      }),
    ).toEqual({ completed: 2, total: 3, percent: 67 });
  });

  it("weights a subject progress by each unit's planned days", () => {
    expect(
      subjectProgress([
        { startDate: "2026-08-01", endDate: "2026-08-02", completedDates: ["2026-08-01"] },
        { startDate: "2026-08-01", endDate: "2026-08-04", completedDates: ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"] },
      ]),
    ).toEqual({ completed: 5, total: 6, percent: 83 });
  });
});
