import { X } from "lucide-react";
import type { VideoChapter } from "../../lib/bilibili/extendedModels";
import { chapterContains } from "../../lib/bilibili/extendedModels";
import { formatChapterTime } from "./PlayerChapterStrip";
import { useOverlayInteraction } from "../../lib/overlayStack";

export function PlayerChapterPanel({
  chapters,
  positionMs,
  chapterProgressVisible,
  onSeek,
  onToggleChapterProgress,
  onClose,
}: {
  chapters: VideoChapter[];
  positionMs: number;
  chapterProgressVisible: boolean;
  onSeek: (positionSeconds: number) => void;
  onToggleChapterProgress: (visible: boolean) => void;
  onClose: () => void;
}) {
  // 登记浮层栈：系统返回/Escape 先关分段信息，而不是退回资料库。
  useOverlayInteraction(true, onClose);
  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card player-chapter-panel" role="dialog" aria-modal="true" aria-label="分段信息">
        <header className="player-chapter-panel-header">
          <h2>分段信息</h2>
          <label className="player-chapter-panel-toggle">
            <span>分段进度条</span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={chapterProgressVisible}
              checked={chapterProgressVisible}
              onChange={(event) => onToggleChapterProgress(event.target.checked)}
            />
          </label>
          <button className="icon-button" type="button" aria-label="关闭分段信息" title="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="player-chapter-panel-list">
          {chapters.map((chapter, index) => {
            const selected = chapterContains(chapter, positionMs, index === chapters.length - 1);
            return (
              <button
                key={`${chapter.startMs}-${chapter.endMs}-${chapter.title}`}
                type="button"
                className={selected ? "player-chapter-panel-item active" : "player-chapter-panel-item"}
                onClick={() => { onSeek(chapter.startMs / 1000); onClose(); }}
              >
                {chapter.imageUrl ? (
                  <img className="player-chapter-panel-thumb" src={chapter.imageUrl} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="player-chapter-panel-thumb placeholder" aria-hidden="true" />
                )}
                <span className="player-chapter-panel-body">
                  <strong>{chapter.title}</strong>
                  <small>{formatChapterTime(chapter.startMs)} - {formatChapterTime(chapter.endMs)}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
