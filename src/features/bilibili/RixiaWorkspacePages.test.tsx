import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { InboxView } from "../inbox/InboxView";
import { NotesView } from "../notes/NotesView";
import { TasksView } from "../tasks/TasksView";
import { FocusView } from "../focus/FocusView";
import { CountdownsView } from "../countdowns/CountdownsView";
import { VideosView } from "../videos/VideosView";
import { ToolsView } from "../tools/ToolsView";
import { PlanView } from "../plan/PlanView";
import { useAppStore } from "../../store/useAppStore";

describe("Rixia leftover pages use FocuBili chrome", () => {
  beforeEach(() => {
    useAppStore.setState({
      view: "inbox",
      inbox: [],
      notes: [],
      tasks: [],
      countdowns: [],
      resources: [],
      enabledTools: ["tasks", "habits", "notes", "countdowns", "focus", "videos"],
      focusMinutes: 25,
      focusGoalMinutes: 120,
      focusSessions: [],
      focusRounds: { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
      activeFocus: null,
      habits: [],
      subjects: [],
      studyUnits: [],
    } as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it.each([
    ["收集箱", InboxView],
    ["笔记", NotesView],
    ["任务", TasksView],
    ["专注计时", FocusView],
    ["倒计时", CountdownsView],
    ["看课", VideosView],
    ["工具", ToolsView],
    ["计划", PlanView],
  ] as const)("renders %s inside the FocuBili page chrome", (title, View) => {
    const { container } = render(<View />);
    expect(container.querySelector(".fb-page")).not.toBeNull();
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回我的" })).toBeInTheDocument();
  });

  it("navigates to tasks after converting an inbox item", () => {
    useAppStore.setState({
      inbox: [{ id: "inbox-1", text: "整理复习计划", createdAt: "2026-08-23T00:00:00.000Z" }],
    } as Partial<ReturnType<typeof useAppStore.getState>>);

    render(<InboxView />);

    fireEvent.click(screen.getByRole("button", { name: /转为任务/ }));

    expect(useAppStore.getState().tasks).toHaveLength(1);
    expect(useAppStore.getState().inbox).toHaveLength(0);
    expect(useAppStore.getState().view).toBe("tasks");
  });
});
