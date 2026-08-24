import { describe, expect, it } from "vitest";
import { openNativePlaybackWithRefresh, pickPlayableDashVideo, trackSourceCandidates } from "./playbackSourcePolicy";

describe("trackSourceCandidates", () => {
  it("keeps the primary URL first and removes duplicates", () => {
    expect(trackSourceCandidates({ baseUrl: "https://a", backupUrls: ["https://a", "https://b", ""] })).toEqual(["https://a", "https://b"]);
  });

  it("prefers official Bilibili DASH hosts over mCDN primaries", () => {
    expect(
      trackSourceCandidates({
        baseUrl: "https://b-node.edge.mountaintoys.cn:4483/video.m4s",
        backupUrls: ["https://upos-sz-mirrorcos.bilivideo.com/video.m4s"],
      }),
    ).toEqual([
      "https://upos-sz-mirrorcos.bilivideo.com/video.m4s",
      "https://b-node.edge.mountaintoys.cn:4483/video.m4s",
    ]);
  });
});

describe("pickPlayableDashVideo", () => {
  it("prefers an AVC track when HEVC is listed first", () => {
    const hevc = { id: 80, baseUrl: "https://hevc", backupUrls: [], codecs: "hev1.1.6.L120.90", bandwidth: 1 };
    const avc = { id: 80, baseUrl: "https://avc", backupUrls: [], codecs: "avc1.640032", bandwidth: 1 };
    expect(pickPlayableDashVideo([hevc, avc])?.baseUrl).toBe("https://avc");
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

  it("falls back to a progressive durl when DASH tracks are missing", async () => {
    const opened: string[] = [];
    const result = await openNativePlaybackWithRefresh({
      resolve: async () => ({
        quality: 64,
        acceptQuality: [64],
        timelengthMs: 1000,
        durl: [{ order: 1, length: 1, size: 1, url: "https://progressive.mp4", backup_url: [] }],
      }),
      open: async (videoUrl, audioUrl) => {
        opened.push(`${videoUrl}|${audioUrl ?? ""}`);
      },
    });
    expect(opened).toEqual(["https://progressive.mp4|"]);
    expect(result.durl?.[0]?.url).toBe("https://progressive.mp4");
  });

  it("uses fallbackResolve for fnval=1 MP4 after DASH open fails", async () => {
    const opened: string[] = [];
    const result = await openNativePlaybackWithRefresh({
      resolve: async () => ({
        quality: 80,
        acceptQuality: [80],
        timelengthMs: 1000,
        dash: {
          quality: 80,
          acceptQuality: [80],
          durationMs: 1000,
          video: [{ id: 80, baseUrl: "https://dash-video", backupUrls: [], codecs: "avc1", bandwidth: 1 }],
          audio: [{ id: 30280, baseUrl: "https://dash-audio", backupUrls: [], codecs: "", bandwidth: 0 }],
        },
      }),
      fallbackResolve: async () => ({
        quality: 64,
        acceptQuality: [64],
        timelengthMs: 1000,
        durl: [{ order: 1, length: 1, size: 1, url: "https://mp4-fallback.mp4", backup_url: [] }],
      }),
      open: async (videoUrl) => {
        opened.push(videoUrl);
        if (videoUrl.includes("dash")) throw new Error("DASH 无法播放");
      },
      maxRefreshes: 0,
    });
    expect(opened).toEqual(["https://dash-video", "https://mp4-fallback.mp4"]);
    expect(result.durl?.[0]?.url).toBe("https://mp4-fallback.mp4");
  });
});
