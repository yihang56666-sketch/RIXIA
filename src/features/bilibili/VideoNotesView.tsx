/**
 * 时间点笔记管理页 — 1:1 React 移植自 FocuBili 的
 * video_notes_page.dart（738 行）。
 *
 * 结构：搜索框 → 笔记卡片列表（16:9 封面 + 时间角标）→ 选择模式
 * （全选 / 导出文件 / 分享文件）。删除经确认弹窗。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBilibiliPublicContentService } from "../../lib/bilibili/publicContentService";
import { createVideoNoteService } from "../../lib/bilibili/services";
import type { VideoNote } from "../../lib/bilibili/types";
import { downloadExportPackage, exportVideoNotes, VideoNoteExportFormat } from "../../lib/bilibili/miscServices";
import { useAppStore } from "../../store/useAppStore";
import { M3Dialog, Mi, useM3Feedback } from "./m3";
import { VideoNoteDetailDialog } from "./VideoNoteDetailDialog";
import { VideoNoteSharePreview } from "./VideoNoteSharePreview";

export function formatVideoNotePosition(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatVideoNoteDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function VideoNotesView() {
  const service = useMemo(() => createVideoNoteService(), []);
  const bilibiliService = useMemo(() => createBilibiliPublicContentService(), []);
  const showMessage = useM3Feedback().showMessage;
  const openBilibiliVideoAt = useAppStore((state) => state.openBilibiliVideoAt);

  const [notes, setNotes] = useState<VideoNote[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);
  const [formatSheet, setFormatSheet] = useState<"export" | "share" | null>(null);
  const [detailNote, setDetailNote] = useState<VideoNote | null>(null);
  const [sharingNote, setSharingNote] = useState<VideoNote | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VideoNote | null>(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await service.list();
      setNotes(items);
      setLoading(false);
      void backfillMissingCovers(items);
    } catch {
      setError("暂时无法读取本机笔记，请稍后重试。");
      setLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // 封面补齐是后台慢任务：组件卸载或重新加载后必须停止，
  // 且写入前重读最新笔记，避免用过期快照覆盖用户刚保存的编辑。
  const backfillGenerationRef = useRef(0);
  useEffect(() => () => {
    backfillGenerationRef.current += 1;
  }, []);

  const backfillMissingCovers = useCallback(
    async (sourceNotes: VideoNote[]) => {
      const generation = ++backfillGenerationRef.current;
      const missingBvids = [...new Set(sourceNotes.filter((n) => !n.videoCoverUrl).map((n) => n.bvid))];
      for (const bvid of missingBvids) {
        if (backfillGenerationRef.current !== generation) return;
        let coverUrl = "";
        try {
          const video = await bilibiliService.lookupVideo(bvid);
          coverUrl = (video.thumbnailUrl ?? "").trim();
        } catch {
          coverUrl = "";
        }
        if (!coverUrl) continue;
        if (backfillGenerationRef.current !== generation) return;
        const matchingIds = new Set(sourceNotes.filter((n) => n.bvid === bvid).map((n) => n.id));
        for (const id of matchingIds) {
          if (backfillGenerationRef.current !== generation) return;
          // 写入前重读存储里的最新版本，只补封面字段，不覆盖其他编辑。
          const latest = await service.list();
          const current = latest.find((n) => n.id === id);
          if (!current || current.videoCoverUrl) continue;
          await service.save({ ...current, videoCoverUrl: coverUrl });
          setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, videoCoverUrl: coverUrl } : n)));
        }
      }
    },
    [bilibiliService, service],
  );

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return notes;
    return notes.filter((note) =>
      [note.title, note.body, note.videoTitle, note.ownerName, note.bvid, note.partTitle]
        .join("\n")
        .toLowerCase()
        .includes(keyword),
    );
  }, [notes, query]);

  function toggleSelection(note: VideoNote) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(note.id)) next.delete(note.id);
      else next.add(note.id);
      return next;
    });
  }

  function startSelection(note: VideoNote) {
    setSelectionMode(true);
    setSelectedIds(new Set([note.id]));
  }

  function selectAllVisible() {
    setSelectionMode(true);
    setSelectedIds(new Set(filtered.map((n) => n.id)));
  }

  function leaveSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function confirmDelete(note: VideoNote) {
    setPendingDelete(null);
    await service.remove(note.id);
    await loadNotes();
  }

  async function runExport(format: VideoNoteExportFormat, share: boolean) {
    const selected = notes.filter((n) => selectedIds.has(n.id));
    if (selected.length === 0 || exporting) return;
    setFormatSheet(null);
    setExporting(true);
    try {
      const pkg = exportVideoNotes(selected, format, "BEID 时间点笔记");
      if (share && typeof navigator.share === "function") {
        const blob = new Blob([pkg.bytes as BlobPart], { type: format === VideoNoteExportFormat.json ? "application/json" : "text/markdown" });
        const file = new File([blob], pkg.fileName, { type: blob.type });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ title: "BEID 时间点笔记", files: [file] });
          showMessage(pkg.imageCount > 0 ? `已分享 ${pkg.noteCount} 条笔记和 ${pkg.imageCount} 张图片。` : `已分享 ${pkg.noteCount} 条笔记。`);
          leaveSelectionMode();
          return;
        }
      }
      downloadExportPackage(pkg);
      showMessage(pkg.imageCount > 0 ? `已导出 ${pkg.noteCount} 条笔记和 ${pkg.imageCount} 张图片。` : `已导出 ${pkg.noteCount} 条笔记。`);
      leaveSelectionMode();
    } catch {
      showMessage("笔记导出失败，请检查存储位置后重试。");
    } finally {
      setExporting(false);
    }
  }

  function NoteCover({ note }: { note: VideoNote }) {
    return (
      <span style={{ position: "relative", width: 132, height: 74, flex: "0 0 132px", borderRadius: 10, overflow: "hidden", display: "block", background: "var(--m3-surface-container-highest)" }}>
        {note.videoCoverUrl ? (
          <img src={note.videoCoverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
        ) : (
          <span style={{ display: "grid", placeItems: "center", height: "100%" }}><Mi name="ondemand_video" /></span>
        )}
        <span style={{ position: "absolute", right: 6, bottom: 5, background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 7px", borderRadius: 6 }}>
          {formatVideoNotePosition(note.positionSeconds)}
        </span>
      </span>
    );
  }

  function NoteCard({ note }: { note: VideoNote }) {
    const selected = selectedIds.has(note.id);
    return (
      <section className="m3-card">
        <div
          className="m3-list-tile"
          style={{ padding: 12, alignItems: "flex-start", cursor: "pointer", borderRadius: 12 }}
          onClick={() => (selectionMode ? toggleSelection(note) : setDetailNote(note))}
          onContextMenu={(e) => {
            e.preventDefault();
            if (!selectionMode) startSelection(note);
          }}
        >
          {selectionMode && (
            <span className="m3-tile-leading">
              <span
                className={selected ? "m3-avatar fb-selection-check" : "m3-avatar"}
                style={{ width: 24, height: 24, borderRadius: 4, background: selected ? "var(--m3-primary)" : "transparent", border: "2px solid var(--m3-on-surface-variant)" }}
              >
                {selected && <Mi name="check" size={16} style={{ color: "var(--m3-on-primary)" }} />}
              </span>
            </span>
          )}
          <NoteCover note={note} />
          <span className="m3-tile-body" style={{ alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
            <span className="m3-title-sm" style={{ fontWeight: 800, lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {note.title}
            </span>
            <span style={{ flex: 1 }} />
            <span className="m3-body-sm fb-on-surface-variant" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {note.videoTitle}
            </span>
            <span className="m3-label-sm fb-on-surface-variant" style={{ marginTop: 3 }}>
              {formatVideoNoteDateTime(note.createdAt)}
            </span>
          </span>
          {!selectionMode && (
            <span className="m3-tile-trailing" style={{ alignSelf: "flex-start" }}>
              <span className="m3-menu-anchor" onClick={(e) => e.stopPropagation()}>
                <button
                  className="m3-icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(note);
                  }}
                  aria-label="笔记操作"
                  title="笔记操作"
                >
                  <Mi name="more_vert" size={20} />
                </button>
              </span>
            </span>
          )}
        </div>
      </section>
    );
  }

  const body = loading ? (
    <div style={{ display: "grid", placeItems: "center", padding: 60 }}>
      <span className="m3-circular-progress lg" />
    </div>
  ) : error != null ? (
    <div style={{ display: "grid", placeItems: "center", padding: 48, gap: 12 }}>
      <span className="m3-body-md">{error}</span>
      <button className="m3-outlined-btn" onClick={() => void loadNotes()}>重试</button>
    </div>
  ) : notes.length === 0 ? (
    <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <span style={{ textAlign: "center" }}>
        <Mi name="edit_note" size={54} style={{ display: "block", margin: "0 auto 12px" }} />
        <span className="m3-body-lg">还没有时间点笔记</span>
        <span className="m3-body-sm" style={{ display: "block", marginTop: 6 }}>在视频页点“记笔记”即可保存此刻的想法。</span>
      </span>
    </div>
  ) : (
    <>
      <div style={{ padding: "8px 16px 10px" }}>
        <div className="m3-field">
          <Mi name="search" size={20} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索时间点笔记"
            placeholder="搜索笔记、视频或 UP 主"
          />
          {query.length > 0 && (
            <button className="m3-icon-btn" onClick={() => setQuery("")} aria-label="清空搜索" title="清空搜索" style={{ width: 32, height: 32 }}>
              <Mi name="close" size={20} />
            </button>
          )}
        </div>
        <p className="m3-body-sm" style={{ padding: "8px 2px 0" }}>
          {query.length === 0 ? `共 ${notes.length} 条笔记` : `找到 ${filtered.length} 条笔记`}
        </p>
      </div>
      {filtered.length === 0 ? (
        <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
          <span style={{ textAlign: "center" }}>
            <Mi name="search_off" size={54} style={{ display: "block", margin: "0 auto 12px" }} />
            <span className="m3-body-lg">没有匹配的笔记</span>
            <span className="m3-body-sm" style={{ display: "block", marginTop: 6 }}>换个标题、视频名、UP 主或正文关键词试试。</span>
          </span>
        </div>
      ) : (
        <div className="video-notes-grid" role="list">
          {filtered.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="fb fb-page">
      <header className="fb-appbar">
        <button className="m3-icon-btn" onClick={() => (selectionMode ? leaveSelectionMode() : useAppStore.getState().setView("settings"))} aria-label={selectionMode ? "取消选择" : "返回我的"} title={selectionMode ? "取消选择" : "返回我的"}>
          <Mi name={selectionMode ? "close" : "arrow_back"} />
        </button>
        <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>
          {selectionMode ? `已选择 ${selectedIds.size} 条` : "时间点笔记"}
        </h1>
        {selectionMode ? (
          <button className="m3-text-btn" onClick={selectAllVisible} aria-label="全选当前结果" title="全选当前结果">
            <Mi name="select_all" size={20} /> 全选
          </button>
        ) : (
          <>
            <button className="m3-text-btn" disabled={notes.length === 0} onClick={() => setSelectionMode(true)} aria-label="导出">
              导出
            </button>
            <button className="m3-icon-btn" onClick={() => void loadNotes()} aria-label="刷新" title="刷新">
              <Mi name="refresh" />
            </button>
          </>
        )}
      </header>

      <div className="fb-scroll-page">{body}</div>

      {selectionMode && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--m3-outline-variant)", background: "var(--m3-surface)", display: "flex", gap: 12, flex: "0 0 auto" }}>
          <button className="m3-outlined-btn" style={{ flex: 1 }} disabled={selectedIds.size === 0 || exporting} onClick={() => setFormatSheet("export")}>
            <Mi name="download" size={18} /> 导出文件
          </button>
          <button className="m3-filled-btn" style={{ flex: 1 }} disabled={selectedIds.size === 0 || exporting} onClick={() => setFormatSheet("share")}>
            {exporting ? <span className="m3-circular-progress" style={{ width: 18, height: 18 }} /> : <Mi name="ios_share" size={18} />} {exporting ? "处理中…" : "分享文件"}
          </button>
        </div>
      )}

      {formatSheet !== null && (
        <div className="m3-dialog-scrim" style={{ alignItems: "flex-end" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setFormatSheet(null); }}>
          <div className="m3-dialog" style={{ width: "min(100%, 480px)", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: "8px 0 16px" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--m3-outline-variant)", margin: "8px auto 8px" }} />
            <div className="m3-list-tile" onClick={() => void runExport(VideoNoteExportFormat.markdown, formatSheet === "share")}>
              <span className="m3-tile-leading"><Mi name="description" /></span>
              <span className="m3-tile-body">
                <span className="m3-body-lg">导出为 Markdown</span>
                <span className="m3-body-sm">适合 Obsidian、Notion 等笔记软件读取</span>
              </span>
            </div>
            <div className="m3-list-tile" onClick={() => void runExport(VideoNoteExportFormat.json, formatSheet === "share")}>
              <span className="m3-tile-leading"><Mi name="data_object" /></span>
              <span className="m3-tile-body">
                <span className="m3-body-lg">导出为 JSON</span>
                <span className="m3-body-sm">保留完整字段，便于备份与回导</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <M3Dialog
          title="删除笔记"
          onClose={() => setPendingDelete(null)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setPendingDelete(null)}>取消</button>
              <button className="m3-filled-btn" onClick={() => void confirmDelete(pendingDelete)}>删除</button>
            </>
          }
        >
          确定删除“{pendingDelete.title}”吗？
        </M3Dialog>
      )}

      {sharingNote && <VideoNoteSharePreview note={sharingNote} onClose={() => setSharingNote(null)} />}
      {detailNote && (
        <VideoNoteDetailDialog
          note={detailNote}
          onClose={() => setDetailNote(null)}
          onSave={async (updated) => {
            const saved = await service.save(updated);
            if (saved) {
              setNotes((items) => items.map((n) => (n.id === updated.id ? updated : n)));
              setDetailNote(updated);
            }
            return saved;
          }}
          onOpenVideo={() => openBilibiliVideoAt(detailNote.bvid, detailNote.videoTitle, detailNote.partCid, detailNote.positionSeconds)}
          onShare={() => {
            setDetailNote(null);
            setSharingNote(detailNote);
          }}
          onDelete={() => {
            void confirmDelete(detailNote);
            setDetailNote(null);
          }}
        />
      )}
    </div>
  );
}
