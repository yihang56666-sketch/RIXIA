import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FeatureMapDialog } from "./FeatureMapDialog";

describe("FeatureMapDialog", () => {
  it("renders grouped feature cards", () => {
    render(<FeatureMapDialog open onClose={vi.fn()} onStartTour={vi.fn()} />);
    expect(screen.getByText("看课")).toBeInTheDocument();
    expect(screen.getByText("找到视频、继续学习、边看边记。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /搜索视频/ })).toBeInTheDocument();
  });

  it("opens the selected route and tour task", async () => {
    const onStartTour = vi.fn();
    render(<FeatureMapDialog open onClose={vi.fn()} onStartTour={onStartTour} />);
    fireEvent.click(screen.getByRole("button", { name: /搜索视频/ }));
    expect(onStartTour).toHaveBeenCalledWith("watch");
  });
});
