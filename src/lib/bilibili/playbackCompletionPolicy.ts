import type { LearningListEntry } from "./types";

export function isPlaybackComplete({
  currentTime,
  duration,
  playing,
  toleranceSeconds = 0.5,
}: {
  currentTime: number;
  duration: number;
  playing: boolean;
  toleranceSeconds?: number;
}): boolean {
  return duration > 0 && !playing && currentTime >= Math.max(0, duration - toleranceSeconds);
}

export function nextIncompleteLearningEntry(
  entries: LearningListEntry[],
  currentBvid: string,
  currentPartCid: number,
): LearningListEntry | null {
  const currentIndex = entries.findIndex((entry) =>
    entry.bvid === currentBvid && (entry.partCid ?? 0) === currentPartCid,
  );
  const start = currentIndex >= 0 ? currentIndex + 1 : 0;
  return entries.slice(start).find((entry) => !entry.completedAt) ?? null;
}
