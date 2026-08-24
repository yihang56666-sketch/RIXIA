import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CommandPalette } from "./CommandPalette";
import { useAppStore } from "../store/useAppStore";

describe("CommandPalette", () => {
  beforeEach(() => {
    useAppStore.setState({ view: "focus-dashboard" });
  });

  it("does not expose the removed server watch-history route", () => {
    render(<CommandPalette open onClose={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText("搜索任务、习惯、笔记… 或直接创建"), {
      target: { value: "观看历史" },
    });

    expect(screen.queryByRole("option", { name: "前往 · 观看历史" })).not.toBeInTheDocument();
  });

  it("does not expose the first-launch gate as a blank route", () => {
    render(<CommandPalette open onClose={() => undefined} />);

    fireEvent.change(screen.getByPlaceholderText("搜索任务、习惯、笔记… 或直接创建"), {
      target: { value: "首次启动" },
    });

    expect(screen.queryByRole("option", { name: "前往 · 首次启动" })).not.toBeInTheDocument();
  });

  it("navigates to a task without changing its completion state", () => {
    useAppStore.setState({
      view: "focus-dashboard",
      tasks: [{
        id: "task-1",
        title: "整理错题",
        done: false,
        due: null,
        createdAt: "2026-08-23T00:00:00.000Z",
      }],
    } as Partial<ReturnType<typeof useAppStore.getState>>);

    render(<CommandPalette open onClose={() => undefined} />);
    fireEvent.change(screen.getByPlaceholderText("搜索任务、习惯、笔记… 或直接创建"), {
      target: { value: "整理错题" },
    });

    const taskOption = screen.getAllByRole("option").find((option) => option.textContent?.startsWith("整理错题"));
    expect(taskOption).toBeTruthy();
    fireEvent.click(taskOption!);

    expect(useAppStore.getState().tasks[0]?.done).toBe(false);
    expect(useAppStore.getState().view).toBe("tasks");
  });
});
