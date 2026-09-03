import { ExternalLink, MonitorPlay, Play, Search, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { buildSearchUrl, extractBvid } from "../../lib/bilibili";
import { relativeTime } from "../../lib/time";
import { RixiaWorkspacePage } from "../bilibili/RixiaWorkspacePage";
import { useAppStore } from "../../store/useAppStore";
import type { CourseResource } from "../../types";
import { identifyResourceSource, isProtectedCloudSource, normalizeResourceLink, resourceSourceLabel, type ResourceSource } from "../../lib/resourceSources";

function VideoCard({ video, onOpen }: { video: CourseResource; onOpen: () => void }) {
  const { removeResource } = useAppStore();
  const external = Boolean(video.url);
  const sourceLabel = video.source && video.source !== "bilibili" ? resourceSourceLabel(video.source) : "哔哩哔哩";
  return (
    <article className="card video-card">
      <button className="video-cover" onClick={onOpen} aria-label={external ? `打开${sourceLabel}资源：${video.title}` : `观看 ${video.title}`}>
        {external ? <ExternalLink size={26} strokeWidth={1.5} /> : <MonitorPlay size={26} strokeWidth={1.5} />}
        <span className="video-play-badge"><Play size={13} fill="currentColor" /></span>
      </button>
      <div className="video-info">
        <button className="video-title" onClick={onOpen} title={video.title}>
          <strong>{video.title}</strong>
        </button>
        <span className="muted video-meta">{sourceLabel} · {relativeTime(video.addedAt)}</span>
      </div>
      <button className="delete-icon" onClick={() => removeResource(video.id)} aria-label="删除视频" title="删除视频">
        <Trash2 size={15} />
      </button>
    </article>
  );
}

export function VideosView() {
  const { resources, addResource, openBilibiliVideo, openCloudResource } = useAppStore();
  const [input, setInput] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [source, setSource] = useState<ResourceSource>("bilibili");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    const detected = identifyResourceSource(input);
    if (source !== "bilibili") {
      if (detected !== source) { setError(`请输入${resourceSourceLabel(source)}链接。`); return; }
      // 打开规范化后的绝对地址：识别器接受无 scheme 输入，直接 open 原文
      // 会被当成相对路径跳回应用自身。
      const target = normalizeResourceLink(input);
      if (!target) { setError("链接无效，请粘贴完整的 HTTPS 链接。"); return; }
      const resource = addResource(target, title);
      if (!resource) { setError("这个资源已经在看课区了。"); return; }
      setInput("");
      setTitle("");
      setError(isProtectedCloudSource(source) ? `${resourceSourceLabel(source)}已收藏，打开时将在官方页面完成登录/授权。` : "资源已收藏到看课区，可从卡片打开。");
      return;
    }
    if (!extractBvid(input)) {
      setError("没有识别到 BV 号，请粘贴完整的视频链接（如 https://www.bilibili.com/video/BV…）");
      return;
    }
    setError("");
    const resource = addResource(input, title);
    if (!resource) {
      setError("这个视频已经在看课区了。");
      return;
    }
    setInput("");
    setTitle("");
  }

  return (
    <RixiaWorkspacePage title="看课">
    <div className="stack">
      <section className="card">
        <h2>添加视频</h2>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
          粘贴哔哩哔哩视频链接或 BV 号，收藏网课和教程，随时在这里观看。
        </p>
        <form className="stack" onSubmit={handleSubmit} style={{ gap: 10, marginTop: 12 }}>
          <select className="field" aria-label="资源来源" value={source} onChange={(event) => setSource(event.target.value as ResourceSource)}>
            <option value="bilibili">哔哩哔哩</option>
            <option value="quark">夸克网盘</option>
            <option value="baidu">百度网盘</option>
            <option value="direct">HTTPS 直链</option>
          </select>
          <input
            className="field"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={source === "bilibili" ? "https://www.bilibili.com/video/BV… 或 BV 号" : "粘贴资源链接"}
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
            <VideoCard key={video.id} video={video} onOpen={() => {
              if (video.url) openCloudResource(video.id);
              else openBilibiliVideo(video.bvid, video.title);
            }} />
          ))}
        </div>
      )}
    </div>
    </RixiaWorkspacePage>
  );
}
