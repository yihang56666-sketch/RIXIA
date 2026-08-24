import { describe, expect, it } from "vitest";
import { buildVideoFocusRequest } from "./focusPlaybackPolicy";

describe("video focus playback policy", () => {
  it("builds a focus request tied to the selected video part", () => {
    expect(buildVideoFocusRequest({ bvid: "BV1", title: "高数", cid: 42, pageNumber: 2, partTitle: "极限" }, true, 18)).toEqual({
      goal: "高数 · P2 极限",
      durationMs: 25 * 60_000,
      startImmediately: true,
      sourceBvid: "BV1",
      sourceVideoTitle: "高数",
      sourcePartCid: 42,
      sourcePartPageNumber: 2,
      sourcePartTitle: "极限",
      sourcePositionMs: 18_000,
      completeOnPartEnd: true,
    });
  });
});
