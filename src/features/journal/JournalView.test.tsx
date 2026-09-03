
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { JournalView } from "./JournalView";
import { useAppStore } from "../../store/useAppStore";

describe("JournalView", () => {
  beforeEach(() => {
    useAppStore.setState({
      journals: [],
      tasks: [],
      habits: [],
      focusSessions: [],
    });
  });

  it("renders the new entry editor and disabled cancel/save actions", () => {
    render(<JournalView />);

    expect(screen.getByText("今日日记")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/写点什么吧/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  });

  it("saves the journal, switches to read mode, and reopens the editor", async () => {
    render(<JournalView />);

    fireEvent.change(screen.getByPlaceholderText(/写点什么吧/), {
      target: { value: "#复盘\n\n完成 [[考研数学]] 错题整理" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(useAppStore.getState().journals).toHaveLength(1);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    const textarea = screen.getByPlaceholderText(/写点什么吧/);
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("#复盘\n\n完成 [[考研数学]] 错题整理");
    expect(screen.getByRole("button", { name: "取消" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  });

  it("restores the saved body when cancel is clicked after editing", () => {
    useAppStore.setState({
      journals: [
        {
          date: "2026-08-29",
          body: "已保存的正文",
          updatedAt: "2026-08-29T12:00:00.000Z",
        },
      ],
      tasks: [],
      habits: [],
      focusSessions: [],
    });

    render(<JournalView date="2026-08-29" />);
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    const textarea = screen.getByPlaceholderText(/写点什么吧/);
    fireEvent.change(textarea, { target: { value: "被丢弃的草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    // 取消后回到查看模式，展示的是已保存内容而不是被丢弃的草稿。
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(useAppStore.getState().journals[0].body).toBe("已保存的正文");
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.getByPlaceholderText(/写点什么吧/)).toHaveValue("已保存的正文");
  });

  it("renders extracted tag and wiki-link chips for a saved entry", () => {
    useAppStore.setState({
      journals: [
        {
          date: "2026-08-29",
          body: "#晨跑\n完成 [[任务标题]]",
          updatedAt: "2026-08-29T12:00:00.000Z",
        },
      ],
      tasks: [
        {
          id: "task-1",
          title: "晨跑",
          done: true,
          due: "2026-08-29",
          createdAt: "2026-08-29T07:00:00.000Z",
          completedAt: "2026-08-29T07:30:00.000Z",
        },
      ],
      habits: [],
      focusSessions: [
        {
          id: "session-1",
          date: "2026-08-29",
          minutes: 50,
          completedAt: "2026-08-29T08:00:00.000Z",
        },
      ],
    });

    render(<JournalView date="2026-08-29" />);

    expect(screen.getByText("1/1 任务")).toBeInTheDocument();
    expect(screen.getByText("0 习惯")).toBeInTheDocument();
    expect(screen.getByText("50 分钟")).toBeInTheDocument();
    expect(screen.getByText("晨跑")).toBeInTheDocument();
    expect(screen.getByText("任务标题")).toBeInTheDocument();
  });
});
