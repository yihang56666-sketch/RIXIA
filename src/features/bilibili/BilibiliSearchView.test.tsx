import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BilibiliSearchView } from "./BilibiliSearchView";
import { useAppStore } from "../../store/useAppStore";
import { M3FeedbackProvider } from "./m3";
import type { LearningListEntry, VideoSearchResult } from "../../lib/bilibili/types";

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
const learningList = {
  list: vi.fn<() => Promise<LearningListEntry[]>>().mockResolvedValue([]),
  add: vi.fn().mockResolvedValue(true),
  remove: vi.fn().mockResolvedValue(true),
};

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
  createLearningListService: () => learningList,
}));

describe("BilibiliSearchView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storedHistory = [];
    learningList.list.mockResolvedValue([]);
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

  it("ignores an older keyword suggestion response", async () => {
    const older = deferred<string[]>();
    const newer = deferred<string[]>();
    suggestKeywords.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    render(<BilibiliSearchView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "旧词" } });
    await waitFor(() => expect(suggestKeywords).toHaveBeenCalledWith("旧词"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "新词" } });
    await waitFor(() => expect(suggestKeywords).toHaveBeenCalledWith("新词"));
    await act(async () => newer.resolve(["新词建议"]));
    await act(async () => older.resolve(["旧词建议"]));
    expect(screen.queryByRole("option", { name: "旧词建议" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "新词建议" })).toBeInTheDocument();
  });

  it("invalidates an in-flight search when the input is cleared", async () => {
    const pending = deferred<{ page: number; totalPages: number; results: VideoSearchResult[] }>();
    searchVideos.mockReturnValueOnce(pending.promise);
    render(<BilibiliSearchView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "旧词" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(searchVideos).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    expect(screen.getByText("搜索你真正想看的内容")).toBeInTheDocument();
    await act(async () => pending.resolve({ page: 1, totalPages: 1, results: [] }));
    expect(screen.getByText("搜索你真正想看的内容")).toBeInTheDocument();
  });

  it.each(["Enter", " "])("opens a video result with the %s key", async (key) => {
    render(<BilibiliSearchView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "线性代数" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.keyDown(await screen.findByRole("button", { name: "线性代数第一讲" }), { key });
    await waitFor(() => expect(useAppStore.getState().view).toBe("bilibili-player"));
  });

  it("opens a user result with the keyboard", async () => {
    render(<BilibiliSearchView />);
    fireEvent.click(screen.getByRole("button", { name: "用户" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "考研老师" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.keyDown(await screen.findByRole("button", { name: "考研老师" }), { key: "Enter" });
    expect(useAppStore.getState().view).toBe("creator-profile");
  });

  it("does not navigate after a pending video lookup outlives the view", async () => {
    const pending = deferred<Awaited<ReturnType<typeof lookupVideo>>>();
    lookupVideo.mockReturnValueOnce(pending.promise);
    const { unmount } = render(<BilibiliSearchView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "线性代数" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.click(await screen.findByRole("button", { name: "线性代数第一讲" }));
    unmount();
    useAppStore.setState({ view: "settings" });
    await act(async () => pending.reject(new Error("请求已过期")));
    expect(useAppStore.getState().view).toBe("settings");
  });

  it("removes the persisted learning entry by its real id", async () => {
    learningList.list.mockResolvedValue([{
      id: "persisted-entry-id", bvid: "BV1xx411c7mD", partCid: 7, title: "线性代数第一讲",
      ownerName: "老师", coverUrl: "", durationSeconds: 1200, addedAt: "2026-09-06T00:00:00.000Z",
    }]);
    render(<BilibiliSearchView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "BV1xx411c7mD" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.click(await screen.findByRole("button", { name: "更多选项" }));
    fireEvent.click(screen.getByRole("button", { name: "取消加入" }));
    await waitFor(() => expect(learningList.remove).toHaveBeenCalledWith("persisted-entry-id"));
  });

  it("reports a failed learning-list write instead of silently clearing the busy state", async () => {
    learningList.add.mockResolvedValueOnce(false);
    render(<M3FeedbackProvider><BilibiliSearchView /></M3FeedbackProvider>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "BV1xx411c7mD" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.click(await screen.findByRole("button", { name: "更多选项" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/加入学习清单失败/);
  });

  it("reports a failed learning-list removal", async () => {
    learningList.list.mockResolvedValue([{
      id: "persisted-entry-id", bvid: "BV1xx411c7mD", partCid: 7, title: "线性代数第一讲",
      ownerName: "老师", coverUrl: "", durationSeconds: 1200, addedAt: "2026-09-06T00:00:00.000Z",
    }]);
    learningList.remove.mockResolvedValueOnce(false);
    render(<M3FeedbackProvider><BilibiliSearchView /></M3FeedbackProvider>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "BV1xx411c7mD" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.click(await screen.findByRole("button", { name: "更多选项" }));
    fireEvent.click(screen.getByRole("button", { name: "取消加入" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/移出学习清单失败/);
  });

  it("keeps the history confirmation open when clearing storage fails", async () => {
    storedHistory = ["高等数学"];
    clearHistory.mockResolvedValueOnce(false);
    render(<M3FeedbackProvider><BilibiliSearchView /></M3FeedbackProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "清空搜索历史" }));
    fireEvent.click(screen.getByRole("button", { name: "清除" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/清除搜索记录失败/);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("allows the next search to paginate while an older page request is pending", async () => {
    const result: VideoSearchResult = {
      bvid: "BV1xx411c7mD", title: "分页结果", ownerName: "老师", durationSeconds: 60,
      thumbnailUrl: "", playCount: 0, danmakuCount: 0, episodeCountText: "",
    };
    const older = deferred<{ page: number; totalPages: number; results: VideoSearchResult[] }>();
    searchVideos.mockResolvedValueOnce({ page: 1, totalPages: 2, results: [result] })
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ page: 1, totalPages: 2, results: [result] })
      .mockResolvedValueOnce({ page: 2, totalPages: 2, results: [] });
    const { container } = render(<BilibiliSearchView />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "旧词" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await screen.findByText("分页结果");
    const results = container.querySelectorAll(".fb-scroll-page");
    fireEvent.scroll(results[results.length - 1]!);
    await waitFor(() => expect(searchVideos).toHaveBeenCalledWith("旧词", 2, expect.any(Object)));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "新词" } });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await screen.findByText("分页结果");
    fireEvent.scroll(results[results.length - 1]!);
    await waitFor(() => expect(searchVideos).toHaveBeenCalledWith("新词", 2, expect.any(Object)));
    await act(async () => older.resolve({ page: 2, totalPages: 2, results: [] }));
  });
});
