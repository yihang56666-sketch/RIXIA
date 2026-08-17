import { ArrowLeft, ExternalLink, MonitorPlay, Play, Search, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { buildPlayerUrl, buildSearchUrl, extractBvid } from "../../lib/bilibili";
import { relativeTime } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";
import type { CourseResource } from "../../types";

function VideoCard({ video, onOpen }: { video: CourseResource; onOpen: () => void }) {
  const { removeResource } = useAppStore();
  return (
    <article className="card video-card">
      <button className="video-cover" onClick={onOpen} aria-label={`观看 ${video.title}`}>
        <MonitorPlay size={26} strokeWidth={1.5} />
        <span className="video-play-badge"><Play size={13} fill="currentColor" /></span>
      </button>
      <div className="video-info">
        <button className="video-title" onClick={onOpen} title={video.title}>
          <strong>{video.title}</strong>
        </button>
        <span className="muted video-meta">{video.bvid} · {relativeTime(video.addedAt)}</span>
      </div>
      <button className="delete-icon" onClick={() => removeResource(video.id)} aria-label="删除视频" title="删除视频">
        <Trash2 size={15} />
      </button>
    </article>
  );
}

export function VideosView() {
  const { resources, addResource } = useAppStore();
  const [input, setInput] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [watching, setWatching] = useState<CourseResource | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    if (!extractBvid(input)) {
      setError("没有识别到 BV 号，请粘贴完整的视频链接（如 https://www.bilibili.com/video/BV…）");
      return;
    }
    setError("");
    addResource(input, title);
    setInput("");
    setTitle("");
  }

  if (watching) {
    return (
      <div className="stack">
        <button className="back-button" onClick={() => setWatching(null)}>
          <ArrowLeft size={18} /> 返回看课列表
        </button>
        <section className="card" style={{ padding: 12 }}>
          <div className="player-wrap">
            <iframe
              src={buildPlayerUrl(watching.bvid)}
              title={watching.title}
              className="player-frame"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          </div>
          <div className="row" style={{ marginTop: 12, padding: "0 4px" }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{watching.title}</h3>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{watching.bvid} · 高清优先 · 弹幕已关闭</p>
            </div>
            <a
              className="ghost-btn"
              href={`https://www.bilibili.com/video/${watching.bvid}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={15} /> 在哔哩哔哩打开
            </a>
          </div>
        </section>
        <p className="muted" style={{ fontSize: 12.5, textAlign: "center" }}>
          播放需要联网；看完记得回来打个卡 ✅
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>添加视频</h2>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
          粘贴哔哩哔哩视频链接或 BV 号，收藏网课和教程，随时在这里观看。
        </p>
        <form className="stack" onSubmit={handleSubmit} style={{ gap: 10, marginTop: 12 }}>
          <input
            className="field"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="https://www.bilibili.com/video/BV… 或 BV 号"
          />
          <input
            className="field"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="给它起个名字（可选，如：高数强化 第 3 讲）"
          />
          <button className="primary compact" type="submit">收藏到看课区</button>
        </form>
        {error && <p className="background-error">{error}</p>}
      </section>

      {resources.length === 0 ? (
        <section className="card">
          <div className="empty" style={{ display: "grid", justifyItems: "center", gap: 10, padding: "30px 8px" }}>
            <MonitorPlay size={26} color="var(--text-3)" strokeWidth={1.5} />
            <span>还没有收藏视频，去哔哩哔哩找些好课吧</span>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <a className="ghost-btn" href={buildSearchUrl("考研网课")} target="_blank" rel="noreferrer">
              <Search size={15} /> 搜索考研网课
            </a>
          </div>
        </section>
      ) : (
        <div className="video-grid">
          {resources.map((video) => (
            <VideoCard key={video.id} video={video} onOpen={() => setWatching(video)} />
          ))}
        </div>
      )}
    </div>
  );
}
