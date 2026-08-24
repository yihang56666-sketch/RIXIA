import { describe, expect, it, vi } from "vitest";
import {
  buildFocusSessionShareText,
  buildFocusStatisticsShareText,
  buildVideoNoteShareText,
  shareFocusText,
} from "./focusShareService";

describe("focus share service", () => {
  it("builds a completed-session summary with its goal and duration", () => {
    expect(buildFocusSessionShareText({
      goal: "复习高数极限",
      focusedMs: 90 * 60_000,
      interruptions: 2,
    })).toBe("我在 BEID 完成了“复习高数极限”专注任务，专注 1h30m，打断 2 次。");
  });

  it("builds a statistics summary from the visible totals", () => {
    expect(buildFocusStatisticsShareText({
      totalMs: 125 * 60_000,
      totalSessions: 4,
      completedSessions: 3,
      currentStreak: 2,
    })).toBe("这是我在 BEID 的专注统计：累计 2h5m，4 次专注，完成 3 次，连续 2 天。");
  });

  it("builds a timestamp note summary with its source video", () => {
    expect(buildVideoNoteShareText({
      title: "矩阵秩",
      videoTitle: "线性代数第一讲",
      positionSeconds: 90,
    })).toBe("来自 BEID 的时间点笔记：矩阵秩（线性代数第一讲 · 1:30）");
  });

  it("uses the system share sheet when it is available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();

    await expect(shareFocusText({ title: "专注成果", text: "内容" }, { share, writeText }))
      .resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: "专注成果", text: "内容" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the summary when the system share sheet is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(shareFocusText({ title: "专注成果", text: "内容" }, { writeText }))
      .resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("内容");
  });
});
