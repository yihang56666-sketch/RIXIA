import { X } from "lucide-react";
import { buildDanmakuStudySummary, DEFAULT_DANMAKU_STUDY_CONFIG } from "../../lib/bilibili/danmakuStudyModel";
import type { DanmakuEntry, DanmakuPreferences } from "../../lib/bilibili/types";

interface DanmakuStudyPanelProps {
  open: boolean;
  entries: DanmakuEntry[];
  currentTimeSeconds: number;
  preferences: DanmakuPreferences;
  loading: boolean;
  failed: boolean;
  onClose: () => void;
  onRetry?: () => void;
  onOpenPreferences?: () => void;
}

export function DanmakuStudyPanel({
  open,
  entries,
  currentTimeSeconds,
  preferences,
  loading,
  failed,
  onClose,
  onRetry,
  onOpenPreferences,
}: DanmakuStudyPanelProps) {
  if (!open) return null;
  const summary = buildDanmakuStudySummary(entries, currentTimeSeconds, preferences, {
    ...DEFAULT_DANMAKU_STUDY_CONFIG,
    highSignalLimit: 5,
    signalStrength: "standard",
  });

  return (
    <aside className="danmaku-study-panel" role="dialog" aria-label="弹幕学习模式">
      <header className="danmaku-study-head">
        <div>
          <strong>弹幕学习</strong>
          <span>{summary.windowLabel}</span>
        </div>
        <button className="danmaku-study-close" onClick={onClose} aria-label="关闭弹幕学习模式">
          <X size={14} />
        </button>
      </header>
      <div className="danmaku-study-body">
        {loading && <p>正在读取弹幕</p>}
        {!loading && failed && (
          <>
            <p>弹幕数据还没读到，学习摘要暂时不可用。</p>
            {onRetry && (
              <button className="danmaku-study-action" onClick={onRetry}>重试读取弹幕</button>
            )}
          </>
        )}
        {!loading && !failed && summary.visibleCount === 0 && (
          <p>当前位置没有弹幕。可以把疑问先记到时间点笔记里。</p>
        )}
        {!loading && !failed && summary.visibleCount > 0 && summary.highSignalEntries.length === 0 && (
          <p>这一段没有发现明显的问题或时间点信号。</p>
        )}
        {!loading && !failed && summary.highSignalEntries.length > 0 && (
          <ul className="danmaku-study-list">
            {summary.highSignalEntries.map((item) => (
              <li key={item.id}>
                <span>{item.text}</span>
                <small>{item.startTimeSeconds.toFixed(0)}s</small>
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="danmaku-study-foot">
        {onOpenPreferences && (
          <button className="danmaku-study-action" onClick={onOpenPreferences} aria-label="打开弹幕设置">
            弹幕设置
          </button>
        )}
      </footer>
    </aside>
  );
}
