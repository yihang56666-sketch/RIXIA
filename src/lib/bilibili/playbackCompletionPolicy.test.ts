import { describe, expect, it } from "vitest";
import { isPlaybackComplete, nextIncompleteLearningEntry } from "./playbackCompletionPolicy";
import type { LearningListEntry } from "./types";

function entry(id: string, bvid: string, cid: number, completedAt?: string): LearningListEntry {
  return {
    id,
    bvid,
    partCid: cid,
    partPageNumber: cid,
    partTitle: `P${cid}`,
    title: id,
    ownerName: "老师",
    coverUrl: "",
    durationSeconds: 100,
    addedAt: `2026-08-19T0${cid}:00:00.000Z`,
    ...(completedAt ? { completedAt } : {}),
  };
}

describe("playback completion policy", () => {
  it("only treats a paused video at its end as complete", () => {
    expect(isPlaybackComplete({ currentTime: 99.6, duration: 100, playing: false })).toBe(true);
    expect(isPlaybackComplete({ currentTime: 99, duration: 100, playing: true })).toBe(false);
    expect(isPlaybackComplete({ currentTime: 20, duration: 100, playing: false })).toBe(false);
  });

  it("finds the next unfinished part after the current learning entry", () => {
    const entries = [
      entry("current", "BV1", 1),
      entry("done", "BV2", 2, "2026-08-19T09:00:00.000Z"),
      entry("next", "BV3", 3),
    ];
    expect(nextIncompleteLearningEntry(entries, "BV1", 1)?.id).toBe("next");
  });
});
