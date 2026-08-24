import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlaybackCompletionOverlay } from "./PlaybackCompletionOverlay";

describe("PlaybackCompletionOverlay", () => {
  it("lets the learner mark the current part complete or continue", () => {
    const onMarkCompleted = vi.fn();
    const onContinue = vi.fn();
    render(
      <PlaybackCompletionOverlay
        hasNext
        markedCompleted={false}
        processing={false}
        onMarkCompleted={onMarkCompleted}
        onContinue={onContinue}
      />,
    );

    expect(screen.getByText("这一项播放完成")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "标记已完成" }));
    fireEvent.click(screen.getByRole("button", { name: "继续学习" }));
    expect(onMarkCompleted).toHaveBeenCalledOnce();
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows the finished state when there is no next entry", () => {
    render(
      <PlaybackCompletionOverlay
        hasNext={false}
        markedCompleted
        processing={false}
        onMarkCompleted={vi.fn()}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByText("已完成学习")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "继续学习" })).not.toBeInTheDocument();
  });
});
