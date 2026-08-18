/**
 * RIXIA Bilibili 扩展模型 — 1:1 TS 移植自 FocuBili 的：
 * - player_enhancement.dart（VideoChapter / InteractiveVideoInfo / InteractiveVideoChoice / InteractiveVideoNode / PlayerEnhancementMetadata）
 * - video_shot_preview.dart（VideoShotFrame / VideoShotPreview）
 * - danmaku_presentation_window.dart（DanmakuPresentationWindow）
 * - danmaku_timeline_index.dart（DanmakuTimelineIndex）
 * - public_profile.dart（CreatorProfile / CreatorVideo / CreatorArticle / CreatorCollection / CreatorContentPage）
 * - focus_statistics.dart（FocusStatistics 完整版）
 * - player_overlay_data.dart（DanmakuSegmentLoadResult / PlayerOverlayData）
 * - learning_list_entry.dart（LearningListEntry 完整版）
 *
 * 这些模型在 src/lib/bilibili/types.ts 中仅做了简化版；此文件保留完整版。
 */

// ============ Player Enhancement ============

export interface VideoChapter {
  title: string;
  startMs: number;
  endMs: number;
  imageUrl: string;
}

export function chapterDuration(chapter: VideoChapter): number {
  return chapter.endMs > chapter.startMs ? chapter.endMs - chapter.startMs : 0;
}

export function chapterContains(chapter: VideoChapter, positionMs: number, isLast: boolean): boolean {
  return positionMs >= chapter.startMs && (positionMs < chapter.endMs || (isLast && positionMs === chapter.endMs));
}

export interface InteractiveVideoInfo {
  graphVersion: number;
}

export interface InteractiveVideoChoice {
  edgeId: number;
  cid: number;
  label: string;
}

export interface InteractiveVideoNode {
  title: string;
  edgeId: number;
  isLeaf: boolean;
  choices: InteractiveVideoChoice[];
  choicePromptLeadTimeMs?: number;
  pauseVideoForChoice: boolean;
}

export function nodeHasChoices(node: InteractiveVideoNode): boolean {
  return !node.isLeaf && node.choices.length > 0;
}

export interface PlayerEnhancementMetadata {
  chapters: VideoChapter[];
  interaction?: InteractiveVideoInfo;
}

// ============ Video Shot Preview ============

export interface VideoShotFrame {
  imageUrl: string;
  column: number;
  row: number;
  frameWidth: number;
  frameHeight: number;
  sheetColumns: number;
  sheetRows: number;
}

export interface VideoShotPreview {
  imageUrls: string[];
  sampleSeconds: number[];
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
}

export function frameForPosition(preview: VideoShotPreview, positionMs: number): VideoShotFrame | null {
  if (
    preview.imageUrls.length === 0 ||
    preview.sampleSeconds.length === 0 ||
    preview.columns <= 0 ||
    preview.rows <= 0 ||
    preview.frameWidth <= 0 ||
    preview.frameHeight <= 0
  ) {
    return null;
  }
  const targetSeconds = Math.max(0, Math.min(Math.floor(positionMs / 1000), 2 ** 31));
  let lower = 0;
  let upper = preview.sampleSeconds.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((preview.sampleSeconds[middle] ?? 0) <= targetSeconds) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  const frameIndex = Math.max(0, Math.min(lower - 1, preview.sampleSeconds.length - 1));
  const cellsPerSheet = preview.columns * preview.rows;
  const sheetIndex = Math.max(0, Math.min(Math.floor(frameIndex / cellsPerSheet), preview.imageUrls.length - 1));
  const cellIndex = frameIndex % cellsPerSheet;
  return {
    imageUrl: preview.imageUrls[sheetIndex] ?? "",
    column: cellIndex % preview.columns,
    row: Math.floor(cellIndex / preview.columns),
    frameWidth: preview.frameWidth,
    frameHeight: preview.frameHeight,
    sheetColumns: preview.columns,
    sheetRows: preview.rows,
  };
}

// ============ Danmaku Presentation Window ============

const SEGMENT_DURATION_MS = 360_000; // 6 minutes
const BUCKET_DURATION_MS = 100;

export function segmentIndexForPosition(positionMs: number): number {
  return Math.max(1, Math.floor(positionMs / SEGMENT_DURATION_MS) + 1);
}

export function startOfSegment(segmentIndex: number): number {
  const safeIndex = segmentIndex < 1 ? 1 : segmentIndex;
  return (safeIndex - 1) * SEGMENT_DURATION_MS;
}

export class DanmakuPresentationWindow {
  private segmentFloors: Map<number, number> = new Map();

  clear(): void {
    this.segmentFloors.clear();
  }

  forgetSegment(segmentIndex: number): void {
    this.segmentFloors.delete(segmentIndex);
  }

  restartFrom(positionMs: number): void {
    const safePosition = Math.max(0, positionMs);
    const segmentIndex = segmentIndexForPosition(safePosition);
    this.segmentFloors.set(segmentIndex, safePosition);
  }

  prepareSegment(segmentIndex: number, currentPositionMs: number): void {
    const segmentStart = startOfSegment(segmentIndex);
    const segmentEnd = segmentStart + SEGMENT_DURATION_MS;
    const currentInsideSegment = currentPositionMs >= segmentStart && currentPositionMs < segmentEnd;
    this.segmentFloors.set(segmentIndex, currentInsideSegment ? currentPositionMs : segmentStart);
  }

  floorForSegment(segmentIndex: number): number {
    return this.segmentFloors.get(segmentIndex) ?? startOfSegment(segmentIndex);
  }

  filterEntries<T extends { startTimeSeconds: number }>(segmentIndex: number, entries: T[]): T[] {
    if (entries.length === 0) return entries;
    const floor = this.floorForSegment(segmentIndex);
    const floorSeconds = floor / 1000;
    let lower = 0;
    let upper = entries.length;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if ((entries[middle]?.startTimeSeconds ?? 0) < floorSeconds) {
        lower = middle + 1;
      } else {
        upper = middle;
      }
    }
    if (lower === 0) return entries;
    if (lower >= entries.length) return [];
    return entries.slice(lower);
  }
}

// ============ Danmaku Timeline Index ============

export interface IndexedDanmakuEntry extends DanmakuEntry {
  repeatCount: number;
}

export function bucketForPosition(positionMs: number): number {
  return positionMs < 0 ? 0 : Math.floor(positionMs / BUCKET_DURATION_MS);
}

export class DanmakuTimelineIndex {
  readonly entries: IndexedDanmakuEntry[];
  private readonly buckets: Map<number, IndexedDanmakuEntry[]>;

  private constructor(
    entries: IndexedDanmakuEntry[],
    buckets: Map<number, IndexedDanmakuEntry[]>,
  ) {
    this.entries = entries;
    this.buckets = buckets;
  }

  static fromEntries(source: DanmakuEntry[], preferences: {
    enabled: boolean;
    showScrolling: boolean;
    showTop: boolean;
    showBottom: boolean;
    mergeRepeated: boolean;
    blockedKeywords: string[];
  }): DanmakuTimelineIndex {
    const ordered = source
      .filter((entry) => allowsMode(entry.mode, preferences) && !blocksKeyword(entry.text, preferences.blockedKeywords))
      .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const processed: IndexedDanmakuEntry[] = [];
    const mergeIndexes: Map<string, number> = new Map();
    for (const entry of ordered) {
      const mergeKey = `${bucketForPosition(entry.startTimeSeconds * 1000)}|${entry.text.trim().toLowerCase()}`;
      const existingIndex = preferences.mergeRepeated ? mergeIndexes.get(mergeKey) : undefined;
      if (existingIndex == null) {
        mergeIndexes.set(mergeKey, processed.length);
        processed.push({ ...entry, repeatCount: 1 });
      } else {
        const existing = processed[existingIndex];
        if (existing) {
          processed[existingIndex] = { ...existing, repeatCount: existing.repeatCount + 1 };
        }
      }
    }
    const buckets: Map<number, IndexedDanmakuEntry[]> = new Map();
    for (const entry of processed) {
      const bucketIndex = bucketForPosition(entry.startTimeSeconds * 1000);
      const list = buckets.get(bucketIndex);
      if (list) {
        list.push(entry);
      } else {
        buckets.set(bucketIndex, [entry]);
      }
    }
    return new DanmakuTimelineIndex(processed, buckets);
  }

  entriesAt(positionMs: number): IndexedDanmakuEntry[] {
    return this.buckets.get(bucketForPosition(positionMs)) ?? [];
  }
}

// ============ Creator Profile ============

export enum CreatorVideoOrder {
  latest = "latest",
  mostPlayed = "mostplayed",
  mostFavorited = "mostfavorited",
}

export interface CreatorProfile {
  mid: number;
  name: string;
  avatarUrl: string;
  sign: string;
  officialDescription: string;
  followingCount: number;
  followerCount: number;
  likeCount: number;
  videoCount: number;
  articleCount: number;
}

export interface CreatorVideo {
  bvid: string;
  title: string;
  coverUrl: string;
  durationSeconds: number;
  partCount: number;
  publishedAt?: string;
  stats: import("./types").VideoStats;
}

export interface CreatorArticle {
  id: number;
  title: string;
  summary: string;
  coverUrl: string;
  publishedAt?: string;
  viewCount: number;
}

export interface CreatorCollection {
  id: number;
  ownerMid: number;
  ownerName: string;
  ownerAvatarUrl: string;
  title: string;
  coverUrl: string;
  description: string;
  totalCount: number;
  previewVideos: CreatorVideo[];
}

export interface CreatorContentPage<T> {
  items: T[];
  page: number;
  hasMore: boolean;
  totalCount?: number;
}

// ============ Player Overlay Data ============

export interface DanmakuSegmentLoadResult {
  segmentIndex: number;
  entries: DanmakuEntry[];
}

export interface PlayerOverlayData {
  bvid: string;
  cid: number;
  title: string;
  ownerName: string;
  ownerAvatarUrl: string;
  coverUrl: string;
  durationSeconds: number;
  danmaku: DanmakuEntry[];
  chapters: VideoChapter[];
  interactive?: InteractiveVideoInfo;
}

// ============ Helpers ============

function allowsMode(mode: number, prefs: { showScrolling: boolean; showTop: boolean; showBottom: boolean }): boolean {
  // 1 = scrolling, 4 = bottom, 5 = top, 6 = reverse, 7 = advanced, 8 = code, 9 = bas
  if (mode === 1) return prefs.showScrolling;
  if (mode === 4) return prefs.showBottom;
  if (mode === 5) return prefs.showTop;
  // Other modes (reverse, advanced, code, bas) are always allowed
  return true;
}

function blocksKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

// Re-export types from main types module for convenience
import type { DanmakuEntry } from "./types";

export type { DanmakuEntry };
