import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerChapterStrip } from "./PlayerChapterStrip";

describe("PlayerChapterStrip", () => {
  it("highlights the current chapter and seeks when a chapter is selected", () => {
    const onSeek = vi.fn();
    render(
      <PlayerChapterStrip
        chapters={[
          { title: "基础", startMs: 0, endMs: 30_000, imageUrl: "" },
          { title: "例题", startMs: 30_000, endMs: 90_000, imageUrl: "" },
        ]}
        positionMs={45_000}
        onSeek={onSeek}
      />,
    );

    expect(screen.getByRole("button", { name: "例题" })).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "基础" }));
    expect(onSeek).toHaveBeenCalledWith(0);
  });

  it("renders nothing when the chapter progress bar is hidden", () => {
    render(
      <PlayerChapterStrip
        chapters={[{ title: "基础", startMs: 0, endMs: 30_000, imageUrl: "" }]}
        positionMs={0}
        visible={false}
        onSeek={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("视频章节")).not.toBeInTheDocument();
  });
});
