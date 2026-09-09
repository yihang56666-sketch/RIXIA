import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../types";
import { nextReviewDue, nextReviewStage, REVIEW_INTERVAL_DAYS, reviewStats } from "./kaoyan";
import { migratePersistedState } from "./migrations";

function lastRoundItem(): ReviewItem {
  return {
    id: "review", sourceType: "custom", title: "最后一轮", stage: 5,
    dueDate: "2026-10-30", createdAt: "2026-09-01T00:00:00Z",
    history: [{ date: "2026-09-30", remembered: true }],
  };
}

describe("complete spaced-review lifecycle", () => {
  it("keeps the scheduled 30-day review pending until it is actually completed", () => {
    expect(reviewStats([lastRoundItem()], "2026-10-01")).toEqual({
      dueToday: 0, upcoming: 1, mastered: 0,
    });
    expect(reviewStats([lastRoundItem()], "2026-10-30")).toEqual({
      dueToday: 1, upcoming: 0, mastered: 0,
    });
  });

  it("requires all six successful review rounds before marking an item mastered", () => {
    let item: ReviewItem = {
      ...lastRoundItem(), stage: 0, dueDate: "2026-09-02", history: [],
    };
    for (let round = 0; round < REVIEW_INTERVAL_DAYS.length; round += 1) {
      const completedDate = item.dueDate;
      const stage = nextReviewStage(item.stage, true);
      item = {
        ...item, stage, dueDate: nextReviewDue(completedDate, stage),
        history: [...item.history, { date: completedDate, remembered: true }],
      };
      expect(reviewStats([item], completedDate).mastered).toBe(round === 5 ? 1 : 0);
    }
    expect(item.stage).toBe(REVIEW_INTERVAL_DAYS.length);
    expect(nextReviewStage(item.stage, false)).toBe(0);
  });

  it("preserves a completed terminal stage during persistence validation", () => {
    const item = { ...lastRoundItem(), stage: REVIEW_INTERVAL_DAYS.length };
    const migrated = migratePersistedState({ reviewItems: [item] }, 3);
    expect(migrated.reviewItems?.[0].stage).toBe(REVIEW_INTERVAL_DAYS.length);
  });
});
