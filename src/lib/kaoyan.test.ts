import { describe, expect, it } from "vitest";
import {
  currentExamDate, dateKeysInRange, examDateForYear, kaoyanExamLabel, kaoyanMilestones,
  mockExamStats, nextReviewDue, nextReviewStage, REVIEW_INTERVAL_DAYS,
  kaoyanCourseQuery, reviewStats, subjectProgress, unitProgress,
} from "./kaoyan";
import type { MockExam, ReviewItem } from "../types";

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

describe("Ebbinghaus review scheduling", () => {
  it("advances through the fixed interval ladder", () => {
    expect(nextReviewDue("2026-08-01", 0)).toBe("2026-08-02");
    expect(nextReviewDue("2026-08-01", 1)).toBe("2026-08-03");
    expect(nextReviewDue("2026-08-01", 2)).toBe("2026-08-05");
    expect(nextReviewDue("2026-08-01", 3)).toBe("2026-08-08");
    expect(nextReviewDue("2026-08-01", 4)).toBe("2026-08-16");
    expect(nextReviewDue("2026-08-01", 5)).toBe("2026-08-31");
  });

  it("moves forward when remembered and resets when forgotten", () => {
    expect(nextReviewStage(2, true)).toBe(3);
    expect(nextReviewStage(REVIEW_INTERVAL_DAYS.length - 1, true)).toBe(REVIEW_INTERVAL_DAYS.length - 1);
    expect(nextReviewStage(4, false)).toBe(0);
  });

  it("separates due, upcoming, and mastered items", () => {
    const items: ReviewItem[] = [
      { id: "1", sourceType: "custom", title: "到期", dueDate: "2026-08-20", stage: 1, history: [], createdAt: "2026-08-19T00:00:00Z" },
      { id: "2", sourceType: "custom", title: "未来", dueDate: "2026-08-25", stage: 0, history: [], createdAt: "2026-08-19T00:00:00Z" },
      {
        id: "3", sourceType: "custom", title: "已掌握", dueDate: "2026-08-10", stage: REVIEW_INTERVAL_DAYS.length - 1,
        history: [{ date: "2026-08-19", remembered: true }], createdAt: "2026-08-01T00:00:00Z",
      },
    ];
    expect(reviewStats(items, "2026-08-21")).toEqual({ dueToday: 1, upcoming: 1, mastered: 1 });
  });
});

describe("Kaoyan exam date", () => {
  it("picks the second-to-last Saturday of December", () => {
    expect(examDateForYear(2026)).toBe("2026-12-19");
    expect(examDateForYear(2025)).toBe("2025-12-20");
    expect(examDateForYear(2027)).toBe("2027-12-18");
  });

  it("rolls over to next year once this year's exam has passed", () => {
    expect(currentExamDate("2026-08-22", null)).toBe("2026-12-19");
    expect(currentExamDate("2026-12-20", null)).toBe("2027-12-18");
    expect(currentExamDate("2026-08-22", "2026-12-26")).toBe("2026-12-26");
  });

  it("labels the graduate-admission year without an ordinal prefix", () => {
    expect(kaoyanExamLabel("2026-12-19")).toBe("2027 考研初试");
    expect(kaoyanExamLabel("bad")).toBe("考研初试");
  });

  it("builds the milestone timeline around the exam date", () => {
    const milestones = kaoyanMilestones("2026-12-19");
    expect(milestones).toHaveLength(8);
    expect(milestones.map((item) => item.name)).toContain("初试");
    expect(milestones.find((item) => item.name === "初试")?.date).toBe("2026-12-19");
    expect(milestones.find((item) => item.name === "成绩公布")?.date).toBe("2027-02-26");
  });
});

describe("Mock exam stats", () => {
  const exams: MockExam[] = [
    { id: "1", date: "2026-10-01", subject: "数学", paperName: "卷一", score: 90, total: 150, createdAt: "2026-10-01T10:00:00Z" },
    { id: "2", date: "2026-10-08", subject: "数学", paperName: "卷二", score: 110, total: 150, createdAt: "2026-10-08T10:00:00Z" },
    { id: "3", date: "2026-10-08", subject: "英语", paperName: "阅读", score: 40, total: 100, createdAt: "2026-10-08T10:00:00Z" },
  ];

  it("aggregates per subject with latest, average, best and trend", () => {
    const stats = mockExamStats(exams);
    const math = stats.find((item) => item.subject === "数学");
    expect(math).toMatchObject({ count: 2, latest: 110, average: 100, best: 110, trend: 20 });
    const english = stats.find((item) => item.subject === "英语");
    expect(english).toMatchObject({ count: 1, latest: 40, average: 40, best: 40, trend: 0 });
  });

  it("returns an empty summary for no exams", () => {
    expect(mockExamStats([])).toEqual([]);
  });
});

describe("Kaoyan course search query", () => {
  it("prefixes 考研 unless the title already contains it", () => {
    expect(kaoyanCourseQuery("高数")).toBe("考研高数");
    expect(kaoyanCourseQuery("考研英语阅读")).toBe("考研英语阅读");
    expect(kaoyanCourseQuery("  ")).toBe("考研");
  });
});
