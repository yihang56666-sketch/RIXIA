/**
 * RIXIA 专注鼓励 + 外链 + 应用更新 + 笔记导出 — TS 移植自 FocuBili 的：
 * - focus_encouragement_service.dart（60 行）
 * - external_link_service.dart（12 行）
 * - app_update_service.dart（579 行，简化为核心逻辑）
 * - video_note_export_service.dart（215 行）
 *
 * 省略了纯 Flutter 平台通道部分（focus_notification_service 452 行、
 * focus_share_service 64 行、video_note_share_service 155 行），
 * 这些依赖 Flutter 原生 notification / share_plus / path_provider /
 * RenderRepaintBoundary，在 Web 上用 Web API 替代（见下方注释）。
 */

// ============ Focus Encouragement ============

// FocuBili assets/data/focus_encouragements.json 原文（资源不可用时兜底）。
const FALLBACK_MESSAGES: Record<string, string[]> = {
  regular: [
    "先别急着停下来，再陪目标走五分钟。",
    "把注意力带回这一小步，你不需要一次完成全部。",
    "刚才的投入没有白费，继续播放就能接着累计。",
    "短暂分心很正常，回来就是一次新的开始。",
    "先完成眼前这一段，再决定要不要休息。",
    "你已经开始了，保持节奏会比重新启动更轻松。",
  ],
  nearCompletion: [
    "已经完成大部分了，最后这一段最值得坚持。",
    "终点已经很近，再专注几分钟就能完整收尾。",
    "你已完成至少八成，继续播放把这次专注变成一次完成。",
    "只剩不到五分钟，给这次努力一个完整的句号。",
    "现在放弃最可惜，再坚持一小会儿就完成了。",
  ],
};

export interface FocusEncouragementService {
  messageFor(nearCompletion: boolean, seed: number): Promise<string>;
}

export function createFocusEncouragementService(
  loadAsset?: () => Promise<string>,
): FocusEncouragementService {
  let cached: Record<string, string[]> | null = null;
  return {
    async messageFor(nearCompletion, seed) {
      const messages = cached ??= await loadMessages();
      const key = nearCompletion ? "nearCompletion" : "regular";
      const candidates = messages[key] ?? FALLBACK_MESSAGES[key]!;
      return candidates[Math.abs(seed) % candidates.length]!;
    },
  };

  async function loadMessages(): Promise<Record<string, string[]>> {
    if (!loadAsset) return { ...FALLBACK_MESSAGES };
    try {
      const raw = await loadAsset();
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return { ...FALLBACK_MESSAGES };
      const result: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(value)) {
          result[key] = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
        }
      }
      return result;
    } catch {
      return { ...FALLBACK_MESSAGES };
    }
  }
}

// ============ External Link ============

export async function launchExternalLink(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.host) {
    return false;
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

// ============ App Update (GitHub Releases) ============

export const APP_VERSION = "0.3.12";

export enum AppUpdateStatus {
  idle = "idle",
  disabled = "disabled",
  checking = "checking",
  upToDate = "upToDate",
  available = "available",
  failed = "failed",
}

export interface AppUpdateResult {
  status: AppUpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  downloadUrl?: string;
  releaseHighlights: string[];
  message?: string;
}

const GITHUB_API = "https://api.github.com/repos/Yihang56666-sketch/RIXIA/releases?per_page=1";
const UPDATE_CACHE_KEY = "rixia_app_update_cache_v1";
const UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function parseVersion(value: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isNewerVersion(latest: string, current: string): boolean {
  const left = parseVersion(latest);
  const right = parseVersion(current);
  if (!left || !right) return latest !== current;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

interface CachedUpdate {
  savedAt: number;
  result: AppUpdateResult;
}

function readUpdateCache(currentVersion: string): AppUpdateResult | null {
  try {
    const raw = localStorage.getItem(UPDATE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedUpdate;
    if (!cached?.result || cached.result.currentVersion !== currentVersion) return null;
    if (Date.now() - cached.savedAt > UPDATE_CACHE_TTL_MS) return null;
    return cached.result;
  } catch {
    return null;
  }
}

function writeUpdateCache(result: AppUpdateResult): void {
  try {
    localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), result }));
  } catch {
    // A blocked storage environment must not stop the app from loading.
  }
}

function failedUpdate(currentVersion: string, message = "暂时无法检查更新，请稍后再试。"): AppUpdateResult {
  return {
    status: AppUpdateStatus.failed,
    currentVersion,
    message,
    releaseHighlights: [],
  };
}

export async function checkForUpdate(
  currentVersion: string,
  options: { force?: boolean } = {},
): Promise<AppUpdateResult> {
  if (!options.force) {
    const cached = readUpdateCache(currentVersion);
    if (cached) return cached;
  }
  const result = await requestLatestRelease(currentVersion);
  writeUpdateCache(result);
  return result;
}

async function requestLatestRelease(currentVersion: string): Promise<AppUpdateResult> {
  try {
    const response = await fetch(GITHUB_API, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "X-Requested-With": "BEID",
      },
    });
    if (response.status === 404) {
      return {
        status: AppUpdateStatus.upToDate,
        currentVersion,
        releaseHighlights: [],
      };
    }
    if (response.status === 403 || response.status === 429) {
      return failedUpdate(currentVersion);
    }
    if (!response.ok) {
      return failedUpdate(currentVersion);
    }
    const payload = await response.json() as {
      tag_name?: string;
      html_url?: string;
      body?: string;
      assets?: Array<{ browser_download_url?: string }>;
    } | Array<{
      tag_name?: string;
      html_url?: string;
      body?: string;
      assets?: Array<{ browser_download_url?: string }>;
    }>;
    const data = Array.isArray(payload) ? payload[0] : payload;
    if (!data) {
      return {
        status: AppUpdateStatus.upToDate,
        currentVersion,
        releaseHighlights: [],
      };
    }
    const latestRaw = data.tag_name?.replace(/^v/, "") ?? "";
    const hasUpdate = Boolean(latestRaw && isNewerVersion(latestRaw, currentVersion));
    const highlights = (data.body ?? "")
      .split("\n")
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter((line) => line.length > 0)
      .slice(0, 10);
    return {
      status: hasUpdate ? AppUpdateStatus.available : AppUpdateStatus.upToDate,
      currentVersion,
      latestVersion: latestRaw || undefined,
      releaseUrl: data.html_url,
      downloadUrl: data.assets?.[0]?.browser_download_url,
      releaseHighlights: highlights,
    };
  } catch {
    return failedUpdate(currentVersion);
  }
}

// ============ Video Note Export ============

export enum VideoNoteExportFormat {
  markdown = "markdown",
  json = "json",
}

export interface VideoNoteExportPackage {
  fileName: string;
  bytes: Uint8Array;
  noteCount: number;
  imageCount: number;
}

import type { VideoNote } from "./types";

export function exportVideoNotes(
  notes: VideoNote[],
  format: VideoNoteExportFormat,
  videoTitle: string,
): VideoNoteExportPackage {
  const safeTitle = videoTitle.replace(/[<>:"/\\|?*]/g, "_").slice(0, 80) || "rixia-notes";
  const timestamp = new Date().toISOString().slice(0, 10);
  const imageCount = notes.filter((note) => typeof note.framePath === "string" && note.framePath.trim().length > 0).length;
  if (format === VideoNoteExportFormat.json) {
    const json = JSON.stringify(notes, null, 2);
    const bytes = new TextEncoder().encode(json);
    return {
      fileName: `${safeTitle}-${timestamp}.json`,
      bytes,
      noteCount: notes.length,
      imageCount,
    };
  }
  // Markdown
  const lines: string[] = [`# ${videoTitle} 笔记`, ""];
  for (const note of notes) {
    const min = Math.floor(note.positionSeconds / 60);
    const sec = note.positionSeconds % 60;
    const time = `${min}:${String(sec).padStart(2, "0")}`;
    lines.push(`## ${time} — ${note.title}`);
    lines.push("");
    lines.push(note.body);
    lines.push("");
    if (note.framePath) {
      lines.push(`![时间点画面](${note.framePath})`);
      lines.push("");
    }
    lines.push(`> 创建于 ${note.createdAt}`);
    lines.push("");
  }
  const bytes = new TextEncoder().encode(lines.join("\n"));
  return {
    fileName: `${safeTitle}-${timestamp}.md`,
    bytes,
    noteCount: notes.length,
    imageCount,
  };
}

/** 触发浏览器下载导出文件。 */
export function downloadExportPackage(pkg: VideoNoteExportPackage): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([pkg.bytes as BlobPart], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pkg.fileName;
  a.click();
  URL.revokeObjectURL(url);
}
