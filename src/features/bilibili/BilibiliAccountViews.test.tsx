import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BilibiliFavoritesView, BilibiliFollowedView, BilibiliSubscribedCollectionsView, FavoriteVideosView } from "./BilibiliAccountViews";
import { useAppStore } from "../../store/useAppStore";

function loginLocalStorage(userName = "测试账号") {
  localStorage.setItem("rixia_bilibili_cookie_v1", "SESSDATA=test");
  localStorage.setItem("rixia_bilibili_auth_v1", JSON.stringify({ signedIn: true, userName, mid: 1 }));
}

describe("BilibiliFavoritesView", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens a favorite folder and navigates to the favorite-videos view", async () => {
    loginLocalStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { list: [{ id: 9, title: "数学收藏", cover: "", media_count: 1, state: 0 }] },
    }), { status: 200 })));

    render(<BilibiliFavoritesView />);
    const folder = await screen.findByRole("button", { name: /数学收藏/ });
    fireEvent.click(folder);

    expect(useAppStore.getState().view).toBe("favorite-videos");
    expect(useAppStore.getState().activeBilibiliFavoriteFolder?.mediaId).toBe(9);
  });

  it("shows login prompt when signed out", () => {
    localStorage.clear();
    render(<BilibiliFavoritesView />);
    expect(screen.getByText(/请先登录/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去登录" })).toBeInTheDocument();
  });
});

describe("FavoriteVideosView", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders a favorite folder's videos", async () => {
    loginLocalStorage();
    useAppStore.setState({ activeBilibiliFavoriteFolder: { mediaId: 9, title: "数学收藏", coverUrl: "", mediaCount: 1, isAvailable: true } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      code: 0,
      data: { medias: [{ bvid: "BV1GJ411x7h7", title: "极限", cover: "", upper: { name: "老师" }, duration: "12:00", page: 1, fav_time: 1700000000, cnt_info: { play: 3, danmaku: 1 }, attr: 0 }], has_more: false, total: 1 },
    }), { status: 200 })));

    render(<FavoriteVideosView />);
    expect(await screen.findByText("极限")).toBeInTheDocument();
    expect(screen.getByText(/老师/)).toBeInTheDocument();
  });

  it("offers login when the selected favorite folder is opened while signed out", async () => {
    localStorage.clear();
    useAppStore.setState({
      activeBilibiliFavoriteFolder: {
        mediaId: 9,
        title: "数学收藏",
        coverUrl: "",
        mediaCount: 1,
        isAvailable: true,
      },
    });

    render(<FavoriteVideosView />);

    expect(await screen.findByText(/请先登录/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "去登录" })).toBeInTheDocument();
  });
});

describe("BilibiliFollowedView", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders followed creators with UID and sign", async () => {
    loginLocalStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { list: [{ mid: 123, uname: "数学老师", face: "", sign: "讲数学", official_verify: { type: 0, desc: "认证" } }], total: 1 },
    }), { status: 200 })));

    render(<BilibiliFollowedView />);
    expect(await screen.findByText("数学老师")).toBeInTheDocument();
    expect(screen.getByText(/UID：123/)).toBeInTheDocument();
    expect(screen.getByText(/认证/)).toBeInTheDocument();
  });

  it("filters the loaded list by search keyword without extra requests", async () => {
    loginLocalStorage();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { list: [
        { mid: 123, uname: "数学老师", face: "", sign: "讲数学", official_verify: { type: -1, desc: "" } },
        { mid: 456, uname: "物理老师", face: "", sign: "讲物理", official_verify: { type: -1, desc: "" } },
      ], total: 2 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BilibiliFollowedView />);
    await screen.findByText("数学老师");
    const callsBefore = fetchMock.mock.calls.length;

    fireEvent.change(screen.getByPlaceholderText("搜索昵称、UID、认证或签名"), { target: { value: "物理" } });

    expect(await screen.findByText("物理老师")).toBeInTheDocument();
    expect(screen.queryByText("数学老师")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("offers login again when an existing session has expired", async () => {
    loginLocalStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: -101,
      message: "未登录",
      data: null,
    }), { status: 200 })));

    render(<BilibiliFollowedView />);

    expect(await screen.findByText("登录已过期，请重新登录。")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "去登录" })).toBeInTheDocument();
  });
});

describe("BilibiliSubscribedCollectionsView", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders subscribed collection metadata", async () => {
    loginLocalStorage();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { list: [{ id: 99, type: 21, title: "线性代数合集", cover: "", intro: "从基础开始", upper: { mid: 8, name: "数学课", face: "" }, media_count: 12, view_count: 345 }], has_more: false, total: 1 },
    }), { status: 200 })));

    render(<BilibiliSubscribedCollectionsView />);
    expect(await screen.findByText("线性代数合集")).toBeInTheDocument();
    expect(screen.getByText(/数学课/)).toBeInTheDocument();
    expect(screen.getByText(/12 支视频/)).toBeInTheDocument();
  });

  it("shows login prompt when signed out", () => {
    localStorage.clear();
    render(<BilibiliSubscribedCollectionsView />);
    expect(screen.getByText(/请先登录/)).toBeInTheDocument();
  });
});
