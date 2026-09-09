import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TodayView } from "./TodayView";
import { PlanView } from "../plan/PlanView";
import { useAppStore } from "../../store/useAppStore";
import { todayKey } from "../../lib/time";

describe("TodayView", () => {
  beforeEach(() => {
    useAppStore.setState({
      theme: "porcelain",
      density: "standard",
      backgroundImage: null,
      view: "today",
      enabledTools: ["tasks", "habits", "notes", "countdowns", "focus", "videos"],
      inbox: [],
      tasks: [],
      habits: [],
      notes: [],
      countdowns: [],
      subjects: [],
      studyUnits: [],
      focusMinutes: 25,
      focusSessions: [],
      focusGoalMinutes: 120,
      focusRounds: { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
      activeFocus: null,
      resources: [],
      timestampNotes: [],
      journals: [],
    });
  });

  it("renders the next-step action when state is empty", () => {
    render(<TodayView />);
    expect(screen.getByRole("heading", { name: "今日节奏" })).toBeTruthy();
    expect(screen.getByText("下一步")).toBeTruthy();
    expect(screen.getByText("创建今日任务")).toBeTruthy();
  });

  it("opens task planning when the next action is to create today's task", () => {
    render(<TodayView />);

    fireEvent.click(screen.getByRole("button", { name: "开始" }));

    expect(useAppStore.getState().view).toBe("plan");
  });

  it.each(["0/0 习惯", "管理"])("opens habits from the %s action", (actionName) => {
    render(<TodayView />);

    fireEvent.click(screen.getByRole("button", { name: actionName }));

    expect(useAppStore.getState().view).toBe("habits");
  });

  it("opens countdowns from the next countdown overview", () => {
    useAppStore.setState({
      countdowns: [{ id: "exam", title: "考试", date: todayKey(), createdAt: new Date().toISOString() }],
    });
    render(<TodayView />);

    fireEvent.click(screen.getByRole("button", { name: "0 天 · 考试" }));

    expect(useAppStore.getState().view).toBe("countdowns");
  });

  it("renders focus action when activeFocus is set", () => {
    useAppStore.setState({
      activeFocus: { startedAt: "2026-08-17T08:00:00.000Z", mode: "countdown" },
    });
    render(<TodayView />);
    expect(screen.getByText("继续专注")).toBeTruthy();
  });

  it("renders task action when today task exists", () => {
    useAppStore.setState({
      tasks: [
        {
          id: "t1",
          title: "复习英语",
          done: false,
          due: "2026-08-17",
          createdAt: "2026-08-01T00:00:00.000Z",
          completedAt: null,
        },
      ],
    });
    render(<TodayView />);
    // Title appears both as the action label and in the today task list.
    expect(screen.getAllByText("复习英语").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the status-strip pills", () => {
    render(<TodayView />);
    // In empty state, tasks/habits/focus all show 0, so expect multiple.
    const zeros = screen.getAllByText("0", { selector: "strong" });
    expect(zeros.length).toBeGreaterThanOrEqual(3);
  });

  it("uses rounds for interval habit streaks in the today list", () => {
    useAppStore.setState({
      habits: [{
        id: "interval-habit",
        title: "隔日复习",
        createdAt: "2026-08-01T00:00:00.000Z",
        checkedDates: [],
        frequency: { type: "interval-days", interval: 2 },
      }],
    });
    render(<TodayView />);

    expect(screen.queryByText("连续 0 轮")).toBeInTheDocument();
  });

  it("shows continue-learning section even when empty", () => {
    render(<TodayView />);
    expect(screen.getByText("继续学习")).toBeTruthy();
  });

  it("renders journal section at the bottom", () => {
    render(<TodayView />);
    expect(screen.getByText("今日日记")).toBeTruthy();
  });

  it("toggles review chart on expand button click", () => {
    render(<TodayView />);
    const expand = screen.getByText("展开");
    fireEvent.click(expand);
    expect(screen.getByText("收起")).toBeTruthy();
  });

  it("renders inbox pill count when inbox has items", () => {
    useAppStore.setState({
      inbox: [
        { id: "i1", text: "想法一", createdAt: "2026-08-15T00:00:00.000Z" },
        { id: "i2", text: "想法二", createdAt: "2026-08-16T00:00:00.000Z" },
      ],
    });
    render(<TodayView />);
    const inboxPill = screen.getByText("2");
    expect(inboxPill.parentElement?.textContent ?? "").toContain("收集");
  });

  it("keeps the overdue next-step task visible after starting it", () => {
    useAppStore.setState({
      tasks: [{
        id: "overdue-1",
        title: "补交英语作业",
        done: false,
        due: "2020-01-01",
        createdAt: "2020-01-01T00:00:00.000Z",
        completedAt: null,
      }],
    });
    const { unmount } = render(<TodayView />);
    fireEvent.click(screen.getByRole("button", { name: "开始" }));
    expect(useAppStore.getState().view).toBe("plan");
    expect(useAppStore.getState().focusedTaskId).toBe("overdue-1");
    unmount();

    render(<PlanView />);
    expect(screen.getByText("补交英语作业")).toBeInTheDocument();
  });

  it("opens the next-step resource instead of a generic library list", () => {
    useAppStore.setState({
      resources: [{
        id: "r-next",
        bvid: "BV1GJ411x7h7",
        title: "高数第3讲",
        status: "in-progress",
        addedAt: "2026-08-10T00:00:00.000Z",
        lastOpenedAt: new Date().toISOString(),
      }],
    });
    render(<TodayView />);
    fireEvent.click(screen.getByRole("button", { name: "开始" }));
    expect(useAppStore.getState().view).toBe("bilibili-player");
    expect(useAppStore.getState().activeBilibiliBvid).toBe("BV1GJ411x7h7");
  });
});
