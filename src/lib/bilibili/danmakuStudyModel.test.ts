import { describe, expect, it } from "vitest";
import { DEFAULT_DANMAKU_PREFERENCES, DanmakuMode, type DanmakuEntry } from "./types";
import { buildDanmakuStudySummary, type DanmakuStudyConfig } from "./danmakuStudyModel";

const config: DanmakuStudyConfig = {
  windowSeconds: 12,
  highSignalLimit: 3,
  signalStrength: "standard",
};

function entry(text: string, startTimeSeconds: number, id = 1): DanmakuEntry {
  return {
    id,
    text,
    startTimeSeconds,
    durationSeconds: 6,
    mode: DanmakuMode.scrolling,
    color: 0xffffff,
    fontSize: 22,
    pool: 0,
    midHash: "",
  };
}

describe("buildDanmakuStudySummary", () => {
  it("ranks questions above low-information danmaku", () => {
    const result = buildDanmakuStudySummary(
      [entry("哈哈哈", 10, 1), entry("这里为什么要这样写？", 12, 2)],
      12,
      DEFAULT_DANMAKU_PREFERENCES,
      config,
    );

    expect(result.highSignalEntries[0]?.text).toBe("这里为什么要这样写？");
    expect(result.highSignalEntries[0]?.score).toBeGreaterThan(0);
  });

  it("excludes entries outside the nearby playback window", () => {
    const result = buildDanmakuStudySummary(
      [entry("现在的问题是什么？", 10, 1), entry("很远的问题是什么？", 120, 2)],
      10,
      DEFAULT_DANMAKU_PREFERENCES,
      config,
    );

    expect(result.highSignalEntries).toHaveLength(1);
    expect(result.highSignalEntries[0]?.text).toBe("现在的问题是什么？");
  });

  it("keeps the list deterministic and malformed-data safe", () => {
    const entries = [entry("怎么做这道题？", 20, 2), entry("怎么做这道题？", 21, 3), entry("哈哈", 20, 4)];
    const first = buildDanmakuStudySummary(entries, 20, DEFAULT_DANMAKU_PREFERENCES, config);
    const second = buildDanmakuStudySummary(entries, 20, DEFAULT_DANMAKU_PREFERENCES, config);
    const malformed = buildDanmakuStudySummary(undefined as unknown as DanmakuEntry[], 20, DEFAULT_DANMAKU_PREFERENCES, config);

    expect(first).toEqual(second);
    expect(malformed.highSignalEntries).toEqual([]);
    expect(first.highSignalEntries[0]?.text).toBe("怎么做这道题？");
  });
});
