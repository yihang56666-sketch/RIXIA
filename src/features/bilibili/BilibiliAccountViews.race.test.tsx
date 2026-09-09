import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BilibiliFollowedView, BilibiliSubscribedCollectionsView, FavoriteVideosView } from "./BilibiliAccountViews";
import { AccountDataLoadStatus } from "../../lib/bilibili/types";
import { useAppStore } from "../../store/useAppStore";
import { M3FeedbackProvider } from "./m3";

const service = {
  listFavoriteVideos: vi.fn(),
  listFollowedCreators: vi.fn(),
  listSubscribedCollections: vi.fn(),
};
const lookupVideo = vi.fn();
const folder = { mediaId: 1, title: "当前收藏夹", coverUrl: "", mediaCount: 2, isAvailable: true };

vi.mock("../../lib/bilibili/accountService", () => ({
  createBilibiliAuthService: () => ({ currentState: () => ({ signedIn: true }) }),
  createBilibiliAccountDataService: () => service,
}));
vi.mock("../../lib/bilibili/publicContentService", () => ({
  createBilibiliPublicContentService: () => ({ lookupVideo }),
}));

function deferred<Result>() {
  let resolve!: (value: Result) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Result>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function page<Item>(items: Item[], pageNumber = 1, hasMore = false) {
  return { status: AccountDataLoadStatus.success, items, page: pageNumber, hasMore };
}

const cases = [
  {
    name: "favorites", View: FavoriteVideosView, request: service.listFavoriteVideos, refresh: "刷新当前收藏夹",
    search: "搜索视频标题、UP 主或 BV 号",
    item: (name: string) => ({ bvid: name, title: name, coverUrl: "", ownerName: "UP 主", durationSeconds: 60, partCount: 1, isAvailable: true }),
  },
  {
    name: "followed", View: BilibiliFollowedView, request: service.listFollowedCreators, refresh: "刷新我的关注",
    search: "搜索昵称、UID、认证或签名",
    item: (name: string) => ({ mid: name === "原条目" ? 1 : name === "过期条目" ? 2 : 3, name, avatarUrl: "", sign: "", officialDescription: "" }),
  },
  {
    name: "subscriptions", View: BilibiliSubscribedCollectionsView, request: service.listSubscribedCollections, refresh: "刷新我的订阅",
    search: "搜索合集或 UP 主",
    item: (name: string) => ({ id: name === "原条目" ? 1 : name === "过期条目" ? 2 : 3, title: name, coverUrl: "", description: "", ownerMid: 1, ownerName: "UP 主", videoCount: 1 }),
  },
];

describe("account view request boundaries", () => {
  beforeEach(() => {
    Object.values(service).forEach((request) => request.mockReset());
    lookupVideo.mockReset();
    useAppStore.setState({ view: "favorite-videos", activeBilibiliFavoriteFolder: folder });
  });

  it("ignores a previous favorite folder response after selecting another folder", async () => {
    const older = deferred<ReturnType<typeof page>>();
    service.listFavoriteVideos.mockReturnValueOnce(older.promise).mockResolvedValueOnce(page([cases[0]!.item("新收藏内容")]));
    render(<FavoriteVideosView />);
    await act(async () => { useAppStore.setState({ activeBilibiliFavoriteFolder: { ...folder, mediaId: 2 } }); });
    await screen.findByText("新收藏内容");
    await act(async () => older.resolve(page([cases[0]!.item("过期条目")])));
    expect(screen.queryByText("过期条目")).not.toBeInTheDocument();
    expect(screen.getByText("新收藏内容")).toBeInTheDocument();
  });

  it.each(cases)("ignores stale pagination after refreshing $name", async ({ View, request, refresh, item }) => {
    const older = deferred<ReturnType<typeof page>>();
    request.mockResolvedValueOnce(page([item("原条目")], 1, true))
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(page([item("刷新条目")]));
    render(<View />);
    fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
    fireEvent.click(screen.getByRole("button", { name: refresh }));
    await screen.findByText("刷新条目");
    await act(async () => older.resolve(page([item("过期条目")], 2)));
    expect(screen.queryByText("过期条目")).not.toBeInTheDocument();
    expect(screen.getByText("刷新条目")).toBeInTheDocument();
  });

  it.each(cases)("keeps pagination reachable when $name has no local filter matches", async ({ View, request, search, item }) => {
    request.mockResolvedValueOnce(page([item("原条目")], 1, true));
    render(<View />);
    fireEvent.change(await screen.findByPlaceholderText(search), { target: { value: "未加载的内容" } });
    expect(screen.getByText(/没有匹配/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加载更多" })).toBeEnabled();
  });

  it.each(cases.slice(1))("preserves loaded $name entries after a pagination failure", async ({ View, request, item }) => {
    request.mockResolvedValueOnce(page([item("原条目")], 1, true)).mockResolvedValueOnce({
      status: AccountDataLoadStatus.networkError, items: [], page: 2, hasMore: false, message: "加载更多失败，请重试。",
    });
    render(<M3FeedbackProvider><View /></M3FeedbackProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(screen.getByText("原条目")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("加载更多失败");
    expect(screen.getByRole("button", { name: "加载更多" })).toBeEnabled();
  });

  it.each(cases)("deduplicates repeated items within the same $name page", async ({ View, request, item }) => {
    const next = item("后续条目");
    request.mockResolvedValueOnce(page([item("原条目")], 1, true)).mockResolvedValueOnce(page([next, next], 2));
    render(<View />);
    fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
    await waitFor(() => expect(screen.getAllByText("后续条目")).toHaveLength(1));
  });

  it("does not navigate when a favorite lookup finishes after leaving the view", async () => {
    const pending = deferred<{ bvid: string; title: string }>();
    service.listFavoriteVideos.mockResolvedValueOnce(page([cases[0]!.item("原条目")]));
    lookupVideo.mockReturnValueOnce(pending.promise);
    const { unmount } = render(<FavoriteVideosView />);
    fireEvent.click(await screen.findByRole("button", { name: /原条目/ }));
    unmount();
    useAppStore.setState({ view: "settings" });
    await act(async () => pending.reject(new Error("过期请求失败")));
    expect(useAppStore.getState().view).toBe("settings");
  });
});
