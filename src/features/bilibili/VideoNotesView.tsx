import { Clock3, Loader2, Play, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createVideoNoteService } from "../../lib/bilibili/services";
import type { VideoNote } from "../../lib/bilibili/types";
import { useAppStore } from "../../store/useAppStore";

export function formatVideoNotePosition(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

export function VideoNotesView() {
  const service = useMemo(() => createVideoNoteService(), []);
  const openBilibiliVideo = useAppStore((state) => state.openBilibiliVideo);
  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    service.list().then((items) => {
      if (!cancelled) {
        setNotes(items);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setError("暂时无法读取本机笔记");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [service]);

  const filtered = notes.filter((note) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return true;
    return [note.title, note.body, note.videoTitle, note.ownerName, note.bvid, note.partTitle]
      .join("\n").toLowerCase().includes(keyword);
  });

  async function removeNote(note: VideoNote) {
    if (!await service.remove(note.id)) return;
    setNotes((items) => items.filter((item) => item.id !== note.id));
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <div>
            <h2>时间点笔记</h2>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>按视频、UP 主或内容搜索本机记录</p>
          </div>
          <span className="muted" style={{ fontSize: 12.5 }}>{notes.length} 条</span>
        </div>
        <label className="bilibili-search-form">
          <Search size={15} aria-hidden="true" />
          <input
            className="field"
            aria-label="搜索时间点笔记"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索笔记、视频或 UP 主"
          />
        </label>
      </section>

      {loading && <section className="card"><Loader2 size={16} className="spin" /> 加载中…</section>}
      {error && <section className="card"><p className="background-error">{error}</p></section>}
      {!loading && !error && filtered.length === 0 && (
        <section className="card"><p className="empty">{notes.length ? "没有匹配的时间点笔记" : "还没有时间点笔记"}</p></section>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="stack">
          {filtered.map((note) => (
            <article className="card" key={note.id}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{note.title || "未命名笔记"}</h3>
                  <p className="muted" style={{ margin: "4px 0", fontSize: 12.5 }}>{note.videoTitle} · {note.ownerName}</p>
                  <p className="note-body">{note.body}</p>
                  <span className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5 }}>
                    <Clock3 size={13} /> {note.partTitle} · {formatVideoNotePosition(note.positionSeconds)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button className="icon-button" onClick={() => openBilibiliVideo(note.bvid, note.videoTitle)} aria-label="打开视频" title="打开视频">
                    <Play size={15} />
                  </button>
                  <button className="delete-icon" onClick={() => void removeNote(note)} aria-label="删除时间点笔记" title="删除时间点笔记">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
