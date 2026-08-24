import { afterEach, describe, expect, it, vi } from "vitest";
import { createJsonRequest, refererForBiliUrl } from "./httpAdapter";

describe("createJsonRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem("rixia_bilibili_cookie_v1");
  });

  it("routes the Bilibili search endpoint through the search proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createJsonRequest()("https://api.bilibili.com/x/web-interface/wbi/search/type?keyword=math");

    expect(fetchMock).toHaveBeenCalledWith(
      "/bili-search-api/x/web-interface/wbi/search/type?keyword=math",
      expect.any(Object),
    );
  });

  it("routes a video detail endpoint through the video proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createJsonRequest()("https://api.bilibili.com/x/web-interface/view?bvid=BV1gA411j7Ta");

    expect(fetchMock).toHaveBeenCalledWith(
      "/bili-video-api/x/web-interface/view?bvid=BV1gA411j7Ta",
      expect.any(Object),
    );
  });

  it("forwards a stored login cookie through CapacitorHttp", async () => {
    localStorage.setItem("rixia_bilibili_cookie_v1", "SESSDATA=test; bili_jct=test");
    const nativeRequest = vi.fn().mockResolvedValue({ status: 200, data: "{}", headers: {} });
    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      Capacitor: { isNativePlatform: () => true },
      CapacitorHttp: { request: nativeRequest },
    });

    await createJsonRequest()("https://api.bilibili.com/x/player/playurl?bvid=BV1&cid=1");

    expect(nativeRequest).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({ Cookie: "SESSDATA=test; bili_jct=test" }),
    }));
  });

  it("uses the registered CapacitorHttp plugin when it is exposed through Plugins", async () => {
    const nativeRequest = vi.fn().mockResolvedValue({ status: 200, data: "{}", headers: {} });
    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: { CapacitorHttp: { request: nativeRequest } },
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("WebView fetch must not be used")));

    await createJsonRequest()("https://api.bilibili.com/x/web-interface/nav");

    expect(nativeRequest).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://api.bilibili.com/x/web-interface/nav",
      method: "GET",
    }));
  });

  it("routes a WBI video detail endpoint through the video proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createJsonRequest()("https://api.bilibili.com/x/web-interface/wbi/view?bvid=BV1gA411j7Ta");

    expect(fetchMock).toHaveBeenCalledWith(
      "/bili-video-api/x/web-interface/wbi/view?bvid=BV1gA411j7Ta",
      expect.any(Object),
    );
  });

  it("sends a video page referer for native playurl requests", async () => {
    const nativeRequest = vi.fn().mockResolvedValue({ status: 200, data: "{}", headers: {} });
    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      Capacitor: { isNativePlatform: () => true },
      CapacitorHttp: { request: nativeRequest },
    });

    await createJsonRequest()("https://api.bilibili.com/x/player/wbi/playurl?bvid=BV1gA411j7Ta&cid=1");

    expect(nativeRequest).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({
        Referer: "https://www.bilibili.com/video/BV1gA411j7Ta/",
        Origin: "https://www.bilibili.com",
      }),
    }));
  });
});

describe("refererForBiliUrl", () => {
  it("uses the video page for view and playurl requests", () => {
    expect(refererForBiliUrl("https://api.bilibili.com/x/web-interface/wbi/view?bvid=BV1xx411c7mD")).toBe(
      "https://www.bilibili.com/video/BV1xx411c7mD/",
    );
  });
});
