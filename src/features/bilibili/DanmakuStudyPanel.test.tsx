import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DANMAKU_PREFERENCES, DanmakuMode, type DanmakuEntry } from "../../lib/bilibili/types";
import { DanmakuStudyPanel } from "./DanmakuStudyPanel";

const entries: DanmakuEntry[] = [
  {
    id: 1,
    text: "这里为什么要这样写？",
    startTimeSeconds: 10,
    durationSeconds: 6,
    mode: DanmakuMode.scrolling,
    color: 0xffffff,
    fontSize: 22,
    pool: 0,
    midHash: "",
  },
];

describe("DanmakuStudyPanel", () => {
  it("shows the high-signal list and preferences link", () => {
    render(
      <DanmakuStudyPanel
        open
        entries={entries}
        currentTimeSeconds={10}
        preferences={DEFAULT_DANMAKU_PREFERENCES}
        loading={false}
        failed={false}
        onClose={vi.fn()}
        onOpenPreferences={vi.fn()}
      />,
    );

    expect(screen.getByText("这里为什么要这样写？")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开弹幕设置" })).toBeInTheDocument();
  });

  it("shows retry and empty states without blocking playback", () => {
    const onRetry = vi.fn();
    render(
      <DanmakuStudyPanel
        open
        entries={[]}
        currentTimeSeconds={10}
        preferences={DEFAULT_DANMAKU_PREFERENCES}
        loading={false}
        failed
        onClose={vi.fn()}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "重试读取弹幕" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
