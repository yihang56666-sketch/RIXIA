import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import { FeatureTour, restartTourPlayback, TOUR_PALETTE_OPEN_EVENT } from "./FeatureTour";

describe("FeatureTour", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ view: "focus-dashboard" });
  });

  it("shows a first-run welcome and navigates through the real views", () => {
    render(<FeatureTour />);
    expect(screen.getByLabelText("欢迎")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "开始巡览" }));
    expect(useAppStore.getState().view).toBe("focus-dashboard");
    expect(screen.getByText("从这里开始搜索")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(useAppStore.getState().view).toBe("search");
    expect(screen.getByText("真正搜你想看的内容")).toBeInTheDocument();
  });

  it("starts the selected tour task", () => {
    render(<FeatureTour initialTask="watch" />);
    expect(screen.getByText("从首页找到入口")).toBeInTheDocument();
  });

  it("advances when the user clicks the real target", () => {
    const heroSearch = document.createElement("button");
    heroSearch.dataset.tourTarget = "home-search";
    heroSearch.id = "tour-hero-search";
    document.body.append(heroSearch);
    render(<FeatureTour />);
    fireEvent.click(screen.getByRole("button", { name: "开始巡览" }));
    expect(useAppStore.getState().view).toBe("focus-dashboard");

    act(() => fireEvent.click(document.querySelector<HTMLElement>("#tour-hero-search")!));
    expect(screen.getByText("真正搜你想看的内容")).toBeInTheDocument();
  });

  it("asks Shell to open the command palette at the palette step", () => {
    render(<FeatureTour />);
    const openListener = vi.fn();
    window.addEventListener(TOUR_PALETTE_OPEN_EVENT, openListener);

    const steps = ["开始巡览", "下一步", "下一步", "下一步", "下一步", "下一步", "下一步"];
    steps.forEach((label) => fireEvent.click(screen.getByRole("button", { name: label })));
    expect(openListener).toHaveBeenCalledTimes(1);
    expect(screen.getByText("一键到达任何页面")).toBeInTheDocument();
  });

  it("restarts from the first step when replay is requested", () => {
    render(<FeatureTour />);
    fireEvent.click(screen.getByRole("button", { name: "跳过巡览" }));
    expect(screen.queryByLabelText("欢迎")).not.toBeInTheDocument();

    act(() => restartTourPlayback());
    expect(screen.getByLabelText("欢迎")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始巡览"})).toBeInTheDocument();
  });

  it("persists completion and skips the tour next time", () => {
    const first = render(<FeatureTour />);
    fireEvent.click(screen.getByRole("button", { name: "跳过巡览" }));
    first.unmount();

    render(<FeatureTour />);
    expect(screen.queryByLabelText("欢迎")).not.toBeInTheDocument();
    expect(localStorage.getItem("rixia_feature_tour_v1")).toContain('"dismissed":true');
  });

  it("resumes from persisted progress on the next launch", () => {
    localStorage.setItem(
      "rixia_feature_tour_v1",
      JSON.stringify({ completedSteps: [0, 1], dismissed: false, updatedAt: "" }),
    );
    render(<FeatureTour />);
    expect(screen.getByText("真正搜你想看的内容")).toBeInTheDocument();
  });
});
