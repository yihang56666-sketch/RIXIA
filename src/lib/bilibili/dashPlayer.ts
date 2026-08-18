/**
 * RIXIA DASH MSE 播放器 — 用 MediaSource Extensions 把 B 站 DASH 视频/音频流
 * 拼接给 HTML5 <video> 元素，实现完全原生的播放控制（替代 B 站官方 iframe embed）。
 *
 * 与 FocuBili 的 video_player 插件不同（Flutter 走 native 媒体管线），Web 端
 * 走 MSE。当浏览器不支持 MSE 或视频流 URL 被跨域拦截时，降级到 durl（mp4 直链）。
 *
 * 用法：
 *   const player = new DashPlayer(videoElement);
 *   await player.load(dashStream);  // 或 loadDurl(durl)
 *   player.play();
 */

import type { DashStream, PlayUrlResult } from "./playurlService";

export interface DashPlayerOptions {
  video: HTMLVideoElement;
  onTimeUpdate?: (seconds: number) => void;
  onDurationChange?: (seconds: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onError?: (message: string) => void;
}

export class DashPlayer {
  private readonly video: HTMLVideoElement;
  private readonly options: DashPlayerOptions;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;

  constructor(options: DashPlayerOptions) {
    this.options = options;
    this.video = options.video;
    this.attachVideoEvents();
  }

  private attachVideoEvents(): void {
    this.video.addEventListener("timeupdate", () => {
      this.options.onTimeUpdate?.(this.video.currentTime);
    });
    this.video.addEventListener("durationchange", () => {
      this.options.onDurationChange?.(this.video.duration);
    });
    this.video.addEventListener("play", () => this.options.onPlay?.());
    this.video.addEventListener("pause", () => this.options.onPause?.());
    this.video.addEventListener("error", () => {
      this.options.onError?.(this.video.error?.message ?? "未知播放错误");
    });
  }

  /**
   * 加载 DASH 流。需要 MSE 支持；如果浏览器不支持 MSE，调用方应回退到 loadDurl。
   */
  async load(stream: DashStream): Promise<void> {
    if (typeof MediaSource === "undefined" || !MediaSource.isTypeSupported("video/mp4; codecs=\"avc1.42E01E, mp4a.40.2\"")) {
      throw new Error("浏览器不支持 MSE，请回退到 durl");
    }
    this.mediaSource = new MediaSource();
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    this.video.src = this.objectUrl;
    await new Promise<void>((resolve) => {
      if (!this.mediaSource) {
        resolve();
        return;
      }
      this.mediaSource.addEventListener("sourceopen", () => resolve(), { once: true });
    });
    if (!this.mediaSource) return;
    // 简化实现：拼接第一个 video track + 第一个 audio track
    // 真实 DASH 播放器需要分段加载（SegmentLoader），这里用整体 fetch + append
    const videoTrack = stream.video[0];
    const audioTrack = stream.audio[0];
    if (!videoTrack) {
      throw new Error("DASH 流没有视频轨道");
    }
    // 用 mimeType: video/mp4; codecs="avc1.42E01E, mp4a.40.2"
    const codecs = videoTrack.codecs || "avc1.42E01E";
    const audioCodecs = audioTrack?.codecs || "mp4a.40.2";
    const mimeType = `video/mp4; codecs="${codecs}, ${audioCodecs}"`;
    if (!MediaSource.isTypeSupported(mimeType)) {
      throw new Error(`MIME 不支持：${mimeType}`);
    }
    this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
    try {
      // fetch video + audio 并行
      const [videoBuf, audioBuf] = await Promise.all([
        videoTrack ? fetchArrayBuffer(videoTrack.baseUrl) : Promise.resolve(null),
        audioTrack ? fetchArrayBuffer(audioTrack.baseUrl) : Promise.resolve(null),
      ]);
      if (videoBuf) await this.appendBuffer(videoBuf);
      if (audioBuf) await this.appendBuffer(audioBuf);
      this.mediaSource.endOfStream();
    } catch (err) {
      this.options.onError?.(err instanceof Error ? err.message : "加载 DASH 流失败");
    }
  }

  /**
   * 加载 durl（mp4 直链）作为后备方案。
   * 注意：B 站对视频 URL 有 referer 检查；浏览器 HTML5 video 直接 src 会失败。
   * 在 Capacitor 原生模式下，可以通过 native HTTP 下载后用 blob URL 播放。
   */
  async loadDurl(durl: PlayUrlResult["durl"]): Promise<void> {
    if (!durl || durl.length === 0) {
      throw new Error("没有可用的 mp4 直链");
    }
    // 尝试直接赋值 src（在原生 webview 或无 referer 限制时可用）
    const first = durl[0]!;
    this.video.src = first.url;
    this.video.load();
  }

  private async appendBuffer(buffer: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.sourceBuffer) {
        reject(new Error("SourceBuffer 未初始化"));
        return;
      }
      this.sourceBuffer.addEventListener("updateend", () => resolve(), { once: true });
      this.sourceBuffer.addEventListener("error", (e) => reject(e), { once: true });
      this.sourceBuffer.appendBuffer(buffer);
    });
  }

  play(): Promise<void> {
    return this.video.play();
  }

  pause(): void {
    this.video.pause();
  }

  seek(time: number): void {
    this.video.currentTime = time;
  }

  setVolume(volume: number): void {
    this.video.volume = Math.max(0, Math.min(1, volume));
  }

  getCurrentTime(): number {
    return this.video.currentTime;
  }

  getDuration(): number {
    return this.video.duration;
  }

  destroy(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.video.removeAttribute("src");
    this.video.load();
  }
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    headers: { Referer: "https://www.bilibili.com/" },
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`获取媒体流失败：HTTP ${response.status}`);
  }
  return response.arrayBuffer();
}
