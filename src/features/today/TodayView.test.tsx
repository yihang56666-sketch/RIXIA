import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TodayView } from "./TodayView";
import { useAppStore } from "../../store/useAppStore";

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
});
