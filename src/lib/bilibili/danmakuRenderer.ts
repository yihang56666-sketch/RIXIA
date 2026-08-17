/**
 * RIXIA 弹幕渲染器 — TS 移植自 FocuBili 的 player_danmaku_rendering.dart
 * + danmaku_launch_scheduler.dart。
 *
 * 实现要点（与 FocuBili 一致）：
 * - 弹幕按时间窗口分片加载
 * - 滚动/顶部/底部三种模式
 * - 同一行（lane）的弹幕最小间隔 = travelDuration / maxVisibleEntries
 * - 排队超过 maximumDelay 的弹幕被丢弃
 * - 支持透明度、字号、显示区域、合并重复、屏蔽词
 */

import type { DanmakuEntry, DanmakuPreferences } from "./types";
import { DanmakuMode } from "./types";
import { DEFAULT_DANMAKU_PREFERENCES } from "./types";

const MAXIMUM_DELAY_SECONDS = 2;

export interface DanmakuRenderEntry extends DanmakuEntry {
  lane: number;
  renderedStartSeconds: number;
  textWidth: number;
}

export interface DanmakuRendererOptions {
  canvasWidth: number;
  canvasHeight: number;
  preferences: DanmakuPreferences;
  fontSize?: number;
  fontFamily?: string;
}

export class DanmakuRenderer {
  private preferences: DanmakuPreferences;
  private readonly canvasWidth: number;
  private readonly canvasHeight: number;
  private readonly fontSize: number;
  private readonly fontFamily: string;
  private lastCommittedStartByLane: Map<number, number> = new Map();
  private measureCanvas: HTMLCanvasElement | null = null;

  constructor(options: DanmakuRendererOptions) {
    this.preferences = options.preferences;
    this.canvasWidth = options.canvasWidth;
    this.canvasHeight = options.canvasHeight;
    this.fontSize = options.fontSize ?? options.preferences.fontSize;
    this.fontFamily = options.fontFamily ??
      `-apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`;
  }

  updatePreferences(preferences: DanmakuPreferences): void {
    this.preferences = preferences;
  }

  /** 计算给定时刻应渲染的弹幕条目（含 lane 分配）。 */
  schedule(entries: DanmakuEntry[], currentTimeSeconds: number): DanmakuRenderEntry[] {
    if (!this.preferences.enabled) return [];
    const visibleAreaHeight = this.canvasHeight * this.preferences.displayArea;
    const laneHeight = this.fontSize + 4;
    const laneCount = Math.max(1, Math.min(this.preferences.laneCount, Math.floor(visibleAreaHeight / laneHeight)));
    const travelSeconds = this.preferences.scrollDurationSeconds;
    const minimumSpacing = travelSeconds / Math.max(1, laneCount * 2);

    this.lastCommittedStartByLane.clear();

    const window = 0.5;
    const out: DanmakuRenderEntry[] = [];
    for (const entry of entries) {
      if (entry.startTimeSeconds > currentTimeSeconds + window) break;
      if (entry.startTimeSeconds + entry.durationSeconds < currentTimeSeconds - window) continue;
      if (this.isBlocked(entry)) continue;
      const lane = this.pickLane(entry, currentTimeSeconds, minimumSpacing, laneCount);
      if (lane < 0) continue;
      const textWidth = this.measureText(entry.text);
      const renderedStart = Math.max(entry.startTimeSeconds, this.lastCommittedStartByLane.get(lane) ?? 0);
      this.lastCommittedStartByLane.set(lane, renderedStart + (entry.durationSeconds || travelSeconds));
      out.push({ ...entry, lane, renderedStartSeconds: renderedStart, textWidth });
    }
    return out;
  }

  private pickLane(
    entry: DanmakuEntry,
    _currentTimeSeconds: number,
    minimumSpacing: number,
    laneCount: number,
  ): number {
    const mode = entry.mode;
    const eligibleLaneStart = mode === DanmakuMode.top ? 0 : mode === DanmakuMode.bottom ? laneCount - 1 : 0;
    const eligibleLaneEnd = mode === DanmakuMode.top ? Math.floor(laneCount / 2) : mode === DanmakuMode.bottom ? laneCount : laneCount;
    let bestLane = -1;
    let bestStart = Infinity;
    for (let lane = eligibleLaneStart; lane < eligibleLaneEnd; lane++) {
      const last = this.lastCommittedStartByLane.get(lane) ?? 0;
      const candidate = Math.max(entry.startTimeSeconds, last + minimumSpacing);
      if (candidate - entry.startTimeSeconds > MAXIMUM_DELAY_SECONDS) continue;
      if (candidate < bestStart) {
        bestStart = candidate;
        bestLane = lane;
      }
    }
    return bestLane;
  }

  private isBlocked(entry: DanmakuEntry): boolean {
    if (entry.mode === DanmakuMode.scrolling && !this.preferences.showScrolling) return true;
    if (entry.mode === DanmakuMode.top && !this.preferences.showTop) return true;
    if (entry.mode === DanmakuMode.bottom && !this.preferences.showBottom) return true;
    if (this.preferences.blockedKeywords.some((kw) => entry.text.includes(kw))) return true;
    return false;
  }

  private measureText(text: string): number {
    if (typeof document === "undefined") return text.length * this.fontSize * 0.6;
    if (!this.measureCanvas) {
      this.measureCanvas = document.createElement("canvas");
    }
    const ctx = this.measureCanvas.getContext("2d");
    if (!ctx) return text.length * this.fontSize * 0.6;
    ctx.font = `${this.fontSize}px ${this.fontFamily}`;
    return ctx.measureText(text).width;
  }

  getMetrics() {
    return {
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      fontSize: this.fontSize,
      laneCount: this.preferences.laneCount,
      displayArea: this.preferences.displayArea,
    };
  }
}

export function normalizeDanmakuPreferences(value: Partial<DanmakuPreferences> | null | undefined): DanmakuPreferences {
  if (!value) return { ...DEFAULT_DANMAKU_PREFERENCES };
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_DANMAKU_PREFERENCES.enabled,
    opacity: typeof value.opacity === "number" ? clamp(value.opacity, 0, 1) : DEFAULT_DANMAKU_PREFERENCES.opacity,
    fontSize: typeof value.fontSize === "number" ? clamp(value.fontSize, 8, 48) : DEFAULT_DANMAKU_PREFERENCES.fontSize,
    laneCount: typeof value.laneCount === "number" ? clampInt(value.laneCount, 1, 30) : DEFAULT_DANMAKU_PREFERENCES.laneCount,
    scrollDurationSeconds: typeof value.scrollDurationSeconds === "number" ? clamp(value.scrollDurationSeconds, 3, 30) : DEFAULT_DANMAKU_PREFERENCES.scrollDurationSeconds,
    displayArea: typeof value.displayArea === "number" ? clamp(value.displayArea, 0.1, 1) : DEFAULT_DANMAKU_PREFERENCES.displayArea,
    strokeWidth: typeof value.strokeWidth === "number" ? clamp(value.strokeWidth, 0, 6) : DEFAULT_DANMAKU_PREFERENCES.strokeWidth,
    showScrolling: typeof value.showScrolling === "boolean" ? value.showScrolling : true,
    showTop: typeof value.showTop === "boolean" ? value.showTop : true,
    showBottom: typeof value.showBottom === "boolean" ? value.showBottom : true,
    mergeRepeated: typeof value.mergeRepeated === "boolean" ? value.mergeRepeated : true,
    blockedKeywords: Array.isArray(value.blockedKeywords) ? value.blockedKeywords.filter((k): k is string => typeof k === "string") : [],
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.trunc(clamp(value, min, max));
}

export { DEFAULT_DANMAKU_PREFERENCES };
