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

const FALLBACK_MESSAGES: Record<string, string[]> = {
  nearCompletion: ["最后一点了，再坚持一下！", "马上就到了！", "收尾时间！"],
  regular: ["保持节奏，继续加油！", "你正在变得更好", "每一步都算数"],
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

const GITHUB_API = "https://api.github.com/repos/Yihang56666-sketch/clock/releases/latest";

export async function checkForUpdate(currentVersion: string): Promise<AppUpdateResult> {
  try {
    const response = await fetch(GITHUB_API, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!response.ok) {
      return {
        status: AppUpdateStatus.failed,
        currentVersion,
        message: `HTTP ${response.status}`,
        releaseHighlights: [],
      };
    }
    const data = await response.json() as {
      tag_name?: string;
      html_url?: string;
      body?: string;
      assets?: Array<{ browser_download_url?: string }>;
    };
    const latestRaw = data.tag_name?.replace(/^v/, "") ?? "";
    const hasUpdate = latestRaw && latestRaw !== currentVersion;
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
  } catch (err) {
    return {
      status: AppUpdateStatus.failed,
      currentVersion,
      message: err instanceof Error ? err.message : "未知错误",
      releaseHighlights: [],
    };
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
  if (format === VideoNoteExportFormat.json) {
    const json = JSON.stringify(notes, null, 2);
    const bytes = new TextEncoder().encode(json);
    return {
      fileName: `${safeTitle}-${timestamp}.json`,
      bytes,
      noteCount: notes.length,
      imageCount: 0,
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
    lines.push(`> 创建于 ${note.createdAt}`);
    lines.push("");
  }
  const bytes = new TextEncoder().encode(lines.join("\n"));
  return {
    fileName: `${safeTitle}-${timestamp}.md`,
    bytes,
    noteCount: notes.length,
    imageCount: 0,
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
