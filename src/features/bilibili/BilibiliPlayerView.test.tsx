import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BilibiliPlayerView } from "./BilibiliPlayerView";
import { focusTimerController } from "./useFocusTimer";
import { useAppStore } from "../../store/useAppStore";

// MSE DASH 播放器替身：浏览器模式下控制面由 DashPlayer 驱动，测试断言它
// 收到的控制命令（音量 / 加载 / 跳转），覆盖当前项目自身的播放器控制面。
const { dashSetVolume, dashLoad, dashInstances, saveVideoNote, removeVideoNote, nativePlayerTest } = vi.hoisted(() => ({
  dashSetVolume: vi.fn(),
  dashLoad: vi.fn().mockResolvedValue({ videoTrack: {}, audioTrack: null }),
  dashInstances: [] as Array<{ seek: ReturnType<typeof vi.fn> }>,
  saveVideoNote: vi.fn().mockResolvedValue(true),
  removeVideoNote: vi.fn().mockResolvedValue(true),
  nativePlayerTest: {
    enabled: false,
    open: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn().mockResolvedValue(undefined),
    requestOrientation: vi.fn().mockResolvedValue(undefined),
    listeners: [] as Array<(state: { phase: string; positionSeconds: number; durationSeconds: number; isPlaying: boolean; message?: string }) => void>,
  },
}));

const focusTimer = {
  hasActiveSession: false,
  updatePlaybackState: vi.fn().mockResolvedValue(undefined),
  completeForPlaybackPart: vi.fn().mockResolvedValue(false),
  associateVideo: vi.fn().mockResolvedValue(undefined),
  startFocus: vi.fn().mockResolvedValue(true),
  updateLastSeen: vi.fn().mockResolvedValue(undefined),
  interruptFocus: vi.fn().mockResolvedValue(undefined),
  progress: 0,
};

const loadInteractiveNode = vi.fn().mockResolvedValue({
  title: "第一段剧情",
  edgeId: 1,
  isLeaf: false,
  choices: [{ edgeId: 2, cid: 200, label: "前往分支" }],
  choicePromptLeadTimeMs: 0,
  pauseVideoForChoice: true,
});
const recordWatchHistory = vi.fn().mockResolvedValue([]);
const playbackPreferences = {
  enableDoubleTapSeek: true,
  wifiDefaultQuality: 80,
  mobileDefaultQuality: 64,
  autoplayNext: false,
  resumeFromLastPosition: true,
  defaultQuality: 80,
  defaultVolume: 0.8,
  playbackRate: 1.5,
};

vi.mock("../../lib/bilibili/publicContentService", () => ({
  createBilibiliPublicContentService: () => ({
    lookupVideo: vi.fn().mockResolvedValue({
      aid: 1,
      bvid: "BV1xx411c7mD",
      cid: 100,
      title: "测试课程",
      ownerName: "测试老师",
      ownerMid: 1,
      ownerAvatarUrl: "",
      description: "",
      descriptionSegments: [],
      stats: { view: 1, danmaku: 1, like: 1, coin: 0, favorite: 0, share: 0 },
      durationSeconds: 120,
      thumbnailUrl: "",
      parts: [
        { cid: 100, pageNumber: 1, title: "P1", durationSeconds: 120 },
        { cid: 101, pageNumber: 2, title: "P2", durationSeconds: 120 },
      ],
      tags: [],
    }),
  }),
}));

vi.mock("../../lib/bilibili/danmakuFetchService", () => ({
  createDanmakuFetchService: () => ({ fetchDanmaku: vi.fn().mockResolvedValue([]) }),
}));

vi.mock("../../lib/bilibili/services", () => ({
  createDanmakuPreferencesService: () => ({ load: vi.fn().mockResolvedValue({ enabled: true, opacity: 1, fontSize: 20, displayArea: 1, showScrolling: true, showTop: true, showBottom: true, mergeRepeated: true, laneCount: 12, scrollDurationSeconds: 9, blockedKeywords: [] }), save: vi.fn() }),
  createPlaybackPreferencesService: () => ({ load: vi.fn().mockResolvedValue(playbackPreferences), save: vi.fn().mockResolvedValue(true) }),
  createVideoNoteService: () => ({ listByVideo: vi.fn().mockResolvedValue([]), save: saveVideoNote, remove: removeVideoNote }),
  createLearningListService: () => ({ add: vi.fn().mockResolvedValue(true), list: vi.fn().mockResolvedValue([]), markCompleted: vi.fn().mockResolvedValue(true) }),
}));

vi.mock("./useFocusTimer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useFocusTimer")>();
  return { ...actual, useFocusTimer: () => focusTimer };
});

vi.mock("../../lib/bilibili/subtitleService", () => ({
  createSubtitleService: () => ({
    listTracks: vi.fn().mockResolvedValue([{ id: 1, language: "zh-CN", label: "中文", locked: false, url: "https://example.test/sub.json" }]),
    loadCues: vi.fn().mockResolvedValue([{ from: 0, to: 30, content: "测试字幕" }]),
  }),
}));

vi.mock("../../lib/bilibili/videoShotService", () => ({
  createBilibiliVideoShotService: () => ({ loadPreview: vi.fn().mockResolvedValue(null) }),
}));

vi.mock("../../lib/bilibili/playerEnhancementService", () => ({
  createBilibiliPlayerEnhancementService: () => ({
    loadMetadata: vi.fn().mockResolvedValue({ chapters: [], interaction: { graphVersion: 1 } }),
    loadInteractiveNode,
  }),
}));

const listWatchHistory = vi.fn().mockResolvedValue([]);

vi.mock("../../lib/bilibili/watchHistoryService", () => ({
  createWatchHistoryService: () => ({ record: recordWatchHistory, list: listWatchHistory, remove: vi.fn(), clear: vi.fn() }),
}));

vi.mock("../../lib/bilibili/dashPlayer", () => ({
  DashPlayer: class {
    setVolume = dashSetVolume;
    load = dashLoad;
    play = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn();
    seek = vi.fn();
    getCurrentTime = vi.fn(() => 0);
    setPlaybackRate = vi.fn();
    destroy = vi.fn();
    constructor() {
      dashInstances.push(this as unknown as { seek: ReturnType<typeof vi.fn> });
    }
  },
  isMsePlaybackSupported: () => true,
}));

vi.mock("../../lib/bilibili/playurlService", () => ({
  createPlayurlService: () => ({
    resolve: vi.fn().mockResolvedValue({
      dash: {
        video: [{ id: 80, baseUrl: "https://cdn.test/bv1.m4s", codecs: "avc1.64001E", bandwidth: 800000, backupUrls: [] }],
        audio: [{ id: 30216, baseUrl: "https://cdn.test/au1.m4s", codecs: "mp4a.40.2", bandwidth: 64000, backupUrls: [] }],
        durationMs: 120000,
      },
      acceptQuality: [32, 64, 80, 120, 127],
    }),
  }),
}));

vi.mock("../../lib/bilibili/nativeMediaPlayer", () => ({
  isAndroidNativeMediaPlayerAvailable: () => nativePlayerTest.enabled,
  requestNativeOrientation: nativePlayerTest.requestOrientation,
  createNativeMediaPlayer: () => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    setBounds: vi.fn().mockResolvedValue(undefined),
    open: nativePlayerTest.open,
    play: nativePlayerTest.play,
    pause: nativePlayerTest.pause,
    seek: nativePlayerTest.seek,
    setVolume: vi.fn().mockResolvedValue(undefined),
    setPlaybackSpeed: vi.fn().mockResolvedValue(undefined),
    setEmbeddedBackground: vi.fn().mockResolvedValue(undefined),
    enterPictureInPicture: vi.fn().mockResolvedValue(false),
    onStateChange: vi.fn(async (listener) => {
      nativePlayerTest.listeners.push(listener);
      return async () => {
        nativePlayerTest.listeners = nativePlayerTest.listeners.filter((item) => item !== listener);
      };
    }),
    dispose: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe("BilibiliPlayerView", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    nativePlayerTest.enabled = false;
    nativePlayerTest.listeners = [];
    nativePlayerTest.open.mockResolvedValue(undefined);
    saveVideoNote.mockResolvedValue(true);
    dashInstances.length = 0;
    localStorage.clear();
    listWatchHistory.mockResolvedValue([]);
    focusTimer.hasActiveSession = false;
    delete (focusTimer as { activeSession?: unknown }).activeSession;
    (focusTimer as { remainingMs?: number }).remainingMs = 0;
  });

  it("shows a quality selector during browser MSE playback and reloads when it changes", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    const select = await screen.findByRole("combobox", { name: "清晰度" });
    expect(screen.queryByRole("option", { name: "4K" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "8K" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1080P" })).toBeInTheDocument();
    const loadsBefore = dashLoad.mock.calls.length;
    fireEvent.change(select, { target: { value: "64" } });
    await waitFor(() => expect(dashLoad.mock.calls.length).toBeGreaterThan(loadsBefore));
  });

  it("shows the focus watching action after the video loads", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    expect(await screen.findByRole("button", { name: "专注观看" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加入学习清单" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "分享视频" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "字幕" })).toBeEnabled());
    await waitFor(() => expect(screen.getByRole("combobox", { name: "播放倍速" })).toHaveValue("1.5"));
    expect(screen.getByRole("button", { name: "导出 Markdown 笔记" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导出 JSON 笔记" })).toBeDisabled();
    const video = document.querySelector("video.player-video");
    expect(video).toBeTruthy();
    expect(video).not.toHaveAttribute("controls");
    expect(video).toHaveAttribute("controlslist", "nodownload nofullscreen noremoteplayback noplaybackrate");
  });

  it("keeps the selected subtitle visible after closing the track selection popup", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "字幕" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "字幕" }));

    const select = await screen.findByRole("combobox", { name: "字幕轨道" });
    fireEvent.change(select, { target: { value: "1" } });
    await screen.findByText("测试字幕");

    fireEvent.click(screen.getByRole("button", { name: "字幕" }));
    expect(screen.queryByRole("combobox", { name: "字幕轨道" })).not.toBeInTheDocument();
    expect(screen.getByText("测试字幕")).toBeInTheDocument();
  });

  it("exposes lane count, scroll duration, and merge-repeated controls in the danmaku settings popup", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    fireEvent.click(await screen.findByRole("button", { name: "弹幕设置" }));

    const mergeCheckbox = screen.getByRole("checkbox", { name: "合并同时出现的相同弹幕" });
    expect(mergeCheckbox).toBeChecked();

    const laneSlider = screen.getByRole("slider", { name: "轨道数量" });
    expect(laneSlider).toHaveValue("12");
    fireEvent.change(laneSlider, { target: { value: "6" } });
    expect(laneSlider).toHaveValue("6");

    const scrollSlider = screen.getByRole("slider", { name: "滚动时长" });
    expect(scrollSlider).toHaveValue("9");
    fireEvent.change(scrollSlider, { target: { value: "15" } });
    expect(scrollSlider).toHaveValue("15");
  });

  it("applies the saved default volume to the dash player", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    await waitFor(() => expect(dashSetVolume).toHaveBeenCalledWith(0.8));
  });

  it("opens an expanded selector for a multi-part video", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.click(await screen.findByRole("button", { name: "展开选集" }));
    expect(await screen.findByRole("dialog", { name: "选择分 P" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正在播放 P1 P1" })).toBeDisabled();
  });

  it("loads the selected interactive branch even when its cid is not a normal part", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    const seek = await screen.findByRole("slider");
    fireEvent.change(seek, { target: { value: "120" } });
    fireEvent.click(await screen.findByRole("button", { name: "前往分支" }));

    await waitFor(() => {
      expect(loadInteractiveNode).toHaveBeenLastCalledWith("BV1xx411c7mD", 1, 2);
      expect(screen.queryByRole("button", { name: "前往分支" })).not.toBeInTheDocument();
    });
  });

  it("records local watch history when playback progress changes", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByRole("slider"), { target: { value: "20" } });

    await waitFor(() => expect(recordWatchHistory).toHaveBeenCalledWith(expect.objectContaining({
      bvid: "BV1xx411c7mD",
      cid: 100,
      positionSeconds: 20,
    })), { timeout: 2500 });
  });

  it("does not clear the focus controller's playback link on playback re-renders, only on unmount", async () => {
    const updatePlaybackStateSpy = vi
      .spyOn(focusTimerController, "updatePlaybackState")
      .mockResolvedValue(undefined);
    const view = render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    const slider = await screen.findByRole("slider");
    await waitFor(() => expect(dashInstances.length).toBeGreaterThan(0));

    // 模拟 MSE 播放中的高频进度重渲染（timeupdate ~4次/秒）
    fireEvent.change(slider, { target: { value: "20" } });
    fireEvent.change(slider, { target: { value: "30" } });
    fireEvent.change(slider, { target: { value: "40" } });
    expect(updatePlaybackStateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ bvid: "" }));

    view.unmount();
    await waitFor(() =>
      expect(updatePlaybackStateSpy).toHaveBeenLastCalledWith({ bvid: "", partCid: 0, isPlaying: false }),
    );
    updatePlaybackStateSpy.mockRestore();
  });

  it("defers the seek command until the progress slider drag ends", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    const slider = await screen.findByRole("slider", { name: "播放进度" });
    await waitFor(() => expect(dashInstances.length).toBeGreaterThan(0));
    const seek = dashInstances[0]!.seek;

    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.change(slider, { target: { value: "80" } });
    fireEvent.change(slider, { target: { value: "110" } });
    // 拖动过程中只更新预览值，不触发真正的 seek。
    expect(seek).not.toHaveBeenCalled();
    expect(slider).toHaveValue("110");

    fireEvent.pointerUp(slider);
    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(110);
  });

  it("commits the range value that is present when pointer capture ends", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    const slider = await screen.findByRole("slider", { name: "播放进度" });
    await waitFor(() => expect(dashInstances.length).toBeGreaterThan(0));
    const seek = dashInstances[0]!.seek;

    fireEvent.pointerDown(slider);
    fireEvent.input(slider, { target: { value: "40" } });
    fireEvent.pointerUp(slider, { target: { value: "90" } });

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(90);
  });

  it("commits the pending seek when pointer capture is lost before pointerup", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    const slider = await screen.findByRole("slider", { name: "播放进度" });
    await waitFor(() => expect(dashInstances.length).toBeGreaterThan(0));
    const seek = dashInstances[0]!.seek;

    fireEvent.pointerDown(slider);
    fireEvent.input(slider, { target: { value: "40" } });
    fireEvent.lostPointerCapture(slider, { target: { value: "90" } });

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(90);
  });

  it("zeroes the recorded watch history position once playback nears completion", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByRole("slider"), { target: { value: "119" } });

    await waitFor(() => expect(recordWatchHistory).toHaveBeenCalledWith(expect.objectContaining({
      bvid: "BV1xx411c7mD",
      cid: 100,
      positionSeconds: 0,
      completed: true,
    })), { timeout: 2500 });
  });

  it("resumes from the saved local progress instead of forcing position zero when a focus session target has no recorded seconds", async () => {
    localStorage.setItem(
      "focubili.playback-progress.v1:BV1xx411c7mD:100",
      JSON.stringify({ positionSeconds: 42, durationSeconds: 120, updatedAt: new Date().toISOString() }),
    );

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" initialPlaybackTarget={{ cid: 100, seconds: 0 }} />);

    await waitFor(() => expect(screen.getByRole("slider")).toHaveValue("42"));
  });

  it("resumes to the last-watched part and position from local watch history when no explicit target is given", async () => {
    listWatchHistory.mockResolvedValue([{
      bvid: "BV1xx411c7mD",
      cid: 101,
      title: "测试课程",
      ownerName: "测试老师",
      thumbnailUrl: "",
      durationSeconds: 120,
      watchedAt: new Date().toISOString(),
      positionSeconds: 60,
      completed: false,
    }]);

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    await waitFor(() => expect(screen.getByRole("slider")).toHaveValue("60"));
    await waitFor(() => expect(screen.getByRole("button", { name: /P2/ })).toHaveClass("active"));
    expect(screen.getByText("P2", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("已跳转到上次观看记录：01:00")).toBeInTheDocument();
  });

  it("ignores the local watch history fallback when resume-from-last-position is disabled", async () => {
    listWatchHistory.mockResolvedValue([{
      bvid: "BV1xx411c7mD",
      cid: 101,
      title: "测试课程",
      ownerName: "测试老师",
      thumbnailUrl: "",
      durationSeconds: 120,
      watchedAt: new Date().toISOString(),
      positionSeconds: 60,
      completed: false,
    }]);
    playbackPreferences.resumeFromLastPosition = false;

    try {
      render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

      await waitFor(() => expect(screen.getByRole("button", { name: /P1/ })).toHaveClass("active"));
      expect(screen.getByRole("button", { name: /P2/ })).not.toHaveClass("active");
      expect(screen.getByRole("slider")).toHaveValue("0");
      expect(screen.queryByText(/已跳转到上次观看记录/)).not.toBeInTheDocument();
    } finally {
      playbackPreferences.resumeFromLastPosition = true;
    }
  });

  it("shows a resume notice when an explicit playback target is applied", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" initialPlaybackTarget={{ cid: 100, seconds: 30 }} />);

    await waitFor(() => expect(screen.getByRole("slider")).toHaveValue("30"));
    expect(screen.getByText("已跳转到指定位置：00:30")).toBeInTheDocument();
  });

  it("shows the remaining part duration instead of the raw focus timer when the session tracks the current part", async () => {
    focusTimer.hasActiveSession = true;
    (focusTimer as { activeSession?: unknown }).activeSession = {
      goal: "学完这一段",
      completeOnPartEnd: true,
      sourceBvid: "BV1xx411c7mD",
      sourcePartCid: 100,
    };
    (focusTimer as { remainingMs?: number }).remainingMs = 25 * 60_000;

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByRole("slider"), { target: { value: "60" } });

    await waitFor(() => expect(screen.getByLabelText("专注状态")).toHaveTextContent("01:00"));
  });

  it("pauses playback and shows a notice when the active focus session finishes", async () => {
    focusTimer.hasActiveSession = true;
    (focusTimer as { activeSession?: unknown }).activeSession = { id: "session-1", status: "running" };
    (focusTimer as { lastFinishedSession?: unknown }).lastFinishedSession = null;
    (focusTimer as { remainingMs?: number }).remainingMs = 60_000;

    const { rerender } = render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByRole("button", { name: "关联专注" });

    fireEvent.click(screen.getByRole("button", { name: "播放" }));
    expect(screen.getByRole("button", { name: "暂停" })).toBeInTheDocument();

    focusTimer.hasActiveSession = false;
    (focusTimer as { activeSession?: unknown }).activeSession = undefined;
    (focusTimer as { lastFinishedSession?: unknown }).lastFinishedSession = { id: "session-1", status: "completed" };
    rerender(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "播放" })).toBeInTheDocument());
    await screen.findByText("专注完成，视频已暂停");
  });

  it("saves the focus session's last-seen frame and position when switching parts", async () => {
    focusTimer.hasActiveSession = true;
    (focusTimer as { activeSession?: unknown }).activeSession = {
      id: "session-1",
      status: "running",
      sourceBvid: "BV1xx411c7mD",
      sourcePartCid: 100,
    };

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByRole("button", { name: "关联专注" });

    fireEvent.change(await screen.findByRole("slider"), { target: { value: "45" } });
    fireEvent.click(await screen.findByRole("button", { name: "展开选集" }));
    fireEvent.click(await screen.findByRole("button", { name: "打开 P2 P2" }));

    await waitFor(() => expect((focusTimer as { updateLastSeen: ReturnType<typeof vi.fn> }).updateLastSeen)
      .toHaveBeenCalledWith(expect.objectContaining({ positionMs: 45_000 })));
  });

  it("saves the focus session's last-seen position when the player unmounts", async () => {
    focusTimer.hasActiveSession = true;
    (focusTimer as { activeSession?: unknown }).activeSession = {
      id: "session-1",
      status: "running",
      sourceBvid: "BV1xx411c7mD",
      sourcePartCid: 100,
    };

    const { unmount } = render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    fireEvent.change(await screen.findByRole("slider"), { target: { value: "30" } });
    unmount();

    await waitFor(() => expect((focusTimer as { updateLastSeen: ReturnType<typeof vi.fn> }).updateLastSeen)
      .toHaveBeenCalledWith(expect.objectContaining({ positionMs: 30_000 })));
  });

  it("proactively prompts to associate the video with an active focus session that has no video yet", async () => {
    focusTimer.hasActiveSession = true;
    (focusTimer as { activeSession?: unknown }).activeSession = { id: "session-1", goal: "专心学习", status: "running" };

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    expect(await screen.findByText('是否将"专心学习"关联到当前播放的视频？')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关联" }));

    await waitFor(() => expect(focusTimer.associateVideo).toHaveBeenCalledWith(expect.objectContaining({
      bvid: "BV1xx411c7mD",
      partCid: 100,
    })));
    expect(screen.queryByText('是否将"专心学习"关联到当前播放的视频？')).not.toBeInTheDocument();
  });

  it("does not re-prompt for the same video after the association prompt is dismissed", async () => {
    focusTimer.hasActiveSession = true;
    (focusTimer as { activeSession?: unknown }).activeSession = { id: "session-1", goal: "专心学习", status: "running" };

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    await screen.findByText('是否将"专心学习"关联到当前播放的视频？');
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByText('是否将"专心学习"关联到当前播放的视频？')).not.toBeInTheDocument();
    await screen.findByText("我们将在新的视频提示你关联");

    fireEvent.change(await screen.findByRole("slider"), { target: { value: "10" } });
    expect(screen.queryByText('是否将"专心学习"关联到当前播放的视频？')).not.toBeInTheDocument();
  });

  it("gates leaving the player behind a focus interruption flow when the session tracks the current part", async () => {
    focusTimer.hasActiveSession = true;
    (focusTimer as { activeSession?: unknown }).activeSession = {
      id: "session-1",
      status: "running",
      sourceBvid: "BV1xx411c7mD",
      sourcePartCid: 100,
    };
    (focusTimer as { remainingMs?: number }).remainingMs = 20 * 60_000;

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByRole("button", { name: "关联专注" });

    fireEvent.click(screen.getByRole("button", { name: "返回资料库" }));

    expect(await screen.findByText("要不要再坚持一下？")).toBeInTheDocument();
    expect(useAppStore.getState().view).not.toBe("library");

    fireEvent.click(screen.getByRole("button", { name: "继续专注" }));
    await waitFor(() => expect(screen.queryByText("要不要再坚持一下？")).not.toBeInTheDocument());
    expect(useAppStore.getState().view).not.toBe("library");
  });

  it("leaves the player after confirming the focus interruption reason", async () => {
    focusTimer.hasActiveSession = true;
    (focusTimer as { activeSession?: unknown }).activeSession = {
      id: "session-1",
      status: "running",
      sourceBvid: "BV1xx411c7mD",
      sourcePartCid: 100,
    };
    (focusTimer as { remainingMs?: number }).remainingMs = 20 * 60_000;
    useAppStore.setState({ view: "bilibili-player" });

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByRole("button", { name: "关联专注" });

    fireEvent.click(screen.getByRole("button", { name: "返回资料库" }));
    await screen.findByText("要不要再坚持一下？");
    fireEvent.click(screen.getByRole("button", { name: "仍然退出" }));

    const reasonInput = await screen.findByPlaceholderText("退出或暂停原因（可选）");
    fireEvent.change(reasonInput, { target: { value: "临时有事" } });
    fireEvent.click(screen.getByRole("button", { name: "确认" }));

    await waitFor(() => expect((focusTimer as { interruptFocus: ReturnType<typeof vi.fn> }).interruptFocus).toHaveBeenCalled());
    await waitFor(() => expect(useAppStore.getState().view).toBe("library"));
  });

  it("navigates between parts using the previous/next part shortcuts in the control bar", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByRole("button", { name: "专注观看" });

    expect(screen.getByRole("button", { name: "上一集" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "下一集" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "P2 · P2" })).toHaveClass("active"));
    expect(screen.getByRole("button", { name: "下一集" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "上一集" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "P1 · P1" })).toHaveClass("active"));
  });

  it("associates a new note with the part selected in the player", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByRole("button", { name: "下一集" });

    fireEvent.click(screen.getByRole("button", { name: "下一集" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "P2 · P2" })).toHaveClass("active"));
    fireEvent.change(screen.getByLabelText("笔记标题"), { target: { value: "P2 笔记" } });
    fireEvent.change(screen.getByLabelText("笔记正文"), { target: { value: "只属于第二个分P" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));

    await waitFor(() => expect(saveVideoNote).toHaveBeenLastCalledWith(expect.objectContaining({
      title: "P2 笔记",
      partCid: 101,
      partPageNumber: 2,
    })));
  });

  it("saves a timestamped note with a title through the composer and lists it as a chip", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByLabelText("笔记标题"), { target: { value: "重点内容" } });
    fireEvent.change(screen.getByLabelText("笔记正文"), { target: { value: "这里讲得很清楚" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /重点内容/ })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /跳转到时间点/ })).toBeInTheDocument();
    expect(screen.getByLabelText("删除笔记")).toBeInTheDocument();
  });

  it("records the current playback time when saving a new timestamp note", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByLabelText("笔记标题");
    fireEvent.click(screen.getByRole("button", { name: "前进 10 秒" }));
    fireEvent.click(screen.getByRole("button", { name: "前进 10 秒" }));
    fireEvent.change(screen.getByLabelText("笔记标题"), { target: { value: "当前进度" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    await waitFor(() => expect(saveVideoNote).toHaveBeenLastCalledWith(expect.objectContaining({
      title: "当前进度",
      positionSeconds: 20,
    })));
  });

  it("does not duplicate a note when manual save races with the pending auto-save", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByLabelText("笔记标题"), { target: { value: "只保存一次" } });
    fireEvent.change(screen.getByLabelText("笔记正文"), { target: { value: "自动保存与手动保存不能重复写入" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(saveVideoNote).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => window.setTimeout(resolve, 950));
    expect(saveVideoNote).toHaveBeenCalledTimes(1);
  });

  it("rejects an explicit save without a title", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByLabelText("笔记正文"), { target: { value: "缺标题" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByText("请先填写笔记标题。");
  });

  it("loads an existing note into the composer for editing when its chip is clicked", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByLabelText("笔记标题"), { target: { value: "第一条" } });
    fireEvent.change(screen.getByLabelText("笔记正文"), { target: { value: "内容一" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByRole("button", { name: /第一条/ });

    fireEvent.click(screen.getByLabelText("新建笔记"));
    expect(screen.getByLabelText("笔记标题")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: /第一条/ }));
    expect(screen.getByLabelText("笔记标题")).toHaveValue("第一条");
    expect(screen.getByLabelText("笔记正文")).toHaveValue("内容一");
  });

  it("deletes the currently edited note after confirmation", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByLabelText("笔记标题"), { target: { value: "待删除" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByRole("button", { name: /待删除/ });

    fireEvent.click(screen.getByLabelText("删除笔记"));
    fireEvent.click(await screen.findByRole("button", { name: "删除" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: /待删除/ })).not.toBeInTheDocument());
  });

  it("does not list a note or claim success when the note service rejects the save", async () => {
    saveVideoNote.mockResolvedValueOnce(false);
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByLabelText("笔记标题"), { target: { value: "失败笔记" } });
    fireEvent.change(screen.getByLabelText("笔记正文"), { target: { value: "不能假装成功" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(saveVideoNote).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /失败笔记/ })).not.toBeInTheDocument();
    expect(await screen.findByText(/保存失败/)).toBeInTheDocument();
  });

  it("keeps an edited note visible when the service cannot persist deletion", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByLabelText("笔记标题"), { target: { value: "保留笔记" } });
    fireEvent.change(screen.getByLabelText("笔记正文"), { target: { value: "删除应失败" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByRole("button", { name: /保留笔记/ });

    removeVideoNote.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByLabelText("删除笔记"));
    fireEvent.click(await screen.findByRole("button", { name: "删除" }));

    await waitFor(() => expect(removeVideoNote).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /保留笔记/ })).toBeInTheDocument();
    expect(screen.getByText(/删除失败/)).toBeInTheDocument();
  });

  it("keeps an undone note in the list when the removal cannot be persisted", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByLabelText("笔记标题"), { target: { value: "撤销失败" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await screen.findByText(/已保存 · /);
    removeVideoNote.mockResolvedValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() => expect(screen.getByText("撤销失败，笔记仍在列表中")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /撤销失败/ })).toBeInTheDocument();
  });

  it("opens the player focus sheet with goal input and duration choices when the topbar focus button is clicked", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByRole("button", { name: "专注观看" });

    fireEvent.click(screen.getByRole("button", { name: "专注控制" }));
    const sheet = await screen.findByRole("dialog", { name: "播放器专注" });
    expect(sheet).toBeInTheDocument();
    expect(sheet.querySelector("input[type='text']")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "25 分钟" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "45 分钟" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^当前分P/ })).toBeInTheDocument();
  });

  it("shows a retry overlay when the native player reports an error", async () => {
    nativePlayerTest.enabled = true;
    nativePlayerTest.open.mockRejectedValue(new Error("原生播放器无法播放当前媒体"));
    if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
      (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver;
    }

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("视频加载失败");
    expect(screen.getByText("原生播放器无法播放当前媒体")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("opens native media with video-page headers and the saved login cookie", async () => {
    nativePlayerTest.enabled = true;
    localStorage.setItem("rixia_bilibili_cookie_v1", "SESSDATA=abc; bili_jct=def");
    if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
      (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver;
    }

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    await waitFor(() => expect(nativePlayerTest.open).toHaveBeenCalled());
    expect(nativePlayerTest.open.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      bvid: "BV1xx411c7mD",
      headers: expect.objectContaining({
        "Accept-Encoding": "identity",
        Referer: "https://www.bilibili.com/video/BV1xx411c7mD/",
        Cookie: "SESSDATA=abc; bili_jct=def",
      }),
    }));
  });

  it("keeps the single web control layer over the embedded native video", async () => {
    nativePlayerTest.enabled = true;
    if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
      (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver;
    }

    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    await waitFor(() => expect(nativePlayerTest.open).toHaveBeenCalled());
    expect(document.querySelector(".fb-player-native-bar")).toBeNull();
    await waitFor(() => {
      expect(document.querySelector(".fb-player-surface")?.getAttribute("data-native")).toBe("1");
      expect(document.documentElement.classList.contains("fb-native-hole")).toBe(true);
    });
    expect(document.querySelectorAll(".fb-player-ctl-row").length).toBe(1);
    expect(screen.getAllByRole("button", { name: "播放" }).length).toBeGreaterThan(0);
  });

  it("keeps speed, volume, quality, and fullscreen controls in the single web layer", async () => {
    nativePlayerTest.enabled = true;
    if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
      (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver;
    }
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await waitFor(() => expect(nativePlayerTest.open).toHaveBeenCalled());
    expect(document.querySelector(".fb-player-native-bar")).toBeNull();
    await waitFor(() => expect(document.querySelector(".fb-player-surface")?.getAttribute("data-native")).toBe("1"));
    const controls = document.querySelector(".fb-player-ctl-row");
    expect(controls).not.toBeNull();
    expect(controls?.querySelector("select[aria-label='播放倍速']")).not.toBeNull();
    await vi.waitFor(() => expect(controls?.querySelector("select[aria-label='清晰度']")).not.toBeNull());
    expect(controls?.querySelector("input[aria-label='音量']")).not.toBeNull();
    expect(controls?.querySelector("button[aria-label='进入全屏']")).not.toBeNull();
  });

  it("consumes the system back request while CSS fullscreen is active", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    fireEvent.click((await screen.findAllByRole("button", { name: "进入全屏" }))[0]);
    expect(screen.getAllByRole("button", { name: "退出全屏" }).length).toBeGreaterThan(0);
    const back = new Event("beid:request-exit-fullscreen", { cancelable: true });
    window.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "进入全屏" }).length).toBeGreaterThan(0));
  });

  it("rotates Android to landscape while CSS fullscreen is active", async () => {
    nativePlayerTest.enabled = true;
    if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
      (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver;
    }
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await waitFor(() => expect(nativePlayerTest.open).toHaveBeenCalled());

    fireEvent.click((await screen.findAllByRole("button", { name: "进入全屏" }))[0]);
    expect(nativePlayerTest.requestOrientation).toHaveBeenLastCalledWith("landscape");

    fireEvent.click((await screen.findAllByRole("button", { name: "退出全屏" }))[0]);
    expect(nativePlayerTest.requestOrientation).toHaveBeenLastCalledWith("portrait");
  });

  it("shows the saved timestamp with an undo entry after saving a note", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);

    fireEvent.change(await screen.findByLabelText("笔记标题"), { target: { value: "反馈测试" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));

    expect(await screen.findByText(/已保存 · /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(() => expect(screen.queryByText(/已保存 · /)).not.toBeInTheDocument());
    expect(screen.getByLabelText("笔记标题")).toHaveValue("");
    expect(saveVideoNote).toHaveBeenCalledTimes(1);
  });

  it("clears the note feedback timer when the player unmounts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { unmount } = render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    fireEvent.change(await screen.findByLabelText("笔记标题"), { target: { value: "卸载清理" } });
    fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
    await waitFor(() => expect(screen.getByText(/已保存 · /)).toBeInTheDocument());

    unmount();
    vi.advanceTimersByTime(7000);
  });

  it("keeps a persistent back button reachable while the control layer is hidden", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByRole("button", { name: "返回资料库" });
    expect(document.querySelector(".fb-player-persistent-back")).toBeNull();

    const overlay = document.querySelector(".player-gesture-overlay") as HTMLElement;
    // 单击视频：双击判定窗口（280ms）过后控制层隐藏
    fireEvent(overlay, new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 150, clientY: 60 }));
    fireEvent(window, new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 150, clientY: 60 }));
    await vi.waitFor(() => expect(document.querySelector(".fb-player-surface")?.getAttribute("data-controls")).toBe("hidden"));

    const persistent = document.querySelector(".fb-player-persistent-back") as HTMLButtonElement;
    expect(persistent).not.toBeNull();
    fireEvent.click(persistent);
    await waitFor(() => expect(useAppStore.getState().view).toBe("library"));
  });

  it("reveals the control layer again after a double-tap seek on the video", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByRole("button", { name: "返回资料库" });

    const overlay = document.querySelector(".player-gesture-overlay") as HTMLElement;
    const tap = (x: number) => {
      fireEvent(overlay, new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: x, clientY: 60 }));
      fireEvent(window, new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: x, clientY: 60 }));
    };
    tap(150);
    await vi.waitFor(() => expect(document.querySelector(".fb-player-surface")?.getAttribute("data-controls")).toBe("hidden"));

    // 双击右侧：快进 10 秒的同时控制层必须重新出现
    tap(180);
    tap(181);
    await vi.waitFor(() => expect(document.querySelector(".fb-player-surface")?.getAttribute("data-controls")).toBe("shown"));
  });

  it("toggles the control layer back on when tapping the hidden video again", async () => {
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await screen.findByRole("button", { name: "返回资料库" });

    const overlay = document.querySelector(".player-gesture-overlay") as HTMLElement;
    const tap = (x: number) => {
      fireEvent(overlay, new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: x, clientY: 60 }));
      fireEvent(window, new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: x, clientY: 60 }));
    };
    tap(150);
    await vi.waitFor(() => expect(document.querySelector(".fb-player-surface")?.getAttribute("data-controls")).toBe("hidden"));

    // 控制层隐藏后再次单击必须重新唤出（surface pointerdown 的 reveal
    // 不能让延迟 onTap 误判为"当前可见"而立即又隐藏）。
    tap(150);
    await vi.waitFor(() => expect(document.querySelector(".fb-player-surface")?.getAttribute("data-controls")).toBe("shown"));
  });

  it("keeps back and focus actions reachable in the web layer over the native view", async () => {
    nativePlayerTest.enabled = true;
    if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
      (globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      } as typeof ResizeObserver;
    }
    render(<BilibiliPlayerView bvid="BV1xx411c7mD" />);
    await waitFor(() => expect(nativePlayerTest.open).toHaveBeenCalled());
    expect(document.querySelector(".fb-player-native-bar")).toBeNull();
    const surface = document.querySelector(".fb-player-surface");
    await waitFor(() => expect(surface?.getAttribute("data-native")).toBe("1"));
    const back = surface?.querySelector("button[aria-label='返回资料库']") as HTMLButtonElement | null;
    expect(back).not.toBeNull();
    expect(surface?.querySelector("button[aria-label='专注控制']")).not.toBeNull();

    fireEvent.click(back!);
    await waitFor(() => expect(useAppStore.getState().view).toBe("library"));
  });
});
