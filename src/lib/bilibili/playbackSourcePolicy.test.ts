import { describe, expect, it } from "vitest";
import { openNativePlaybackWithRefresh, trackSourceCandidates } from "./playbackSourcePolicy";

describe("trackSourceCandidates", () => {
  it("keeps the primary URL first and removes duplicates", () => {
    expect(trackSourceCandidates({ baseUrl: "https://a", backupUrls: ["https://a", "https://b", ""] })).toEqual(["https://a", "https://b"]);
  });
});

describe("openNativePlaybackWithRefresh", () => {
  it("refreshes playurl once after every current CDN combination fails", async () => {
    let resolves = 0;
    const opened: string[] = [];
    const result = await openNativePlaybackWithRefresh({
      resolve: async () => {
        resolves += 1;
        return {
          quality: 80,
          acceptQuality: [80],
          timelengthMs: 1000,
          dash: {
            quality: 80,
            acceptQuality: [80],
            durationMs: 1000,
            video: [{ id: 80, baseUrl: resolves === 1 ? "https://bad-video" : "https://good-video", backupUrls: [], codecs: "", bandwidth: 0 }],
            audio: [{ id: 30280, baseUrl: "https://good-audio", backupUrls: [], codecs: "", bandwidth: 0 }],
          },
        };
      },
      open: async (videoUrl, audioUrl) => {
        opened.push(`${videoUrl}|${audioUrl ?? ""}`);
        if (videoUrl.includes("bad")) throw new Error("线路失效");
      },
    });

    expect(resolves).toBe(2);
    expect(opened).toEqual(["https://bad-video|https://good-audio", "https://good-video|https://good-audio"]);
    expect(result.dash?.video[0].baseUrl).toBe("https://good-video");
  });
});
