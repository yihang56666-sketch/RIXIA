import type { InteractiveVideoChoice } from "../../lib/bilibili/extendedModels";

export function InteractiveVideoChoiceOverlay({
  title,
  choices,
  loading = false,
  error,
  onChoiceSelected,
  onRetry,
}: {
  title: string;
  choices: InteractiveVideoChoice[];
  loading?: boolean;
  error?: string;
  onChoiceSelected: (choice: InteractiveVideoChoice) => void;
  onRetry?: () => void;
}) {
  return (
    <div className="interactive-video-overlay" role="dialog" aria-label={title || "请选择剧情走向"}>
      <strong>{title || "请选择剧情走向"}</strong>
      {loading && <p>正在加载剧情选项…</p>}
      {error && (
        <div className="interactive-video-error">
          <p>{error}</p>
          {onRetry && <button className="m3-outlined-btn compact" onClick={onRetry}>重试</button>}
        </div>
      )}
      {!loading && !error && (
        <div className="interactive-video-choices">
          {choices.map((choice) => (
            <button key={`${choice.edgeId}:${choice.cid}`} className="interactive-video-choice" onClick={() => onChoiceSelected(choice)}>
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
