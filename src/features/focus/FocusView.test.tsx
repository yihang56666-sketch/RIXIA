import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusView } from "./FocusView";
import { useAppStore } from "../../store/useAppStore";
import { requestWakeLock } from "../../lib/wakeLock";

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
    vi.mocked(requestWakeLock).mockReset().mockResolvedValue(null);
    useAppStore.setState({
      view: "focus",
      focusMinutes: 25,
      focusGoalMinutes: 120,
      focusSessions: [],
      focusRounds: { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
      activeFocus: null,
    } as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  afterEach(() => vi.restoreAllMocks());

  it("releases a wake lock that resolves after a newly started timer unmounts", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    let resolveLock!: (release: () => void) => void;
    const pendingLock = new Promise<() => void>((resolve) => { resolveLock = resolve; });
    const release = vi.fn();
    vi.mocked(requestWakeLock).mockReturnValueOnce(pendingLock);
    const { unmount } = render(<FocusView />);
    fireEvent.click(screen.getByRole("button", { name: "开始专注" }));
    expect(requestWakeLock).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => { resolveLock(release); });

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases the visibility effect's pending wake lock after restored timer unmount", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    let resolveLock!: (release: () => void) => void;
    const pendingLock = new Promise<() => void>((resolve) => { resolveLock = resolve; });
    const release = vi.fn();
    vi.mocked(requestWakeLock).mockReturnValueOnce(pendingLock);
    useAppStore.setState({ activeFocus: {
      startedAt: new Date().toISOString(), mode: "countdown", running: true,
      endsAtMs: Date.now() + 60_000,
    } });
    const { unmount } = render(<FocusView />);
    expect(requestWakeLock).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => { resolveLock(release); });

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("stops the selected ambience instead of switching to white noise", () => {
    render(<FocusView />);

    fireEvent.click(screen.getByRole("button", { name: "雨声" }));
    fireEvent.click(screen.getByRole("button", { name: "停止" }));

    expect(startAmbience).toHaveBeenCalledTimes(1);
    expect(startAmbience).toHaveBeenCalledWith("rain", 0.4);
    expect(stopAmbience).toHaveBeenCalledTimes(1);
  });

  it.each([0, 3])("skips a zero-minute break after %i previously completed rounds", (completedRounds) => {
    vi.useFakeTimers();
    try {
      useAppStore.setState({
        focusRounds: { workMinutes: 25, shortBreakMinutes: 0, longBreakMinutes: 0, longBreakEvery: 4 },
        activeFocus: {
          startedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
          mode: "countdown", phase: "focus", running: true,
          endsAtMs: Date.now() - 1, completedRounds,
        },
      });
      render(<FocusView />);

      expect(useAppStore.getState().focusSessions).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "继续休息" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "开始专注" })).toBeInTheDocument();
      expect(screen.getByText("25:00")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
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
