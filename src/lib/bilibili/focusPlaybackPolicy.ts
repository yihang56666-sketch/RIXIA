export interface VideoFocusPartInput {
  bvid: string;
  title: string;
  cid: number;
  pageNumber: number;
  partTitle: string;
}

export function buildVideoFocusRequest(part: VideoFocusPartInput, isPlaying: boolean, positionSeconds: number) {
  const title = part.title.trim() || "B 站视频";
  const partLabel = part.partTitle.trim() || `第 ${part.pageNumber} P`;
  return {
    goal: `${title} · P${part.pageNumber} ${partLabel}`,
    durationMs: 25 * 60_000,
    startImmediately: isPlaying,
    sourceBvid: part.bvid,
    sourceVideoTitle: title,
    sourcePartCid: part.cid,
    sourcePartPageNumber: part.pageNumber,
    sourcePartTitle: partLabel,
    sourcePositionMs: Math.max(0, Math.round(positionSeconds * 1000)),
    completeOnPartEnd: true,
  };
}
