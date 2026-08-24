import { useState, type ChangeEvent } from "react";
import {
  X,
  Delete,
  ImageIcon,
  Loader2,
  MapPin,
  Plus,
  Save,
} from "lucide-react";

/**
 * RIXIA 视频时间点笔记编辑器 — 1:1 React 移植自 FocuBili 的
 * video_note_composer.dart（525 行）。
 *
 * 功能：
 * - 标题输入（80 字限制）
 * - 正文输入（6000 字限制，自动高度）
 * - 时间点显示（mm:ss 或 h:mm:ss）
 * - 自动记录时间显示（创建时间）
 * - 分 P 标签显示
 * - "插入时间点画面"开关（Web 上用 canvas 截图替代 Flutter Image.file）
 * - "跳转到时间点"按钮
 * - 新建/删除/保存按钮
 * - 紧凑模式（compact）和全屏无边框模式（borderless）
 * - 保存中状态禁用所有操作
 */

export function formatVideoNotePosition(seconds: number): string {
  const s = Math.max(0, Math.min(Math.floor(seconds), 604800));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function formatVideoNoteDateTime(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export interface VideoNoteComposerProps {
  title: string;
  body: string;
  positionSeconds: number;
  partPageNumber?: number;
  createdAt?: string;
  framePath?: string;
  includeFrame: boolean;
  saving: boolean;
  compact?: boolean;
  borderless?: boolean;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onIncludeFrameChange: (value: boolean) => void;
  onSave: () => void;
  onNew: () => void;
  onClose: () => void;
  onJumpToPosition?: () => void;
  onDelete?: () => void;
}

export function VideoNoteComposer({
  title,
  body,
  positionSeconds,
  partPageNumber,
  createdAt,
  framePath,
  includeFrame,
  saving,
  compact = false,
  borderless = false,
  onTitleChange,
  onBodyChange,
  onIncludeFrameChange,
  onSave,
  onNew,
  onClose,
  onJumpToPosition,
  onDelete,
}: VideoNoteComposerProps) {
  const [frameError, setFrameError] = useState(false);
  const recordedText = createdAt ? formatVideoNoteDateTime(createdAt) : (borderless ? "保存时记录" : "保存时自动填写");
  const inputDisabled = saving;

  function handleTitleChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.value.length <= 80) {
      onTitleChange(e.target.value);
    }
  }

  function handleBodyChange(e: ChangeEvent<HTMLTextAreaElement>) {
    if (e.target.value.length <= 6000) {
      onBodyChange(e.target.value);
    }
  }

  return (
    <div className={`note-composer ${compact ? "compact" : ""} ${borderless ? "borderless" : ""}`}>
      {compact ? (
        <div className="note-composer-header-compact">
          <strong className="note-composer-title-label">时间点笔记</strong>
          <span className="muted note-composer-recorded-time">{recordedText}</span>
          {partPageNumber != null && partPageNumber > 0 && (
            <span className="note-part-chip">P{partPageNumber}</span>
          )}
          <span className="muted note-composer-position">
            视频位置：{formatVideoNotePosition(positionSeconds)}
          </span>
          <button
            className="icon-button"
            onClick={onNew}
            disabled={inputDisabled}
            aria-label="新建笔记"
            title="新建笔记"
          >
            <Plus size={20} />
          </button>
          <button
            className="icon-button"
            onClick={onClose}
            disabled={inputDisabled}
            aria-label="关闭笔记"
            title="关闭笔记"
          >
            <X size={20} />
          </button>
        </div>
      ) : (
        <div className="note-composer-header-regular">
          <div className="row">
            <strong className="note-composer-title-label">时间点笔记</strong>
            <button
              className="icon-button"
              onClick={onNew}
              disabled={inputDisabled}
              aria-label="新建笔记"
              title="新建笔记"
            >
              <Plus size={21} />
            </button>
            <button
              className="icon-button"
              onClick={onClose}
              disabled={inputDisabled}
              aria-label="关闭笔记"
              title="关闭笔记"
            >
              <X size={21} />
            </button>
          </div>
          <div className="note-composer-meta-row">
            <span className="muted note-composer-recorded-time">{recordedText}</span>
            {partPageNumber != null && partPageNumber > 0 && (
              <span className="note-part-chip">P{partPageNumber}</span>
            )}
            <span className="note-composer-position-chip">
              {formatVideoNotePosition(positionSeconds)}
            </span>
          </div>
        </div>
      )}

      {borderless && <hr className="note-composer-divider" />}

      <input
        className={`field note-title-field ${borderless ? "borderless" : ""}`}
        value={title}
        onChange={handleTitleChange}
        disabled={inputDisabled}
        placeholder="例如：这个观点很重要"
        maxLength={80}
        aria-label="笔记标题"
      />

      <textarea
        className={`field note-body-field ${borderless ? "borderless" : ""}`}
        value={body}
        onChange={handleBodyChange}
        disabled={inputDisabled}
        placeholder="写下此刻的想法…"
        maxLength={6000}
        rows={compact ? (borderless ? 4 : 3) : (borderless ? 3 : 4)}
        aria-label="笔记正文"
        style={{ minHeight: compact ? 80 : 100, resize: "vertical" }}
      />

      <div className="note-composer-bottom">
        <div className="note-composer-options">
          <label className={`note-frame-chip ${includeFrame ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={includeFrame}
              onChange={(e) => onIncludeFrameChange(e.target.checked)}
              disabled={inputDisabled}
            />
            <ImageIcon size={16} />
            <span>插入时间点画面</span>
          </label>
          {onJumpToPosition && (
            <button
              className="m3-outlined-btn compact"
              onClick={onJumpToPosition}
              disabled={inputDisabled}
            >
              <MapPin size={16} />
              跳转到时间点
            </button>
          )}
        </div>
        <div className="note-composer-commit">
          {onDelete && (
            <button
              className="icon-button"
              onClick={onDelete}
              disabled={inputDisabled}
              aria-label="删除笔记"
              title="删除笔记"
            >
              <Delete size={18} />
            </button>
          )}
          <button
            className="m3-filled-btn compact"
            onClick={onSave}
            disabled={inputDisabled}
          >
            {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      </div>

      {includeFrame && framePath && !frameError && (
        <div className="note-frame-preview">
          <img
            src={framePath}
            alt="时间点画面"
            onError={() => setFrameError(true)}
            style={{ maxWidth: "100%", borderRadius: 10 }}
          />
        </div>
      )}
      {includeFrame && frameError && (
        <div className="note-frame-error">
          已保存的画面文件不存在
        </div>
      )}
    </div>
  );
}
