import { afterEach, describe, expect, it, vi } from "vitest";
import { createDanmakuFetchService } from "./danmakuFetchService";

describe("DanmakuFetchService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the local comment proxy in a browser development session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("<i />", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createDanmakuFetchService().fetchDanmaku(40429357187);

    expect(fetchMock).toHaveBeenCalledWith(
      "/bili-comment/40429357187.xml",
      expect.any(Object),
    );
  });

  it("uses CapacitorHttp for danmaku requests in the native app", async () => {
    const nativeRequest = vi.fn().mockResolvedValue({ status: 200, data: "<i />", headers: {} });
    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      Capacitor: { isNativePlatform: () => true },
      CapacitorHttp: { request: nativeRequest },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("WebView fetch must not be used")));

    await createDanmakuFetchService().fetchDanmaku(40429357187);

    expect(nativeRequest).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://comment.bilibili.com/40429357187.xml",
      method: "GET",
    }));
  });
});
