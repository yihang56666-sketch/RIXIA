import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BilibiliSearchView } from "./BilibiliSearchView";
import { useAppStore } from "../../store/useAppStore";

const searchUsers = vi.fn().mockResolvedValue({
  page: 1,
  totalPages: 1,
  results: [{
    mid: 999,
    name: "考研老师",
    avatarUrl: "https://example.test/avatar.jpg",
    signature: "专注学习",
    followerCount: 12345,
    videoCount: 42,
    level: 6,
    isUploader: true,
    certification: "教育认证",
  }],
});
const searchVideos = vi.fn().mockResolvedValue({
  page: 1,
  totalPages: 1,
  results: [{
    bvid: "BV1xx411c7mD",
    title: "线性代数第一讲",
    ownerName: "老师",
    durationSeconds: 1200,
    thumbnailUrl: "https://example.test/cover.jpg",
    playCount: 100,
    danmakuCount: 10,
    episodeCountText: "",
  }],
});
const suggestKeywords = vi.fn().mockResolvedValue(["高等数学", "高等数学同济版"]);
let storedHistory: string[] = [];
const clearHistory = vi.fn().mockImplementation(async () => {
  storedHistory = [];
  return true;
});

const lookupVideo = vi.fn().mockResolvedValue({
  aid: 1,
  bvid: "BV1xx411c7mD",
  cid: 7,
  title: "线性代数第一讲",
  ownerName: "老师",
  ownerMid: 1,
  ownerAvatarUrl: "",
  description: "",
  descriptionSegments: [],
  stats: { viewCount: 100, danmakuCount: 10 },
  durationSeconds: 1200,
  thumbnailUrl: "https://example.test/cover.jpg",
  parts: [{ cid: 7, pageNumber: 1, title: "第一讲", durationSeconds: 1200 }],
  tags: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock("../../lib/bilibili/publicContentService", () => ({
  createBilibiliPublicContentService: () => ({
    searchVideos,
    suggestKeywords,
    lookupVideo,
    searchUsers,
  }),
  extractBvid: (value: string) => /^BV[0-9A-Za-z]{10}$/i.test(value.trim()) ? value.trim() : null,
}));

vi.mock("../../lib/bilibili/services", () => ({
  createSearchHistoryService: () => ({
    list: vi.fn().mockImplementation(() => Promise.resolve(storedHistory)),
    record: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: clearHistory,
  }),
  createLearningListService: () => ({
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
  }),
}));

describe("BilibiliSearchView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedHistory = [];
    useAppStore.setState({ view: "search", resources: [], pendingBilibiliSearch: null });
  });

  it("shows matching suggestions and searches the selected keyword", async () => {
    render(<BilibiliSearchView />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "高数" } });
    const suggestion = await screen.findByRole("option", { name: "高等数学" });
    fireEvent.click(suggestion);

    await waitFor(() => expect(searchVideos).toHaveBeenCalledWith("高等数学", 1, expect.any(Object)));
  });

  it("clears all local search history from the history section", async () => {
    storedHistory = ["高等数学", "线性代数"];
    render(<BilibiliSearchView />);

    fireEvent.click(await screen.findByRole("button", { name: "清空搜索历史" }));
    fireEvent.click(screen.getByRole("button", { name: "清除" }));

    await waitFor(() => expect(clearHistory).toHaveBeenCalledOnce());
    expect(screen.queryByText("高等数学")).not.toBeInTheDocument();
  });

  it("opens a selected search result in the player", async () => {
    render(<BilibiliSearchView />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "线性代数" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    const video = await screen.findByRole("button", { name: "线性代数第一讲" });
    fireEvent.click(video);

    await waitFor(() => expect(useAppStore.getState().view).toBe("bilibili-player"));
  });

  it("re-runs the current keyword as a user search when switching modes", async () => {
    render(<BilibiliSearchView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "武忠祥" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(searchVideos).toHaveBeenCalledWith("武忠祥", 1, expect.any(Object)));

    fireEvent.click(screen.getByRole("button", { name: "用户" }));
    await waitFor(() => expect(searchUsers).toHaveBeenCalledWith("武忠祥", 1, expect.any(Object)));
    expect(await screen.findByRole("button", { name: /^考研老师$/ })).toBeInTheDocument();
  });

  it("opens a selected user result in the creator profile", async () => {
    render(<BilibiliSearchView />);

    fireEvent.click(screen.getByRole("button", { name: "用户" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "考研老师" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    const user = await screen.findByRole("button", { name: /^考研老师$/ });
    fireEvent.click(user);

    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.view).toBe("creator-profile");
      expect(state.activeBilibiliCreator).toMatchObject({
        mid: 999,
        name: "考研老师",
        avatarUrl: "https://example.test/avatar.jpg",
        sign: "专注学习",
        officialDescription: "教育认证",
      });
    });
  });

  it("consumes a pending kaoyan course search on mount", async () => {
    useAppStore.setState({ pendingBilibiliSearch: "考研英语阅读" });
    render(<BilibiliSearchView />);
    await waitFor(() => expect(searchVideos).toHaveBeenCalledWith("考研英语阅读", 1, expect.any(Object)));
    expect(useAppStore.getState().pendingBilibiliSearch).toBeNull();
  });

  it("keeps the newest result when an older search resolves later", async () => {
    const oldRequest = deferred<{ page: number; totalPages: number; results: Array<Record<string, unknown>> }>();
    const newRequest = deferred<{ page: number; totalPages: number; results: Array<Record<string, unknown>> }>();
    searchVideos
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise);
    render(<BilibiliSearchView />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "旧关键词" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(searchVideos).toHaveBeenCalledWith("旧关键词", 1, expect.any(Object)));
    fireEvent.change(input, { target: { value: "新关键词" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(searchVideos).toHaveBeenCalledWith("新关键词", 1, expect.any(Object)));

    const result = (bvid: string, title: string) => ({
      bvid,
      title,
      ownerName: "老师",
      durationSeconds: 600,
      thumbnailUrl: "",
      playCount: 1,
      danmakuCount: 0,
      episodeCountText: "",
    });
    newRequest.resolve({
      page: 1,
      totalPages: 1,
      results: [result("BVnew000001", "新关键词结果")],
    });
    oldRequest.resolve({
      page: 1,
      totalPages: 1,
      results: [result("BVold000001", "旧关键词结果")],
    });

    await waitFor(() => expect(screen.getByText("新关键词结果")).toBeInTheDocument());
    expect(screen.queryByText("旧关键词结果")).not.toBeInTheDocument();
  });

  it("uses the newly selected sort order for the next search", async () => {
    render(<BilibiliSearchView />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "线性代数" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(searchVideos).toHaveBeenCalledWith("线性代数", 1, expect.objectContaining({ order: "relevance" })));

    fireEvent.click(screen.getByRole("button", { name: "播放多" }));
    await waitFor(() => expect(searchVideos).toHaveBeenLastCalledWith("线性代数", 1, expect.objectContaining({ order: "mostplayed" })));
  });
});
