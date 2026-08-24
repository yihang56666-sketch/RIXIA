import type { VideoChapter } from "../../lib/bilibili/extendedModels";
import { chapterContains, chapterDuration } from "../../lib/bilibili/extendedModels";

export function formatChapterTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PlayerChapterStrip({
  chapters,
  positionMs,
  onSeek,
  visible = true,
}: {
  chapters: VideoChapter[];
  positionMs: number;
  onSeek: (positionSeconds: number) => void;
  visible?: boolean;
}) {
  if (chapters.length === 0 || !visible) return null;
  return (
    <div className="player-chapter-strip" aria-label="视频章节">
      {chapters.map((chapter, index) => {
        const active = chapterContains(chapter, positionMs, index === chapters.length - 1);
        return (
          <button
            key={`${chapter.startMs}-${chapter.endMs}-${chapter.title}`}
            className={active ? "player-chapter active" : "player-chapter"}
            style={{ flexGrow: Math.max(chapterDuration(chapter), 1) }}
            aria-current={active ? "step" : undefined}
            title={`${chapter.title} · ${formatChapterTime(chapter.startMs)}`}
            onClick={() => onSeek(chapter.startMs / 1000)}
          >
            <span>{chapter.title}</span>
          </button>
        );
      })}
    </div>
  );
}
