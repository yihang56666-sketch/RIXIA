import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningListEntry } from "../../lib/bilibili/types";
import { FocusSessionStatus, type FullFocusSession } from "../../lib/bilibili/focusSessionModel";
import { useAppStore } from "../../store/useAppStore";
import { FocusDashboard } from "./FocusDashboard";
import { todayKey } from "../../lib/time";

const mockedFocusTimer = vi.hoisted(() => ({
  ready: true,
  hasActiveSession: false,
  activeSession: null as FullFocusSession | null,
  remainingMs: 0,
  elapsedMs: 0,
  progress: 0,
  history: [] as FullFocusSession[],
  todayFocusedMs: 0,
  todayCompletedCount: 0,
  lastFinishedSession: null as FullFocusSession | null,
  dismissLastFinishedSession: vi.fn(),
  extendCompletedFocus: vi.fn().mockResolvedValue(true),
}));

vi.mock("./useFocusTimer", () => ({
  useFocusTimer: () => mockedFocusTimer,
}));

const completedSession: FullFocusSession = {
  id: "completed-1",
  goal: "完成高数练习",
  plannedDurationMs: 25 * 60_000,
  accumulatedFocusMs: 25 * 60_000,
  startedAt: "2026-08-19T09:00:00.000Z",
  finishedAt: "2026-08-19T09:25:00.000Z",
  status: FocusSessionStatus.completed,
  sourcePositionMs: 0,
  completeOnPartEnd: false,
  interruptions: [],
  dailyFocusMilliseconds: {},
};

describe("FocusDashboard", () => {
  beforeEach(() => {
    Object.assign(mockedFocusTimer, {
      ready: true,
      hasActiveSession: false,
      activeSession: null,
      remainingMs: 0,
      elapsedMs: 0,
      progress: 0,
      history: [],
      todayFocusedMs: 0,
      todayCompletedCount: 0,
      lastFinishedSession: null,
      dismissLastFinishedSession: vi.fn(),
      extendCompletedFocus: vi.fn().mockResolvedValue(true),
    });
  });

const entry: LearningListEntry = {
  id: "learning-1",
  bvid: "BV1xx411c7mD",
  title: "高等数学第一讲",
  ownerName: "数学老师",
  coverUrl: "",
  durationSeconds: 3600,
  addedAt: "2026-08-19T08:00:00.000Z",
  lastOpenedAt: "2026-08-19T09:00:00.000Z",
};

  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ view: "focus-dashboard", activeBilibiliBvid: null });
  });

  it("shows the next unfinished learning item with paths to continue or manage it", async () => {
    localStorage.setItem("rixia_learning_list_v1", JSON.stringify([entry]));
    render(<FocusDashboard onOpenStatistics={() => undefined} />);

    expect((await screen.findAllByText("继续学习")).length).toBeGreaterThan(0);
    expect(screen.getByText("高等数学第一讲")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看清单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /继续学习/ })).toBeInTheDocument();
  });

  it("opens the completion dialog when a focus session has just finished", async () => {
    mockedFocusTimer.lastFinishedSession = completedSession;
    render(<FocusDashboard onOpenStatistics={() => undefined} />);

    expect(await screen.findByText("专注已结束，做得好！")).toBeInTheDocument();
  });

  it("exposes the kaoyan planner from the home action card", async () => {
    render(<FocusDashboard onOpenStatistics={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "考研计划" }));
    expect(useAppStore.getState().view).toBe("kaoyan");
  });

  it("shows a kaoyan countdown card on the home workspace", async () => {
    useAppStore.setState({ kaoyanExamDate: "2026-12-19", reviewItems: [] });
    render(<FocusDashboard onOpenStatistics={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: /今日考研/ }));
    expect(useAppStore.getState().view).toBe("kaoyan");
  });

  it("shows today's review count on the kaoyan card", async () => {
    const today = todayKey();
    useAppStore.setState({
      kaoyanExamDate: "2026-12-19",
      reviewItems: [{
        id: "r1",
        sourceType: "custom",
        title: "英语阅读",
        dueDate: today,
        stage: 0,
        history: [],
        createdAt: `${today}T00:00:00.000Z`,
      }],
    });
    render(<FocusDashboard onOpenStatistics={() => undefined} />);
    expect(await screen.findByRole("button", { name: /待复习 1/ })).toBeInTheDocument();
  });

  it("opens Bilibili discovery from the home action card", async () => {
    render(<FocusDashboard onOpenStatistics={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "B站发现" }));
    expect(useAppStore.getState().view).toBe("home-feed");
  });
});
