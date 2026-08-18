/**
 * RIXIA B 站视频流解析器 — 复刻 FocuBili 通过原生 HTTP 请求 playurl 接口
 * 的逻辑，用于在 RIXIA 内部用 HTML5 video 直接播放视频（而不是嵌 B 站官方 iframe）。
 *
 * 接口：GET https://api.bilibili.com/x/player/playurl?bvid=...&cid=...&qn=80&fnval=16&fnver=0
 *   fnval=16 表示请求 DASH 格式（视频流 + 音频流分离）
 *   qn=64/74/80/112 表示清晰度（480/720/1080/1080+）
 *
 * 返回 JSON：
 *   {
 *     "code": 0,
 *     "data": {
 *       "quality": 80,
 *       "format": "flv720",
 *       "timelength": 600000,
 *       "accept_quality": [80, 64, 32, 16],
 *       "dash": {
 *         "video": [{ "id": 80, "baseUrl": "https://...", "codecs": "avc", ... }],
 *         "audio": [{ "id": 30280, "baseUrl": "https://...", ... }],
 *         "dolby": {...},
 *         "flac": {...}
 *       },
 *       "durl": [...]  // fnval!=16 时的备用 mp4 流
 *     }
 *   }
 *
 * 注意：B 站对视频流 URL 有 referer 检查。浏览器直接 fetch 会被 CORS + referer 拦截。
 * 在纯 Web 模式下，使用 durl（mp4 直链）作为后备；在 Capacitor 原生模式下
 * 用 dash.video + dash.audio 走 MSE 拼接。
 */

import type { JsonRequest } from "./types";

export interface DashStream {
  video: DashTrack[];
  audio: DashTrack[];
  durationMs: number;
  quality: number;
  acceptQuality: number[];
}

export interface DashTrack {
  id: number;
  baseUrl: string;
  backupUrls: string[];
  codecs: string;
  bandwidth: number;
  width?: number;
  height?: number;
}

export interface PlayUrlResult {
  dash?: DashStream;
  durl?: Array<{ order: number; length: number; size: number; url: string; backup_url: string[] }>;
  quality: number;
  acceptQuality: number[];
  timelengthMs: number;
}

export interface PlayurlService {
  resolve(bvid: string, cid: number, options?: { qn?: number; fnval?: number }): Promise<PlayUrlResult>;
}

const API_HOST = "api.bilibili.com";
const PLAYURL_PATH = "/x/player/playurl";

const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export function createPlayurlService(
  requestJson: JsonRequest = defaultRequestJson,
): PlayurlService {
  return {
    async resolve(bvid, cid, options = {}) {
      const qn = options.qn ?? 80;
      const fnval = options.fnval ?? 16;
      const params = new URLSearchParams({
        bvid,
        cid: String(cid),
        qn: String(qn),
        fnval: String(fnval),
        fnver: "0",
        fourk: "1",
      });
      const url = `https://${API_HOST}${PLAYURL_PATH}?${params.toString()}`;
      const text = await requestJson(url);
      return parsePlayUrl(text);
    },
  };
}

async function defaultRequestJson(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": DESKTOP_USER_AGENT,
      Referer: "https://www.bilibili.com/",
      Accept: "application/json",
    },
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`playurl 接口请求失败：HTTP ${response.status}`);
  }
  return response.text();
}

export function parsePlayUrl(text: string): PlayUrlResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new Error("playurl 接口返回的 JSON 无法解析");
  }
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("playurl 接口返回了非对象响应");
  }
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code !== 0) {
    const message = readText(root.message);
    throw new Error(message ? `${message}（错误码：${code}）` : `playurl 失败（错误码：${code}）`);
  }
  const data = root.data;
  if (typeof data !== "object" || data === null) {
    throw new Error("playurl 接口没有返回 data");
  }
  const d = data as Record<string, unknown>;
  const result: PlayUrlResult = {
    quality: readInteger(d.quality),
    acceptQuality: Array.isArray(d.accept_quality)
      ? (d.accept_quality as unknown[]).map((v) => readInteger(v))
      : [],
    timelengthMs: readInteger(d.timelength),
  };
  const dashRaw = d.dash;
  if (typeof dashRaw === "object" && dashRaw !== null) {
    const dash = dashRaw as Record<string, unknown>;
    const videos = Array.isArray(dash.video) ? (dash.video as unknown[]) : [];
    const audios = Array.isArray(dash.audio) ? (dash.audio as unknown[]) : [];
    result.dash = {
      video: videos.map(parseDashTrack).filter((t): t is DashTrack => t != null),
      audio: audios.map(parseDashTrack).filter((t): t is DashTrack => t != null),
      durationMs: readInteger(dash.duration) || result.timelengthMs,
      quality: readInteger(dash.video instanceof Array && dash.video[0] ? (dash.video[0] as Record<string, unknown>).id : 0),
      acceptQuality: result.acceptQuality,
    };
  }
  const durlRaw = d.durl;
  if (Array.isArray(durlRaw)) {
    result.durl = (durlRaw as unknown[]).map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        order: readInteger(item.order),
        length: readInteger(item.length),
        size: readInteger(item.size),
        url: readText(item.url),
        backup_url: Array.isArray(item.backup_url) ? (item.backup_url as unknown[]).map((v) => String(v)) : [],
      };
    });
  }
  return result;
}

function parseDashTrack(raw: unknown): DashTrack | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const baseUrl = readText(item.baseUrl || item.base_url);
  if (!baseUrl) return null;
  const backupUrls = Array.isArray(item.backupUrl || item.backup_url)
    ? ((item.backupUrl ?? item.backup_url) as unknown[]).map((v) => String(v))
    : [];
  return {
    id: readInteger(item.id),
    baseUrl,
    backupUrls,
    codecs: readText(item.codecs),
    bandwidth: readInteger(item.bandwidth),
    width: typeof item.width === "number" ? (item.width as number) : undefined,
    height: typeof item.height === "number" ? (item.height as number) : undefined,
  };
}

function readInteger(value: unknown): number {
  if (typeof value === "number") return Math.max(0, Math.min(Math.trunc(value), 2 ** 31));
  const n = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(n, 2 ** 31));
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
