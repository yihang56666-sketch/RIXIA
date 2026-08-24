import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FocusView } from "./FocusView";
import { useAppStore } from "../../store/useAppStore";

const { startAmbience, stopAmbience, setAmbienceVolume } = vi.hoisted(() => ({
  startAmbience: vi.fn(),
  stopAmbience: vi.fn(),
  setAmbienceVolume: vi.fn(),
}));

vi.mock("../../lib/noise", () => ({
  NOISE_OPTIONS: [
    { key: "white", label: "白噪音" },
    { key: "rain", label: "雨声" },
    { key: "waves", label: "海浪" },
  ],
  startAmbience,
  stopAmbience,
  setAmbienceVolume,
}));

vi.mock("../../lib/chime", () => ({ playChime: vi.fn() }));
vi.mock("../../lib/wakeLock", () => ({ requestWakeLock: vi.fn().mockResolvedValue(null) }));
vi.mock("../../lib/focusNotifications", () => ({
  nativeFocusNotification: {},
  createFocusNotificationService: () => ({
    showFocusCompleted: vi.fn().mockResolvedValue(undefined),
    scheduleReminder: vi.fn().mockResolvedValue(false),
    cancelReminder: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("FocusView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      view: "focus",
      focusMinutes: 25,
      focusGoalMinutes: 120,
      focusSessions: [],
      focusRounds: { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
      activeFocus: null,
    } as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it("stops the selected ambience instead of switching to white noise", () => {
    render(<FocusView />);

    fireEvent.click(screen.getByRole("button", { name: "雨声" }));
    fireEvent.click(screen.getByRole("button", { name: "停止" }));

    expect(startAmbience).toHaveBeenCalledTimes(1);
    expect(startAmbience).toHaveBeenCalledWith("rain", 0.4);
    expect(stopAmbience).toHaveBeenCalledTimes(1);
  });

  it("keeps the countdown running across unmount/remount via the persisted anchor", async () => {
    const { unmount } = render(<FocusView />);

    // 开始一个 25 分钟倒计时
    fireEvent.click(screen.getByRole("button", { name: "开始专注" }));
    await waitFor(() => expect(useAppStore.getState().activeFocus?.running).toBe(true));

    unmount();

    // 模拟在别的页面停留：直接推进真实时间锚点（endsAt 不变，剩余秒数由它推导）
    await waitFor(() => {
      const snapshot = useAppStore.getState().activeFocus;
      expect(snapshot?.running).toBe(true);
      expect(typeof snapshot?.endsAtMs).toBe("number");
    });

    // 把结束时间拨到 10 分钟后，模拟"已经过去了 15 分钟"
    const snapshot = useAppStore.getState().activeFocus!;
    useAppStore.setState({
      activeFocus: { ...snapshot, endsAtMs: Date.now() + 10 * 60 * 1000 },
    });

    render(<FocusView />);

    // 恢复后应显示约 10:00 剩余（而不是重置为 25:00）
    await waitFor(() => {
      expect(screen.getByText(/^(09|10):[0-9]{2}$/)).toBeInTheDocument();
    });
  });

  it("does not auto-start the next round when skipping the rest immediately after it begins", () => {
    vi.useFakeTimers();
    try {
      act(() => {
        useAppStore.setState({
          activeFocus: {
            startedAt: new Date().toISOString(),
            mode: "countdown",
            phase: "short-break",
            running: true,
            endsAtMs: Date.now() + 5 * 60 * 1000,
            completedRounds: 1,
          },
        });
      });
      render(<FocusView />);

      // 休息中点击"跳过休息"
      fireEvent.click(screen.getByRole("button", { name: /跳过休息/ }));
      // 400ms 后原本会自动开始的下一回合不应启动
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.getByRole("button", { name: "开始专注" })).toBeInTheDocument();
      expect(useAppStore.getState().activeFocus).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
