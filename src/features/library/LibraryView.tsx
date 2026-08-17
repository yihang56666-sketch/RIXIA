import { useState } from "react";
import { ExternalLink, MonitorPlay, Play, Trash2 } from "lucide-react";
import { relativeTime } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";
import type { CourseResource } from "../../types";

type Tab = "continue" | "saved" | "notes" | "inbox";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "continue", label: "继续学习" },
  { key: "saved", label: "已保存" },
  { key: "notes", label: "笔记" },
  { key: "inbox", label: "收集箱" },
];

function ResourceCard({ resource, onOpen }: { resource: CourseResource; onOpen: () => void }) {
  const removeResource = useAppStore((state) => state.removeResource);
  const progress = resource.durationSeconds && resource.progressSeconds
    ? Math.min(100, Math.round((resource.progressSeconds / resource.durationSeconds) * 100))
    : null;

  return (
    <article className="card library-card">
      <button className="library-cover" onClick={onOpen} aria-label={`打开 ${resource.title}`}>
        <MonitorPlay size={22} strokeWidth={1.5} />
        <span className="library-play-badge"><Play size={12} fill="currentColor" /></span>
      </button>
      <div className="library-info">
        <button className="library-title" onClick={onOpen} title={resource.title}>
          <strong>{resource.title}</strong>
        </button>
        <span className="muted library-meta">
          {resource.bvid} · {relativeTime(resource.lastOpenedAt ?? resource.addedAt)}
        </span>
        {progress !== null && (
          <div className="library-progress">
            <div className="library-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div className="library-actions">
        <a
          className="icon-button"
          href={`https://www.bilibili.com/video/${resource.bvid}`}
          target="_blank"
          rel="noreferrer"
          aria-label="在哔哩哔哩打开"
          title="在哔哩哔哩打开"
        >
          <ExternalLink size={15} />
        </a>
        <button
          className="icon-button"
          onClick={() => removeResource(resource.id)}
          aria-label="删除"
          title="删除"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

/**
 * Library is the unified learning surface — segmented control switches
 * between continue-learning, saved, notes and inbox.
 * Stub implementation for the v2 shell; full feature work (provider-based
 * playback, timestamp notes) lands in a later task.
 */
export function LibraryView() {
  const [tab, setTab] = useState<Tab>("continue");
  const resources = useAppStore((state) => state.resources);
  const notes = useAppStore((state) => state.notes);
  const inbox = useAppStore((state) => state.inbox);
  const addResource = useAppStore((state) => state.addResource);
  const setView = useAppStore((state) => state.setView);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!input.trim()) return;
    const res = addResource(input);
    if (!res) {
      setError("没有识别到 BV 号，或已收藏过该视频");
      return;
    }
    setError("");
    setInput("");
  }

  const continueList = resources
    .filter((r) => r.status !== "completed")
    .sort((a, b) => (b.lastOpenedAt ?? b.addedAt).localeCompare(a.lastOpenedAt ?? a.addedAt));

  const savedList = [...resources].sort((a, b) => b.addedAt.localeCompare(a.addedAt));

  function openExternal(resource: CourseResource) {
    window.open(`https://www.bilibili.com/video/${resource.bvid}`, "_blank", "noopener");
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="segmented" role="tablist" aria-label="资料库视图">
          {TABS.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? "segmented-item active" : "segmented-item"}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {tab === "continue" && (
        <section className="card">
          <h2>继续学习</h2>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
            上次没看完的视频，从这里继续。
          </p>
          {continueList.length === 0 ? (
            <div className="empty" style={{ padding: "26px 8px" }}>
              <MonitorPlay size={26} color="var(--text-3)" strokeWidth={1.5} />
              <span>没有进行中的课程</span>
            </div>
          ) : (
            <div className="library-grid">
              {continueList.map((r) => (
                <ResourceCard key={r.id} resource={r} onOpen={() => openExternal(r)} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "saved" && (
        <section className="card">
          <h2>已保存</h2>
          <form className="stack" onSubmit={handleAdd} style={{ gap: 8, marginTop: 10 }}>
            <input
              className="field"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="粘贴哔哩哔哩视频链接或 BV 号"
            />
            {error && <p className="background-error">{error}</p>}
          </form>
          {savedList.length === 0 ? (
            <div className="empty" style={{ padding: "26px 8px" }}>
              <span>还没有保存视频</span>
            </div>
          ) : (
            <div className="library-grid">
              {savedList.map((r) => (
                <ResourceCard key={r.id} resource={r} onOpen={() => openExternal(r)} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "notes" && (
        <section className="card">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2>笔记</h2>
            <span className="muted" style={{ fontSize: 12.5 }}>{notes.length} 条</span>
          </div>
          {notes.length === 0 ? (
            <div className="empty" style={{ padding: "26px 8px" }}>
              <span>还没有笔记，到「计划 → 笔记」中创建</span>
            </div>
          ) : (
            <ul className="library-notes">
              {notes.slice(0, 12).map((n) => (
                <li key={n.id}>
                  <span>{n.body}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{relativeTime(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "inbox" && (
        <section className="card">
          <div className="row" style={{ marginBottom: 6 }}>
            <h2>收集箱</h2>
            <button className="ghost-btn compact" onClick={() => setView("inbox")}>
              打开完整收集箱
            </button>
          </div>
          {inbox.length === 0 ? (
            <div className="empty" style={{ padding: "26px 8px" }}>
              <span>收集箱是空的</span>
            </div>
          ) : (
            <ul className="library-inbox">
              {inbox.slice(0, 8).map((i) => (
                <li key={i.id}>
                  <span>{i.text}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{relativeTime(i.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
