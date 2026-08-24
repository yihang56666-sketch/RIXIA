import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusStatisticsView } from "./FocusStatisticsView";

vi.mock("./useFocusTimer", () => ({
  useFocusTimer: () => ({
    history: [],
  }),
}));

describe("FocusStatisticsView", () => {
  it("opens a share preview for the current focus statistics", () => {
    render(<FocusStatisticsView />);

    fireEvent.click(screen.getByRole("button", { name: "分享专注统计" }));

    expect(screen.getByRole("dialog", { name: "专注分享预览" })).toBeInTheDocument();
    expect(screen.getByText("这是我在 BEID 的专注统计：累计 0m，0 次专注，完成 0 次，连续 0 天。"))
      .toBeInTheDocument();
  });
});
