import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Shell } from "./Shell";
import { useAppStore } from "../store/useAppStore";

describe("Shell", () => {
  beforeEach(() => {
    useAppStore.setState({ view: "focus-dashboard" });
  });

  it("keeps the FocuBili navigation and opens the Rixia command palette with Ctrl+K", () => {
    render(<Shell><div>内容</div></Shell>);

    expect(screen.getAllByRole("button", { name: "首页" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "搜索" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "我的" })).toHaveLength(2);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "命令面板" })).toBeInTheDocument();
  });

  it("keeps Rixia quick capture on workspace pages, not FocuBili home", () => {
    useAppStore.setState({ view: "today" });
    render(<Shell><div>内容</div></Shell>);

    fireEvent.click(screen.getByRole("button", { name: "快速收集" }));
    expect(screen.getByRole("dialog", { name: "快速收集" })).toBeInTheDocument();
  });

  it("hides quick capture on FocuBili home and search", () => {
    act(() => useAppStore.setState({ view: "focus-dashboard" }));
    const { rerender } = render(<Shell><div>内容</div></Shell>);
    expect(screen.queryByRole("button", { name: "快速收集" })).not.toBeInTheDocument();

    act(() => useAppStore.setState({ view: "search" }));
    rerender(<Shell><div>内容</div></Shell>);
    expect(screen.queryByRole("button", { name: "快速收集" })).not.toBeInTheDocument();
  });

  it("renders Rixia workspace pages as full-bleed FocuBili stages", () => {
    useAppStore.setState({ view: "kaoyan" });
    const { container } = render(<Shell><div>考研</div></Shell>);
    expect(container.querySelector("main.focubili-stage.full")).not.toBeNull();
  });

  it("applies the persisted Rixia density to the document", () => {
    render(<Shell><div>内容</div></Shell>);

    act(() => useAppStore.getState().setDensity("compact"));
    expect(document.documentElement.dataset.density).toBe("compact");
  });

  it("hides quick capture on the immersive player page", () => {
    useAppStore.setState({ view: "bilibili-player" });
    render(<Shell><div>内容</div></Shell>);
    expect(screen.queryByRole("button", { name: "快速收集" })).not.toBeInTheDocument();
  });

  it("hides quick capture on the kaoyan planner to avoid a second plus button", () => {
    useAppStore.setState({ view: "kaoyan" });
    render(<Shell><div>考研</div></Shell>);
    expect(screen.queryByRole("button", { name: "快速收集" })).not.toBeInTheDocument();
  });
});
