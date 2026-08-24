import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import { LearningListView } from "./LearningListView";

const learningListService = {
    list: vi.fn().mockResolvedValue([{
      id: "entry-1",
      bvid: "BV1xx411c7mD",
      title: "极限复习课",
      ownerName: "数学老师",
      coverUrl: "",
      durationSeconds: 600,
      addedAt: "2026-08-19T08:00:00.000Z",
      partCid: 42,
      partPageNumber: 2,
      partTitle: "第二讲",
    }]),
    add: vi.fn(),
    remove: vi.fn(),
    markOpened: vi.fn().mockResolvedValue(true),
    markCompleted: vi.fn().mockResolvedValue(true),
    setStatus: vi.fn().mockResolvedValue(true),
    reorderIncomplete: vi.fn().mockResolvedValue(true),
};

vi.mock("../../lib/bilibili/services", () => ({
  createLearningListService: () => learningListService,
}));

describe("LearningListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    learningListService.list.mockResolvedValue([]);
    useAppStore.setState({ view: "learning-list", activeBilibiliBvid: null });
  });

  it("opens the selected learning item in the player with its BVID and part", async () => {
    learningListService.list.mockResolvedValue([{
      id: "entry-1",
      bvid: "BV1xx411c7mD",
      title: "极限复习课",
      ownerName: "数学老师",
      coverUrl: "",
      durationSeconds: 600,
      addedAt: "2026-08-19T08:00:00.000Z",
      partCid: 42,
      partPageNumber: 2,
      partTitle: "第二讲",
    }]);
    render(<LearningListView />);

    fireEvent.click(await screen.findByRole("button", { name: /继续学习/ }));
    await waitFor(() => {
      expect(useAppStore.getState().view).toBe("bilibili-player");
      expect(useAppStore.getState().activeBilibiliBvid).toBe("BV1xx411c7mD");
      expect(useAppStore.getState().activeBilibiliPlaybackTarget).toEqual({ cid: 42, seconds: 0 });
    });
  });

  it("filters learning entries and separates completed work", async () => {
    learningListService.list.mockResolvedValue([
      {
        id: "active", bvid: "BV-active", title: "高数极限", ownerName: "数学老师", coverUrl: "", durationSeconds: 600,
        addedAt: "2026-08-19T08:00:00.000Z", partCid: 1, partPageNumber: 1, partTitle: "极限", status: "learning",
      },
      {
        id: "done", bvid: "BV-done", title: "英语阅读", ownerName: "英语老师", coverUrl: "", durationSeconds: 600,
        addedAt: "2026-08-18T08:00:00.000Z", partCid: 2, partPageNumber: 2, partTitle: "阅读", status: "completed", completedAt: "2026-08-19T09:00:00.000Z",
      },
    ]);
    render(<LearningListView />);

    expect(await screen.findByText("已完成（1）")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "搜索学习清单" }));
    fireEvent.change(screen.getByPlaceholderText("搜索视频、UP 主或分 P"), { target: { value: "英语" } });
    expect(screen.queryByText("高数极限")).not.toBeInTheDocument();
    expect(screen.getByText("英语阅读")).toBeInTheDocument();
  });
});
