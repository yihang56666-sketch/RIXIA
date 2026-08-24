import { CheckCircle2, Play } from "lucide-react";

export function PlaybackCompletionOverlay({
  hasNext,
  markedCompleted,
  processing,
  onMarkCompleted,
  onContinue,
}: {
  hasNext: boolean;
  markedCompleted: boolean;
  processing: boolean;
  onMarkCompleted: () => void;
  onContinue: () => void;
}) {
  const finished = markedCompleted && !hasNext;
  return (
    <div className="playback-completion-overlay" role="status">
      <div className="playback-completion-heading">
        <CheckCircle2 size={24} />
        <div>
          <strong>{finished ? "已完成学习" : markedCompleted ? "已标记完成" : "这一项播放完成"}</strong>
          <p>{finished ? "学习清单内的全部视频都已完成。" : "标记此分 P 完成，或继续学习下一项。"}</p>
        </div>
      </div>
      {!finished && (
        <div className="playback-completion-actions">
          <button className="m3-outlined-btn compact" disabled={processing || markedCompleted} onClick={onMarkCompleted}>
            <CheckCircle2 size={14} /> {markedCompleted ? "已标记完成" : "标记已完成"}
          </button>
          {hasNext && (
            <button className="m3-filled-btn compact" disabled={processing} onClick={onContinue}>
              <Play size={14} /> 继续学习
            </button>
          )}
        </div>
      )}
    </div>
  );
}
