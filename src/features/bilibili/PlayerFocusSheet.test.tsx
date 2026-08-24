import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerFocusSheet } from "./PlayerFocusSheet";

const startFocus = vi.fn().mockResolvedValue(true);
const extendFocus = vi.fn().mockResolvedValue(true);
const resumeFocus = vi.fn().mockResolvedValue(undefined);
const endFocusEarly = vi.fn().mockResolvedValue(undefined);

vi.mock("./useFocusTimer", () => ({
  useFocusTimer: () => ({
    ready: true,
    activeSession: null,
    lastFinishedSession: null,
    history: [],
    hasActiveSession: false,
    remainingMs: 25 * 60_000,
    elapsedMs: 0,
    progress: 0,
    startFocus,
    extendFocus,
    resumeFocus,
    endFocusEarly,
    pauseFocus: vi.fn(),
    interruptFocus: vi.fn(),
    associateVideo: vi.fn(),
    updateLastSeen: vi.fn(),
    updatePlaybackState: vi.fn(),
    completeForPlaybackPart: vi.fn(),
    extendCompletedFocus: vi.fn(),
    dismissLastFinishedSession: vi.fn(),
    deleteHistoryEntry: vi.fn(),
    clearHistory: vi.fn(),
    todayFocusedMs: 0,
    todayCompletedCount: 0,
  }),
}));

vi.mock("../../lib/bilibili/focusSessionModel", () => ({
  FocusSessionStatus: { running: "running", paused: "paused", completed: "completed", interrupted: "interrupted", endedEarly: "endedEarly" },
  FocusInterruptionKind: { manualPause: "manualPause", playerExit: "playerExit", appBackground: "appBackground" },
}));

describe("PlayerFocusSheet", () => {
  it("renders ready form with goal input, duration chips, and start button", () => {
    render(
      <PlayerFocusSheet
        defaultGoal=""
        partRemainingSeconds={3000}
        bvid="BV1"
        videoTitle="测试课程"
        partCid={100}
        partPageNumber={1}
        partTitle="P1"
        videoIsPlaying={true}
        sourcePositionMs={0}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: "播放器专注" })).toBeInTheDocument();
    expect(screen.getByText("测试课程 · P1 P1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "25 分钟" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "45 分钟" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^当前分P/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始专注" })).toBeDisabled();
  });

  it("enables the start button and starts focus when a goal is entered", async () => {
    render(
      <PlayerFocusSheet
        defaultGoal=""
        partRemainingSeconds={3000}
        bvid="BV1"
        videoTitle="测试课程"
        partCid={100}
        partPageNumber={1}
        partTitle="P1"
        videoIsPlaying={true}
        sourcePositionMs={0}
        onClose={() => {}}
      />,
    );
    const goalInput = screen.getByRole("textbox");
    fireEvent.change(goalInput, { target: { value: "看完第一集" } });
    const startButton = screen.getByRole("button", { name: "开始专注" });
    expect(startButton).not.toBeDisabled();
    fireEvent.click(startButton);
    await Promise.resolve();
    expect(startFocus).toHaveBeenCalledWith(expect.objectContaining({
      goal: "看完第一集",
      durationMs: 25 * 60_000,
      completeOnPartEnd: false,
    }));
  });

  it("selects completeOnPartEnd when the part-completion choice is picked", async () => {
    render(
      <PlayerFocusSheet
        defaultGoal=""
        partRemainingSeconds={3000}
        bvid="BV1"
        videoTitle="测试课程"
        partCid={100}
        partPageNumber={1}
        partTitle="P1"
        videoIsPlaying={true}
        sourcePositionMs={0}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^当前分P/ }));
    const goalInput = screen.getByRole("textbox");
    fireEvent.change(goalInput, { target: { value: "看完P1" } });
    fireEvent.click(screen.getByRole("button", { name: "开始专注" }));
    await Promise.resolve();
    expect(startFocus).toHaveBeenCalledWith(expect.objectContaining({
      completeOnPartEnd: true,
    }));
  });

  it("closes the sheet when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <PlayerFocusSheet
        defaultGoal=""
        partRemainingSeconds={3000}
        bvid="BV1"
        videoTitle="测试课程"
        partCid={100}
        partPageNumber={1}
        partTitle="P1"
        videoIsPlaying={true}
        sourcePositionMs={0}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalled();
  });
});
