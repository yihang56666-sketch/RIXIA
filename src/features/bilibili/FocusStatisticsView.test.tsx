import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFocusSession,
  finishAt,
  FocusSessionStatus,
  type FullFocusSession,
} from "../../lib/bilibili/focusSessionModel";
import { M3FeedbackProvider } from "./m3";
import { FocusStatisticsView } from "./FocusStatisticsView";

const { timerMock } = vi.hoisted(() => ({
  timerMock: {
    history: [] as FullFocusSession[],
    activeSession: null as FullFocusSession | null,
    remainingMs: 0,
    deleteHistoryEntry: vi.fn(),
    clearHistory: vi.fn(),
  },
}));

vi.mock("./useFocusTimer", () => ({
  useFocusTimer: () => timerMock,
}));

function completedSession(id: string, goal: string): FullFocusSession {
  // 会话时间必须相对"现在"：统计页默认只显示最近 7 天，固定日期的夹具
  // 一旦越过 7 天边界（写死于 2026-09-05，9 月 12 日起必失败）整页为空。
  const startMs = Date.now() - 60 * 60 * 1000;
  return finishAt(
    createFocusSession({
      id,
      goal,
      plannedDurationMs: 60_000,
      now: new Date(startMs).toISOString(),
    }),
    startMs + 60_000,
    FocusSessionStatus.completed,
    "时间到",
  );
}

describe("FocusStatisticsView", () => {
  afterEach(() => {
    vi.clearAllMocks();
    timerMock.history = [];
    timerMock.activeSession = null;
  });

  it("opens a share preview for the current focus statistics", () => {
    render(<FocusStatisticsView />);

    fireEvent.click(screen.getByRole("button", { name: "分享专注统计" }));

    expect(screen.getByRole("dialog", { name: "专注分享预览" })).toBeInTheDocument();
    expect(screen.getByText("这是我在 BEID 的专注统计：累计 0m，0 次专注，完成 0 次，连续 0 天。"))
      .toBeInTheDocument();
  });

  it("keeps the search input focused across edits", () => {
    render(<FocusStatisticsView />);
    const input = screen.getAllByPlaceholderText("搜索目标、视频标题、分P或 BV 号")[0]!;
    input.focus();
    fireEvent.change(input, { target: { value: "高" } });
    expect(input).toHaveFocus();
    expect(screen.getAllByPlaceholderText("搜索目标、视频标题、分P或 BV 号")[0]).toBe(input);
  });

  it("keeps the delete confirmation open and reports failure when deleting fails", async () => {
    timerMock.history = [completedSession("s1", "删除失败测试")];
    timerMock.deleteHistoryEntry.mockResolvedValue(false);
    render(<M3FeedbackProvider><FocusStatisticsView /></M3FeedbackProvider>);

    fireEvent.click(screen.getAllByRole("button", { name: "删除记录" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() => expect(timerMock.deleteHistoryEntry).toHaveBeenCalledWith("s1"));
    expect(screen.getByRole("alertdialog", { name: "删除这条专注记录？" })).toBeInTheDocument();
    expect(screen.getByText("删除失败，请重试。")).toBeInTheDocument();
  });

  it("keeps the clear confirmation open and reports failure when clearing fails", async () => {
    timerMock.history = [completedSession("s1", "清空失败测试")];
    timerMock.clearHistory.mockResolvedValue(false);
    render(<M3FeedbackProvider><FocusStatisticsView /></M3FeedbackProvider>);

    fireEvent.click(screen.getByRole("button", { name: "清空专注历史" }));
    fireEvent.click(screen.getByRole("button", { name: "全部清空" }));

    await waitFor(() => expect(timerMock.clearHistory).toHaveBeenCalled());
    expect(screen.getByRole("alertdialog", { name: "清空全部专注历史？" })).toBeInTheDocument();
    expect(screen.getByText("清空失败，请稍后重试。")).toBeInTheDocument();
  });

  it("closes the clear confirmation and confirms success when clearing succeeds", async () => {
    timerMock.history = [completedSession("s1", "清空成功测试")];
    timerMock.clearHistory.mockResolvedValue(true);
    render(<M3FeedbackProvider><FocusStatisticsView /></M3FeedbackProvider>);

    fireEvent.click(screen.getByRole("button", { name: "清空专注历史" }));
    fireEvent.click(screen.getByRole("button", { name: "全部清空" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog", { name: "清空全部专注历史？" })).not.toBeInTheDocument(),
    );
    expect(screen.getByText("已清空全部专注历史")).toBeInTheDocument();
  });
});
