/**
 * RIXIA 视频截图服务 — 1:1 TS 移植自 FocuBili 的
 * video_shot_service.dart（166 行）。
 *
 * 通过 B 站公开视频截图接口读取雪碧预览图元数据，
 * 用于播放器进度条拖动时的视频帧预览。
 */

import type { JsonRequest } from "./types";
import type { VideoShotPreview } from "./extendedModels";
import type { VideoShotFrame } from "./extendedModels";
import { createJsonRequest } from "./httpAdapter";

export interface VideoShotService {
  loadPreview(bvid: string, cid: number): Promise<VideoShotPreview | null>;
}

export interface VideoShotCropRect {
  sx: number;
  sy: number;
  width: number;
  height: number;
}

export function cropRectForFrame(frame: VideoShotFrame): VideoShotCropRect {
  return {
    sx: Math.max(0, frame.column) * frame.frameWidth,
    sy: Math.max(0, frame.row) * frame.frameHeight,
    width: frame.frameWidth,
    height: frame.frameHeight,
  };
}

/** Loads one sprite sheet and returns the selected frame as a portable data URL. */
export async function captureVideoShotFrame(frame: VideoShotFrame): Promise<string | null> {
  if (!frame.imageUrl || frame.frameWidth <= 0 || frame.frameHeight <= 0) return null;
  if (typeof Image === "undefined" || typeof document === "undefined") return null;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.crossOrigin = "anonymous";
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("视频帧图片加载失败"));
      element.src = frame.imageUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = frame.frameWidth;
    canvas.height = frame.frameHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const crop = cropRectForFrame(frame);
    context.drawImage(image, crop.sx, crop.sy, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export function createEmptyVideoShotService(): VideoShotService {
  return {
    async loadPreview() {
      return null;
    },
  };
}

const API_HOST = "api.bilibili.com";
const PATH = "/x/player/videoshot";

export function createBilibiliVideoShotService(
  requestJson: JsonRequest = createJsonRequest(),
): VideoShotService {
  return {
    async loadPreview(bvid, cid) {
      if (!bvid.trim() || cid <= 0) return null;
      try {
        const url = `https://${API_HOST}${PATH}?bvid=${encodeURIComponent(bvid)}&cid=${cid}&index=1`;
        const text = await requestJson(url);
        let decoded: unknown;
        try {
          decoded = JSON.parse(text);
        } catch {
          return null;
        }
        if (typeof decoded !== "object" || decoded === null) return null;
        const root = decoded as Record<string, unknown>;
        const code = readInt(root.code);
        if (code !== 0) return null;
        const data = readMap(root.data);
        const imageUrls = readImageUrls(data.image);
        const sampleSeconds = readIndexes(data.index);
        const columns = readPositiveInt(data.img_x_len);
        const rows = readPositiveInt(data.img_y_len);
        const width = readPositiveInt(data.img_x_size);
        const height = readPositiveInt(data.img_y_size);
        if (
          imageUrls.length === 0 ||
          sampleSeconds.length === 0 ||
          columns <= 0 ||
          rows <= 0 ||
          width <= 0 ||
          height <= 0
        ) {
          return null;
        }
        return {
          imageUrls,
          sampleSeconds,
          columns,
          rows,
          frameWidth: width,
          frameHeight: height,
        };
      } catch {
        return null;
      }
    },
  };
}

function readMap(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readInt(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

function readPositiveInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n) || n <= 0) return 0;
  return n;
}

function readIndexes(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const indexes = value
    .map((item) => {
      if (typeof item === "number") return item;
      const n = Number.parseInt(String(item ?? ""), 10);
      return Number.isNaN(n) ? null : n;
    })
    .filter((item): item is number => item != null && item >= 0)
    .sort((a, b) => a - b);
  return indexes;
}

function readImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    const raw = String(item ?? "").trim();
    if (!raw) continue;
    const normalized = raw.startsWith("//") ? `https:${raw}` : raw;
    let parsed: URL | null;
    try {
      parsed = new URL(normalized);
    } catch {
      parsed = null;
    }
    if (
      parsed &&
      parsed.protocol === "https:" &&
      (parsed.host.endsWith(".hdslb.com") || parsed.host.endsWith(".biliimg.com"))
    ) {
      urls.push(parsed.toString());
    }
  }
  return urls;
}
