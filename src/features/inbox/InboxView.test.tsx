import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { InboxView } from "./InboxView";
import { useAppStore } from "../../store/useAppStore";
import { todayKey } from "../../lib/time";

describe("InboxView", () => {
  beforeEach(() => {
    useAppStore.setState({ view: "inbox", inbox: [] });
  });

  it("renders the empty state when no inbox items exist", () => {
    render(<InboxView />);

    expect(screen.getByText("收集箱")).toBeInTheDocument();
    expect(screen.getByText("收集箱是空的，脑袋里想到什么就先丢进来")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("输入一个想法或待办")).toBeInTheDocument();
  });

  it("adds an inbox item and keeps it in the list", () => {
    render(<InboxView />);

    fireEvent.change(screen.getByPlaceholderText("输入一个想法或待办"), {
      target: { value: "先记一个灵感" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(screen.getByText("先记一个灵感")).toBeInTheDocument();
    expect(useAppStore.getState().inbox[0]?.text).toBe("先记一个灵感");
  });

  it("converts an inbox item into today's task", () => {
    useAppStore.setState({
      inbox: [
        {
          id: "inbox-1",
          text: "整理成今天的任务",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    render(<InboxView />);

    fireEvent.click(screen.getByRole("button", { name: /转为任务/ }));
    expect(screen.queryByText("整理成今天的任务")).not.toBeInTheDocument();
    expect(useAppStore.getState().tasks).toEqual([
      expect.objectContaining({
        title: "整理成今天的任务",
        due: todayKey(),
      }),
    ]);
  });

  it("deletes an inbox item from the list", () => {
    useAppStore.setState({
      inbox: [
        {
          id: "inbox-2",
          text: "需要删除",
          createdAt: new Date().toISOString(),
        },
      ],
    });

    render(<InboxView />);

    expect(screen.getByText("需要删除")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.queryByText("需要删除")).not.toBeInTheDocument();
  });
});