import type { DashTrack, PlayUrlResult } from "./playurlService";

export function trackSourceCandidates(track: Pick<DashTrack, "baseUrl" | "backupUrls">): string[] {
  const candidates: string[] = [];
  for (const value of [track.baseUrl, ...track.backupUrls]) {
    const url = value.trim();
    if (url && !candidates.includes(url)) candidates.push(url);
  }
  return candidates;
}

export interface NativePlaybackOpenPlan {
  resolve: () => Promise<PlayUrlResult>;
  open: (videoUrl: string, audioUrl?: string) => Promise<void>;
  maxRefreshes?: number;
}

/**
 * Opens a native DASH source, refreshing playurl once when all current CDN
 * combinations fail. Bilibili CDN URLs are short-lived, so a fresh response
 * is more useful than repeatedly retrying stale URLs.
 */
export async function openNativePlaybackWithRefresh({
  resolve,
  open,
  maxRefreshes = 1,
}: NativePlaybackOpenPlan): Promise<PlayUrlResult> {
  let lastError: unknown = new Error("没有可用的 DASH 播放线路");
  for (let refresh = 0; refresh <= Math.max(0, Math.trunc(maxRefreshes)); refresh += 1) {
    const response = await resolve();
    const videoTrack = response.dash?.video[0];
    if (!videoTrack) {
      lastError = new Error("当前视频没有可用的 DASH 视频轨");
      continue;
    }
    const audioTrack = response.dash?.audio[0];
    const videoSources = trackSourceCandidates(videoTrack);
    const audioSources = audioTrack ? trackSourceCandidates(audioTrack) : [undefined];
    for (const videoUrl of videoSources) {
      for (const audioUrl of audioSources) {
        try {
          await open(videoUrl, audioUrl);
          return response;
        } catch (error) {
          lastError = error;
        }
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("所有视频 CDN 地址均无法播放");
}
