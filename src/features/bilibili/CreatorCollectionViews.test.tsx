import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreatorProfileView, CollectionDetailView } from "./CreatorCollectionViews";
import { CreatorVideoOrder } from "../../lib/bilibili/extendedModels";
import { M3FeedbackProvider } from "./m3";

const listCreatorVideos = vi.fn().mockResolvedValue({ items: [{ bvid: "BV1xx411c7mD", title: "投稿视频", coverUrl: "", durationSeconds: 60, partCount: 1, stats: { viewCount: 1, danmakuCount: 0, replyCount: 0, favoriteCount: 0, coinCount: 0, shareCount: 0, likeCount: 0 } }], page: 1, hasMore: false, totalCount: 1 });
const lookupVideo = vi.fn().mockResolvedValue({ bvid: "BV1xx411c7mD", title: "投稿视频", ownerName: "测试 UP", thumbnailUrl: "", durationSeconds: 60, parts: [{ cid: 1, pageNumber: 1, title: "P1", durationSeconds: 60 }] });
const loadCreatorProfile = vi.fn().mockResolvedValue({ mid: 1, name: "测试 UP", avatarUrl: "", sign: "签名", officialDescription: "认证", followingCount: 2, followerCount: 100, likeCount: 20, videoCount: 1, articleCount: 0 });
const listCreatorArticles = vi.fn().mockResolvedValue({ items: [{ id: 7, title: "专栏文章", summary: "专栏摘要", coverUrl: "", viewCount: 42 }], page: 1, hasMore: false });
const listCollectionVideos = vi.fn().mockResolvedValue({ items: [{ bvid: "BV1xx411c7mD", title: "合集视频", coverUrl: "", durationSeconds: 60, partCount: 1, stats: { viewCount: 1, danmakuCount: 0, replyCount: 0, favoriteCount: 0, coinCount: 0, shareCount: 0, likeCount: 0 } }], page: 1, hasMore: false });
const addLearningEntry = vi.fn().mockResolvedValue(true);
const collection = { id: 2, ownerMid: 1, title: "测试合集", coverUrl: "", description: "简介", ownerName: "测试 UP", ownerAvatarUrl: "", videoCount: 1, viewCount: 3 };

function deferred<Result>() {
  let resolve!: (value: Result) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Result>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

vi.mock("../../lib/bilibili/publicContentService", () => ({
  createBilibiliPublicContentService: () => ({
    loadCreatorProfile,
    listCreatorVideos,
    listCreatorArticles,
    listCreatorCollections: vi.fn().mockResolvedValue({ items: [], page: 1, hasMore: false }),
    listCollectionVideos,
    lookupVideo,
  }),
}));

vi.mock("../../lib/bilibili/watchHistoryService", () => ({
  createWatchHistoryService: () => ({ list: vi.fn().mockResolvedValue([]), record: vi.fn(), remove: vi.fn(), clear: vi.fn() }),
}));

vi.mock("../../lib/bilibili/services", () => ({
  createLearningListService: () => ({ list: vi.fn().mockResolvedValue([]), add: addLearningEntry }),
}));

describe("CreatorCollectionViews", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("renders creator profile and uploaded videos", async () => {
    render(<CreatorProfileView mid={1} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    expect(await screen.findByText("测试 UP")).toBeInTheDocument();
    expect(screen.getByText("投稿视频")).toBeInTheDocument();
  });

  it("renders the creator's public articles separately from uploaded videos", async () => {
    render(<CreatorProfileView mid={1} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "专栏" }));
    expect(await screen.findByText("专栏文章")).toBeInTheDocument();
    expect(screen.getByText(/专栏摘要/)).toBeInTheDocument();
  });

  it("reloads uploads with the submitted keyword and sort order", async () => {
    listCreatorVideos.mockClear();
    render(<CreatorProfileView mid={1} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    await screen.findByText("投稿视频");

    fireEvent.click(screen.getByRole("button", { name: "搜索投稿" }));
    const input = await screen.findByRole("textbox", { name: "搜索该 UP 主的投稿" });
    fireEvent.change(input, { target: { value: "线性代数" } });
    fireEvent.submit(input.closest("form")!);

    fireEvent.click(screen.getByRole("button", { name: /最新发布/ }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "最多播放" }));

    expect(await screen.findByText("投稿视频")).toBeInTheDocument();
    await waitFor(() => expect(listCreatorVideos).toHaveBeenLastCalledWith(1, 1, { keyword: "线性代数", order: CreatorVideoOrder.mostPlayed }));
  });

  it("renders collection metadata and videos", async () => {
    render(<CollectionDetailView collection={{ id: 2, ownerMid: 1, title: "测试合集", coverUrl: "", description: "简介", ownerName: "测试 UP", ownerAvatarUrl: "", videoCount: 1, viewCount: 3 }} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    expect(await screen.findByText("测试合集")).toBeInTheDocument();
    expect(screen.getAllByText("合集视频").length).toBeGreaterThan(1);
  });

  it("ignores a previous creator profile after navigation to another creator", async () => {
    const older = deferred<{ mid: number; name: string }>();
    loadCreatorProfile.mockReturnValueOnce(older.promise).mockResolvedValueOnce({ mid: 2, name: "新的 UP 主" });
    const { rerender } = render(<CreatorProfileView mid={1} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    rerender(<CreatorProfileView mid={2} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    await screen.findByText("新的 UP 主");
    await act(async () => older.resolve({ mid: 1, name: "过期的 UP 主" }));
    expect(screen.queryByText("过期的 UP 主")).not.toBeInTheDocument();
    expect(screen.getByText("新的 UP 主")).toBeInTheDocument();
  });

  it("does not show previous uploads when the next creator fails to load", async () => {
    const { rerender } = render(<CreatorProfileView mid={1} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    await screen.findByText("投稿视频");
    listCreatorVideos.mockRejectedValueOnce(new Error("新的投稿加载失败"));
    rerender(<CreatorProfileView mid={2} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    expect(await screen.findByText("新的投稿加载失败")).toBeInTheDocument();
    expect(screen.queryByText("投稿视频")).not.toBeInTheDocument();
  });

  it("resets pagination busy state when switching creator tabs", async () => {
    const older = deferred<{ items: never[]; page: number; hasMore: boolean }>();
    listCreatorVideos.mockResolvedValueOnce({ items: [], page: 1, hasMore: true }).mockReturnValueOnce(older.promise);
    listCreatorArticles.mockResolvedValueOnce({ items: [{ id: 7, title: "专栏文章", summary: "", viewCount: 0 }], page: 1, hasMore: true });
    const { container } = render(<CreatorProfileView mid={1} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    await screen.findByText("暂无公开投稿");
    fireEvent.scroll(container.querySelector(".creator-content-scroll")!);
    await waitFor(() => expect(listCreatorVideos).toHaveBeenCalledWith(1, 2, expect.any(Object)));
    fireEvent.click(screen.getByRole("tab", { name: "专栏" }));
    await screen.findByText("专栏文章");
    fireEvent.scroll(container.querySelector(".creator-content-scroll")!);
    await waitFor(() => expect(listCreatorArticles).toHaveBeenCalledWith(1, 2));
    await act(async () => older.resolve({ items: [], page: 2, hasMore: false }));
  });

  it("does not append a previous collection page to the next collection", async () => {
    const older = deferred<{ items: Array<Record<string, unknown>>; page: number; hasMore: boolean }>();
    listCollectionVideos.mockResolvedValueOnce({ items: [], page: 1, hasMore: true })
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ items: [], page: 1, hasMore: false });
    const { container, rerender } = render(<CollectionDetailView collection={collection} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    await screen.findByText("这个合集暂时没有可播放视频");
    fireEvent.scroll(container.querySelector(".creator-content-scroll")!);
    await waitFor(() => expect(listCollectionVideos).toHaveBeenCalledWith(1, 2, 2));
    rerender(<CollectionDetailView collection={{ ...collection, id: 3 }} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    await screen.findByText("这个合集暂时没有可播放视频");
    await act(async () => older.resolve({ items: [{ bvid: "BV-old", title: "旧合集视频", coverUrl: "", durationSeconds: 60, partCount: 2, stats: { viewCount: 1, danmakuCount: 0 } }], page: 2, hasMore: false }));
    expect(screen.queryByText("旧合集视频")).not.toBeInTheDocument();
  });

  it("does not open a video when the nested add button receives a keyboard event", async () => {
    const onOpenVideo = vi.fn();
    render(<CreatorProfileView mid={1} onBack={vi.fn()} onOpenVideo={onOpenVideo} />);
    const addButton = await screen.findByRole("button", { name: "加入学习清单" });
    await act(async () => { fireEvent.keyDown(addButton, { key: "Enter" }); });
    expect(onOpenVideo).not.toHaveBeenCalled();
    fireEvent.click(addButton);
    await waitFor(() => expect(addLearningEntry).toHaveBeenCalledOnce());
  });

  it.each(["creator", "collection"])("reports failed local saves from the %s view", async (view) => {
    addLearningEntry.mockResolvedValueOnce(false);
    render(<M3FeedbackProvider>{view === "creator"
      ? <CreatorProfileView mid={1} onBack={vi.fn()} onOpenVideo={vi.fn()} />
      : <CollectionDetailView collection={collection} onBack={vi.fn()} onOpenVideo={vi.fn()} />}</M3FeedbackProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "加入学习清单" }));
    expect(await screen.findByRole("status")).toHaveTextContent("加入学习清单失败");
  });

  it.each(["creator", "collection"])("does not open a video after the %s view unmounts", async (view) => {
    const onOpenVideo = vi.fn();
    const { unmount } = render(view === "creator"
      ? <CreatorProfileView mid={1} onBack={vi.fn()} onOpenVideo={onOpenVideo} />
      : <CollectionDetailView collection={collection} onBack={vi.fn()} onOpenVideo={onOpenVideo} />);
    const row = await screen.findByRole("button", { name: "加入学习清单" });
    const pending = deferred<{ bvid: string; title: string }>();
    lookupVideo.mockReturnValueOnce(pending.promise);
    fireEvent.click(row.closest(".creator-video-row")!);
    unmount();
    await act(async () => pending.resolve({ bvid: "BV1xx411c7mD", title: "延迟视频" }));
    expect(onOpenVideo).not.toHaveBeenCalled();
  });

  it("offers an in-place retry when collection loading fails", async () => {
    listCollectionVideos.mockRejectedValueOnce(new Error("合集连接失败"));
    render(<CollectionDetailView collection={collection} onBack={vi.fn()} onOpenVideo={vi.fn()} />);
    await screen.findByText("合集连接失败");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(listCollectionVideos).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "加入学习清单" })).toBeInTheDocument();
  });
});
