import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerChapterPanel } from "./PlayerChapterPanel";
import type { VideoChapter } from "../../lib/bilibili/extendedModels";

const chapters: VideoChapter[] = [
  { title: "开场", startMs: 0, endMs: 60_000, imageUrl: "" },
  { title: "正片", startMs: 60_000, endMs: 300_000, imageUrl: "https://example.com/preview.jpg" },
];

describe("PlayerChapterPanel", () => {
  it("marks the chapter containing the current position as active", () => {
    render(
      <PlayerChapterPanel
        chapters={chapters}
        positionMs={120_000}
        chapterProgressVisible
        onSeek={vi.fn()}
        onToggleChapterProgress={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const active = screen.getByText("正片").closest("button");
    expect(screen.getByRole("dialog", { name: "分段信息" })).toContainElement(document.activeElement as HTMLElement);
    expect(active).toHaveClass("active");
  });

  it("seeks to the chapter start and closes when a chapter is clicked", () => {
    const onSeek = vi.fn();
    const onClose = vi.fn();
    render(
      <PlayerChapterPanel
        chapters={chapters}
        positionMs={0}
        chapterProgressVisible
        onSeek={onSeek}
        onToggleChapterProgress={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("正片").closest("button")!);
    expect(onSeek).toHaveBeenCalledWith(60);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("toggles the chapter progress bar visibility switch", () => {
    const onToggleChapterProgress = vi.fn();
    render(
      <PlayerChapterPanel
        chapters={chapters}
        positionMs={0}
        chapterProgressVisible
        onSeek={vi.fn()}
        onToggleChapterProgress={onToggleChapterProgress}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggleChapterProgress).toHaveBeenCalledWith(false);
  });
});
