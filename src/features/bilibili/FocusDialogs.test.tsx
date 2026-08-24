import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusSessionStatus, type FullFocusSession } from "../../lib/bilibili/focusSessionModel";
import { FocusCompletionDialog } from "./FocusDialogs";

const session: FullFocusSession = {
  id: "focus-1",
  goal: "完成高数练习",
  plannedDurationMs: 25 * 60_000,
  accumulatedFocusMs: 25 * 60_000,
  startedAt: "2026-08-19T09:00:00.000Z",
  finishedAt: "2026-08-19T09:25:00.000Z",
  status: FocusSessionStatus.completed,
  sourcePositionMs: 0,
  completeOnPartEnd: false,
  interruptions: [],
  dailyFocusMilliseconds: {},
};

describe("FocusCompletionDialog", () => {
  it("opens a share preview for the completed focus session", () => {
    render(<FocusCompletionDialog session={session} onClose={vi.fn()} onExtend={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "分享专注成果" }));

    expect(screen.getByRole("dialog", { name: "专注分享预览" })).toBeInTheDocument();
    expect(screen.getByText("我在 BEID 完成了“完成高数练习”专注任务，专注 25m。"))
      .toBeInTheDocument();
  });
});
