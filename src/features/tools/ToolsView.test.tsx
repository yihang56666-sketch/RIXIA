
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ToolsView } from "./ToolsView";
import { useAppStore } from "../../store/useAppStore";

describe("ToolsView", () => {
  beforeEach(() => {
    useAppStore.setState({
      view: "tools",
      enabledTools: ["tasks", "focus"],
    } as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it("renders inside the FocuBili page chrome", () => {
    const { container } = render(<ToolsView />);

    expect(container.querySelector(".fb-page")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "工具" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回我的" })).toBeInTheDocument();
  });

  it("shows only the tools enabled in the store", () => {
    render(<ToolsView />);

    expect(screen.getByText("任务")).toBeInTheDocument();
    expect(screen.getByText("专注")).toBeInTheDocument();
    expect(screen.queryByText("习惯")).not.toBeInTheDocument();
    expect(screen.queryByText("笔记")).not.toBeInTheDocument();
    expect(screen.queryByText("倒计时")).not.toBeInTheDocument();
    expect(screen.queryByText("看课")).not.toBeInTheDocument();
  });

  it("navigates to a tool view on click", () => {
    render(<ToolsView />);

    fireEvent.click(screen.getByRole("button", { name: /任务/ }));
    expect(useAppStore.getState().view).toBe("tasks");
  });

  it("shows the hint text about tool selection", () => {
    render(<ToolsView />);

    expect(screen.getByText(/按需使用工具/)).toBeInTheDocument();
  });
});
