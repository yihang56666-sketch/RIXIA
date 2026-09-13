import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Captions,
  Download,
  Share2,
  ExternalLink,
  ListPlus,
  ListVideo,
  Loader2,
  Pause,
  PictureInPicture,
  Play,
  Repeat,
  Moon,
  Settings2,
  Tag,
  Timer,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  MessageSquare,
  ThumbsUp,
  Star,
  Coins,
  UserRound,
  GalleryHorizontal,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { createBilibiliPublicContentService } from "../../lib/bilibili/publicContentService";
import { createDanmakuFetchService } from "../../lib/bilibili/danmakuFetchService";
import { DanmakuRenderer } from "../../lib/bilibili/danmakuRenderer";
import {
  createDanmakuPreferencesService,
  createLearningListService,
  createPlaybackPreferencesService,
  createVideoNoteService,
} from "../../lib/bilibili/services";
import type {
  DanmakuEntry,
  DanmakuPreferences,
  VideoCollectionEntry,
  VideoNote,
  VideoPart,
  VideoPreview,
} from "../../lib/bilibili/types";
import { DEFAULT_DANMAKU_PREFERENCES, DanmakuMode } from "../../lib/bilibili/types";
import { DashPlayer, isMsePlaybackSupported } from "../../lib/bilibili/dashPlayer";
import { GestureCoordinator } from "../../lib/bilibili/gestureCoordinator";
import { createJsonRequest, readStoredBilibiliCookie } from "../../lib/bilibili/httpAdapter";
import { hasOpenOverlays } from "../../lib/overlayStack";
import { Capacitor } from "@capacitor/core";
import {
  createNativeMediaPlayer,
  isAndroidNativeMediaPlayerAvailable,
  requestNativeOrientation,
  type NativeMediaPlayer,
  type NativePlayerBounds,
} from "../../lib/bilibili/nativeMediaPlayer";
import { nativeMediaRequestHeaders } from "../../lib/bilibili/nativeMediaHeaders";
import { createPlayurlService } from "../../lib/bilibili/playurlService";
import { openNativePlaybackWithRefresh } from "../../lib/bilibili/playbackSourcePolicy";
import { createPlaybackProgressStore } from "../../lib/bilibili/playbackProgress";
import { chooseDefaultPlaybackQuality, choosePlaybackQuality, filterBrowserMseQualities, qualityLabel } from "../../lib/bilibili/qualityPolicy";
import { createId } from "../../lib/id";
import { useAppStore } from "../../store/useAppStore";
import { KaoyanPlayerStudyLink } from "../kaoyan/KaoyanPlayerStudyLink";
import { focusTimerController, useFocusTimer } from "./useFocusTimer";
import { FocusInterruptionKind, FocusSessionStatus, hasVideoAssociation, isActive as isFocusSessionActive } from "../../lib/bilibili/focusSessionModel";
import { FocusInterruptionFlow } from "./FocusDialogs";
import { shouldPauseForSleepTimer, shouldRestartLoop } from "../../lib/bilibili/playbackControlPolicy";
import { createSubtitleService, type SubtitleCue, type SubtitleTrack } from "../../lib/bilibili/subtitleService";
import { downloadExportPackage, exportVideoNotes, VideoNoteExportFormat } from "../../lib/bilibili/miscServices";
import { captureVideoShotFrame, createBilibiliVideoShotService } from "../../lib/bilibili/videoShotService";
import { frameForPosition, type VideoShotFrame, type VideoShotPreview } from "../../lib/bilibili/extendedModels";
import { createMediaSessionService } from "../../lib/bilibili/mediaSessionService";
import { createBilibiliPlayerEnhancementService } from "../../lib/bilibili/playerEnhancementService";
import type { PlayerEnhancementMetadata } from "../../lib/bilibili/extendedModels";
import { PlayerChapterStrip } from "./PlayerChapterStrip";
import { PlayerChapterPanel } from "./PlayerChapterPanel";
import { isPlaybackComplete, nextIncompleteLearningEntry } from "../../lib/bilibili/playbackCompletionPolicy";
import { PlaybackCompletionOverlay } from "./PlaybackCompletionOverlay";
import { InteractiveVideoChoiceOverlay } from "./InteractiveVideoChoiceOverlay";
import { shouldPresentInteractiveChoice, interactiveChoiceTarget } from "../../lib/bilibili/interactivePlaybackPolicy";
import type { InteractiveVideoNode } from "../../lib/bilibili/extendedModels";
import { createWatchHistoryService } from "../../lib/bilibili/watchHistoryService";
import { PlayerCollectionSheet } from "./PlayerCollectionSheet";
import { PlayerPartSelector } from "./PlayerPartSelector";
import { VideoNoteComposer, formatVideoNotePosition } from "./VideoNoteComposer";
import { M3Dialog } from "./m3";
import { PlayerFocusSheet } from "./PlayerFocusSheet";

/**
 * 播放控制适配器 — 统一浏览器 MSE 与 Android 原生播放器的控制面，
 * 手势、专注和控制条代码无需感知底层差异。这里是进程内适配接口，
 * 不是外部 FocuBili 宿主桥接。
 */
interface PlayerControlBridge {
  getCurrentTime(): number;
  play(): void;
  pause(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  setPlaybackRate(rate: number): void;
}

/**
 * BEID 集成 B 站播放器 — 参考 FocuBili 的 player_page.dart：
 * - 浏览器优先 MSE DASH 直连播放（视频/音频 m4s 经 /bili-media 代理），
 *   控制条直接控制本项目的 <video>；失败时显示可重试错误卡片
 * - Android 原生走 Media3（nativeMediaPlayer）：视频视图贴在 WebView 之下，
 *   网页把 .fb-player-surface 镂空露出画面，所以两端共用同一套控制层
 * - 同时单独加载弹幕 XML，在 canvas 上渲染滚动/顶部/底部弹幕
 * - 支持时间点笔记（save / list）
 * - 支持分 P 切换
 * - 弹幕偏好（字号、不透明度、显示区域、屏蔽词等）
 */
export function BilibiliPlayerView({ bvid, initialPlaybackTarget }: { bvid: string; initialPlaybackTarget?: { cid: number; seconds: number } | null }) {
  const service = useMemo(() => createBilibiliPublicContentService(), []);
  const danmakuService = useMemo(() => createDanmakuFetchService(), []);
  const danmakuPreferencesService = useMemo(() => createDanmakuPreferencesService(), []);
  const playbackPreferencesService = useMemo(() => createPlaybackPreferencesService(), []);
  const videoNoteService = useMemo(() => createVideoNoteService(), []);
  const learningListService = useMemo(() => createLearningListService(), []);
  const playbackProgressStore = useMemo(() => createPlaybackProgressStore(), []);
  const subtitleService = useMemo(() => createSubtitleService(), []);
  const videoShotService = useMemo(() => createBilibiliVideoShotService(), []);
  const mediaSession = useMemo(() => createMediaSessionService(), []);
  const enhancementService = useMemo(() => createBilibiliPlayerEnhancementService(), []);
  const watchHistoryService = useMemo(() => createWatchHistoryService(), []);
  const setView = useAppStore((state) => state.setView);
  const focusTimer = useFocusTimer();
  const updateResourceProgress = useAppStore((state) => state.updateResourceProgress);
  const openBilibiliCreator = useAppStore((state) => state.openBilibiliCreator);

  const [video, setVideo] = useState<VideoPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [learningListMessage, setLearningListMessage] = useState("");
  const [learningEntries, setLearningEntries] = useState<Awaited<ReturnType<typeof learningListService.list>>>([]);
  const [completionMarked, setCompletionMarked] = useState(false);
  const [completionProcessing, setCompletionProcessing] = useState(false);
  const [danmaku, setDanmaku] = useState<DanmakuEntry[]>([]);
  const [prefs, setPrefs] = useState<DanmakuPreferences>(DEFAULT_DANMAKU_PREFERENCES);
  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [notePositionSeconds, setNotePositionSeconds] = useState(0);
  const [notePartCid, setNotePartCid] = useState<number | null>(null);
  const [includeNoteFrame, setIncludeNoteFrame] = useState(false);
  const [noteFramePath, setNoteFramePath] = useState<string | undefined>(undefined);
  const [noteSaving, setNoteSaving] = useState(false);
  // 保存反馈带结构化状态：成功显示时间点并提供撤销入口，失败说明原因等待重试。
  const [noteFeedback, setNoteFeedback] = useState<{ text: string; kind: "success" | "error"; undoNoteId?: string } | null>(null);
  const noteFeedbackTimerRef = useRef<number | null>(null);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState(false);
  // 屏蔽词输入的原始草稿：避免受控值过滤空段导致逗号打不进去
  const [blockedKeywordsDraft, setBlockedKeywordsDraft] = useState<string | null>(null);
  const noteAutoSaveTimerRef = useRef<number | null>(null);
  // 笔记草稿是否有未落盘改动 + 最新 saveNote 引用：自动保存走提交后依赖的
  // effect 防抖（避免调度时的旧闭包丢掉最后几个字），卸载时兜底保存一次。
  const noteDirtyRef = useRef(false);
  const saveNoteRef = useRef<((automatic?: boolean) => Promise<void>) | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  // 进度条拖动中的预览时间：拖动期间只更新这里，松手才提交一次真正的 seek，
  // 避免 onChange 每个 tick 都触发 seek 把 MSE 管线打满（拖动卡死的根因）。
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const scrubTimeRef = useRef<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [showPrefs, setShowPrefs] = useState(false);
  const [activePartCid, setActivePartCid] = useState<number | null>(null);
  const [requestedQuality, setRequestedQuality] = useState(80);
  // Load pipeline uses this quality. Auto-correction after playurl resolve updates
  // requestedQuality for UI only, so the MSE pipeline is not destroyed/rebuilt.
  const [loadQuality, setLoadQuality] = useState(80);
  const [qualityOptions, setQualityOptions] = useState<number[]>([]);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [chapterProgressVisible, setChapterProgressVisible] = useState(true);
  const [showChapterPanel, setShowChapterPanel] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerPlays, setSleepTimerPlays] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playbackPreferencesLoaded, setPlaybackPreferencesLoaded] = useState(false);
  const [doubleTapSeekEnabled, setDoubleTapSeekEnabled] = useState(true);
  const resumeFromLastPositionRef = useRef(true);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<number | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [shotPreview, setShotPreview] = useState<VideoShotPreview | null>(null);
  const [hoveredFrame, setHoveredFrame] = useState<VideoShotFrame | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [enhancementMetadata, setEnhancementMetadata] = useState<PlayerEnhancementMetadata>({ chapters: [] });
  const [interactiveNode, setInteractiveNode] = useState<InteractiveVideoNode | null>(null);
  const [interactiveLoading, setInteractiveLoading] = useState(false);
  const [interactiveError, setInteractiveError] = useState("");
  const [interactiveChoicePresented, setInteractiveChoicePresented] = useState(false);
  const [interactiveEdgeId, setInteractiveEdgeId] = useState<number | undefined>(undefined);
  const [showCollection, setShowCollection] = useState(false);
  const [showPartSelector, setShowPartSelector] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenRef = useRef(false);
  const restoringPortraitRef = useRef(false);
  const [clock, setClock] = useState(() => new Date());
  const [speedPill, setSpeedPill] = useState(false);
  const controlsTimerRef = useRef<number | null>(null);
  const controlsVisibleRef = useRef(true);
  const speedBeforeLongPressRef = useRef<number | null>(null);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const playerPageRef = useRef<HTMLDivElement | null>(null);

  const enterFullscreen = useCallback(async () => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    // 统一走 CSS 全屏（surface position:fixed）。不用原生 requestFullscreen：
    // 它会把 surface 放进浏览器 top layer，压掉 surface 之外的所有弹窗
    // （选集/分段信息/专注 Sheet/M3Dialog），全屏里这些按钮会全部失灵；
    // Android WebView 还经常直接 reject。CSS 全屏三端行为一致。
    // Android/Pad 端同步锁定系统横屏，让全屏按钮真的把设备转过来。
    fullscreenRef.current = true;
    setFullscreen(true);
    try {
      await requestNativeOrientation("landscape");
    } catch {
      // 方向锁定失败不阻塞全屏本身。
    }
    document.documentElement.classList.add("fb-player-active-fullscreen");
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen?.();
      } catch {
        // Fall through to the local CSS fullscreen fallback.
      }
    }
    // 先回竖屏再清状态：系统返回手势退出全屏后也不会把设备留在横屏。
    // 锁竖屏期间屏蔽 orientation change 的自动重进，避免 Android 物理旋转
    // 还没到位时 matchMedia 仍报 landscape 又立刻拉回全屏。
    restoringPortraitRef.current = true;
    document.documentElement.classList.remove("fb-player-active-fullscreen");
    fullscreenRef.current = false;
    setFullscreen(false);
    try {
      await requestNativeOrientation("portrait");
    } catch {
      // 方向恢复失败也要保证 UI 状态能退出来。
    } finally {
      restoringPortraitRef.current = false;
    }
  }, []);

  useEffect(
    () => () => {
      document.documentElement.classList.remove("fb-player-active-fullscreen");
      if (fullscreenRef.current) void requestNativeOrientation("portrait");
    },
    [],
  );

  useEffect(() => {
    const onSystemBack = (event: Event) => {
      if (!fullscreenRef.current && !document.fullscreenElement) return;
      event.preventDefault();
      void exitFullscreen();
    };
    window.addEventListener("beid:request-exit-fullscreen", onSystemBack);
    return () => window.removeEventListener("beid:request-exit-fullscreen", onSystemBack);
  }, [exitFullscreen]);
  const gestureRef = useRef<HTMLDivElement | null>(null);
  // 手势层在 loading 结束后才挂载；用 callback ref 让协调器 effect 感知挂载时机，
  // 否则首次 effect 跑在 loading 期间、拿到 null ref 后手势永远失效。
  const [gestureElement, setGestureElement] = useState<HTMLDivElement | null>(null);
  const attachGestureElement = useCallback((el: HTMLDivElement | null) => {
    gestureRef.current = el;
    setGestureElement(el);
  }, []);
  // 手指按下那一刻控制层的可见性快照：surface 的 pointerdown reveal 在协调器
  // 的延迟 onTap 之前执行，onTap 需要它才能正确切换而不是永远隐藏。
  const tapBaselineVisibleRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<DanmakuRenderer | null>(null);
  const prefsRef = useRef<DanmakuPreferences>(DEFAULT_DANMAKU_PREFERENCES);
  const dprRef = useRef(1);
  const animationRef = useRef<number | null>(null);
  const playerControlRef = useRef<PlayerControlBridge | null>(null);
  const gestureRefCoordinator = useRef<GestureCoordinator | null>(null);
  const nativePlayerRef = useRef<NativeMediaPlayer | null>(null);
  const nativeVideoSizeRef = useRef<{ width: number; height: number } | null>(null);
  const dashPlayerRef = useRef<DashPlayer | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const resumedPositionRef = useRef(0);
  const resumeNoticeShownRef = useRef(false);
  // MSE 管线的 playurl 刷新机会（每条管线生命周期一次），防止 403 刷新死循环。
  const mseRefreshUsedRef = useRef(false);
  // 跨分P的一次性跳转目标（笔记跳转/互动分支起点）：切换分P会重建播放器，
  // 旧实例上的 seek 无效；目标先记在这里，新管线就绪后消费一次。
  const pendingSeekTargetRef = useRef<{ cid: number; seconds: number } | null>(null);
  const lastAudibleVolumeRef = useRef(1);
  const initialTargetAppliedRef = useRef(false);
  const observedFocusSessionIdRef = useRef<string | null>(null);
  const dismissedAssociationCandidateRef = useRef<string | null>(null);
  const [associationPromptSessionId, setAssociationPromptSessionId] = useState<string | null>(null);
  const [showLeaveInterruptionFlow, setShowLeaveInterruptionFlow] = useState(false);
  const [showFocusSheet, setShowFocusSheet] = useState(false);
  const historyResumeTargetRef = useRef<{ cid: number; seconds: number } | null>(null);
  const [resumeNotice, setResumeNotice] = useState("");
  const resumeNoticeTimerRef = useRef<number | null>(null);

  function showResumeNotice(message: string) {
    if (resumeNoticeTimerRef.current != null) window.clearTimeout(resumeNoticeTimerRef.current);
    setResumeNotice(message);
    resumeNoticeTimerRef.current = window.setTimeout(() => setResumeNotice(""), 3000);
  }
  useEffect(() => () => {
    if (resumeNoticeTimerRef.current != null) window.clearTimeout(resumeNoticeTimerRef.current);
  }, []);
  const completedFocusPartRef = useRef<string | null>(null);
  const loopRestartInFlightRef = useRef(false);
  const sleepDeadlineRef = useRef<number | null>(null);
  const interactiveRequestRef = useRef(0);
  const [nativePlayerActive, setNativePlayerActive] = useState(false);
  const nativePlayerActiveRef = useRef(false);
  useEffect(() => {
    nativePlayerActiveRef.current = nativePlayerActive;
  }, [nativePlayerActive]);
  const shouldUseNativePlayer = isAndroidNativeMediaPlayerAvailable();
  // 浏览器模式用 MSE DASH 直连（对齐 FocuBili：只有自绘控制层一套控制界面，
  // 绝不嵌官方 iframe）。加载失败显示错误卡片 + 重试。
  const [dashActive, setDashActive] = useState(false);
  const [dashFailed, setDashFailed] = useState(false);
  const [dashErrorMessage, setDashErrorMessage] = useState("");
  const [dashRetryCount, setDashRetryCount] = useState(0);
  const dashEligible = !shouldUseNativePlayer && !dashFailed;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    resumeNoticeShownRef.current = false;
    pendingSeekTargetRef.current = null;
    // 历史回退决策必须等播放偏好就绪后再做，否则「从上次位置继续」关闭时
    // 仍可能按默认 true 走回退（lookup 与偏好加载同为异步时存在竞态）。
    const playbackPrefsPromise = playbackPreferencesService.load();
    service.lookupVideo(bvid).then(async (v) => {
      if (cancelled) return;
      setVideo(v);
      const resolvedPrefs = await playbackPrefsPromise.catch(() => null);
      if (cancelled) return;
      if (resolvedPrefs) resumeFromLastPositionRef.current = resolvedPrefs.resumeFromLastPosition;
      let targetPart = initialPlaybackTarget && v.parts.some((part) => part.cid === initialPlaybackTarget.cid)
        ? initialPlaybackTarget.cid
        : v.cid;
      // 未指定明确目标时，且当前分P没有本机保存进度时，回退到本机观看历史记录的分P和位置
      // （对齐 FocuBili playback_resume_plan.dart 的 canUseHistory 分支）。
      let historyResumeSeconds = 0;
      // 「从上次位置继续」被关闭时，连本机观看历史的静默回退也一并停用；
      // 只有用户显式点击（时间点笔记 / 历史页“继续播放”）才允许带位置进入。
      if (!initialPlaybackTarget && resumeFromLastPositionRef.current) {
        const savedForDefault = playbackProgressStore.load(v.bvid, targetPart);
        if (!savedForDefault || savedForDefault.positionSeconds <= 0) {
          try {
            const historyEntries = await watchHistoryService.list();
            const historyEntry = historyEntries.find((entry) => entry.bvid.trim().toUpperCase() === v.bvid.trim().toUpperCase());
            const historyPart = historyEntry ? v.parts.find((part) => part.cid === historyEntry.cid) : undefined;
            if (historyEntry && historyPart && historyEntry.positionSeconds > 0 && historyPart.durationSeconds - historyEntry.positionSeconds > 3) {
              targetPart = historyPart.cid;
              historyResumeSeconds = historyEntry.positionSeconds;
            }
          } catch {
            // 本机观看历史读取失败时保持默认分P，不阻塞播放。
          }
        }
      }
      if (cancelled) return;
      setActivePartCid(targetPart);
      setDuration(v.durationSeconds);
      if (initialPlaybackTarget && initialPlaybackTarget.seconds > 0 && targetPart === initialPlaybackTarget.cid && !initialTargetAppliedRef.current) {
        initialTargetAppliedRef.current = true;
        resumedPositionRef.current = initialPlaybackTarget.seconds;
        setCurrentTime(initialPlaybackTarget.seconds);
        resumeNoticeShownRef.current = true;
        showResumeNotice(`已跳转到指定位置：${formatVideoNotePosition(initialPlaybackTarget.seconds)}`);
      } else if (historyResumeSeconds > 0) {
        historyResumeTargetRef.current = { cid: targetPart, seconds: historyResumeSeconds };
        resumedPositionRef.current = historyResumeSeconds;
        setCurrentTime(historyResumeSeconds);
        resumeNoticeShownRef.current = true;
        showResumeNotice(`已跳转到上次观看记录：${formatVideoNotePosition(historyResumeSeconds)}`);
      }
      setLoading(false);
      videoNoteService.listByVideo(v.bvid).then((n) => !cancelled && setNotes(n));
      setEditingNoteId(null);
      setNoteTitle("");
      setNoteBody("");
      setIncludeNoteFrame(false);
      setNoteFramePath(undefined);
      setNotePartCid(targetPart);
      learningListService.list().then((items) => !cancelled && setLearningEntries(items));
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "加载失败");
      setLoading(false);
    });
    danmakuPreferencesService.load().then((p) => !cancelled && setPrefs(p));
    playbackPrefsPromise.then((p) => {
      if (cancelled) return;
      resumeFromLastPositionRef.current = p.resumeFromLastPosition;
      const connectionType = (navigator as Navigator & { connection?: { type?: string } }).connection?.type;
      const defaultQuality = chooseDefaultPlaybackQuality(p, connectionType);
      setRequestedQuality(defaultQuality);
      setLoadQuality(defaultQuality);
      setDoubleTapSeekEnabled(p.enableDoubleTapSeek);
      setPlaybackSpeed(p.playbackRate);
      lastAudibleVolumeRef.current = p.defaultVolume > 0 ? p.defaultVolume : lastAudibleVolumeRef.current;
      setVolume(p.defaultVolume);
      setMuted(p.defaultVolume <= 0);
      setPlaybackPreferencesLoaded(true);
    });
    return () => { cancelled = true; };
  }, [bvid, service, danmakuPreferencesService, playbackPreferencesService, videoNoteService, initialPlaybackTarget, learningListService]);

  useEffect(() => {
    setCompletionMarked(false);
  }, [activePartCid, video?.bvid]);

  // 当切换分 P 时重新加载弹幕
  useEffect(() => {
    if (activePartCid == null) return;
    let cancelled = false;
    danmakuService.fetchDanmaku(activePartCid).then((entries) => {
      if (!cancelled) setDanmaku(entries);
    });
    return () => { cancelled = true; };
  }, [activePartCid, danmakuService]);

  useEffect(() => {
    if (!video || activePartCid == null) {
      setEnhancementMetadata({ chapters: [] });
      return;
    }
    let cancelled = false;
    void enhancementService.loadMetadata(video.bvid, activePartCid)
      .then((metadata) => { if (!cancelled) setEnhancementMetadata(metadata); })
      .catch(() => { if (!cancelled) setEnhancementMetadata({ chapters: [] }); });
    return () => { cancelled = true; };
  }, [activePartCid, enhancementService, video]);

  useEffect(() => {
    setInteractiveNode(null);
    setInteractiveError("");
    setInteractiveChoicePresented(false);
  }, [activePartCid, video?.bvid]);

  useEffect(() => {
    setInteractiveEdgeId(undefined);
  }, [video?.bvid]);

  useEffect(() => {
    const graphVersion = enhancementMetadata.interaction?.graphVersion;
    if (!video || !graphVersion || interactiveEdgeId != null) return;
    const requestId = ++interactiveRequestRef.current;
    setInteractiveLoading(true);
    setInteractiveError("");
    void enhancementService.loadInteractiveNode(video.bvid, graphVersion).then((node) => {
      if (requestId === interactiveRequestRef.current) setInteractiveNode(node);
    }).catch((err) => {
      if (requestId === interactiveRequestRef.current) setInteractiveError(err instanceof Error ? err.message : "互动剧情加载失败");
    }).finally(() => {
      if (requestId === interactiveRequestRef.current) setInteractiveLoading(false);
    });
    return () => { interactiveRequestRef.current += 1; };
  }, [enhancementMetadata.interaction?.graphVersion, enhancementService, interactiveEdgeId, video]);

  useEffect(() => {
    if (!shouldPresentInteractiveChoice(interactiveNode, currentTime, duration, interactiveChoicePresented)) return;
    if (interactiveNode?.pauseVideoForChoice) {
      if (nativePlayerActive) void nativePlayerRef.current?.pause();
      playerControlRef.current?.pause();
      setPlaying(false);
    }
    setInteractiveChoicePresented(true);
  }, [currentTime, duration, interactiveChoicePresented, interactiveNode, nativePlayerActive]);

  useEffect(() => {
    if (!video || activePartCid == null) return;
    let cancelled = false;
    setSubtitleTracks([]);
    setSubtitleCues([]);
    setSelectedSubtitleId(null);
    void subtitleService.listTracks(video.bvid, activePartCid).then((tracks) => {
      if (!cancelled) setSubtitleTracks(tracks);
    }).catch(() => {
      if (!cancelled) setSubtitleTracks([]);
    });
    return () => { cancelled = true; };
  }, [activePartCid, subtitleService, video]);

  useEffect(() => {
    const track = subtitleTracks.find((item) => item.id === selectedSubtitleId);
    if (!track) {
      setSubtitleCues([]);
      return;
    }
    let cancelled = false;
    setSubtitleLoading(true);
    void subtitleService.loadCues(track).then((cues) => {
      if (!cancelled) setSubtitleCues(cues);
    }).catch(() => {
      if (!cancelled) setSubtitleCues([]);
    }).finally(() => {
      if (!cancelled) setSubtitleLoading(false);
    });
    return () => { cancelled = true; };
  }, [selectedSubtitleId, subtitleService, subtitleTracks]);

  useEffect(() => {
    if (!video || activePartCid == null) return;
    let cancelled = false;
    setShotPreview(null);
    setHoveredFrame(null);
    void videoShotService.loadPreview(video.bvid, activePartCid).then((preview) => {
      if (!cancelled) setShotPreview(preview);
    });
    return () => { cancelled = true; };
  }, [activePartCid, video, videoShotService]);

  // Keep resume state isolated per BV and CID so multi-part courses never overwrite each other.
  useEffect(() => {
    if (!video || activePartCid == null || !playbackPreferencesLoaded) return;
    const saved = playbackProgressStore.load(video.bvid, activePartCid);
    const isInitialTargetPart = Boolean(
      initialPlaybackTarget &&
      initialPlaybackTarget.seconds > 0 &&
      initialTargetAppliedRef.current &&
      activePartCid === initialPlaybackTarget.cid,
    );
    const historyTarget = historyResumeTargetRef.current;
    // 偏好关闭时历史回退目标必须失效（覆盖偏好加载晚于 lookup 的竞态）。
    const isHistoryTargetPart = Boolean(
      resumeFromLastPositionRef.current &&
      historyTarget &&
      historyTarget.cid === activePartCid,
    );
    const position = isInitialTargetPart
      ? initialPlaybackTarget!.seconds
      : isHistoryTargetPart
        ? historyTarget!.seconds
        : !resumeFromLastPositionRef.current
          ? 0
          : (saved?.positionSeconds ?? 0);
    if (isHistoryTargetPart) historyResumeTargetRef.current = null;
    resumedPositionRef.current = position;
    setCurrentTime(position);
  }, [activePartCid, initialPlaybackTarget, playbackPreferencesLoaded, playbackProgressStore, video?.bvid]);

  // 最新播放位置（timeupdate 高频变化，不能作为 effect 依赖）。
  const currentTimeRef = useRef(0);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  const schedulePlaybackSaveRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    schedulePlaybackSaveRef.current?.();
  }, [currentTime]);

  // 播放进度 + 本机观看历史落盘：
  // - 尾随去抖 1.5s 内只保留一个待写入定时器（连续播放也会周期性落盘，
  //   旧实现每次 timeupdate 都重置 setTimeout 导致播放中永远不保存）；
  // - 分P切换 / 组件卸载 / 页面隐藏时立即 flush，避免丢失最后一段进度。
  useEffect(() => {
    if (!video || activePartCid == null || duration <= 0) {
      schedulePlaybackSaveRef.current = null;
      return;
    }
    let pendingTimer: number | null = null;

    const flush = () => {
      const position = Math.floor(currentTimeRef.current);
      if (position <= 0) return;
      playbackProgressStore.save(video.bvid, activePartCid, position, duration);
      const resource = useAppStore.getState().resources.find((item) => item.bvid === video.bvid);
      if (resource) updateResourceProgress(resource.id, position, duration);
      const isCompleted = duration - position <= 3;
      void watchHistoryService.record({
        bvid: video.bvid,
        cid: activePartCid,
        title: video.title,
        ownerName: video.ownerName,
        thumbnailUrl: video.thumbnailUrl,
        durationSeconds: duration,
        watchedAt: new Date().toISOString(),
        positionSeconds: isCompleted ? 0 : position,
        completed: isCompleted,
      });
    };

    const schedule = () => {
      if (pendingTimer != null) return;
      pendingTimer = window.setTimeout(() => {
        pendingTimer = null;
        flush();
      }, 1500);
    };
    schedulePlaybackSaveRef.current = schedule;

    const onPageHide = () => {
      if (pendingTimer != null) {
        window.clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      flush();
    };
    window.addEventListener("pagehide", onPageHide);

    schedule();
    return () => {
      schedulePlaybackSaveRef.current = null;
      window.removeEventListener("pagehide", onPageHide);
      if (pendingTimer != null) window.clearTimeout(pendingTimer);
      flush();
    };
  }, [activePartCid, duration, playbackProgressStore, updateResourceProgress, video, watchHistoryService]);

  // Android uses Media3 for Bilibili's separate DASH video/audio tracks. The
  // Browser MSE and the Android native plugin are separate implementations of
  // the same integrated player; neither relies on an external host page.
  // 原生视频视图位于 WebView 之下，网页在 .fb-player-surface 处镂空露出画面，
  // 因此控制层、弹幕画布和手势层与 Electron/浏览器端共用同一套 DOM。
  useEffect(() => {
    if (!shouldUseNativePlayer || !video || activePartCid == null || !overlayRef.current) return;
    let cancelled = false;
    let removeListener: (() => Promise<void>) | null = null;
    const nativePlayer = createNativeMediaPlayer();
    nativePlayerRef.current = nativePlayer;

    // 原生视图贴在网页镂空洞之下，位置必须逐帧跟随。ResizeObserver 只报告尺寸
    // 变化，看不到安全区/键盘/布局位移，这些情况曾让画面和控制层错开一整条状态栏。
    let lastMeasured: NativePlayerBounds | null = null;
    let queuedBounds: NativePlayerBounds | null = null;
    let sendingBounds = false;
    let layoutFrame = 0;

    const readBounds = (): NativePlayerBounds | null => {
      const element = overlayRef.current;
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top) || rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };

    const boundsMoved = (previous: NativePlayerBounds | null, next: NativePlayerBounds) =>
      !previous
      || Math.abs(previous.left - next.left) >= 0.5
      || Math.abs(previous.top - next.top) >= 0.5
      || Math.abs(previous.width - next.width) >= 0.5
      || Math.abs(previous.height - next.height) >= 0.5;

    const pumpBounds = () => {
      if (sendingBounds || !queuedBounds) return;
      const next = queuedBounds;
      queuedBounds = null;
      sendingBounds = true;
      void nativePlayer.setBounds(next).catch(() => {}).finally(() => {
        sendingBounds = false;
        if (queuedBounds) pumpBounds();
      });
    };

    const syncBounds = () => {
      const next = readBounds();
      if (!boundsMoved(lastMeasured, next ?? lastMeasured!)) return;
      lastMeasured = next;
      if (!next) return;
      queuedBounds = next;
      pumpBounds();
    };

    const trackLayout = () => {
      layoutFrame = requestAnimationFrame(trackLayout);
      syncBounds();
    };

    const failNative = (message: string) => {
      if (cancelled) return;
      setDashErrorMessage(message);
      setDashFailed(true);
      setNativePlayerActive(false);
      void nativePlayer.dispose();
    };

    const start = async () => {
      await nativePlayer.initialize();
      removeListener = await nativePlayer.onStateChange((state) => {
        if (cancelled) return;
        if (state.phase === "error") {
          failNative(state.message || "原生播放器无法播放当前媒体");
          return;
        }
        setCurrentTime(state.positionSeconds);
        if (state.durationSeconds > 0) setDuration(state.durationSeconds);
        setPlaying(state.isPlaying);
        if (state.videoWidth && state.videoHeight) {
          nativeVideoSizeRef.current = { width: state.videoWidth, height: state.videoHeight };
        }
      });
      await syncBounds();
      // setBounds 是异步排队的，open 之前先等一帧量好的区域落位，
      // 避免首帧视频出现在 (0,0) 尺寸上。
      await new Promise<void>((resolve) => {
        const settle = () => {
          if (!sendingBounds) {
            resolve();
            return;
          }
          requestAnimationFrame(settle);
        };
        settle();
      });
      if (cancelled) return;
      const pendingTarget = pendingSeekTargetRef.current;
      if (pendingTarget && pendingTarget.cid === activePartCid) {
        // 跨分P一次性跳转目标（笔记/互动分支）在原生管线打开前消费。
        pendingSeekTargetRef.current = null;
        resumedPositionRef.current = pendingTarget.seconds;
        setCurrentTime(pendingTarget.seconds);
      }
      const playurlService = createPlayurlService(createJsonRequest());
      if (cancelled) return;
      const response = await openNativePlaybackWithRefresh({
        resolve: () => playurlService.resolve(video.bvid, activePartCid, { qn: requestedQuality }),
        fallbackResolve: () => playurlService.resolve(video.bvid, activePartCid, { qn: requestedQuality, fnval: 1 }),
        open: (videoUrl, audioUrl) => nativePlayer.open({
          bvid: video.bvid,
          cid: activePartCid,
          videoUrl,
          audioUrl,
          positionSeconds: resumedPositionRef.current,
          title: video.title,
          headers: nativeMediaRequestHeaders(video.bvid, readStoredBilibiliCookie()),
        }),
      });
      if (!cancelled) {
        setQualityOptions(response.acceptQuality);
      }
      if (!cancelled) {
        setNativePlayerActive(true);
        setDashFailed(false);
        await nativePlayer.play();
      }
    };

    layoutFrame = requestAnimationFrame(trackLayout);
    start().catch((error) => {
      failNative(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
      setNativePlayerActive(false);
      cancelAnimationFrame(layoutFrame);
      void removeListener?.();
      void nativePlayer.dispose();
      if (nativePlayerRef.current === nativePlayer) nativePlayerRef.current = null;
    };
  }, [activePartCid, dashRetryCount, requestedQuality, shouldUseNativePlayer, video?.bvid]);

  // 原生播放期间把网页背景镂空，并把窗口底色换成页面表面色：
  // 镂空洞之外的像素仍然由网页自己绘制，观感与 Electron 端一致。
  // data-theme/data-m3-mode 变化时重新取色，换肤不会残留旧底色。
  useEffect(() => {
    if (!shouldUseNativePlayer || !nativePlayerActive) return;
    const root = document.documentElement;
    root.classList.add("fb-native-hole");
    const player = nativePlayerRef.current;
    if (!player) return;
    const syncEmbeddedColor = () => {
      const page = playerPageRef.current;
      if (!page) return;
      const styles = window.getComputedStyle(page);
      void player
        .setEmbeddedBackground(
          styles.getPropertyValue("--focubili-surface") || styles.backgroundColor,
        )
        .catch(() => {});
    };
    syncEmbeddedColor();
    const observer = new MutationObserver(syncEmbeddedColor);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme", "data-m3-mode", "data-density"],
    });
    return () => {
      root.classList.remove("fb-native-hole");
      observer.disconnect();
    };
  }, [nativePlayerActive, shouldUseNativePlayer]);

  // 初始化弹幕渲染器：画布尺寸跟随容器变化（全屏/旋转/分屏），
  // 并按 devicePixelRatio 渲染避免 HiDPI 模糊；偏好变化时重建渲染器以应用新字号。
  useEffect(() => {
    prefsRef.current = prefs;
    const overlay = overlayRef.current;
    const canvas = canvasRef.current;
    if (!overlay || !canvas) return;

    const syncSize = () => {
      const rect = overlay.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      dprRef.current = dpr;
      rendererRef.current = new DanmakuRenderer({
        canvasWidth: width,
        canvasHeight: height,
        preferences: prefsRef.current,
      });
    };

    syncSize();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncSize);
    observer.observe(overlay);
    return () => observer.disconnect();
  }, [prefs]);

  // 浏览器 MSE 模式：DashPlayer 直接控制 <video>，所有控制条/手势/专注联动
  // 通过统一的进程内控制适配器生效。playurl 或媒体流失败时显示错误卡片。
  useEffect(() => {
    // 等待已保存清晰度偏好加载完成再建管线，避免默认值≠保存值时整条流加载两次
    if (!playbackPreferencesLoaded) return;
    if (!dashEligible || nativePlayerActive || !video || activePartCid == null) return;
    if (!isMsePlaybackSupported()) {
      setDashErrorMessage("当前浏览器不支持 MSE 视频播放");
      setDashFailed(true);
      return;
    }
    if (typeof window !== "undefined" && "__TAURI__" in window) {
      // Tauri 生产环境没有 /bili-media 本地代理，直连 CDN 会被防盗链拦截；
      // 快速失败给出可行动的提示，而不是泛化的 CORS/403 错误。
      setDashErrorMessage("Tauri 桌面端暂未内置媒体代理，请在 Web 或 Electron 桌面版观看");
      setDashFailed(true);
      return;
    }
    const element = videoElementRef.current;
    if (!element) return;
    let disposed = false;
    mseRefreshUsedRef.current = false;
    const player = new DashPlayer({
      video: element,
      onTimeUpdate: (t) => setCurrentTime(t),
      onDurationChange: (d) => setDuration(d),
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onError: (message) => {
        if (disposed) return;
        // 媒体 URL 有时效：seek/长暂停后的 403 允许刷新一次 playurl 再重启管线，
        // 仍失败才报废。decode/追加类错误不在此列（刷新救不了解码问题）。
        const refreshable = /HTTP \d{3}|媒体流请求失败|跳转超时|跳转失败/.test(message);
        if (refreshable && !mseRefreshUsedRef.current) {
          mseRefreshUsedRef.current = true;
          void (async () => {
            try {
              const playurlService = createPlayurlService(createJsonRequest());
              const response = await playurlService.resolve(video.bvid, activePartCid, { qn: loadQuality });
              if (disposed) return;
              if (!response.dash) throw new Error("当前视频没有可用的 DASH 流");
              await player.refresh(response.dash, loadQuality);
              if (disposed) return;
              setDashFailed(false);
              setDashActive(true);
            } catch {
              if (disposed) return;
              setDashErrorMessage(message);
              setDashFailed(true);
              setDashActive(false);
            }
          })();
          return;
        }
        setDashErrorMessage(message);
        setDashFailed(true);
        setDashActive(false);
      },
    });
    dashPlayerRef.current = player;
    playerControlRef.current = player;
    void (async () => {
      try {
        const playurlService = createPlayurlService(createJsonRequest());
        const response = await playurlService.resolve(video.bvid, activePartCid, { qn: loadQuality });
        if (disposed) return;
        if (!response.dash) throw new Error("当前视频没有可用的 DASH 流");
        const { videoTrack } = await player.load(response.dash, loadQuality);
        if (disposed) return;
        // 选项必须与 pickVideoTrack 的实际选择一致（带宽护栏会静默降档），
        // 否则下拉框提供 1080P、实际却播 480P。只展示所选轨道及以下的档位。
        const pickedQualityId = videoTrack?.id ?? 0;
        const qualityOptionsForPlayer = filterBrowserMseQualities(response.acceptQuality)
          .filter((quality) => pickedQualityId > 0 ? quality <= pickedQualityId : true);
        const effectiveQuality = choosePlaybackQuality(loadQuality, qualityOptionsForPlayer);
        setQualityOptions(qualityOptionsForPlayer);
        if (effectiveQuality !== requestedQuality) setRequestedQuality(effectiveQuality);
        setDashActive(true);
        const pendingTarget = pendingSeekTargetRef.current;
        if (pendingTarget && pendingTarget.cid === activePartCid) {
          // 跨分P笔记跳转/互动分支：新管线就绪，消费一次性目标（优先于续播进度）。
          pendingSeekTargetRef.current = null;
          resumedPositionRef.current = pendingTarget.seconds;
          setCurrentTime(pendingTarget.seconds);
          player.seek(pendingTarget.seconds);
        } else if (resumedPositionRef.current > 0) {
          player.seek(resumedPositionRef.current);
          if (!resumeNoticeShownRef.current) {
            showResumeNotice(`已从 ${formatTime(resumedPositionRef.current)} 继续播放`);
          }
        }
        void player.play().catch(() => undefined);
      } catch (error) {
        if (!disposed) {
          // 调试期保留：MSE 失败原因需要在前端可见，方便区分 CDN/解码/协议问题。
          setDashErrorMessage(error instanceof Error ? error.message : String(error));
          setDashFailed(true);
          setDashActive(false);
        }
      }
    })();
    return () => {
      disposed = true;
      if (dashPlayerRef.current === player) {
        player.destroy();
        dashPlayerRef.current = null;
      }
      if (playerControlRef.current === player) playerControlRef.current = null;
      setDashActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashEligible, video?.bvid, activePartCid, loadQuality, dashRetryCount, playbackPreferencesLoaded]);

  useEffect(() => {
    if (!playbackPreferencesLoaded) return;
    if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.setVolume(volume);
    playerControlRef.current?.setVolume(volume);
  }, [nativePlayerActive, playbackPreferencesLoaded, volume]);

  // 启动手势协调器。回调经 ref 透传，协调器只在元素/开关变化时重建——
  // 若把 currentTime 等放进依赖，timeupdate 每次触发都会在拖拽中途销毁重建
  // 协调器，手势状态丢失（横向拖动失灵的根因之一）。
  const pendingGestureScrubRef = useRef<number | null>(null);
  const gestureHandlers = {
    onSeek: (delta: number) => {
      // 双击左/右侧的快进快退同样要唤出控制层，
      // 否则用户双击后只看到迷你进度条，找不到任何视频选项。
      revealControls();
      if (nativePlayerActive && nativePlayerRef.current) {
        const target = Math.max(0, Math.min(duration, currentTime + delta));
        void nativePlayerRef.current.seek(target);
        setCurrentTime(target);
        return;
      }
      const current = playerControlRef.current?.getCurrentTime() ?? currentTime;
      const target = Math.max(0, Math.min(duration, current + delta));
      playerControlRef.current?.seek(target);
      setCurrentTime(target);
    },
    onSeekAbsolute: (time: number) => {
      if (shotPreview && duration > 0) setHoveredFrame(frameForPosition(shotPreview, time * 1000));
      pendingGestureScrubRef.current = time;
      setScrubTime(time);
      revealControls();
    },
    onScrubEnd: () => {
      setHoveredFrame(null);
      const pending = pendingGestureScrubRef.current;
      pendingGestureScrubRef.current = null;
      setScrubTime(null);
      if (pending !== null) commitSeek(pending);
    },
    onTogglePlay: () => {
      // 双击中央切换播放/暂停时同步显示控制层，让状态变化可见。
      revealControls();
      if (nativePlayerActive && nativePlayerRef.current) {
        if (playing) void nativePlayerRef.current.pause();
        else void nativePlayerRef.current.play();
        setPlaying(!playing);
        return;
      }
      if (playing) {
        playerControlRef.current?.pause();
        setPlaying(false);
      } else {
        playerControlRef.current?.play();
        setPlaying(true);
      }
    },
    onVolume: (delta: number) => {
      const next = Math.max(0, Math.min(1, (muted ? 0 : volume) + delta));
      if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.setVolume(next);
        playerControlRef.current?.setVolume(next);
      if (next > 0) lastAudibleVolumeRef.current = next;
      setVolume(next);
      setMuted(next === 0);
    },
    onTap: () => {
      setShowPrefs(false);
      // surface 的 onPointerDown 会先 revealControls，等协调器 280ms 后回调 onTap
      // 时 controlsVisibleRef 已被刷新为 true——按按下瞬间的快照判断才不会自我挫败。
      if (tapBaselineVisibleRef.current) {
        if (controlsTimerRef.current != null) window.clearTimeout(controlsTimerRef.current);
        controlsTimerRef.current = null;
        setControlsVisible(false);
      } else {
        revealControls();
      }
    },
    onLongPress: () => {
      if (!playing || speedBeforeLongPressRef.current !== null) return;
      speedBeforeLongPressRef.current = playbackSpeed;
      changePlaybackSpeed(3);
      setSpeedPill(true);
    },
    onLongPressEnd: () => {
      const saved = speedBeforeLongPressRef.current;
      if (saved === null) return;
      speedBeforeLongPressRef.current = null;
      changePlaybackSpeed(saved);
      setSpeedPill(false);
    },
    getCurrentTime: () => playerControlRef.current?.getCurrentTime() ?? currentTime,
    getDuration: () => duration,
  };
  // 每次渲染都刷新闭包，让协调器的事件回调始终读到最新的状态。
  const gestureHandlersRef = useRef(gestureHandlers);
  gestureHandlersRef.current = gestureHandlers;
  useEffect(() => {
    if (!gestureElement) return;
    const handlers = gestureHandlersRef;
    const coord = new GestureCoordinator({
      element: gestureElement,
      onSeek: (delta) => handlers.current.onSeek(delta),
      onSeekAbsolute: (time) => handlers.current.onSeekAbsolute(time),
      onScrubEnd: () => handlers.current.onScrubEnd(),
      onTogglePlay: () => handlers.current.onTogglePlay(),
      onVolume: (delta) => handlers.current.onVolume(delta),
      onTap: () => handlers.current.onTap(),
      onLongPress: () => handlers.current.onLongPress(),
      onLongPressEnd: () => handlers.current.onLongPressEnd(),
      enableDoubleTapSeek: doubleTapSeekEnabled,
      getCurrentTime: () => handlers.current.getCurrentTime(),
      getDuration: () => handlers.current.getDuration(),
    });
    gestureRefCoordinator.current = coord;
    return () => {
      coord.destroy();
      gestureRefCoordinator.current = null;
    };
  }, [doubleTapSeekEnabled, gestureElement]);

  // Keyboard shortcuts stay bound once; live values come from a ref so timeupdate
  // does not add/remove the window listener every animation frame.
  const playerHotkeysRef = useRef({
    playing,
    muted,
    fullscreen,
    nativePlayerActive,
    duration,
    showPrefs,
    showSubtitles,
    showChapterPanel,
    showCollection,
    showPartSelector,
    showLeaveInterruptionFlow,
    showFocusSheet,
    confirmDeleteNote,
    associationPromptSessionId,
  });
  playerHotkeysRef.current = {
    playing,
    muted,
    fullscreen,
    nativePlayerActive,
    duration,
    showPrefs,
    showSubtitles,
    showChapterPanel,
    showCollection,
    showPartSelector,
    showLeaveInterruptionFlow,
    showFocusSheet,
    confirmDeleteNote,
    associationPromptSessionId,
  };
  const playerHotkeyActionsRef = useRef({ enterFullscreen, exitFullscreen, confirmDeleteNote });
  playerHotkeyActionsRef.current = { enterFullscreen, exitFullscreen, confirmDeleteNote };

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const live = playerHotkeysRef.current;
      const actions = playerHotkeyActionsRef.current;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      // 焦点落在可激活控件上时 Space 是"按下"而不是"播放/暂停"。
      if (
        (event.key === " " || event.key === "Enter") &&
        target?.closest(
          "button, a, [role='button'], [role='switch'], [role='option'], [role='menuitem'], [role='tab']",
        )
      ) {
        return;
      }
      // 播放器内浮层（弹幕设置/选集/字幕/笔记删除确认等）或全局浮层打开时，
      // 媒体快捷键一律让路，避免按键穿透弹窗操作背后的播放器。
      if (
        live.showPrefs ||
        live.showSubtitles ||
        live.showChapterPanel ||
        live.showCollection ||
        live.showPartSelector ||
        live.showLeaveInterruptionFlow ||
        live.showFocusSheet ||
        live.confirmDeleteNote ||
        live.associationPromptSessionId != null ||
        hasOpenOverlays()
      ) {
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        if (live.playing) {
          if (live.nativePlayerActive) void nativePlayerRef.current?.pause();
          else playerControlRef.current?.pause();
          setPlaying(false);
        } else {
          if (live.nativePlayerActive) void nativePlayerRef.current?.play();
          else playerControlRef.current?.play();
          setPlaying(true);
        }
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const next = Math.max(0, Math.min(live.duration, currentTimeRef.current + (event.key === "ArrowLeft" ? -10 : 10)));
        currentTimeRef.current = next;
        if (live.nativePlayerActive) void nativePlayerRef.current?.seek(next);
        playerControlRef.current?.seek(next);
        setCurrentTime(next);
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        const nextMuted = !live.muted;
        const nextVolume = nextMuted ? 0 : lastAudibleVolumeRef.current;
        if (live.nativePlayerActive) void nativePlayerRef.current?.setVolume(nextVolume);
        playerControlRef.current?.setVolume(nextVolume);
        setVolume(nextVolume);
        setMuted(nextMuted);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (live.fullscreen) void actions.exitFullscreen();
        else void actions.enterFullscreen();
      } else if (event.key === "Escape" && (document.fullscreenElement || live.fullscreen)) {
        void actions.exitFullscreen();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 播放时控制层自动隐藏（暂停或未播放时保持显示）
  useEffect(() => {
    controlsVisibleRef.current = controlsVisible;
  }, [controlsVisible]);

  useEffect(() => {
    if (!playing) {
      setControlsVisible(true);
      if (controlsTimerRef.current != null) window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
      return;
    }
    revealControls();
    return () => {
      if (controlsTimerRef.current != null) window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      const active = Boolean(document.fullscreenElement);
      fullscreenRef.current = active;
      setFullscreen(active);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // 移动端自动全屏：对齐 FocuBili player_viewport_coordinator.dart 的 _syncFullscreenWithOrientation。
  // 设备旋转到横屏时自动进入全屏，回到竖屏时自动退出（仅 Android/移动端，桌面窗口只响应用户主动操作）。
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const isMobile = Capacitor.getPlatform() === "android" || /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (!isMobile) return;
    const landscapeQuery = window.matchMedia("(orientation: landscape)");
    function syncFullscreen() {
      const isLandscape = landscapeQuery.matches;
      // 设备旋转到横屏时自动进入全屏，回到竖屏时自动退出。
      // 全屏进出都会主动锁定系统方向，宽平板不会出现“退出全屏后又被拉回”。
      if (isLandscape && !document.fullscreenElement && !fullscreenRef.current && !restoringPortraitRef.current) {
        void enterFullscreen();
      } else if (!isLandscape && (document.fullscreenElement || fullscreen)) {
        void exitFullscreen();
      }
    }
    syncFullscreen();
    landscapeQuery.addEventListener("change", syncFullscreen);
    return () => landscapeQuery.removeEventListener("change", syncFullscreen);
  }, [enterFullscreen, exitFullscreen, fullscreen]);

  // 动画循环：每帧根据当前播放器时间渲染弹幕。
  // 时间经 ref 读取，避免依赖 currentTime 导致循环每 ~250ms 被拆掉重建。
  useEffect(() => {
    if (danmaku.length === 0) {
      // 切到无弹幕的分 P（或拉取失败）时清掉上一段分 P 的残影，
      // 否则最后一批弹幕会冻结在画面上直到换集。
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    let stopped = false;
    function tick() {
      if (stopped) return;
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        // getContext 失败不终结动画链：下帧重试，直到组件卸载。
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dpr = dprRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 浏览器模式从 MSE video 读取精确时间，Android 模式使用原生回调时间
      const t = nativePlayerActiveRef.current ? currentTimeRef.current : (playerControlRef.current?.getCurrentTime() ?? currentTimeRef.current);
      const visible = renderer.schedule(danmaku, t);
      drawDanmaku(ctx, visible, t, renderer.getMetrics(), prefsRef.current);
      animationRef.current = requestAnimationFrame(tick);
    }
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      if (animationRef.current != null) cancelAnimationFrame(animationRef.current);
    };
  }, [danmaku]);

  // Couple both Android-native and browser playback to the global focus session.
  useEffect(() => {
    if (!video || activePartCid == null) return;
    void focusTimer.updatePlaybackState({ bvid: video.bvid, partCid: activePartCid, isPlaying: playing });
  }, [activePartCid, focusTimer.updatePlaybackState, playing, video?.bvid]);

  // 离开播放器时清空专注控制器的播放联动状态，
  // 否则控制器仍认为视频在播，"继续专注"会误判为可以恢复计时。
  // 必须挂到控制器单例 + 空依赖：useFocusTimer 每次渲染返回新对象，
  // 依赖它会让 cleanup 以 4 次/秒（timeupdate 频率）执行，把进行中的
  // 专注会话立刻打断并永久停在"已暂停"。
  useEffect(() => {
    const controller = focusTimerController;
    return () => {
      void controller.updatePlaybackState({ bvid: "", partCid: 0, isPlaying: false });
    };
  }, []);

  useEffect(() => {
    if (!video) return;
    mediaSession.sync({
      title: video.title,
      artist: video.ownerName,
      artworkUrl: video.thumbnailUrl,
      isPlaying: playing,
      actions: {
        play: () => {
          if (nativePlayerActive) void nativePlayerRef.current?.play();
          else playerControlRef.current?.play();
          setPlaying(true);
        },
        pause: () => {
          if (nativePlayerActive) void nativePlayerRef.current?.pause();
          else playerControlRef.current?.pause();
          setPlaying(false);
        },
        seekBy: (delta) => {
          const next = Math.max(0, Math.min(durationRef.current, currentTimeRef.current + delta));
          if (nativePlayerActive) void nativePlayerRef.current?.seek(next);
          else playerControlRef.current?.seek(next);
          currentTimeRef.current = next;
          setCurrentTime(next);
        },
        seekTo: (seconds) => {
          const next = Math.max(0, Math.min(durationRef.current, seconds));
          if (nativePlayerActive) void nativePlayerRef.current?.seek(next);
          else playerControlRef.current?.seek(next);
          currentTimeRef.current = next;
          setCurrentTime(next);
        },
      },
    });
  }, [video, duration, mediaSession, nativePlayerActive, playing]);

  useEffect(() => () => mediaSession.clear(), [mediaSession]);

  // 组件卸载（关闭播放器）时保存专注任务的最后画面和位置，供首页"上次看到"展示；
  // 用 ref 持有最新闭包，避免卸载时读取到挂载瞬间的旧 video/currentTime。
  const saveFocusLastSeenRef = useRef(saveFocusLastSeen);
  saveFocusLastSeenRef.current = saveFocusLastSeen;
  useEffect(() => () => { void saveFocusLastSeenRef.current(); }, []);

  useEffect(() => {
    // Only complete when playback actually reached the end while not playing.
    // Scrubbing near duration while paused must not check out a focus session.
    if (!video || activePartCid == null || duration <= 0 || playing) return;
    if (currentTime < duration - 0.15) return;
    const mediaEl = videoElementRef.current;
    // Prefer the media element's ended flag; require a tight near-end match otherwise.
    const reachedEnd = mediaEl?.ended === true || currentTime >= duration - 0.05;
    if (!reachedEnd) return;
    const partKey = `${video.bvid}:${activePartCid}`;
    if (completedFocusPartRef.current === partKey) return;
    completedFocusPartRef.current = partKey;
    void focusTimer.completeForPlaybackPart({ bvid: video.bvid, partCid: activePartCid });
  }, [activePartCid, currentTime, duration, focusTimer.completeForPlaybackPart, playing, video]);

  // 专注任务结束（完成或提前结束）时自动暂停播放并提示，对齐 player_focus_coordinator.dart 的
  // _handleFocusStateChanged / _handleFinishedFocus：只消费新的结束事件，不在任务仍在进行或已经
  // 处理过的同一条记录上重复触发。
  useEffect(() => {
    const activeId = focusTimer.activeSession?.id ?? null;
    if (activeId) {
      observedFocusSessionIdRef.current = activeId;
      return;
    }
    const previousId = observedFocusSessionIdRef.current;
    observedFocusSessionIdRef.current = null;
    const finished = focusTimer.lastFinishedSession;
    if (!previousId || !finished || finished.id !== previousId) return;
    if (playing) {
      if (nativePlayerActive) void nativePlayerRef.current?.pause();
      playerControlRef.current?.pause();
      setPlaying(false);
    }
    setLearningListMessage(finished.status === FocusSessionStatus.completed ? "专注完成，视频已暂停" : "专注已结束，视频已暂停");
    window.setTimeout(() => setLearningListMessage(""), 2400);
  }, [focusTimer.activeSession, focusTimer.lastFinishedSession, nativePlayerActive, playing]);

  // 存在活跃但尚未关联视频的专注任务、且播放器已就绪时，主动提示是否关联当前视频，对齐
  // player_focus_coordinator.dart 的 _maybePromptFocusAssociation。用户取消后同一候选（同一视频+分P）
  // 不会重复打扰，切换到新视频/分P后才会再次询问。
  useEffect(() => {
    const session = focusTimer.activeSession;
    if (!video || activePartCid == null || !session || !isFocusSessionActive(session) || hasVideoAssociation(session) || loading) {
      return;
    }
    const candidate = `${video.bvid}:${activePartCid}`;
    if (dismissedAssociationCandidateRef.current === candidate) return;
    setAssociationPromptSessionId(session.id);
  }, [activePartCid, focusTimer.activeSession, loading, video]);

  // Apply loop and sleep-timer behavior at the same completion boundary used by
  // progress persistence and focus completion.
  useEffect(() => {
    if (!video || activePartCid == null || !shouldPauseForSleepTimer({
      remainingMinutes: sleepTimerMinutes,
      remainingPlays: sleepTimerPlays,
      currentTime,
      duration,
    })) return;
    if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.pause();
    playerControlRef.current?.pause();
    setPlaying(false);
    setSleepTimerMinutes(null);
    setSleepTimerPlays(null);
    sleepDeadlineRef.current = null;
  }, [activePartCid, currentTime, duration, nativePlayerActive, sleepTimerMinutes, sleepTimerPlays, video]);

  useEffect(() => {
    if (sleepTimerMinutes === null || sleepDeadlineRef.current === null) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((sleepDeadlineRef.current! - Date.now()) / 60_000));
      setSleepTimerMinutes(remaining);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [sleepTimerMinutes]);

  useEffect(() => {
    if (!video || activePartCid == null || !shouldRestartLoop({ loopEnabled, playing, currentTime, duration })) return;
    if (loopRestartInFlightRef.current || sleepTimerPlays === 0) return;
    loopRestartInFlightRef.current = true;
    if (sleepTimerPlays !== null) setSleepTimerPlays(Math.max(0, sleepTimerPlays - 1));
    const restart = async () => {
      try {
        if (nativePlayerActive && nativePlayerRef.current) {
          await nativePlayerRef.current.seek(0);
          await nativePlayerRef.current.play();
        } else {
          playerControlRef.current?.seek(0);
          playerControlRef.current?.play();
        }
        setCurrentTime(0);
        setPlaying(true);
      } finally {
        loopRestartInFlightRef.current = false;
      }
    };
    void restart();
  }, [activePartCid, currentTime, duration, loopEnabled, nativePlayerActive, playing, sleepTimerPlays, video]);

  function findNotePart(cid: number | null) {
    return video?.parts.find((p) => p.cid === cid) ?? video?.parts.find((p) => p.cid === activePartCid) ?? video?.parts[0];
  }

  function startNewNote() {
    if (noteAutoSaveTimerRef.current != null) {
      window.clearTimeout(noteAutoSaveTimerRef.current);
      noteAutoSaveTimerRef.current = null;
    }
    noteDirtyRef.current = false;
    setEditingNoteId(null);
    setNoteTitle("");
    setNoteBody("");
    setNotePositionSeconds(Math.floor(currentTime));
    setNotePartCid(activePartCid);
    setIncludeNoteFrame(false);
    setNoteFramePath(undefined);
  }

  function selectNote(note: VideoNote) {
    if (noteAutoSaveTimerRef.current != null) {
      window.clearTimeout(noteAutoSaveTimerRef.current);
      noteAutoSaveTimerRef.current = null;
    }
    noteDirtyRef.current = false;
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteBody(note.body);
    setNotePositionSeconds(note.positionSeconds);
    setNotePartCid(note.partCid);
    setIncludeNoteFrame(Boolean(note.framePath));
    setNoteFramePath(note.framePath);
  }

  async function jumpToNotePosition() {
    if (editingNoteId == null) return;
    const targetPart = findNotePart(notePartCid);
    if (targetPart && targetPart.cid !== activePartCid) {
      // 跨分P：旧播放器实例即将销毁，此刻 seek 无效；把目标交给新管线消费。
      pendingSeekTargetRef.current = { cid: targetPart.cid, seconds: notePositionSeconds };
      setActivePartCid(targetPart.cid);
      setCurrentTime(notePositionSeconds);
      return;
    }
    if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.seek(notePositionSeconds);
    playerControlRef.current?.seek(notePositionSeconds);
    setCurrentTime(notePositionSeconds);
  }

  /** 显示笔记保存反馈并自动消退；成功反馈保留更久，给用户留出撤销窗口。 */
  function showNoteFeedback(feedback: { text: string; kind: "success" | "error"; undoNoteId?: string }, durationMs: number) {
    if (noteFeedbackTimerRef.current != null) window.clearTimeout(noteFeedbackTimerRef.current);
    setNoteFeedback(feedback);
    noteFeedbackTimerRef.current = window.setTimeout(() => {
      noteFeedbackTimerRef.current = null;
      setNoteFeedback(null);
    }, durationMs);
  }

  /** 撤销刚保存的笔记：从服务与列表中移除并回到新建状态。 */
  async function undoLastNoteSave() {
    const undoNoteId = noteFeedback?.undoNoteId;
    if (!undoNoteId) return;
    if (noteFeedbackTimerRef.current != null) {
      window.clearTimeout(noteFeedbackTimerRef.current);
      noteFeedbackTimerRef.current = null;
    }
    setNoteFeedback(null);
    try {
      const removed = await videoNoteService.remove(undoNoteId);
      if (!removed) {
        showNoteFeedback({ text: "撤销失败，笔记仍在列表中", kind: "error" }, 4000);
        return;
      }
      setNotes((current) => current.filter((n) => n.id !== undoNoteId));
      if (editingNoteId === undoNoteId) startNewNote();
    } catch {
      showNoteFeedback({ text: "撤销失败，笔记仍在列表中", kind: "error" }, 4000);
    }
  }

  async function saveNote(automatic = false) {
    if (!video) return;
    // 显式保存优先于待执行的自动保存；否则旧闭包可能仍以 null 的
    // editingNoteId 再创建一条新笔记。
    if (!automatic && noteAutoSaveTimerRef.current != null) {
      window.clearTimeout(noteAutoSaveTimerRef.current);
      noteAutoSaveTimerRef.current = null;
    }
    const trimmedTitle = noteTitle.trim();
    const trimmedBody = noteBody.trim();
    if (!automatic && !trimmedTitle) {
      setLearningListMessage("请先填写笔记标题。");
      window.setTimeout(() => setLearningListMessage(""), 2400);
      return;
    }
    if (!trimmedTitle && !trimmedBody) return;
    if (!automatic) {
      if (noteFeedbackTimerRef.current != null) {
        window.clearTimeout(noteFeedbackTimerRef.current);
        noteFeedbackTimerRef.current = null;
      }
      setNoteFeedback(null);
    }
    setNoteSaving(true);
    try {
      let framePath = includeNoteFrame ? noteFramePath : undefined;
      if (includeNoteFrame && !framePath) {
        const frame = shotPreview ? frameForPosition(shotPreview, notePositionSeconds * 1000) : null;
        framePath = frame ? (await captureVideoShotFrame(frame)) ?? undefined : undefined;
      }
      const targetPart = findNotePart(notePartCid);
      const now = new Date().toISOString();
      const positionSeconds = editingNoteId
        ? notePositionSeconds
        : Math.max(0, Math.floor(currentTime));
      if (!editingNoteId) setNotePositionSeconds(positionSeconds);
      const note: VideoNote = {
        id: editingNoteId ?? createId(),
        bvid: video.bvid,
        videoTitle: video.title,
        ownerName: video.ownerName,
        partCid: targetPart?.cid ?? activePartCid ?? video.cid,
        partPageNumber: targetPart?.pageNumber ?? 1,
        partTitle: targetPart?.title ?? video.title,
        title: trimmedTitle || "未命名笔记",
        body: trimmedBody,
        createdAt: editingNoteId ? notes.find((n) => n.id === editingNoteId)?.createdAt ?? now : now,
        updatedAt: now,
        positionSeconds,
        videoCoverUrl: video.thumbnailUrl,
        ...(framePath ? { framePath } : {}),
      };
      const saved = await videoNoteService.save(note);
      if (!saved) {
        if (!automatic) {
          showNoteFeedback({ text: "保存失败，请重试", kind: "error" }, 4000);
        }
        return;
      }
      setNotes((current) => {
        const exists = current.some((n) => n.id === note.id);
        return exists ? current.map((n) => (n.id === note.id ? note : n)) : [...current, note];
      });
      setEditingNoteId(note.id);
      setNoteFramePath(note.framePath);
      if (!automatic) {
        noteDirtyRef.current = false;
        // 新建笔记给撤销入口；编辑已有笔记只提示更新结果。时间点直接取保存位置。
        const positionText = `${Math.floor(positionSeconds / 60)}:${String(positionSeconds % 60).padStart(2, "0")}`;
        showNoteFeedback(
          editingNoteId == null
            ? { text: `已保存 · ${positionText}`, kind: "success", undoNoteId: note.id }
            : { text: `已更新 · ${positionText}`, kind: "success" },
          6000,
        );
      }
    } catch (error) {
      if (!automatic) {
        showNoteFeedback(
          { text: error instanceof Error ? `保存失败：${error.message}` : "保存失败，请重试", kind: "error" },
          4000,
        );
      }
    } finally {
      // 任何异常（截图失败/配额不足）都不能把保存按钮永久锁在"保存中"。
      setNoteSaving(false);
    }
  }
  // 供卸载兜底保存使用：ref 每次渲染都指向最新的 saveNote，避免空依赖 effect 捕获首帧闭包。
  saveNoteRef.current = saveNote;

  // 自动保存：以提交后的笔记内容为依赖做 800ms 防抖。手动保存仍通过
  // noteAutoSaveTimerRef 直接取消待执行的自动保存（见 saveNote 开头）。
  useEffect(() => {
    if (!noteDirtyRef.current) return;
    const timer = window.setTimeout(() => {
      noteAutoSaveTimerRef.current = null;
      noteDirtyRef.current = false;
      void saveNote(true);
    }, 800);
    noteAutoSaveTimerRef.current = timer;
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteTitle, noteBody, includeNoteFrame]);

  // 卸载兜底：离开播放器时把未落盘的草稿自动保存一次，最后几个字不丢。
  useEffect(() => {
    return () => {
      if (noteFeedbackTimerRef.current != null) {
        window.clearTimeout(noteFeedbackTimerRef.current);
        noteFeedbackTimerRef.current = null;
      }
      if (noteAutoSaveTimerRef.current != null) {
        window.clearTimeout(noteAutoSaveTimerRef.current);
        noteAutoSaveTimerRef.current = null;
      }
      if (noteDirtyRef.current) {
        noteDirtyRef.current = false;
        void saveNoteRef.current?.(true);
      }
    };
  }, []);

  /** 标记草稿有未保存改动；真正的防抖保存在下方 effect 里，
   *  这样自动保存读到的是提交后的标题/正文，而不是调度瞬间的旧闭包。 */
  function scheduleNoteAutoSave() {
    noteDirtyRef.current = true;
  }

  async function deleteEditingNote() {
    if (!editingNoteId) return;
    setConfirmDeleteNote(false);
    setNoteSaving(true);
    try {
      const removed = await videoNoteService.remove(editingNoteId);
      if (!removed) {
        showNoteFeedback({ text: "删除失败，请重试", kind: "error" }, 4000);
        return;
      }
      setNotes((current) => current.filter((n) => n.id !== editingNoteId));
      startNewNote();
    } finally {
      setNoteSaving(false);
    }
  }

  function updatePrefs(patch: Partial<DanmakuPreferences>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    danmakuPreferencesService.save(next);
  }

  /** 提交一次进度跳转：DashPlayer 会对未缓冲区域自动做分段重启拉流。 */
  function commitSeek(seconds: number) {
    if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.seek(seconds);
    playerControlRef.current?.seek(seconds);
    setCurrentTime(seconds);
    revealControls();
  }

  function finishScrub(input: HTMLInputElement) {
    const pending = scrubTimeRef.current;
    if (pending === null) return;
    const value = Number(input.value);
    scrubTimeRef.current = null;
    setScrubTime(null);
    commitSeek(Number.isFinite(value) ? value : pending);
  }

  function revealControls() {
    setControlsVisible(true);
    if (controlsTimerRef.current != null) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = null;
    if (playing) {
      controlsTimerRef.current = window.setTimeout(() => {
        controlsTimerRef.current = null;
        setControlsVisible(false);
      }, 4000);
    }
  }

  if (loading) {
    return (
      <div className="fb-player-page">
        <div className="fb-player-surface">
          <div className="fb-player-status"><Loader2 className="spin" /> 正在准备播放…</div>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="fb-player-page">
        <div className="fb-player-surface">
          <div className="fb-player-status">
            <p className="background-error">{error || "未找到视频"}</p>
            <button className="m3-outlined-btn" onClick={() => setView("library")}>
              <ArrowLeft size={15} /> 返回资料库
            </button>
          </div>
        </div>
      </div>
    );
  }

  const basePart = video.parts[0]!;
  const part = video.parts.find((p) => p.cid === activePartCid) ?? {
    ...basePart,
    cid: activePartCid ?? basePart.cid,
    title: interactiveNode?.title || "互动分支",
  };
  const currentVideo = video;
  const currentLearningEntry = learningEntries.find((entry) =>
    entry.bvid === currentVideo.bvid && (entry.partCid ?? 0) === part.cid,
  );
  const nextLearningEntry = currentLearningEntry
    ? nextIncompleteLearningEntry(learningEntries, currentVideo.bvid, part.cid)
    : null;
  const playbackComplete = currentLearningEntry != null && isPlaybackComplete({
    currentTime,
    duration,
    playing,
  });
  async function addCurrentPartToLearningList() {
    const added = await learningListService.add({
      id: createId(),
      bvid: currentVideo.bvid,
      partCid: part.cid,
      partPageNumber: part.pageNumber,
      partTitle: part.title,
      title: currentVideo.title,
      ownerName: currentVideo.ownerName,
      coverUrl: currentVideo.thumbnailUrl,
      durationSeconds: part.durationSeconds,
      addedAt: new Date().toISOString(),
    });
    setLearningListMessage(added ? `已加入学习清单 · P${part.pageNumber}` : "该分 P 已在学习清单中");
    if (added) setLearningEntries(await learningListService.list());
    window.setTimeout(() => setLearningListMessage(""), 2400);
  }
  async function addCollectionEntryToLearningList(entry: VideoCollectionEntry) {
    const added = await learningListService.add({
      id: createId(),
      bvid: entry.bvid,
      partCid: entry.cid,
      partPageNumber: 1,
      partTitle: entry.title,
      title: entry.title,
      ownerName: video?.ownerName ?? "",
      coverUrl: entry.thumbnailUrl,
      durationSeconds: entry.durationSeconds,
      addedAt: new Date().toISOString(),
    });
    setLearningListMessage(added ? "已加入学习清单" : "该视频已在学习清单中");
    if (added) setLearningEntries(await learningListService.list());
    window.setTimeout(() => setLearningListMessage(""), 2400);
  }
  async function markCurrentLearningComplete() {
    if (!currentLearningEntry) return;
    setCompletionProcessing(true);
    try {
      await learningListService.markCompleted(currentLearningEntry.id);
      setCompletionMarked(true);
      setLearningEntries(await learningListService.list());
    } finally {
      setCompletionProcessing(false);
    }
  }
  async function continueLearning() {
    if (!currentLearningEntry) return;
    setCompletionProcessing(true);
    try {
      await learningListService.markCompleted(currentLearningEntry.id);
      const updatedEntries = await learningListService.list();
      setLearningEntries(updatedEntries);
      const next = nextIncompleteLearningEntry(updatedEntries, currentVideo.bvid, part.cid);
      if (next) {
        useAppStore.getState().openBilibiliVideoAt(
          next.bvid,
          next.title,
          next.partCid ?? 0,
          0,
        );
      } else {
        setCompletionMarked(true);
      }
    } finally {
      setCompletionProcessing(false);
    }
  }
  function configureSleepTimer(value: string) {
    if (value === "off") {
      setSleepTimerMinutes(null);
      setSleepTimerPlays(null);
      sleepDeadlineRef.current = null;
      return;
    }
    if (value.startsWith("m:")) {
      const minutes = Number(value.slice(2));
      setSleepTimerMinutes(minutes);
      setSleepTimerPlays(null);
      sleepDeadlineRef.current = Date.now() + minutes * 60_000;
      return;
    }
    const plays = Number(value.slice(2));
    setSleepTimerMinutes(null);
    setSleepTimerPlays(plays);
    sleepDeadlineRef.current = null;
  }
  function changePlaybackSpeed(value: number) {
    setPlaybackSpeed(value);
    if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.setPlaybackSpeed(value);
    playerControlRef.current?.setPlaybackRate(value);
  }
  async function shareVideo() {
    const url = `https://www.bilibili.com/video/${video?.bvid}`;
    if (!video) return;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: video.title, text: `${video.title} · BEID`, url });
        setShareMessage("已打开分享面板");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMessage("视频链接已复制");
      } else {
        setShareMessage(url);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareMessage("分享失败，请复制 B 站链接");
    }
    window.setTimeout(() => setShareMessage(""), 2400);
  }
  async function copyBvid() {
    if (!video) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(video.bvid);
      }
      setShareMessage("已复制 " + video.bvid);
    } catch {
      setShareMessage("复制失败，请手动选择文本");
    }
    window.setTimeout(() => setShareMessage(""), 2400);
  }
  function previewAt(clientX: number, input: HTMLInputElement) {
    if (!shotPreview || duration <= 0) return;
    const rect = input.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    setHoveredFrame(frameForPosition(shotPreview, ratio * duration * 1000));
  }
  const activeFocusSession = focusTimer.activeSession;
  const focusFollowsCurrentPart = Boolean(
    activeFocusSession?.completeOnPartEnd &&
    activeFocusSession.sourceBvid === video?.bvid &&
    activeFocusSession.sourcePartCid === activePartCid,
  );
  const visibleFocusRemainingMs = focusFollowsCurrentPart && duration > 0
    ? Math.max(0, Math.round((duration - currentTime) * 1000))
    : focusTimer.remainingMs;
  const activeSubtitle = selectedSubtitleId !== null
    ? subtitleCues.find((cue) => currentTime >= cue.from && currentTime <= cue.to)?.content ?? ""
    : "";
  async function chooseInteractiveBranch(choice: Parameters<typeof interactiveChoiceTarget>[0]) {
    const graphVersion = enhancementMetadata.interaction?.graphVersion;
    if (!graphVersion || !video) return;
    const target = interactiveChoiceTarget(choice);
    if (nativePlayerActive) await nativePlayerRef.current?.pause();
    playerControlRef.current?.pause();
    setPlaying(false);
    resumedPositionRef.current = 0;
    setCurrentTime(0);
    setInteractiveChoicePresented(false);
    setInteractiveEdgeId(target.edgeId);
    // 分支起点是一次性跳转目标：仅改 resumedPositionRef 会被按 cid 回读的
    // 续播 effect 覆盖成该分支的历史进度，导致重看分支跳到旧位置。
    pendingSeekTargetRef.current = { cid: target.cid, seconds: 0 };
    setActivePartCid(target.cid);
    const requestId = ++interactiveRequestRef.current;
    setInteractiveLoading(true);
    setInteractiveError("");
    try {
      const node = await enhancementService.loadInteractiveNode(video.bvid, graphVersion, target.edgeId);
      if (requestId === interactiveRequestRef.current) setInteractiveNode(node);
    } catch (err) {
      if (requestId === interactiveRequestRef.current) setInteractiveError(err instanceof Error ? err.message : "互动剧情加载失败");
    } finally {
      if (requestId === interactiveRequestRef.current) setInteractiveLoading(false);
    }
  }
  async function saveFocusLastSeen() {
    const session = focusTimer.activeSession;
    if (!video || !session || session.sourceBvid !== video.bvid || session.sourcePartCid !== activePartCid) return;
    const frame = shotPreview ? frameForPosition(shotPreview, currentTime * 1000) : null;
    const framePath = frame ? (await captureVideoShotFrame(frame)) ?? undefined : undefined;
    await focusTimer.updateLastSeen({ framePath, positionMs: Math.round(currentTime * 1000) });
  }

  function dismissFocusAssociationPrompt() {
    if (video && activePartCid != null) dismissedAssociationCandidateRef.current = `${video.bvid}:${activePartCid}`;
    setAssociationPromptSessionId(null);
    setLearningListMessage("我们将在新的视频提示你关联");
    window.setTimeout(() => setLearningListMessage(""), 2400);
  }

  async function confirmFocusAssociationPrompt() {
    if (!video || activePartCid == null) return;
    const targetPart = video.parts.find((p) => p.cid === activePartCid) ?? video.parts[0]!;
    setAssociationPromptSessionId(null);
    const frame = shotPreview ? frameForPosition(shotPreview, currentTime * 1000) : null;
    const framePath = frame ? (await captureVideoShotFrame(frame)) ?? undefined : undefined;
    await focusTimer.associateVideo({
      bvid: video.bvid,
      videoTitle: video.title,
      partCid: targetPart.cid,
      partPageNumber: targetPart.pageNumber,
      partTitle: targetPart.title,
      isPlaying: playing,
      positionMs: Math.round(currentTime * 1000),
      framePath,
    });
    setLearningListMessage(`已关联视频：${video.title}（P${targetPart.pageNumber} ${targetPart.title}）`);
    window.setTimeout(() => setLearningListMessage(""), 2400);
  }

  function focusSessionTracksCurrentPart(): boolean {
    const session = focusTimer.activeSession;
    return Boolean(
      session &&
      isFocusSessionActive(session) &&
      video &&
      session.sourceBvid === video.bvid &&
      session.sourcePartCid === activePartCid,
    );
  }

  // 离开播放器前若专注任务正跟随当前分P，先走"打断"两步确认流程，对齐
  // player_focus_coordinator.dart 的 _requestLeavePlayer；确认打断后补存最后画面和位置。
  function requestLeavePlayer() {
    if (!focusSessionTracksCurrentPart()) {
      void exitFullscreen();
      setView("library");
      return;
    }
    setShowLeaveInterruptionFlow(true);
  }

  function selectPart(selectedPart: VideoPart) {
    void saveFocusLastSeen();
    completedFocusPartRef.current = null;
    resumedPositionRef.current = 0;
    resumeNoticeShownRef.current = false;
    historyResumeTargetRef.current = null;
    setResumeNotice("");
    setInteractiveEdgeId(undefined);
    setActivePartCid(selectedPart.cid);
    setNotePartCid(selectedPart.cid);
    setCurrentTime(0);
  }

  // 弹幕设置 / 字幕轨道面板：渲染在画面浮层内；Android 原生模式下
  // 画面是 WebView 之下透出来的原生视频，浮层同样盖在视频之上。
  const danmakuPrefsPanel = showPrefs && (
    <div className="fb-player-popup" role="dialog" aria-label="弹幕设置">
      <strong>弹幕设置</strong>
      <label className="field-row">
        <span>弹幕开关</span>
        <input type="checkbox" checked={prefs.enabled} onChange={(e) => updatePrefs({ enabled: e.target.checked })} />
      </label>
      <label className="field-row">
        <span>不透明度</span>
        <input type="range" min={0} max={1} step={0.1} value={prefs.opacity} onChange={(e) => updatePrefs({ opacity: Number(e.target.value) })} />
      </label>
      <label className="field-row">
        <span>字号</span>
        <input type="range" min={8} max={48} step={1} value={prefs.fontSize} onChange={(e) => updatePrefs({ fontSize: Number(e.target.value) })} />
      </label>
      <label className="field-row">
        <span>显示区域</span>
        <input type="range" min={0.1} max={1} step={0.1} value={prefs.displayArea} onChange={(e) => updatePrefs({ displayArea: Number(e.target.value) })} />
      </label>
      <label className="field-row">
        <span>滚动弹幕</span>
        <input type="checkbox" checked={prefs.showScrolling} onChange={(e) => updatePrefs({ showScrolling: e.target.checked })} />
      </label>
      <label className="field-row">
        <span>顶部弹幕</span>
        <input type="checkbox" checked={prefs.showTop} onChange={(e) => updatePrefs({ showTop: e.target.checked })} />
      </label>
      <label className="field-row">
        <span>底部弹幕</span>
        <input type="checkbox" checked={prefs.showBottom} onChange={(e) => updatePrefs({ showBottom: e.target.checked })} />
      </label>
      <label className="field-row">
        <span>合并同时出现的相同弹幕</span>
        <input type="checkbox" checked={prefs.mergeRepeated} onChange={(e) => updatePrefs({ mergeRepeated: e.target.checked })} />
      </label>
      <label className="field-row">
        <span>轨道数量</span>
        <input type="range" min={1} max={24} step={1} value={prefs.laneCount} onChange={(e) => updatePrefs({ laneCount: Number(e.target.value) })} />
      </label>
      <label className="field-row">
        <span>滚动时长</span>
        <input type="range" min={3} max={20} step={1} value={prefs.scrollDurationSeconds} onChange={(e) => updatePrefs({ scrollDurationSeconds: Number(e.target.value) })} />
      </label>
      <label className="field-row">
        <span>屏蔽词（逗号分隔）</span>
        <input
          type="text"
          value={blockedKeywordsDraft ?? prefs.blockedKeywords.join(",")}
          onChange={(e) => {
            const raw = e.target.value;
            setBlockedKeywordsDraft(raw);
            updatePrefs({ blockedKeywords: raw.split(",").map((s) => s.trim()).filter(Boolean) });
          }}
          onBlur={() => setBlockedKeywordsDraft(null)}
        />
      </label>
    </div>
  );
  const subtitlePanel = showSubtitles && subtitleTracks.length > 0 && (
    <div className="fb-player-popup" role="dialog" aria-label="字幕轨道">
      <strong>字幕轨道</strong>
      <label className="field-row">
        <select
          aria-label="字幕轨道"
          value={selectedSubtitleId ?? "off"}
          onChange={(event) => {
            const value = event.target.value;
            setSelectedSubtitleId(value === "off" ? null : Number(value));
          }}
        >
          <option value="off">关闭字幕</option>
          {subtitleTracks.map((track) => <option key={track.id} value={track.id}>{track.label}</option>)}
        </select>
      </label>
    </div>
  );

  return (
    <div className="fb-player-page" ref={playerPageRef} data-player-fullscreen={fullscreen ? "1" : "0"}>
      <div
        className="fb-player-surface"
        ref={overlayRef}
        data-native={nativePlayerActive ? "1" : "0"}
        data-fullscreen={fullscreen ? "1" : "0"}
        data-controls={controlsVisible ? "shown" : "hidden"}
        onMouseMove={revealControls}
        onPointerDown={() => {
          tapBaselineVisibleRef.current = controlsVisibleRef.current;
          revealControls();
        }}
      >
        {!nativePlayerActive && (
          <video
            ref={videoElementRef}
            className="player-video"
            playsInline
            preload="auto"
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
            aria-label={video.title}
            aria-busy={!dashActive}
            data-dash-active={dashActive ? "1" : "0"}
          />
        )}
        {!nativePlayerActive && dashFailed && (
          <div className="player-error-overlay" role="alert">
            <strong>视频加载失败</strong>
            <p>{dashErrorMessage || "无法建立播放连接"}</p>
            <button
              className="m3-filled-btn"
              onClick={() => {
                setDashFailed(false);
                setDashErrorMessage("");
                setDashActive(false);
                setDashRetryCount((count) => count + 1);
              }}
            >
              重试
            </button>
          </div>
        )}
        <canvas ref={canvasRef} className="player-danmaku-canvas" />
        {activeSubtitle && <div className="player-subtitle-overlay" aria-live="polite">{activeSubtitle}</div>}
        <div ref={attachGestureElement} className="player-gesture-overlay" />
        {resumeNotice && <div className="fb-player-resume-notice" data-controls={controlsVisible ? "shown" : "hidden"} role="status">{resumeNotice}</div>}
        {interactiveChoicePresented && interactiveNode && (
          <InteractiveVideoChoiceOverlay
            title={interactiveNode.title}
            choices={interactiveNode.choices}
            loading={interactiveLoading}
            error={interactiveError}
            onChoiceSelected={(choice) => void chooseInteractiveBranch(choice)}
            onRetry={() => {
              setInteractiveChoicePresented(false);
              setInteractiveEdgeId(undefined);
            }}
          />
        )}
        {playbackComplete && (
          <PlaybackCompletionOverlay
            hasNext={nextLearningEntry !== null}
            markedCompleted={completionMarked || Boolean(currentLearningEntry?.completedAt)}
            processing={completionProcessing}
            onMarkCompleted={() => void markCurrentLearningComplete()}
            onContinue={() => void continueLearning()}
          />
        )}

        {/* 顶部状态栏 */}
        <div className="fb-player-topbar" data-visible={controlsVisible}>
          <button className="fb-player-topbar-btn" onClick={requestLeavePlayer} aria-label="返回资料库">
            <ArrowLeft size={18} />
          </button>
          <span className="fb-player-topbar-title">{video.title}</span>
          {focusTimer.hasActiveSession && focusTimer.activeSession && (
            <div className="fb-player-focus-status" aria-label="专注状态">
              <Timer size={12} />
              <span>{focusTimer.activeSession.goal}</span>
              <strong>{formatCountdown(visibleFocusRemainingMs)}</strong>
            </div>
          )}
          <span className="fb-player-clock">{formatClock(clock)}</span>
          <button className="fb-player-topbar-btn" onClick={() => setShowFocusSheet(true)} aria-label="专注控制" title="专注控制">
            <Timer size={18} />
          </button>
          <button
            className="fb-player-topbar-btn"
            onClick={() => setShowSubtitles((v) => !v)}
            aria-label="字幕"
            title={subtitleLoading ? "正在读取字幕" : subtitleTracks.length === 0 ? "暂无字幕" : "字幕"}
            disabled={subtitleTracks.length === 0}
          >
            <Captions size={18} />
          </button>
          <button className="fb-player-topbar-btn" onClick={() => setShowPrefs((s) => !s)} aria-label="弹幕设置">
            <Settings2 size={18} />
          </button>
        </div>

        {/* 控制层自动隐藏后仍保留一个可点的返回入口，
            平板/手机全屏看课时不会出现"左上角没有返回按键"。 */}
        {!controlsVisible && (
          <button className="fb-player-persistent-back" onClick={requestLeavePlayer} aria-label="返回资料库">
            <ArrowLeft size={16} />
          </button>
        )}

        {/* 底部控制层 */}
        <div className="fb-player-controls-overlay" data-visible={controlsVisible}>
          <div className="fb-player-seek-wrap">
            {hoveredFrame && (
              <div
                className="fb-player-shot-preview"
                style={{
                  width: hoveredFrame.frameWidth,
                  height: hoveredFrame.frameHeight,
                  backgroundImage: `url(${hoveredFrame.imageUrl})`,
                  backgroundSize: `${hoveredFrame.sheetColumns * hoveredFrame.frameWidth}px ${hoveredFrame.sheetRows * hoveredFrame.frameHeight}px`,
                  backgroundPosition: `-${hoveredFrame.column * hoveredFrame.frameWidth}px -${hoveredFrame.row * hoveredFrame.frameHeight}px`,
                }}
                aria-hidden="true"
              />
            )}
            <input
              type="range"
              className="player-seek"
              min={0}
              max={duration}
              value={scrubTime ?? currentTime}
              aria-label="播放进度"
              onChange={(e) => {
                const t = Number(e.target.value);
                // 非拖动场景（键盘方向键/辅助技术）立即提交；拖动中只挪预览值。
                if (scrubTimeRef.current === null) {
                  commitSeek(t);
                  return;
                }
                scrubTimeRef.current = t;
                setScrubTime(t);
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                const value = Number(e.currentTarget.value);
                scrubTimeRef.current = Number.isFinite(value) ? value : 0;
                setScrubTime(scrubTimeRef.current);
              }}
              onPointerUp={(e) => finishScrub(e.currentTarget)}
              onPointerCancel={(e) => finishScrub(e.currentTarget)}
              onLostPointerCapture={(e) => finishScrub(e.currentTarget)}
              onMouseUp={(e) => finishScrub(e.currentTarget)}
              onTouchEnd={(e) => finishScrub(e.currentTarget)}
              onMouseMove={(e) => previewAt(e.clientX, e.currentTarget)}
              onMouseLeave={() => setHoveredFrame(null)}
              onTouchMove={(e) => previewAt(e.touches[0]?.clientX ?? 0, e.currentTarget)}
            />
          </div>
          <div className="fb-player-ctl-row">
            <button
              className="player-btn"
              onClick={() => {
                if (playing) {
                  if (nativePlayerActive && nativePlayerRef.current) {
                    void nativePlayerRef.current.pause();
                    setPlaying(false);
                    return;
                  }
                  playerControlRef.current?.pause();
                  setPlaying(false);
                } else {
                  if (nativePlayerActive && nativePlayerRef.current) {
                    void nativePlayerRef.current.play();
                    setPlaying(true);
                    return;
                  }
                  playerControlRef.current?.play();
                  setPlaying(true);
                }
              }}
              aria-label={playing ? "暂停" : "播放"}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            {video.parts.length > 1 && (() => {
              const partIndex = video.parts.findIndex((p) => p.cid === activePartCid);
              return (
                <>
                  <button
                    className="player-btn"
                    disabled={partIndex <= 0}
                    onClick={() => { if (partIndex > 0) selectPart(video.parts[partIndex - 1]!); }}
                    aria-label="上一集"
                    title="上一集"
                  >
                    <SkipBack size={16} />
                  </button>
                  <button
                    className="player-btn"
                    disabled={partIndex < 0 || partIndex >= video.parts.length - 1}
                    onClick={() => { if (partIndex >= 0 && partIndex < video.parts.length - 1) selectPart(video.parts[partIndex + 1]!); }}
                    aria-label="下一集"
                    title="下一集"
                  >
                    <SkipForward size={16} />
                  </button>
                </>
              );
            })()}
            <button
              className="player-btn"
              onClick={() => {
                // 用同步 ref 计算，快速连点两次也能各前进 10 秒（state 闭包会读到旧值）。
                const t = Math.max(0, currentTimeRef.current - 10);
                currentTimeRef.current = t;
                if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.seek(t);
                playerControlRef.current?.seek(t);
                setCurrentTime(t);
              }}
              aria-label="后退 10 秒"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              className="player-btn"
              onClick={() => {
                const t = Math.min(duration, currentTimeRef.current + 10);
                currentTimeRef.current = t;
                if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.seek(t);
                playerControlRef.current?.seek(t);
                setCurrentTime(t);
              }}
              aria-label="前进 10 秒"
            >
              <ChevronRight size={17} />
            </button>
            <span className="player-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
            <button
              className="player-btn"
              onClick={() => {
                setMuted((m) => {
                  const next = !m;
                  const nextVolume = next ? 0 : lastAudibleVolumeRef.current;
                  if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.setVolume(nextVolume);
                  playerControlRef.current?.setVolume(nextVolume);
                  setVolume(nextVolume);
                  return next;
                });
              }}
              aria-label={muted ? "取消静音" : "静音"}
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <input
              className="player-volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              aria-label="音量"
              role="presentation"
              onChange={(event) => {
                const next = Math.max(0, Math.min(1, Number(event.target.value)));
                setVolume(next);
                setMuted(next === 0);
                if (next > 0) lastAudibleVolumeRef.current = next;
                if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.setVolume(next);
                playerControlRef.current?.setVolume(next);
              }}
            />
            <select
              className="player-quality-select"
              aria-label="播放倍速"
              value={playbackSpeed}
              onChange={(event) => changePlaybackSpeed(Number(event.target.value))}
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2, 3].map((speed) => (
                <option key={speed} value={speed}>{speed}x</option>
              ))}
            </select>
            {qualityOptions.length > 1 && (
              <select
                className="player-quality-select"
                aria-label="清晰度"
                value={requestedQuality}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (!Number.isFinite(next) || next === requestedQuality) return;
                  resumedPositionRef.current = currentTime;
                  setNativePlayerActive(false);
                  setRequestedQuality(next);
                  setLoadQuality(next);
                }}
              >
                {qualityOptions.map((quality) => <option key={quality} value={quality}>{qualityLabel(quality)}</option>)}
              </select>
            )}
            <button
              className={`player-btn${loopEnabled ? " active" : ""}`}
              onClick={() => setLoopEnabled((enabled) => !enabled)}
              aria-label={loopEnabled ? "关闭循环播放" : "开启循环播放"}
              title={loopEnabled ? "循环播放已开启" : "循环播放"}
            >
              <Repeat size={17} />
            </button>
            {enhancementMetadata.chapters.length > 0 && (
              <button
                className="player-btn"
                onClick={() => setShowChapterPanel(true)}
                aria-label="分段信息"
                title="分段信息"
              >
                <GalleryHorizontal size={17} />
              </button>
            )}
            <label className="player-sleep-control">
              <Moon size={14} />
              <select
                aria-label="定时关闭"
                value={sleepTimerMinutes !== null ? `m:${sleepTimerMinutes}` : sleepTimerPlays !== null ? `p:${sleepTimerPlays}` : "off"}
                onChange={(event) => configureSleepTimer(event.target.value)}
              >
                <option value="off">{sleepTimerMinutes !== null ? `定时关闭 · 剩 ${sleepTimerMinutes} 分钟` : "定时关闭"}</option>
                {sleepTimerMinutes !== null && ![15, 30, 60].includes(sleepTimerMinutes) && (
                  <option value={`m:${sleepTimerMinutes}`}>{sleepTimerMinutes} 分钟后暂停</option>
                )}
                <option value="m:15">15 分钟后暂停</option>
                <option value="m:30">30 分钟后暂停</option>
                <option value="m:60">60 分钟后暂停</option>
                {sleepTimerPlays !== null && sleepTimerPlays > 0 && sleepTimerPlays !== 1 && sleepTimerPlays !== 3 && (
                  <option value={`p:${sleepTimerPlays}`}>播放 {sleepTimerPlays} 次后暂停</option>
                )}
                <option value="p:1">播放 1 次后暂停</option>
                <option value="p:3">播放 3 次后暂停</option>
              </select>
            </label>
            <button
              className="player-btn"
              onClick={() => (fullscreen ? void exitFullscreen() : void enterFullscreen())}
              aria-label={fullscreen ? "退出全屏" : "进入全屏"}
            >
              {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
            {nativePlayerActive && (
              <button
                className="player-btn"
                onClick={() => {
                  // 竖屏/横屏视频各用各的宽高比；原生状态缺失时退回 16:9。
                  const size = nativeVideoSizeRef.current;
                  const ratio = size && size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
                  void nativePlayerRef.current?.enterPictureInPicture(ratio);
                }}
                aria-label="画中画"
              >
                <PictureInPicture size={17} />
              </button>
            )}
          </div>
        </div>

        {!controlsVisible && (
          <div className="fb-player-mini-progress" aria-hidden="true">
            <span style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
          </div>
        )}

        {speedPill && (
          <div className="fb-player-speed-pill" role="status" aria-live="polite">
            三倍速中{">>"}
          </div>
        )}

        {/* 弹幕设置弹窗 */}
        {danmakuPrefsPanel}
        {/* 字幕菜单弹窗 */}
        {subtitlePanel}
      </div>

      {/* 详情区 */}
      <div className="fb-player-details">
        <div className="fb-player-details-inner">
          <h1 className="fb-player-title-lg">{video.title}</h1>

          <div className="fb-player-meta">
            <button
              type="button"
              className="fb-player-owner"
              disabled={video.ownerMid <= 0}
              onClick={() => openBilibiliCreator({ mid: video.ownerMid, name: video.ownerName, avatarUrl: video.ownerAvatarUrl, sign: "", officialDescription: "" })}
            >
              {video.ownerAvatarUrl ? (
                <img className="fb-player-avatar" src={video.ownerAvatarUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="fb-player-avatar"><UserRound size={17} /></span>
              )}
              <span>{video.ownerName}</span>
            </button>
            <span className="fb-player-meta-item"><Play size={12} /> {formatCount(video.stats.viewCount)}</span>
            <span className="fb-player-meta-item"><MessageSquare size={12} /> {formatCount(video.stats.danmakuCount)}</span>
            <button
              type="button"
              className="fb-player-meta-item fb-player-bvid-copy"
              onClick={() => void copyBvid()}
              title="点击复制 BV 号"
              aria-label={"复制 " + video.bvid}
            >
              {video.aid > 0 ? video.bvid + "  AV" + video.aid : video.bvid}
            </button>
          </div>

          {shareMessage && <p className="muted player-share-message" role="status">{shareMessage}</p>}
          {learningListMessage && <p className="muted player-share-message" role="status">{learningListMessage}</p>}

          <div className="fb-player-actions">
            <button className="m3-filled-btn" onClick={() => setShowFocusSheet(true)}>
              <Timer size={14} /> {focusTimer.hasActiveSession ? "关联专注" : "专注观看"}
            </button>
            <button className="m3-outlined-btn" onClick={() => void addCurrentPartToLearningList()}>
              <ListPlus size={14} /> 加入学习清单
            </button>
            <button className="m3-outlined-btn" onClick={() => void shareVideo()} aria-label="分享视频">
              <Share2 size={14} /> 分享
            </button>
            <a className="m3-outlined-btn" href={`https://www.bilibili.com/video/${video.bvid}`} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> 在 B 站打开
            </a>
            {video.collection && video.collection.entries.length > 0 && (
              <button className="m3-outlined-btn" onClick={() => setShowCollection(true)} aria-label="打开合集">
                <ListVideo size={14} /> 合集
              </button>
            )}
          </div>

          <KaoyanPlayerStudyLink title={video.title} />

          <PlayerChapterStrip
            chapters={enhancementMetadata.chapters}
            positionMs={currentTime * 1000}
            visible={chapterProgressVisible}
            onSeek={(seconds) => {
              if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.seek(seconds);
              playerControlRef.current?.seek(seconds);
              setCurrentTime(seconds);
            }}
          />

          {showChapterPanel && (
            <PlayerChapterPanel
              chapters={enhancementMetadata.chapters}
              positionMs={currentTime * 1000}
              chapterProgressVisible={chapterProgressVisible}
              onToggleChapterProgress={setChapterProgressVisible}
              onSeek={(seconds) => {
                if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.seek(seconds);
              playerControlRef.current?.seek(seconds);
                setCurrentTime(seconds);
              }}
              onClose={() => setShowChapterPanel(false)}
            />
          )}

          {video.description && (
            <>
              <p className={descriptionExpanded ? "fb-player-description" : "fb-player-description clamped"}>{video.description}</p>
              <button className="fb-player-description-toggle" onClick={() => setDescriptionExpanded((v) => !v)}>
                {descriptionExpanded ? "收起" : "展开"}
              </button>
            </>
          )}

          <div className="fb-player-stats-row">
            <div className="fb-player-stat"><ThumbsUp size={16} /><strong>{formatCount(video.stats.likeCount)}</strong><span>点赞</span></div>
            <div className="fb-player-stat"><Coins size={16} /><strong>{formatCount(video.stats.coinCount)}</strong><span>投币</span></div>
            <div className="fb-player-stat"><Star size={16} /><strong>{formatCount(video.stats.favoriteCount)}</strong><span>收藏</span></div>
            <div className="fb-player-stat"><Share2 size={16} /><strong>{formatCount(video.stats.shareCount)}</strong><span>分享</span></div>
          </div>

          {video.tags.length > 0 && (
            <div>
              <h3 className="fb-player-section-title">标签</h3>
              <div className="fb-player-chips">
                {video.tags.map((t) => (
                  <span key={t} className="chip"><Tag size={11} /> {t}</span>
                ))}
              </div>
            </div>
          )}



          {video.parts.length > 1 && (
            <section>
              <div className="fb-player-parts-head">
                <p>选集 · 共 {video.parts.length} 集</p>
                <button className="m3-outlined-btn" onClick={() => setShowPartSelector(true)} aria-label="展开选集">
                  <ListVideo size={14} /> 展开
                </button>
              </div>
              <div className="fb-player-chips">
                {video.parts.map((p) => (
                  <button key={p.cid} className={p.cid === activePartCid ? "chip active" : "chip"} onClick={() => selectPart(p)}>
                    P{p.pageNumber} · {p.title}
                  </button>
                ))}
              </div>
            </section>
          )}

          <hr className="fb-player-divider" />

          <section>
            <div className="fb-player-notes-head">
              <h2>时间点笔记</h2>
              <div className="row" style={{ gap: 6 }}>
                <span className="muted" style={{ fontSize: 12.5 }}>{notes.length} 条</span>
                <button
                  className="m3-outlined-btn"
                  onClick={() => downloadExportPackage(exportVideoNotes(notes, VideoNoteExportFormat.markdown, video.title))}
                  disabled={notes.length === 0}
                  aria-label="导出 Markdown 笔记"
                  title="导出 Markdown 笔记"
                >
                  <Download size={14} /> Markdown
                </button>
                <button
                  className="m3-outlined-btn"
                  onClick={() => downloadExportPackage(exportVideoNotes(notes, VideoNoteExportFormat.json, video.title))}
                  disabled={notes.length === 0}
                  aria-label="导出 JSON 笔记"
                  title="导出 JSON 笔记"
                >
                  <Download size={14} /> JSON
                </button>
              </div>
            </div>

            {notes.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>这个视频还没有笔记，先写下第一条吧。</p>
            ) : (
              <ul className="fb-player-note-strip">
                {notes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={n.id === editingNoteId ? "fb-player-note-chip active" : "fb-player-note-chip"}
                      onClick={() => selectNote(n)}
                    >
                      <strong>{n.title}</strong>
                      <span className="fb-player-note-time">{Math.floor(n.positionSeconds / 60)}:{String(n.positionSeconds % 60).padStart(2, "0")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="fb-player-note-composer-wrap">
              {noteFeedback && (
                <div className={noteFeedback.kind === "success" ? "fb-player-note-feedback" : "fb-player-note-feedback error"} role="status">
                  <span>{noteFeedback.text}</span>
                  {noteFeedback.undoNoteId && (
                    <button type="button" className="fb-player-note-undo" onClick={() => void undoLastNoteSave()}>
                      撤销
                    </button>
                  )}
                </div>
              )}
              <VideoNoteComposer
                title={noteTitle}
                body={noteBody}
                positionSeconds={editingNoteId ? notePositionSeconds : Math.max(0, Math.floor(currentTime))}
                partPageNumber={findNotePart(notePartCid)?.pageNumber}
                createdAt={editingNoteId ? notes.find((n) => n.id === editingNoteId)?.createdAt : undefined}
                framePath={noteFramePath}
                includeFrame={includeNoteFrame}
                saving={noteSaving}
                borderless
                onTitleChange={(value) => { setNoteTitle(value); scheduleNoteAutoSave(); }}
                onBodyChange={(value) => { setNoteBody(value); scheduleNoteAutoSave(); }}
                onIncludeFrameChange={(value) => { setIncludeNoteFrame(value); scheduleNoteAutoSave(); }}
                onSave={() => void saveNote()}
                onNew={startNewNote}
                onClose={startNewNote}
                onJumpToPosition={editingNoteId ? () => void jumpToNotePosition() : undefined}
                onDelete={editingNoteId ? () => setConfirmDeleteNote(true) : undefined}
              />
            </div>
          </section>
        </div>
      </div>
      {showLeaveInterruptionFlow && (
        <FocusInterruptionFlow
          kind={FocusInterruptionKind.playerExit}
          onDone={(interrupted) => {
            setShowLeaveInterruptionFlow(false);
            if (!interrupted) return;
            void exitFullscreen();
            void saveFocusLastSeen();
            setView("library");
          }}
        />
      )}
      {associationPromptSessionId && focusTimer.activeSession?.id === associationPromptSessionId && (
        <M3Dialog
          title={`是否将"${focusTimer.activeSession.goal}"关联到当前播放的视频？`}
          onClose={dismissFocusAssociationPrompt}
          actions={
            <>
              <button className="m3-text-btn" onClick={dismissFocusAssociationPrompt}>取消</button>
              <button className="m3-filled-btn" onClick={() => void confirmFocusAssociationPrompt()}>关联</button>
            </>
          }
        >
          {video.title} · P{part.pageNumber} {part.title}
        </M3Dialog>
      )}
      {confirmDeleteNote && (
        <M3Dialog
          title="删除笔记"
          onClose={() => setConfirmDeleteNote(false)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setConfirmDeleteNote(false)}>取消</button>
              <button className="m3-filled-btn" onClick={() => void deleteEditingNote()}>删除</button>
            </>
          }
        >
          确定删除"{noteTitle || "未命名笔记"}"吗？此操作无法撤销。
        </M3Dialog>
      )}
      {showCollection && video.collection && (
        <PlayerCollectionSheet
          collection={video.collection}
          currentBvid={video.bvid}
          onClose={() => setShowCollection(false)}
          onOpenVideo={(nextBvid, title) => useAppStore.getState().openBilibiliVideo(nextBvid, title)}
          onAddToLearningList={(entry) => void addCollectionEntryToLearningList(entry)}
        />
      )}
      {showPartSelector && (
        <PlayerPartSelector
          parts={video.parts}
          currentCid={part.cid}
          onClose={() => setShowPartSelector(false)}
          onSelect={selectPart}
        />
      )}
      {showFocusSheet && (
        <PlayerFocusSheet
          defaultGoal={`${video.title} · P${part.pageNumber} ${part.title}`.trim()}
          partRemainingSeconds={Math.max(0, duration - currentTime)}
          bvid={video.bvid}
          videoTitle={video.title}
          partCid={part.cid}
          partPageNumber={part.pageNumber}
          partTitle={part.title}
          videoIsPlaying={playing}
          sourcePositionMs={Math.round(currentTime * 1000)}
          onClose={() => setShowFocusSheet(false)}
        />
      )}
    </div>
  );
}

function drawDanmaku(
  ctx: CanvasRenderingContext2D,
  entries: Array<{ text: string; mode: DanmakuMode; color: number; fontSize: number; lane: number; renderedStartSeconds: number; startTimeSeconds: number; durationSeconds: number }>,
  currentTime: number,
  metrics: { canvasWidth: number; canvasHeight: number; fontSize: number; displayArea: number; scrollDurationSeconds: number },
  preferences: { opacity: number; strokeWidth: number },
) {
  const laneHeight = metrics.fontSize + 4;
  // 与调度器使用同一滚动时长，避免轨道间隔与实际动画速度不一致造成同轨重叠。
  const travelSeconds = metrics.scrollDurationSeconds;
  ctx.font = `${metrics.fontSize}px -apple-system, "SF Pro Text", "Segoe UI Variable", system-ui, sans-serif`;
  ctx.textBaseline = "top";
  ctx.globalAlpha = Math.max(0, Math.min(1, preferences.opacity));
  for (const entry of entries) {
    const elapsed = currentTime - entry.renderedStartSeconds;
    if (elapsed < 0 || elapsed > entry.durationSeconds) continue;
    let x: number;
    let y: number;
    if (entry.mode === DanmakuMode.scrolling) {
      const progress = elapsed / travelSeconds;
      const textWidth = ctx.measureText(entry.text).width;
      x = metrics.canvasWidth - progress * (metrics.canvasWidth + textWidth);
      y = entry.lane * laneHeight;
    } else if (entry.mode === DanmakuMode.top) {
      x = (metrics.canvasWidth - ctx.measureText(entry.text).width) / 2;
      y = entry.lane * laneHeight;
    } else if (entry.mode === DanmakuMode.bottom) {
      x = (metrics.canvasWidth - ctx.measureText(entry.text).width) / 2;
      y = metrics.canvasHeight * metrics.displayArea - (entry.lane + 1) * laneHeight;
    } else {
      continue;
    }
    const color = `#${entry.color.toString(16).padStart(6, "0")}`;
    if (preferences.strokeWidth > 0) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
      ctx.lineWidth = preferences.strokeWidth;
      ctx.lineJoin = "round";
      ctx.strokeText(entry.text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(entry.text, x, y);
  }
  ctx.globalAlpha = 1;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
  return String(n);
}

function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function BilibiliPlayerRoute() {
  const resources = useAppStore((state) => state.resources);
  const activeBilibiliBvid = useAppStore((state) => state.activeBilibiliBvid);
  const activeBilibiliPlaybackTarget = useAppStore((state) => state.activeBilibiliPlaybackTarget);
  const selectedBvid = activeBilibiliBvid ?? resources.find((r) => r.status === "in-progress")?.bvid ?? resources[0]?.bvid;
  if (!selectedBvid) {
    return (
      <div className="stack">
        <section className="card">
          <p className="muted">还没有可播放的视频，先去资料库添加一个。</p>
        </section>
      </div>
    );
  }
  return <BilibiliPlayerView bvid={selectedBvid} initialPlaybackTarget={activeBilibiliPlaybackTarget} key={`${selectedBvid}:${activeBilibiliPlaybackTarget?.cid ?? 0}:${activeBilibiliPlaybackTarget?.seconds ?? 0}`} />;
}
