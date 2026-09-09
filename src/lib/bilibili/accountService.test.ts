import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BilibiliQrLoginStatus,
  createBilibiliAccountDataService,
  createBilibiliAuthService,
  createBilibiliCookieStore,
  createBilibiliQrLoginService,
} from "./accountService";
import { AccountDataLoadStatus } from "./types";

describe("Bilibili QR login transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("routes QR generation through the local passport proxy in a browser", async () => {
    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1" },
      Capacitor: { isNativePlatform: () => false },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { url: "https://passport.bilibili.com/h5/qr", qrcode_key: "key-1" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const session = await createBilibiliQrLoginService().generate();

    expect(session.key).toBe("key-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/bili-passport/x/passport-login/web/qrcode/generate",
      expect.any(Object),
    );
  });

  it("captures the real login cookie from the proxy's x-bili-set-cookie header on confirmation", async () => {
    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1" },
      Capacitor: { isNativePlatform: () => false },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: {
        code: 0,
        mid: 42,
        url: "https://passport.bilibili.com/crossDomain?DedeUserID=42",
      },
    }), {
      status: 200,
      headers: { "x-bili-set-cookie": "SESSDATA=abc%2Fx; bili_jct=def; DedeUserID=42; buvid3=xyz" },
    })));

    const result = await createBilibiliQrLoginService().poll("key-1");

    expect(result.status).toBe(BilibiliQrLoginStatus.confirmed);
    expect(result.cookieHeader).toBe("SESSDATA=abc%2Fx; bili_jct=def; DedeUserID=42; buvid3=xyz");
    expect(result.mid).toBe(42);
  });

  it("falls back to the redirect url params when no cookie header is readable", async () => {
    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1" },
      Capacitor: { isNativePlatform: () => false },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: {
        code: 0,
        url: "https://passport.bilibili.com/crossDomain?DedeUserID=42&DedeUserID__ckMd5=ck",
      },
    }), { status: 200 })));

    const result = await createBilibiliQrLoginService().poll("key-1");

    expect(result.status).toBe(BilibiliQrLoginStatus.confirmed);
    expect(result.cookieHeader).toBe("DedeUserID=42; DedeUserID__ckMd5=ck");
  });

  it("keeps waiting without leaking a cookie header before confirmation", async () => {
    vi.stubGlobal("window", {
      location: { hostname: "127.0.0.1" },
      Capacitor: { isNativePlatform: () => false },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { code: 86090 },
    }), { status: 200 })));

    const result = await createBilibiliQrLoginService().poll("key-1");

    expect(result.status).toBe(BilibiliQrLoginStatus.scanned);
    expect(result.cookieHeader).toBe("");
  });

  it("does not confirm a poll response without a status code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 })));

    await expect(createBilibiliQrLoginService().poll("key-1")).rejects.toThrow("状态码");
  });
});

describe("Bilibili account request isolation", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it.each(["signOut", "switchAccount"])("does not restore an old profile after %s during nav resolution", async (action) => {
    localStorage.clear();
    const cookieStore = createBilibiliCookieStore();
    const auth = createBilibiliAuthService(cookieStore);
    auth.signIn("SESSDATA=old", {});
    let releaseNav!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { releaseNav = resolve; }))
      .mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { list: [], total: 0 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = createBilibiliAccountDataService(auth, cookieStore).listFollowedCreators(3);

    if (action === "signOut") auth.signOut();
    else auth.signIn("SESSDATA=new", { mid: 99, userName: "new account" });
    releaseNav(new Response(JSON.stringify({ code: 0, data: { isLogin: true, mid: 42, uname: "old account" } }), { status: 200 }));
    await pending;

    expect(auth.currentState()).toEqual(action === "signOut" ? { signedIn: false } : { signedIn: true, mid: 99, userName: "new account", avatarUrl: undefined });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves nav business errors while resolving a missing mid", async () => {
    localStorage.clear();
    const cookieStore = createBilibiliCookieStore();
    const auth = createBilibiliAuthService(cookieStore);
    auth.signIn("SESSDATA=old", {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: -101, data: null }), { status: 200 })));

    await expect(createBilibiliAccountDataService(auth, cookieStore).listFollowedCreators(1)).resolves.toMatchObject({ status: AccountDataLoadStatus.expired });
  });
});

describe("Bilibili account transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not override the native cookie jar after a QR confirmation", async () => {
    const storage = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      get length() { return storage.size; },
    } as Storage;
    const cookieStore = createBilibiliCookieStore(memoryStorage);
    const auth = createBilibiliAuthService(cookieStore, memoryStorage);
    auth.signIn("confirmed", {});
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { list: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createBilibiliAccountDataService(auth, cookieStore).listFollowedCreators(1);

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers.Cookie).toBeUndefined();
  });

  it("uses the local API proxy for a browser cookie session", async () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const storage = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      get length() { return storage.size; },
    } as Storage;
    const cookieStore = createBilibiliCookieStore(memoryStorage);
    const auth = createBilibiliAuthService(cookieStore, memoryStorage);
    auth.signIn("SESSDATA=test; bili_jct=test", { mid: 42 });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { list: [] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await createBilibiliAccountDataService(auth, cookieStore).listFollowedCreators(1);

    expect(fetchMock).toHaveBeenCalledWith(
      "/bili-api/x/relation/followings?vmid=42&pn=1&ps=50&order=desc",
      expect.objectContaining({ headers: expect.objectContaining({ "X-Beid-Cookie": "SESSDATA=test; bili_jct=test" }) }),
    );
  });

  it("loads the signed-in user profile from the Bilibili nav endpoint", async () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const storage = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      get length() { return storage.size; },
    } as Storage;
    const cookieStore = createBilibiliCookieStore(memoryStorage);
    const auth = createBilibiliAuthService(cookieStore, memoryStorage);
    auth.signIn("SESSDATA=test; bili_jct=test", {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { isLogin: true, mid: 42, uname: "测试用户", face: "https://example.test/avatar.jpg" },
    }), { status: 200 })));

    const profile = await createBilibiliAccountDataService(auth, cookieStore).loadCurrentUser();

    expect(profile).toEqual({ mid: 42, userName: "测试用户", avatarUrl: "https://example.test/avatar.jpg" });
  });

  it("preserves network failures when loading the current user", async () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const storage = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      get length() { return storage.size; },
    } as Storage;
    const cookieStore = createBilibiliCookieStore(memoryStorage);
    const auth = createBilibiliAuthService(cookieStore, memoryStorage);
    auth.signIn("SESSDATA=test; bili_jct=test", { mid: 42 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(createBilibiliAccountDataService(auth, cookieStore).loadCurrentUser())
      .rejects.toMatchObject({ status: AccountDataLoadStatus.networkError });
  });

  it("reports an expired session when the nav API rejects the account", async () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const storage = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      get length() { return storage.size; },
    } as Storage;
    const cookieStore = createBilibiliCookieStore(memoryStorage);
    const auth = createBilibiliAuthService(cookieStore, memoryStorage);
    auth.signIn("SESSDATA=test; bili_jct=test", { mid: 42 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: -101,
      message: "未登录",
      data: null,
    }), { status: 200 })));

    await expect(createBilibiliAccountDataService(auth, cookieStore).loadCurrentUser())
      .rejects.toMatchObject({ status: AccountDataLoadStatus.expired });
  });

  it("uses CapacitorHttp for authenticated native account requests", async () => {
    const storage = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      get length() { return storage.size; },
    } as Storage;
    const cookieStore = createBilibiliCookieStore(memoryStorage);
    const auth = createBilibiliAuthService(cookieStore, memoryStorage);
    auth.signIn("confirmed", { mid: 42 });
    const nativeRequest = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify({ code: 0, data: { list: [], total: 0 } }),
      headers: {},
    });
    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      Capacitor: { isNativePlatform: () => true },
      CapacitorHttp: { request: nativeRequest },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("WebView fetch must not be used")));

    const result = await createBilibiliAccountDataService(auth, cookieStore).listFollowedCreators(1);

    expect(result.status).toBe(AccountDataLoadStatus.success);
    expect(nativeRequest).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://api.bilibili.com/x/relation/followings?vmid=42&pn=1&ps=50&order=desc",
      method: "GET",
    }));
  });

  it("preserves auth errors while resolving a missing account mid", async () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const storage = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      get length() { return storage.size; },
    } as Storage;
    const cookieStore = createBilibiliCookieStore(memoryStorage);
    const auth = createBilibiliAuthService(cookieStore, memoryStorage);
    auth.signIn("SESSDATA=test; bili_jct=test", {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));

    const result = await createBilibiliAccountDataService(auth, cookieStore).listFollowedCreators(1);

    expect(result.status).toBe(AccountDataLoadStatus.expired);
  });

  it("upgrades favorite folder and video covers to https thumbnails", async () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const storage = new Map<string, string>();
    const memoryStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: () => null,
      get length() { return storage.size; },
    } as Storage;
    const cookieStore = createBilibiliCookieStore(memoryStorage);
    const auth = createBilibiliAuthService(cookieStore, memoryStorage);
    auth.signIn("SESSDATA=test; bili_jct=test", { mid: 42 });
    const fetchMock = vi.fn(async (url: string) => {
      const href = String(url);
      if (href.includes("/x/v3/fav/folder/created/list") && !href.includes("list-all")) {
        return new Response(JSON.stringify({
          code: 0,
          data: {
            count: 1,
            list: [{ id: 99, title: "默认收藏夹", cover: "http://i0.hdslb.com/bfs/archive/a.jpg", media_count: 2 }],
          },
        }), { status: 200 });
      }
      if (href.includes("/x/v3/fav/resource/list")) {
        return new Response(JSON.stringify({
          code: 0,
          data: {
            has_more: false,
            medias: [{
              bvid: "BV1xx411c7mD",
              title: "收藏视频",
              cover: "http://i0.hdslb.com/bfs/archive/b.jpg",
              duration: 12,
              page: 1,
              attr: 0,
              upper: { name: "UP" },
              cnt_info: {},
            }],
          },
        }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${href}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = createBilibiliAccountDataService(auth, cookieStore);
    const folders = await service.listFavoriteFolders();
    const videos = await service.listFavoriteVideos(99, 1);

    expect(folders.items[0]?.coverUrl).toBe("https://i0.hdslb.com/bfs/archive/a.jpg@320w_200h_1c.webp");
    expect(videos.items[0]?.coverUrl).toBe("https://i0.hdslb.com/bfs/archive/b.jpg@320w_200h_1c.webp");
  });
});
