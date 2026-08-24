import type { DashTrack, PlayUrlResult } from "./playurlService";
import { rankMediaSourceUrls } from "./mediaHostPolicy";

export function pickPlayableDashVideo(videos: DashTrack[]): DashTrack | undefined {
  if (videos.length === 0) return undefined;
  return videos.find((track) => /avc/i.test(track.codecs)) ?? videos[0];
}

export function trackSourceCandidates(track: Pick<DashTrack, "baseUrl" | "backupUrls">): string[] {
  const candidates: string[] = [];
  for (const value of [track.baseUrl, ...track.backupUrls]) {
    const url = value.trim();
    if (url && !candidates.includes(url)) candidates.push(url);
  }
  const ranked = rankMediaSourceUrls(candidates);
  return ranked.length > 0 ? ranked : candidates;
}

export interface NativePlaybackOpenPlan {
  resolve: () => Promise<PlayUrlResult>;
  open: (videoUrl: string, audioUrl?: string) => Promise<void>;
  maxRefreshes?: number;
  fallbackResolve?: () => Promise<PlayUrlResult>;
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
  fallbackResolve,
}: NativePlaybackOpenPlan): Promise<PlayUrlResult> {
  try {
    return await openResolvedSources(resolve, open, maxRefreshes);
  } catch (error) {
    if (!fallbackResolve) throw error;
    return await openResolvedSources(fallbackResolve, open, 0);
  }
}

async function openResolvedSources(
  resolve: () => Promise<PlayUrlResult>,
  open: (videoUrl: string, audioUrl?: string) => Promise<void>,
  maxRefreshes: number,
): Promise<PlayUrlResult> {
  let lastError: unknown = new Error("没有可用的 DASH 播放线路");
  for (let refresh = 0; refresh <= Math.max(0, Math.trunc(maxRefreshes)); refresh += 1) {
    const response = await resolve();
    const videoTrack = pickPlayableDashVideo(response.dash?.video ?? []);
    const audioTrack = response.dash?.audio?.[0];
    if (videoTrack) {
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
    const progressive = response.durl?.map((item) => item.url).filter((url) => /^https:\/\//.test(url)) ?? [];
    for (const videoUrl of progressive) {
      try {
        await open(videoUrl);
        return response;
      } catch (error) {
        lastError = error;
      }
    }
    if (!videoTrack && progressive.length === 0) {
      lastError = new Error("当前视频没有可用的播放线路");
    }
  }
  throw lastError instanceof Error ? lastError : new Error("所有视频 CDN 地址均无法播放");
}
