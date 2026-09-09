import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksView } from "./TasksView";
import { useAppStore } from "../../store/useAppStore";
import { daysUntil, todayKey } from "../../lib/time";

describe("TasksView", () => {
  beforeEach(() => {
    useAppStore.setState({ view: "tasks", tasks: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the tasks page and the empty today state", () => {
    render(<TasksView />);

    expect(screen.getByText("任务")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("添加今天要做的事")).toBeInTheDocument();
    expect(screen.getByText("今天还没有任务")).toBeInTheDocument();
  });

  it("adds a task and shows it under the today filter", () => {
    render(<TasksView />);

    fireEvent.change(screen.getByPlaceholderText("添加今天要做的事"), {
      target: { value: "完成今日复盘" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(screen.getByText("完成今日复盘")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^今天/ })).toHaveAttribute("aria-selected", "true");
    expect(useAppStore.getState().tasks[0]?.due).toBe(todayKey());
  });

  it("assigns the current date when a task is submitted after midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 5, 23, 59, 59));
    render(<TasksView />);
    fireEvent.change(screen.getByPlaceholderText("添加今天要做的事"), {
      target: { value: "午夜后的任务" },
    });

    vi.setSystemTime(new Date(2026, 8, 6, 0, 0, 1));
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(useAppStore.getState().tasks[0]?.due).toBe("2026-09-06");
    expect(screen.getByText("午夜后的任务")).toBeInTheDocument();
  });

  it("toggles a task and shows the completion state", () => {
    useAppStore.setState({
      tasks: [
        {
          id: "task-1",
          title: "晨跑",
          done: false,
          due: todayKey(),
          createdAt: "2026-08-29T07:00:00.000Z",
          completedAt: null,
        },
      ],
    });

    render(<TasksView />);

    fireEvent.click(screen.getByRole("button", { name: "标记为完成" }));
    expect(useAppStore.getState().tasks[0]?.done).toBe(true);
    expect(screen.getByText("晨跑")).toHaveClass("done");
    expect(screen.getByRole("button", { name: "标记为未完成" })).toBeInTheDocument();
  });

  it("filters tasks by today, open, and all", () => {
    const today = todayKey();
    useAppStore.setState({
      tasks: [
        {
          id: "task-today",
          title: "今天的任务",
          done: false,
          due: today,
          createdAt: "2026-08-29T08:00:00.000Z",
          completedAt: null,
        },
        {
          id: "task-overdue",
          title: "之前的任务",
          done: false,
          due: "2020-01-01",
          createdAt: "2020-01-01T08:00:00.000Z",
          completedAt: null,
        },
      ],
    });

    render(<TasksView />);

    expect(screen.getByText("今天的任务")).toBeInTheDocument();
    expect(screen.queryByText("之前的任务")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^全部/ }));
    fireEvent.click(screen.getByRole("tab", { name: /^全部/ }));
    expect(screen.getByText(`逾期 ${Math.abs(daysUntil("2020-01-01", todayKey()))} 天`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /^待办/ }));
    fireEvent.click(screen.getByRole("tab", { name: /^待办/ }));
    expect(screen.getByText("之前的任务")).toBeInTheDocument();
  });

  it("deletes a task from the list", () => {
    useAppStore.setState({
      tasks: [
        {
          id: "task-del",
          title: "需要删除",
          done: false,
          due: todayKey(),
          createdAt: "2026-08-29T09:00:00.000Z",
          completedAt: null,
        },
      ],
    });

    render(<TasksView />);

    expect(screen.getByText("需要删除")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.queryByText("需要删除")).not.toBeInTheDocument();
  });

  it("updates the due date from the edit modal", () => {
    useAppStore.setState({
      tasks: [
        {
          id: "task-edit",
          title: "修改日期",
          done: false,
          due: todayKey(),
          createdAt: "2026-08-29T08:00:00.000Z",
          completedAt: null,
        },
      ],
    });

    render(<TasksView />);

    fireEvent.click(screen.getByTitle("点击编辑"));
    const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(dateInput, { target: { value: "2030-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(useAppStore.getState().tasks[0]?.due).toBe("2030-01-01");
  });

  it("disables the edit save button and keeps the old title when the title is cleared", () => {
    useAppStore.setState({
      tasks: [
        {
          id: "task-empty-title",
          title: "原标题",
          done: false,
          due: todayKey(),
          createdAt: "2026-08-29T08:00:00.000Z",
          completedAt: null,
        },
      ],
    });

    render(<TasksView />);

    fireEvent.click(screen.getByTitle("点击编辑"));
    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeEnabled();

    const titleInput = screen.getByPlaceholderText("任务标题") as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: "  " } });
    expect(save).toBeDisabled();
    fireEvent.click(save);

    // 空标题提交被拦下，旧标题原样保留，弹窗也不该假装保存成功。
    expect(useAppStore.getState().tasks[0]?.title).toBe("原标题");
  });
});
