/**
 * 笔记详情对话框 — 1:1 React 移植自 FocuBili 的
 * video_note_detail_page.dart（785 行）。
 *
 * 结构：视频来源卡（点击先查询最新分P再跳转播放）+ 时间点/日期/分P 元数据标签 +
 * 标题/正文编辑器 + 可点击进入全屏浏览的截图（双击/滚轮缩放）+ 未保存修改
 * 拦截退出确认 + 删除前二次确认。
 */

import { useState, type ReactNode, type WheelEvent } from "react";
import { Calendar, Clock3, Film, Loader2, Maximize2, Play, Save, Share2, Trash2, X } from "lucide-react";
import { createBilibiliPublicContentService } from "../../lib/bilibili/publicContentService";
import type { VideoNote } from "../../lib/bilibili/types";
import { M3Dialog, Mi } from "./m3";
import { formatVideoNoteDateTime, formatVideoNotePosition } from "./VideoNotesView";

function MetadataChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="video-note-detail-chip">
      {icon}
      <span>{label}</span>
    </span>
  );
}

function FrameViewer({ framePath, onClose }: { framePath: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    setScale((current) => Math.min(6, Math.max(1, current - event.deltaY * 0.0015)));
  }

  function handleDoubleClick() {
    setScale((current) => (current > 1 ? 1 : 2.5));
  }

  function resetZoom() {
    setScale(1);
  }

  return (
    <div className="video-note-frame-viewer" role="dialog" aria-label="视频截图全屏浏览" onClick={onClose}>
      <button className="icon-button video-note-frame-viewer-close" onClick={onClose} aria-label="关闭全屏截图"><X size={20} /></button>
      <button className="icon-button video-note-frame-viewer-reset" onClick={(event) => { event.stopPropagation(); resetZoom(); }} aria-label="重置缩放" title="重置缩放"><Maximize2 size={20} /></button>
      <img
        src={framePath}
        alt="时间点画面"
        className="video-note-frame-viewer-image"
        style={{ transform: "scale(" + scale + ")" }}
        onClick={(event) => event.stopPropagation()}
        onWheel={handleWheel}
        onDoubleClick={(event) => { event.stopPropagation(); handleDoubleClick(); }}
      />
    </div>
  );
}

export function VideoNoteDetailDialog({
  note,
  onClose,
  onSave,
  onOpenVideo,
  onShare,
  onDelete,
}: {
  note: VideoNote;
  onClose: () => void;
  onSave: (updated: VideoNote) => Promise<boolean>;
  onOpenVideo: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const bilibiliService = useState(() => createBilibiliPublicContentService())[0];
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [openingVideo, setOpeningVideo] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewingFrame, setViewingFrame] = useState(false);

  const hasUnsavedChanges = title.trim() !== note.title || body.trim() !== note.body;

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setMessage("请填写笔记标题");
      return;
    }
    setSaving(true);
    const updated = { ...note, title: trimmedTitle, body: body.trim(), updatedAt: new Date().toISOString() };
    const saved = await onSave(updated);
    setSaving(false);
    if (saved) setMessage("笔记已保存");
    else setMessage("保存失败，请稍后重试");
  }

  async function handleOpenSourceVideo() {
    if (openingVideo) return;
    setOpeningVideo(true);
    try {
      await bilibiliService.lookupVideo(note.bvid);
      setOpeningVideo(false);
      onOpenVideo();
    } catch {
      setOpeningVideo(false);
      setMessage("暂时无法打开这条笔记对应的视频。");
    }
  }

  function requestClose() {
    if (hasUnsavedChanges) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-label="笔记详情" aria-modal="true">
      <div className="modal-card video-note-detail-dialog">
        <div className="row video-note-detail-header">
          <h2>笔记详情</h2>
          <div className="row" style={{ gap: 4 }}>
            <button className="icon-button" onClick={onShare} disabled={saving} aria-label="分享笔记图片" title="分享笔记图片"><Share2 size={18} /></button>
            <button className="icon-button" onClick={() => setConfirmDelete(true)} disabled={saving} aria-label="删除笔记" title="删除笔记"><Trash2 size={18} /></button>
            <button className="icon-button" onClick={requestClose} disabled={saving} aria-label="关闭笔记详情"><X size={18} /></button>
          </div>
        </div>

        <div className="video-note-detail-reference-pane">
          <button className="video-note-detail-source" onClick={() => void handleOpenSourceVideo()} disabled={saving || openingVideo}>
            {note.videoCoverUrl ? (
              <img className="video-note-detail-source-cover" src={note.videoCoverUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="video-note-detail-source-cover placeholder"><Film size={20} /></span>
            )}
            <span className="video-note-detail-source-info">
              <strong>{note.videoTitle}</strong>
              <small>{note.ownerName || note.bvid} · P{note.partPageNumber} {note.partTitle}</small>
            </span>
            {openingVideo ? <Loader2 size={18} className="spin" /> : <Play size={18} />}
          </button>

          <div className="video-note-detail-chips">
            <MetadataChip icon={<Clock3 size={14} />} label={formatVideoNotePosition(note.positionSeconds)} />
            <MetadataChip icon={<Calendar size={14} />} label={formatVideoNoteDateTime(note.createdAt)} />
            {note.partTitle && <MetadataChip icon={<Film size={14} />} label={"P" + note.partPageNumber + " " + note.partTitle} />}
          </div>

          {note.framePath && (
            <div className="video-note-detail-frame-section">
              <div className="row" style={{ marginBottom: 8 }}>
                <strong className="m3-title-sm">视频截图</strong>
                <span style={{ flex: 1 }} />
                <span className="muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><Mi name="open_in_full" size={16} /> 点击放大</span>
              </div>
              <button type="button" className="video-note-detail-frame-button" onClick={() => setViewingFrame(true)}>
                <img className="video-note-detail-frame" src={note.framePath} alt="时间点画面" />
              </button>
            </div>
          )}
        </div>

        <div className="video-note-detail-editor-pane">
          <input className="field video-note-detail-title-field" aria-label="笔记标题" value={title} maxLength={80} disabled={saving} onChange={(event) => setTitle(event.target.value)} placeholder="笔记标题" />
          <textarea className="field video-note-detail-body" aria-label="笔记正文" value={body} maxLength={6000} disabled={saving} onChange={(event) => setBody(event.target.value)} placeholder="写下此刻的想法…" />

          {message && <p className="muted" role="status">{message}</p>}

          <div className="focus-completion-actions">
            <button className="m3-filled-btn compact" onClick={() => void handleSave()} disabled={saving} aria-label="保存笔记修改"><Save size={15} /> {saving ? "保存中" : "保存"}</button>
          </div>
        </div>
      </div>

      {confirmDiscard && (
        <M3Dialog
          title="有未保存的修改"
          onClose={() => setConfirmDiscard(false)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setConfirmDiscard(false)}>继续编辑</button>
              <button className="m3-filled-btn" onClick={() => { setConfirmDiscard(false); onClose(); }}>不保存并退出</button>
            </>
          }
        >
          退出后，本次修改会丢失。确定不保存并退出吗？
        </M3Dialog>
      )}

      {confirmDelete && (
        <M3Dialog
          title="删除笔记"
          onClose={() => setConfirmDelete(false)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setConfirmDelete(false)}>取消</button>
              <button className="m3-filled-btn" onClick={() => { setConfirmDelete(false); onDelete(); }}>删除</button>
            </>
          }
        >
          确定删除"{note.title}"吗？
        </M3Dialog>
      )}

      {viewingFrame && note.framePath && (
        <FrameViewer framePath={note.framePath} onClose={() => setViewingFrame(false)} />
      )}
    </div>
  );
}
