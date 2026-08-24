import { describe, expect, it, vi } from "vitest";
import { routeIncomingBilibiliUrl, resolveIncomingBilibiliUrl } from "./nativeDeepLink";

describe("routeIncomingBilibiliUrl", () => {
  it("opens a shared Bilibili video in the in-app player", () => {
    const openVideo = vi.fn();

    const handled = routeIncomingBilibiliUrl(
      "https://www.bilibili.com/video/BV1GJ411x7h7?p=2",
      { openVideo },
    );

    expect(handled).toBe(true);
    expect(openVideo).toHaveBeenCalledWith("BV1GJ411x7h7", undefined, 2);
  });

  it("ignores URLs that are not Bilibili navigation targets", () => {
    const openVideo = vi.fn();

    expect(routeIncomingBilibiliUrl("https://example.com/docs", { openVideo })).toBe(false);
    expect(openVideo).not.toHaveBeenCalled();
  });
});

describe("resolveIncomingBilibiliUrl", () => {
  it("follows b23.tv redirects before routing the final video", async () => {
    const target = await resolveIncomingBilibiliUrl("https://b23.tv/AbCd", async () =>
      ({ ok: true, url: "https://www.bilibili.com/video/BV1GJ411x7h7?p=2" } as Response),
    );
    expect(target).toEqual({ kind: "video", bvid: "BV1GJ411x7h7", page: 2 });
  });

  it("leaves ordinary inputs untouched and tolerates short-link failures", async () => {
    const direct = await resolveIncomingBilibiliUrl("BV1GJ411x7h7");
    expect(direct.kind).toBe("video");
    const failed = await resolveIncomingBilibiliUrl("https://b23.tv/AbCd", async () => {
      throw new Error("offline");
    });
    expect(failed).toEqual({ kind: "unknown", raw: "https://b23.tv/AbCd" });
  });
});
