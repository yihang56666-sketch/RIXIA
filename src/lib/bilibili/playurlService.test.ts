import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlayurlService, parsePlayUrl } from "./playurlService";
import { clearWbiKeyCache } from "./wbiSign";

describe("parsePlayUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearWbiKeyCache();
  });

  it("preserves negative Bilibili business codes as errors", () => {
    expect(() => parsePlayUrl(JSON.stringify({ code: -403, message: "无权访问" })))
      .toThrow("无权访问（错误码：-403）");
  });

  it("parses a DASH response with video and audio tracks", () => {
    const result = parsePlayUrl(JSON.stringify({
      code: 0,
      data: {
        quality: 80,
        timelength: 1000,
        accept_quality: [80, 64],
        dash: {
          duration: 1000,
          video: [{ id: 80, baseUrl: "https://video.example/1" }],
          audio: [{ id: 30280, baseUrl: "https://audio.example/1" }],
        },
      },
    }));

    expect(result.dash?.video[0].baseUrl).toBe("https://video.example/1");
    expect(result.dash?.audio[0].baseUrl).toBe("https://audio.example/1");
  });

  it("uses the shared HTTP adapter for the default request path", async () => {
    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      Capacitor: { isNativePlatform: () => false },
    });
    const playurlBody = JSON.stringify({
      code: 0,
      data: { quality: 80, timelength: 1000, accept_quality: [], durl: [] },
    });
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(playurlBody, { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await createPlayurlService().resolve("BV1gA411j7Ta", 123);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/bili-video-api\/x\/player\/(?:wbi\/)?playurl\?/),
      expect.any(Object),
    );
  });

  it("falls back to the unsigned playurl with identical params when the signed request is risk-blocked (HTTP 412)", async () => {
    const nav = JSON.stringify({
      code: 0,
      data: {
        wbi_img: {
          img_url: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
          sub_url: "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
        },
      },
    });
    const requestJson = vi.fn(async (url: string) => {
      if (url.includes("/x/web-interface/nav")) return nav;
      if (url.includes("/wbi/playurl")) throw new Error("HTTP 412");
      return JSON.stringify({
        code: 0,
        data: { quality: 64, accept_quality: [64], timelength: 60000 },
      });
    });

    const result = await createPlayurlService(requestJson).resolve("BV1gA411j7Ta", 123);

    expect(result.quality).toBe(64);
    const playurlCalls = requestJson.mock.calls.filter(([url]) => String(url).includes("playurl"));
    expect(playurlCalls).toHaveLength(2);
    expect(String(playurlCalls[0]?.[0])).toContain("/wbi/playurl");
    expect(String(playurlCalls[1]?.[0])).toContain("/x/player/playurl");
    expect(String(playurlCalls[1]?.[0])).toContain("qn=80");
    expect(String(playurlCalls[1]?.[0])).toContain("fnval=16");
    // 匿名回退带 try_look=1：解锁 720P 试看流（不带则实际流只有 480P）。
    expect(String(playurlCalls[1]?.[0])).toContain("try_look=1");
  });

  it("surfaces the last error when both the signed and unsigned playurl fail", async () => {
    const nav = JSON.stringify({
      code: 0,
      data: {
        wbi_img: {
          img_url: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
          sub_url: "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
        },
      },
    });
    const requestJson = vi.fn(async (url: string) => {
      if (url.includes("/x/web-interface/nav")) return nav;
      throw new Error("HTTP 412");
    });

    await expect(createPlayurlService(requestJson).resolve("BV1gA411j7Ta", 123)).rejects.toThrow("HTTP 412");

    const playurlCalls = requestJson.mock.calls.filter(([url]) => String(url).includes("playurl"));
    expect(playurlCalls).toHaveLength(2);
  });
});
