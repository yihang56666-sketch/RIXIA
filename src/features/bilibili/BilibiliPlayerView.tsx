import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Captions,
  Download,
  Share2,
  ExternalLink,
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
} from "lucide-react";
import { createBilibiliPublicContentService } from "../../lib/bilibili/publicContentService";
import { createDanmakuFetchService } from "../../lib/bilibili/danmakuFetchService";
import { DanmakuRenderer } from "../../lib/bilibili/danmakuRenderer";
import {
  createDanmakuPreferencesService,
  createVideoNoteService,
} from "../../lib/bilibili/services";
import type {
  DanmakuEntry,
  DanmakuPreferences,
  VideoNote,
  VideoPreview,
} from "../../lib/bilibili/types";
import { DEFAULT_DANMAKU_PREFERENCES, DanmakuMode } from "../../lib/bilibili/types";
import { BilibiliIframeBridge } from "../../lib/bilibili/iframeBridge";
import { GestureCoordinator } from "../../lib/bilibili/gestureCoordinator";
import { createJsonRequest } from "../../lib/bilibili/httpAdapter";
import {
  createNativeMediaPlayer,
  isAndroidNativeMediaPlayerAvailable,
  type NativeDanmakuEntry,
  type NativeMediaPlayer,
} from "../../lib/bilibili/nativeMediaPlayer";
import { createPlayurlService } from "../../lib/bilibili/playurlService";
import { openNativePlaybackWithRefresh } from "../../lib/bilibili/playbackSourcePolicy";
import { createPlaybackProgressStore } from "../../lib/bilibili/playbackProgress";
import { choosePlaybackQuality, qualityLabel } from "../../lib/bilibili/qualityPolicy";
import { createId } from "../../lib/id";
import { relativeTime } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";
import { useFocusTimer } from "./useFocusTimer";
import { buildVideoFocusRequest } from "../../lib/bilibili/focusPlaybackPolicy";
import { shouldPauseForSleepTimer, shouldRestartLoop } from "../../lib/bilibili/playbackControlPolicy";
import { createSubtitleService, type SubtitleCue, type SubtitleTrack } from "../../lib/bilibili/subtitleService";
import { downloadExportPackage, exportVideoNotes, VideoNoteExportFormat } from "../../lib/bilibili/miscServices";
import { captureVideoShotFrame, createBilibiliVideoShotService } from "../../lib/bilibili/videoShotService";
import { frameForPosition, type VideoShotFrame, type VideoShotPreview } from "../../lib/bilibili/extendedModels";
import { createMediaSessionService } from "../../lib/bilibili/mediaSessionService";

/**
 * RIXIA 内嵌 B 站播放器 — 复刻 FocuBili 的 player_page.dart：
 * - 通过官方 embed iframe 播放视频
 * - 同时单独加载弹幕 XML，在 canvas 上渲染滚动/顶部/底部弹幕
 * - 支持时间点笔记（save / list）
 * - 支持分 P 切换
 * - 弹幕偏好（字号、不透明度、显示区域、屏蔽词等）
 *
 * 与 FocuBili 的差异：
 * - 视频帧由 B 站官方 iframe 渲染，弹幕在 iframe 之上的覆盖层 canvas 渲染
 * - 时间轴同步通过 postMessage 请求 iframe 当前时间，回退为本地估算
 */
export function BilibiliPlayerView({ bvid }: { bvid: string }) {
  const service = useMemo(() => createBilibiliPublicContentService(), []);
  const danmakuService = useMemo(() => createDanmakuFetchService(), []);
  const danmakuPreferencesService = useMemo(() => createDanmakuPreferencesService(), []);
  const videoNoteService = useMemo(() => createVideoNoteService(), []);
  const playbackProgressStore = useMemo(() => createPlaybackProgressStore(), []);
  const subtitleService = useMemo(() => createSubtitleService(), []);
  const videoShotService = useMemo(() => createBilibiliVideoShotService(), []);
  const mediaSession = useMemo(() => createMediaSessionService(), []);
  const setView = useAppStore((state) => state.setView);
  const focusTimer = useFocusTimer();
  const updateResourceProgress = useAppStore((state) => state.updateResourceProgress);

  const [video, setVideo] = useState<VideoPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [danmaku, setDanmaku] = useState<DanmakuEntry[]>([]);
  const [prefs, setPrefs] = useState<DanmakuPreferences>(DEFAULT_DANMAKU_PREFERENCES);
  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [activePartCid, setActivePartCid] = useState<number | null>(null);
  const [requestedQuality, setRequestedQuality] = useState(80);
  const [qualityOptions, setQualityOptions] = useState<number[]>([]);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerPlays, setSleepTimerPlays] = useState<number | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<number | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [showSubtitles, setShowSubtitles] = useState(false);
  const [subtitleLoading, setSubtitleLoading] = useState(false);
  const [shotPreview, setShotPreview] = useState<VideoShotPreview | null>(null);
  const [hoveredFrame, setHoveredFrame] = useState<VideoShotFrame | null>(null);
  const [shareMessage, setShareMessage] = useState("");

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const rendererRef = useRef<DanmakuRenderer | null>(null);
  const animationRef = useRef<number | null>(null);
  const bridgeRef = useRef<BilibiliIframeBridge | null>(null);
  const gestureRefCoordinator = useRef<GestureCoordinator | null>(null);
  const nativePlayerRef = useRef<NativeMediaPlayer | null>(null);
  const resumedPositionRef = useRef(0);
  const completedFocusPartRef = useRef<string | null>(null);
  const loopRestartInFlightRef = useRef(false);
  const sleepDeadlineRef = useRef<number | null>(null);
  const [nativePlayerActive, setNativePlayerActive] = useState(false);
  const shouldUseNativePlayer = isAndroidNativeMediaPlayerAvailable();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    service.lookupVideo(bvid).then((v) => {
      if (cancelled) return;
      setVideo(v);
      setActivePartCid(v.cid);
      setDuration(v.durationSeconds);
      setLoading(false);
      videoNoteService.listByVideo(v.bvid).then((n) => !cancelled && setNotes(n));
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "加载失败");
      setLoading(false);
    });
    danmakuPreferencesService.load().then((p) => !cancelled && setPrefs(p));
    return () => { cancelled = true; };
  }, [bvid, service, danmakuPreferencesService, videoNoteService]);

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
    if (!video || activePartCid == null) return;
    const saved = playbackProgressStore.load(video.bvid, activePartCid);
    const position = saved?.positionSeconds ?? 0;
    resumedPositionRef.current = position;
    setCurrentTime(position);
  }, [activePartCid, playbackProgressStore, video?.bvid]);

  useEffect(() => {
    if (!video || activePartCid == null || duration <= 0) return;
    const timer = window.setTimeout(() => {
      playbackProgressStore.save(video.bvid, activePartCid, currentTime, duration);
      const resource = useAppStore.getState().resources.find((item) => item.bvid === video.bvid);
      if (resource) updateResourceProgress(resource.id, currentTime, duration);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [activePartCid, currentTime, duration, playbackProgressStore, updateResourceProgress, video?.bvid]);

  // Android uses Media3 for Bilibili's separate DASH video/audio tracks. The
  // iframe stays as a browser and native-plugin fallback when either endpoint fails.
  useEffect(() => {
    if (!shouldUseNativePlayer || !video || activePartCid == null || !overlayRef.current) return;
    let cancelled = false;
    let removeListener: (() => Promise<void>) | null = null;
    const nativePlayer = createNativeMediaPlayer();
    nativePlayerRef.current = nativePlayer;

    const syncBounds = async () => {
      const bounds = overlayRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      await nativePlayer.setBounds({
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      });
    };

    const start = async () => {
      await nativePlayer.initialize();
      removeListener = await nativePlayer.onStateChange((state) => {
        if (cancelled) return;
        setCurrentTime(state.positionSeconds);
        if (state.durationSeconds > 0) setDuration(state.durationSeconds);
        setPlaying(state.isPlaying);
      });
      await syncBounds();
      const playurlService = createPlayurlService(createJsonRequest());
      if (cancelled) return;
      const response = await openNativePlaybackWithRefresh({
        resolve: () => playurlService.resolve(video.bvid, activePartCid, { qn: requestedQuality }),
        open: (videoUrl, audioUrl) => nativePlayer.open({
          bvid: video.bvid,
          cid: activePartCid,
          videoUrl,
          audioUrl,
          positionSeconds: resumedPositionRef.current,
          title: video.title,
        }),
      });
      const effectiveQuality = choosePlaybackQuality(requestedQuality, response.acceptQuality);
      if (!cancelled) {
        setQualityOptions(response.acceptQuality);
        if (effectiveQuality !== requestedQuality) setRequestedQuality(effectiveQuality);
      }
      if (!cancelled) setNativePlayerActive(true);
    };

    const onLayoutChange = () => { void syncBounds(); };
    const resizeObserver = new ResizeObserver(onLayoutChange);
    resizeObserver.observe(overlayRef.current);
    window.addEventListener("scroll", onLayoutChange, true);
    window.addEventListener("resize", onLayoutChange);
    start().catch(() => {
      if (!cancelled) setNativePlayerActive(false);
    });

    return () => {
      cancelled = true;
      setNativePlayerActive(false);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onLayoutChange, true);
      window.removeEventListener("resize", onLayoutChange);
      void removeListener?.();
      void nativePlayer.dispose();
      if (nativePlayerRef.current === nativePlayer) nativePlayerRef.current = null;
    };
  }, [activePartCid, requestedQuality, shouldUseNativePlayer, video]);

  useEffect(() => {
    if (!nativePlayerActive || !nativePlayerRef.current) return;
    const entries: NativeDanmakuEntry[] = danmaku.map((entry) => ({
      text: entry.text,
      startTimeSeconds: entry.startTimeSeconds,
      mode: entry.mode,
      color: entry.color,
      durationSeconds: entry.durationSeconds,
    }));
    void nativePlayerRef.current.setDanmaku(entries);
  }, [danmaku, nativePlayerActive]);

  // 初始化弹幕渲染器
  useEffect(() => {
    if (!overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = rect.width;
    canvas.height = rect.height;
    rendererRef.current = new DanmakuRenderer({
      canvasWidth: rect.width,
      canvasHeight: rect.height,
      preferences: prefs,
    });
  }, [prefs]);

  // 启动 iframe postMessage 桥，用真实播放器时间同步弹幕
  useEffect(() => {
    if (nativePlayerActive || !iframeRef.current) return;
    const bridge = new BilibiliIframeBridge({
      iframe: iframeRef.current,
      onTime: (t) => setCurrentTime(t),
      onDuration: (d) => setDuration(d),
      onStateChange: (s) => setPlaying(s === "playing"),
    });
    bridgeRef.current = bridge;
    bridge.start();
    const restoreTimer = window.setTimeout(() => {
      if (resumedPositionRef.current > 0) bridge.seek(resumedPositionRef.current);
    }, 500);
    return () => {
      window.clearTimeout(restoreTimer);
      bridge.stop();
      bridgeRef.current = null;
    };
  }, [video?.bvid, activePartCid, nativePlayerActive]);

  // 启动手势协调器
  useEffect(() => {
    if (!gestureRef.current) return;
    const coord = new GestureCoordinator({
      element: gestureRef.current,
      onSeek: (delta) => {
        if (nativePlayerActive && nativePlayerRef.current) {
          const target = Math.max(0, Math.min(duration, currentTime + delta));
          void nativePlayerRef.current.seek(target);
          setCurrentTime(target);
          return;
        }
        const current = bridgeRef.current?.getCurrentTime() ?? currentTime;
        const target = Math.max(0, Math.min(duration, current + delta));
        bridgeRef.current?.seek(target);
        setCurrentTime(target);
      },
      onSeekAbsolute: (time) => {
        if (nativePlayerActive && nativePlayerRef.current) {
          void nativePlayerRef.current.seek(time);
          setCurrentTime(time);
          return;
        }
        bridgeRef.current?.seek(time);
        setCurrentTime(time);
      },
      onTogglePlay: () => {
        if (nativePlayerActive && nativePlayerRef.current) {
          if (playing) void nativePlayerRef.current.pause();
          else void nativePlayerRef.current.play();
          setPlaying(!playing);
          return;
        }
        if (playing) {
          bridgeRef.current?.pause();
          setPlaying(false);
        } else {
          bridgeRef.current?.play();
          setPlaying(true);
        }
      },
      onVolume: (delta) => {
        const next = Math.max(0, Math.min(1, (muted ? 0 : 0.8) + delta));
        if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.setVolume(next);
        bridgeRef.current?.setVolume(next);
        setMuted(next === 0);
      },
      onTap: () => {
        setShowPrefs(false);
      },
      getCurrentTime: () => bridgeRef.current?.getCurrentTime() ?? currentTime,
      getDuration: () => duration,
    });
    gestureRefCoordinator.current = coord;
    return () => {
      coord.destroy();
      gestureRefCoordinator.current = null;
    };
  }, [currentTime, duration, playing, muted, nativePlayerActive]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === " ") {
        event.preventDefault();
        if (playing) {
          if (nativePlayerActive) void nativePlayerRef.current?.pause();
          else bridgeRef.current?.pause();
          setPlaying(false);
        } else {
          if (nativePlayerActive) void nativePlayerRef.current?.play();
          else bridgeRef.current?.play();
          setPlaying(true);
        }
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const next = Math.max(0, Math.min(duration, currentTime + (event.key === "ArrowLeft" ? -10 : 10)));
        if (nativePlayerActive) void nativePlayerRef.current?.seek(next);
        bridgeRef.current?.seek(next);
        setCurrentTime(next);
      } else if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        const nextMuted = !muted;
        if (nativePlayerActive) void nativePlayerRef.current?.setVolume(nextMuted ? 0 : 0.8);
        bridgeRef.current?.setVolume(nextMuted ? 0 : 0.8);
        setMuted(nextMuted);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void overlayRef.current?.requestFullscreen?.();
      } else if (event.key === "Escape" && document.fullscreenElement) {
        void document.exitFullscreen?.();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentTime, duration, muted, nativePlayerActive, playing]);

  // 动画循环：每帧根据 currentTime（来自 iframe 桥）渲染弹幕
  useEffect(() => {
    if (danmaku.length === 0) return;
    function tick() {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // currentTime 由 iframe 桥驱动；这里直接读取 bridge 的精确值
      const t = nativePlayerActive ? currentTime : (bridgeRef.current?.getCurrentTime() ?? currentTime);
      const visible = renderer.schedule(danmaku, t);
      drawDanmaku(ctx, visible, t, renderer.getMetrics());
      animationRef.current = requestAnimationFrame(tick);
    }
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current != null) cancelAnimationFrame(animationRef.current);
    };
  }, [danmaku, currentTime, nativePlayerActive]);

  // Couple both native and iframe playback to the global focus session.
  useEffect(() => {
    if (!video || activePartCid == null) return;
    void focusTimer.updatePlaybackState({ bvid: video.bvid, partCid: activePartCid, isPlaying: playing });
  }, [activePartCid, focusTimer.updatePlaybackState, playing, video?.bvid]);

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
          else bridgeRef.current?.play();
          setPlaying(true);
        },
        pause: () => {
          if (nativePlayerActive) void nativePlayerRef.current?.pause();
          else bridgeRef.current?.pause();
          setPlaying(false);
        },
        seekBy: (delta) => {
          const next = Math.max(0, Math.min(duration, currentTime + delta));
          if (nativePlayerActive) void nativePlayerRef.current?.seek(next);
          else bridgeRef.current?.seek(next);
          setCurrentTime(next);
        },
      },
    });
  }, [currentTime, duration, mediaSession, nativePlayerActive, playing, video]);

  useEffect(() => () => mediaSession.clear(), [mediaSession]);

  useEffect(() => {
    if (!video || activePartCid == null || duration <= 0 || playing || currentTime < duration - 0.5) return;
    const partKey = `${video.bvid}:${activePartCid}`;
    if (completedFocusPartRef.current === partKey) return;
    completedFocusPartRef.current = partKey;
    void focusTimer.completeForPlaybackPart({ bvid: video.bvid, partCid: activePartCid });
  }, [activePartCid, currentTime, duration, focusTimer.completeForPlaybackPart, playing, video?.bvid]);

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
    bridgeRef.current?.pause();
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
          bridgeRef.current?.seek(0);
          bridgeRef.current?.play();
        }
        setCurrentTime(0);
        setPlaying(true);
      } finally {
        loopRestartInFlightRef.current = false;
      }
    };
    void restart();
  }, [activePartCid, currentTime, duration, loopEnabled, nativePlayerActive, playing, sleepTimerPlays, video]);

  async function saveNote() {
    if (!video) return;
    if (!noteBody.trim()) return;
    const frame = shotPreview ? frameForPosition(shotPreview, currentTime * 1000) : null;
    const framePath = frame ? await captureVideoShotFrame(frame) : null;
    const note: VideoNote = {
      id: createId(),
      bvid: video.bvid,
      videoTitle: video.title,
      ownerName: video.ownerName,
      partCid: activePartCid ?? video.cid,
      partPageNumber: video.parts.find((p) => p.cid === activePartCid)?.pageNumber ?? 1,
      partTitle: video.parts.find((p) => p.cid === activePartCid)?.title ?? video.title,
      title: noteBody.trim().split("\n")[0]!,
      body: noteBody.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      positionSeconds: Math.floor(currentTime),
      videoCoverUrl: video.thumbnailUrl,
      ...(framePath ? { framePath } : {}),
    };
    await videoNoteService.save(note);
    setNotes([...notes, note]);
    setNoteBody("");
  }

  function updatePrefs(patch: Partial<DanmakuPreferences>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    danmakuPreferencesService.save(next);
  }

  if (loading) {
    return (
      <div className="stack">
        <section className="card"><Loader2 className="spin" /> 加载中…</section>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="stack">
        <button className="ghost-btn compact" onClick={() => setView("library")}>
          <ArrowLeft size={15} /> 返回资料库
        </button>
        <section className="card">
          <p className="background-error">{error || "未找到视频"}</p>
        </section>
      </div>
    );
  }

  const part = video.parts.find((p) => p.cid === activePartCid) ?? video.parts[0]!;
  const currentVideo = video;
  async function startOrAssociateFocus() {
    const request = buildVideoFocusRequest({
      bvid: currentVideo.bvid,
      title: currentVideo.title,
      cid: part.cid,
      pageNumber: part.pageNumber,
      partTitle: part.title,
    }, playing, currentTime);
    if (focusTimer.hasActiveSession) {
      await focusTimer.associateVideo({
        bvid: currentVideo.bvid,
        videoTitle: currentVideo.title,
        partCid: part.cid,
        partPageNumber: part.pageNumber,
        partTitle: part.title,
        isPlaying: playing,
        positionMs: request.sourcePositionMs,
      });
    } else {
      await focusTimer.startFocus(request);
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
    bridgeRef.current?.send("setPlaybackRate", { rate: value });
  }
  async function shareVideo() {
    const url = `https://www.bilibili.com/video/${video?.bvid}`;
    if (!video) return;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: video.title, text: `${video.title} · FocuBili`, url });
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
  function previewAt(clientX: number, input: HTMLInputElement) {
    if (!shotPreview || duration <= 0) return;
    const rect = input.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    setHoveredFrame(frameForPosition(shotPreview, ratio * duration * 1000));
  }
  const activeSubtitle = showSubtitles && selectedSubtitleId !== null
    ? subtitleCues.find((cue) => currentTime >= cue.from && currentTime <= cue.to)?.content ?? ""
    : "";
  const iframeUrl = `https://player.bilibili.com/player.html?bvid=${video.bvid}&cid=${part.cid}&page=${part.pageNumber}&high_quality=1&danmaku=0&autoplay=${playing ? 1 : 0}`;

  return (
    <div className="stack">
      <button className="ghost-btn compact" onClick={() => setView("library")}>
        <ArrowLeft size={15} /> 返回资料库
      </button>

      <section className="card bilibili-player">
        <div className="row" style={{ marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{video.title}</h2>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {video.ownerName} · {video.parts.length} P · {Math.floor(video.durationSeconds / 60)} 分钟
            </p>
          </div>
          <a className="ghost-btn compact" href={`https://www.bilibili.com/video/${video.bvid}`} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> 在 B 站打开
          </a>
          <button className="ghost-btn compact" onClick={() => void startOrAssociateFocus()}>
            <Timer size={14} /> {focusTimer.hasActiveSession ? "关联专注" : "专注观看"}
          </button>
          <button className="ghost-btn compact" onClick={() => void shareVideo()} aria-label="分享视频">
            <Share2 size={14} /> 分享
          </button>
        </div>
        {shareMessage && <p className="muted player-share-message" role="status">{shareMessage}</p>}

        <div className="player-wrap" ref={overlayRef}>
          {!nativePlayerActive && (
            <iframe
              ref={iframeRef}
              src={iframeUrl}
              title={video.title}
              className="player-frame"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          )}
          <canvas ref={canvasRef} className="player-danmaku-canvas" />
          {activeSubtitle && <div className="player-subtitle-overlay" aria-live="polite">{activeSubtitle}</div>}
          <div ref={gestureRef} className="player-gesture-overlay" />
        </div>

        {/* 自定义控制条 */}
        <div className="player-controls">
          <button
            className="player-btn"
            onClick={() => {
              if (playing) {
                if (nativePlayerActive && nativePlayerRef.current) {
                  void nativePlayerRef.current.pause();
                  setPlaying(false);
                  return;
                }
                bridgeRef.current?.pause();
                setPlaying(false);
              } else {
                if (nativePlayerActive && nativePlayerRef.current) {
                  void nativePlayerRef.current.play();
                  setPlaying(true);
                  return;
                }
                bridgeRef.current?.play();
                setPlaying(true);
              }
            }}
            aria-label={playing ? "暂停" : "播放"}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            className="player-btn"
            onClick={() => {
              const t = Math.max(0, currentTime - 10);
              if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.seek(t);
              bridgeRef.current?.seek(t);
              setCurrentTime(t);
            }}
            aria-label="后退 10 秒"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="player-btn"
            onClick={() => {
              const t = Math.min(duration, currentTime + 10);
              if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.seek(t);
              bridgeRef.current?.seek(t);
              setCurrentTime(t);
            }}
            aria-label="前进 10 秒"
          >
            <ChevronRight size={16} />
          </button>
          <div className="player-seek-wrap">
          {hoveredFrame && <div
            className="player-shot-preview"
            style={{
              width: hoveredFrame.frameWidth,
              height: hoveredFrame.frameHeight,
              backgroundImage: `url(${hoveredFrame.imageUrl})`,
              backgroundSize: `${hoveredFrame.sheetColumns * hoveredFrame.frameWidth}px ${hoveredFrame.sheetRows * hoveredFrame.frameHeight}px`,
              backgroundPosition: `-${hoveredFrame.column * hoveredFrame.frameWidth}px -${hoveredFrame.row * hoveredFrame.frameHeight}px`,
            }}
            aria-hidden="true"
          />}
          <input
            type="range"
            className="player-seek"
            min={0}
            max={duration}
            value={currentTime}
            onChange={(e) => {
              const t = Number(e.target.value);
              if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.seek(t);
              bridgeRef.current?.seek(t);
              setCurrentTime(t);
            }}
            onMouseMove={(e) => previewAt(e.clientX, e.currentTarget)}
            onMouseLeave={() => setHoveredFrame(null)}
            onTouchMove={(e) => previewAt(e.touches[0]?.clientX ?? 0, e.currentTarget)}
          />
          </div>
          <span className="player-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <button
            className="player-btn"
            onClick={() => {
              setMuted((m) => {
                const next = !m;
                if (nativePlayerActive && nativePlayerRef.current) void nativePlayerRef.current.setVolume(next ? 0 : 0.8);
                bridgeRef.current?.setVolume(next ? 0 : 0.8);
                return next;
              });
            }}
            aria-label={muted ? "取消静音" : "静音"}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          {nativePlayerActive && qualityOptions.length > 1 && (
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
            <Repeat size={16} />
          </button>
          <label className="player-sleep-control">
            <Moon size={14} />
            <select
              aria-label="定时关闭"
              value={sleepTimerMinutes !== null ? `m:${sleepTimerMinutes}` : sleepTimerPlays !== null ? `p:${sleepTimerPlays}` : "off"}
              onChange={(event) => configureSleepTimer(event.target.value)}
            >
              <option value="off">定时关闭</option>
              <option value="m:15">15 分钟后暂停</option>
              <option value="m:30">30 分钟后暂停</option>
              <option value="m:60">60 分钟后暂停</option>
              <option value="p:1">播放 1 次后暂停</option>
              <option value="p:3">播放 3 次后暂停</option>
            </select>
          </label>
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
          <button
            className={`player-btn${showSubtitles && selectedSubtitleId !== null ? " active" : ""}`}
            onClick={() => setShowSubtitles((visible) => !visible)}
            aria-label={showSubtitles ? "关闭字幕" : "字幕"}
            title={subtitleLoading ? "正在读取字幕" : subtitleTracks.length === 0 ? "暂无字幕" : "字幕"}
            disabled={subtitleTracks.length === 0}
          >
            <Captions size={16} />
          </button>
          <button
            className="player-btn"
            onClick={() => setShowPrefs((s) => !s)}
            aria-label="弹幕设置"
          >
            <Settings2 size={16} />
          </button>
          {nativePlayerActive && (
            <button
              className="player-btn"
              onClick={() => void nativePlayerRef.current?.enterPictureInPicture(16 / 9)}
              aria-label="画中画"
            >
              <PictureInPicture size={16} />
            </button>
          )}
        </div>

        {showPrefs && (
          <div className="player-prefs">
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
              <span>屏蔽词（逗号分隔）</span>
              <input
                type="text"
                value={prefs.blockedKeywords.join(",")}
                onChange={(e) => updatePrefs({ blockedKeywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              />
            </label>
          </div>
        )}

        {showSubtitles && subtitleTracks.length > 0 && (
          <div className="player-subtitle-menu">
            <label>
              <span>字幕轨道</span>
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
        )}

        {video.parts.length > 1 && (
          <div className="bilibili-parts" style={{ marginTop: 10 }}>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>分 P</p>
            <div className="chip-row">
              {video.parts.map((p) => (
                <button
                  key={p.cid}
                  className={p.cid === activePartCid ? "chip active" : "chip"}
                  onClick={() => { completedFocusPartRef.current = null; resumedPositionRef.current = 0; setActivePartCid(p.cid); setCurrentTime(0); }}
                >
                  P{p.pageNumber} · {p.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {video.tags.length > 0 && (
          <div className="bilibili-tags" style={{ marginTop: 10 }}>
            {video.tags.map((t) => (
              <span key={t} className="chip"><Tag size={11} /> {t}</span>
            ))}
          </div>
        )}

        {video.description && (
          <p className="muted bilibili-description" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>
            {video.description}
          </p>
        )}
      </section>

      <section className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2>时间点笔记</h2>
          <div className="row" style={{ gap: 6 }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{notes.length} 条</span>
            <button
              className="ghost-btn compact"
              onClick={() => downloadExportPackage(exportVideoNotes(notes, VideoNoteExportFormat.markdown, video.title))}
              disabled={notes.length === 0}
              aria-label="导出 Markdown 笔记"
              title="导出 Markdown 笔记"
            >
              <Download size={14} /> Markdown
            </button>
            <button
              className="ghost-btn compact"
              onClick={() => downloadExportPackage(exportVideoNotes(notes, VideoNoteExportFormat.json, video.title))}
              disabled={notes.length === 0}
              aria-label="导出 JSON 笔记"
              title="导出 JSON 笔记"
            >
              <Download size={14} /> JSON
            </button>
          </div>
        </div>
        <div className="bilibili-note-input">
          <input
            className="field"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="记下当前时间点的关键内容…"
          />
          <input
            type="number"
            className="field bilibili-note-seconds"
            value={Math.floor(currentTime)}
            onChange={(e) => setCurrentTime(Number(e.target.value) || 0)}
            min={0}
          />
          <button className="primary compact" onClick={saveNote} disabled={!noteBody.trim()}>
            保存
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5 }}>还没有时间点笔记</p>
        ) : (
          <ul className="bilibili-note-list">
            {notes.map((n) => (
              <li key={n.id}>
                <span className="bilibili-note-time">{Math.floor(n.positionSeconds / 60)}:{String(n.positionSeconds % 60).padStart(2, "0")}</span>
                <div>
                  <p>{n.body}</p>
                  <p className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{relativeTime(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function drawDanmaku(
  ctx: CanvasRenderingContext2D,
  entries: Array<{ text: string; mode: DanmakuMode; color: number; fontSize: number; lane: number; renderedStartSeconds: number; startTimeSeconds: number; durationSeconds: number }>,
  currentTime: number,
  metrics: { canvasWidth: number; canvasHeight: number; fontSize: number; displayArea: number },
) {
  const laneHeight = metrics.fontSize + 4;
  const travelSeconds = 9;
  ctx.font = `${metrics.fontSize}px -apple-system, "SF Pro Text", "Segoe UI Variable", system-ui, sans-serif`;
  ctx.textBaseline = "top";
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
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.lineWidth = 2;
    ctx.strokeText(entry.text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(entry.text, x, y);
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function BilibiliPlayerRoute() {
  const resources = useAppStore((state) => state.resources);
  const activeBilibiliBvid = useAppStore((state) => state.activeBilibiliBvid);
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
  return <BilibiliPlayerView bvid={selectedBvid} key={selectedBvid} />;
}
