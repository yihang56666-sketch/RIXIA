import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Tag } from "lucide-react";
import { createBilibiliPublicContentService } from "../../lib/bilibili/publicContentService";
import { createDanmakuFetchService } from "../../lib/bilibili/danmakuFetchService";
import { createDanmakuPreferencesService, createVideoNoteService } from "../../lib/bilibili/services";
import type { VideoNote, VideoPreview } from "../../lib/bilibili/types";
import { createId } from "../../lib/id";
import { relativeTime } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

/**
 * RIXIA 内嵌 B 站播放器 — 在 WebView 内通过官方 iframe 播放，
 * 同时加载并渲染弹幕，支持时间点笔记。
 *
 * 与 FocuBili 的差异：FocuBili 用 Flutter 原生 video_player，这里
 * 用官方 embed iframe（B 站提供的官方网页播放器），更轻量但弹幕通过
 * comment.bilibili.com/<cid>.xml 单独加载。
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
  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    service.lookupVideo(bvid).then((v) => {
      if (cancelled) return;
      setVideo(v);
      setLoading(false);
      danmakuService.fetchDanmaku(v.cid).then(() => { /* loaded */ });
      videoNoteService.listByVideo(v.bvid).then((n) => !cancelled && setNotes(n));
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : "加载失败");
      setLoading(false);
    });
    danmakuPreferencesService.load().then(() => { /* loaded */ });
    return () => { cancelled = true; };
  }, [bvid, service, danmakuService, danmakuPreferencesService, videoNoteService]);

  async function saveNote() {
    if (!video) return;
    if (!noteBody.trim()) return;
    const note: VideoNote = {
      id: createId(),
      bvid: video.bvid,
      videoTitle: video.title,
      ownerName: video.ownerName,
      partCid: video.cid,
      partPageNumber: 1,
      partTitle: video.parts[0]?.title ?? video.title,
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

  const iframeUrl = `https://player.bilibili.com/player.html?bvid=${video.bvid}&cid=${video.cid}&page=1&high_quality=1&danmaku=0&autoplay=0`;

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

        <div className="player-wrap">
          <iframe
            src={iframeUrl}
            title={video.title}
            className="player-frame"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>

        {video.tags.length > 0 && (
          <div className="bilibili-tags">
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

        {video.parts.length > 1 && (
          <div className="bilibili-parts">
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>分 P</p>
            <div className="chip-row">
              {video.parts.map((p) => (
                <span key={p.cid} className="chip">P{p.pageNumber} · {p.title}</span>
              ))}
            </div>
          </div>
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

export function BilibiliPlayerRoute() {
  const resources = useAppStore((state) => state.resources);
  // 资源 id 通过 URL state 传递不便；用最近打开的 "in-progress" 资源
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
