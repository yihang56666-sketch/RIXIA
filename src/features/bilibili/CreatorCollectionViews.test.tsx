import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreatorProfileView, CollectionDetailView } from "./CreatorCollectionViews";
import { CreatorVideoOrder } from "../../lib/bilibili/extendedModels";

const listCreatorVideos = vi.fn().mockResolvedValue({ items: [{ bvid: "BV1xx411c7mD", title: "投稿视频", coverUrl: "", durationSeconds: 60, partCount: 1, stats: { viewCount: 1, danmakuCount: 0, replyCount: 0, favoriteCount: 0, coinCount: 0, shareCount: 0, likeCount: 0 } }], page: 1, hasMore: false, totalCount: 1 });
const lookupVideo = vi.fn().mockResolvedValue({ bvid: "BV1xx411c7mD", title: "投稿视频", ownerName: "测试 UP", thumbnailUrl: "", durationSeconds: 60, parts: [{ cid: 1, pageNumber: 1, title: "P1", durationSeconds: 60 }] });

vi.mock("../../lib/bilibili/publicContentService", () => ({
  createBilibiliPublicContentService: () => ({
    loadCreatorProfile: vi.fn().mockResolvedValue({ mid: 1, name: "测试 UP", avatarUrl: "", sign: "签名", officialDescription: "认证", followingCount: 2, followerCount: 100, likeCount: 20, videoCount: 1, articleCount: 0 }),
    listCreatorVideos,
    listCreatorArticles: vi.fn().mockResolvedValue({ items: [{ id: 7, title: "专栏文章", summary: "专栏摘要", coverUrl: "", viewCount: 42 }], page: 1, hasMore: false }),
    listCreatorCollections: vi.fn().mockResolvedValue({ items: [], page: 1, hasMore: false }),
    listCollectionVideos: vi.fn().mockResolvedValue({ items: [{ bvid: "BV1xx411c7mD", title: "合集视频", coverUrl: "", durationSeconds: 60, partCount: 1, stats: { viewCount: 1, danmakuCount: 0, replyCount: 0, favoriteCount: 0, coinCount: 0, shareCount: 0, likeCount: 0 } }], page: 1, hasMore: false }),
    lookupVideo,
  }),
}));

vi.mock("../../lib/bilibili/watchHistoryService", () => ({
  createWatchHistoryService: () => ({ list: vi.fn().mockResolvedValue([]), record: vi.fn(), remove: vi.fn(), clear: vi.fn() }),
}));

vi.mock("../../lib/bilibili/services", () => ({
  createLearningListService: () => ({ list: vi.fn().mockResolvedValue([]), add: vi.fn().mockResolvedValue(true) }),
}));

describe("CreatorCollectionViews", () => {
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
});