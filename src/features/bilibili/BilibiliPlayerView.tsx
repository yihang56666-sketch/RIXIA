import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Settings2,
  Tag,
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
import { createId } from "../../lib/id";
import { relativeTime } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

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
  const setView = useAppStore((state) => state.setView);

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

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const rendererRef = useRef<DanmakuRenderer | null>(null);
  const animationRef = useRef<number | null>(null);
  const bridgeRef = useRef<BilibiliIframeBridge | null>(null);
  const gestureRefCoordinator = useRef<GestureCoordinator | null>(null);

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
    if (!iframeRef.current) return;
    const bridge = new BilibiliIframeBridge({
      iframe: iframeRef.current,
      onTime: (t) => setCurrentTime(t),
      onDuration: (d) => setDuration(d),
      onStateChange: (s) => setPlaying(s === "playing"),
    });
    bridgeRef.current = bridge;
    bridge.start();
    return () => {
      bridge.stop();
      bridgeRef.current = null;
    };
  }, [video?.bvid, activePartCid]);

  // 启动手势协调器
  useEffect(() => {
    if (!gestureRef.current) return;
    const coord = new GestureCoordinator({
      element: gestureRef.current,
      onSeek: (delta) => {
        const current = bridgeRef.current?.getCurrentTime() ?? currentTime;
        const target = Math.max(0, Math.min(duration, current + delta));
        bridgeRef.current?.seek(target);
        setCurrentTime(target);
      },
      onSeekAbsolute: (time) => {
        bridgeRef.current?.seek(time);
        setCurrentTime(time);
      },
      onTogglePlay: () => {
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
  }, [currentTime, duration, playing, muted]);

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
      const t = bridgeRef.current?.getCurrentTime() ?? currentTime;
      const visible = renderer.schedule(danmaku, t);
      drawDanmaku(ctx, visible, t, renderer.getMetrics());
      animationRef.current = requestAnimationFrame(tick);
    }
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current != null) cancelAnimationFrame(animationRef.current);
    };
  }, [danmaku, currentTime]);

  async function saveNote() {
    if (!video) return;
    if (!noteBody.trim()) return;
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
        </div>

        <div className="player-wrap" ref={overlayRef}>
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            title={video.title}
            className="player-frame"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
          <canvas ref={canvasRef} className="player-danmaku-canvas" />
          <div ref={gestureRef} className="player-gesture-overlay" />
        </div>

        {/* 自定义控制条 */}
        <div className="player-controls">
          <button
            className="player-btn"
            onClick={() => {
              if (playing) {
                bridgeRef.current?.pause();
                setPlaying(false);
              } else {
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
              bridgeRef.current?.seek(t);
              setCurrentTime(t);
            }}
            aria-label="前进 10 秒"
          >
            <ChevronRight size={16} />
          </button>
          <input
            type="range"
            className="player-seek"
            min={0}
            max={duration}
            value={currentTime}
            onChange={(e) => {
              const t = Number(e.target.value);
              bridgeRef.current?.seek(t);
              setCurrentTime(t);
            }}
          />
          <span className="player-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <button
            className="player-btn"
            onClick={() => {
              setMuted((m) => {
                const next = !m;
                bridgeRef.current?.setVolume(next ? 0 : 0.8);
                return next;
              });
            }}
            aria-label={muted ? "取消静音" : "静音"}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            className="player-btn"
            onClick={() => setShowPrefs((s) => !s)}
            aria-label="弹幕设置"
          >
            <Settings2 size={16} />
          </button>
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

        {video.parts.length > 1 && (
          <div className="bilibili-parts" style={{ marginTop: 10 }}>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>分 P</p>
            <div className="chip-row">
              {video.parts.map((p) => (
                <button
                  key={p.cid}
                  className={p.cid === activePartCid ? "chip active" : "chip"}
                  onClick={() => { setActivePartCid(p.cid); setCurrentTime(0); }}
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
          <span className="muted" style={{ fontSize: 12.5 }}>{notes.length} 条</span>
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
  const lastResource = resources.find((r) => r.status === "in-progress") ?? resources[0];
  if (!lastResource) {
    return (
      <div className="stack">
        <section className="card">
          <p className="muted">还没有可播放的视频，先去资料库添加一个。</p>
        </section>
      </div>
    );
  }
  return <BilibiliPlayerView bvid={lastResource.bvid} key={lastResource.id} />;
}
