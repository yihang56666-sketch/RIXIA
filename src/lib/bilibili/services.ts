/**
 * RIXIA Bilibili 服务集 — 把 FocuBili 各 Dart service 用 TS 重写为
 * 基于 localStorage / IndexedDB 的本地实现。行为对齐 FocuBili：
 * - 数据持久化在浏览器本地（无 Cookie、无服务端）
 * - 损坏数据降级为默认值，不阻塞 UI
 * - 所有写入串行排队（saveQueue 模式）
 */

import type {
  DanmakuPreferences,
  PlaybackPreferences,
  VideoNote,
  WatchHistoryEntry,
  LearningListEntry,
  FocusSession,
  FocusStatistics,
} from "./types";
import {
  DEFAULT_DANMAKU_PREFERENCES,
  DEFAULT_PLAYBACK_PREFERENCES,
} from "./types";

// ============ Danmaku preferences ============

const DANMAKU_KEY = "rixia_danmaku_preferences_v1";

export interface DanmakuPreferencesService {
  load(): Promise<DanmakuPreferences>;
  save(preferences: DanmakuPreferences): Promise<boolean>;
}

export function createDanmakuPreferencesService(
  storage: Storage = localStorage,
): DanmakuPreferencesService {
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  return {
    async load() {
      try {
        const raw = storage.getItem(DANMAKU_KEY);
        if (!raw || !raw.trim()) return { ...DEFAULT_DANMAKU_PREFERENCES };
        const decoded = JSON.parse(raw);
        return normalizeDanmaku(decoded);
      } catch {
        return { ...DEFAULT_DANMAKU_PREFERENCES };
      }
    },
    async save(preferences) {
      const encoded = JSON.stringify(preferences);
      saveQueue = saveQueue.then(() => {
        try {
          storage.setItem(DANMAKU_KEY, encoded);
          return true;
        } catch {
          return false;
        }
      });
      return saveQueue;
    },
  };
}

function normalizeDanmaku(value: unknown): DanmakuPreferences {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_DANMAKU_PREFERENCES };
  const v = value as Partial<DanmakuPreferences>;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_DANMAKU_PREFERENCES.enabled,
    opacity: clampNumber(v.opacity, DEFAULT_DANMAKU_PREFERENCES.opacity, 0, 1),
    fontSize: clampNumber(v.fontSize, DEFAULT_DANMAKU_PREFERENCES.fontSize, 8, 48),
    laneCount: clampInt(v.laneCount, DEFAULT_DANMAKU_PREFERENCES.laneCount, 1, 30),
    scrollDurationSeconds: clampNumber(v.scrollDurationSeconds, DEFAULT_DANMAKU_PREFERENCES.scrollDurationSeconds, 3, 30),
    displayArea: clampNumber(v.displayArea, DEFAULT_DANMAKU_PREFERENCES.displayArea, 0.1, 1),
    strokeWidth: clampNumber(v.strokeWidth, DEFAULT_DANMAKU_PREFERENCES.strokeWidth, 0, 6),
    showScrolling: typeof v.showScrolling === "boolean" ? v.showScrolling : true,
    showTop: typeof v.showTop === "boolean" ? v.showTop : true,
    showBottom: typeof v.showBottom === "boolean" ? v.showBottom : true,
    mergeRepeated: typeof v.mergeRepeated === "boolean" ? v.mergeRepeated : true,
    blockedKeywords: Array.isArray(v.blockedKeywords) ? v.blockedKeywords.filter((k): k is string => typeof k === "string") : [],
  };
}

// ============ Playback preferences ============

const PLAYBACK_KEY = "rixia_playback_preferences_v1";

export interface PlaybackPreferencesService {
  load(): Promise<PlaybackPreferences>;
  save(preferences: PlaybackPreferences): Promise<boolean>;
}

export function createPlaybackPreferencesService(
  storage: Storage = localStorage,
): PlaybackPreferencesService {
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  return {
    async load() {
      try {
        const raw = storage.getItem(PLAYBACK_KEY);
        if (!raw || !raw.trim()) return { ...DEFAULT_PLAYBACK_PREFERENCES };
        return normalizePlayback(JSON.parse(raw));
      } catch {
        return { ...DEFAULT_PLAYBACK_PREFERENCES };
      }
    },
    async save(preferences) {
      const encoded = JSON.stringify(preferences);
      saveQueue = saveQueue.then(() => {
        try {
          storage.setItem(PLAYBACK_KEY, encoded);
          return true;
        } catch {
          return false;
        }
      });
      return saveQueue;
    },
  };
}

function normalizePlayback(value: unknown): PlaybackPreferences {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_PLAYBACK_PREFERENCES };
  const v = value as Partial<PlaybackPreferences>;
  return {
    autoplayNext: typeof v.autoplayNext === "boolean" ? v.autoplayNext : false,
    resumeFromLastPosition: typeof v.resumeFromLastPosition === "boolean" ? v.resumeFromLastPosition : true,
    defaultQuality: clampInt(v.defaultQuality, DEFAULT_PLAYBACK_PREFERENCES.defaultQuality, 16, 128),
    defaultVolume: clampNumber(v.defaultVolume, DEFAULT_PLAYBACK_PREFERENCES.defaultVolume, 0, 1),
    playbackRate: clampNumber(v.playbackRate, DEFAULT_PLAYBACK_PREFERENCES.playbackRate, 0.5, 3),
  };
}

// ============ Video notes ============

const VIDEO_NOTES_KEY = "rixia_video_notes_v1";

export interface VideoNoteService {
  list(): Promise<VideoNote[]>;
  listByVideo(bvid: string): Promise<VideoNote[]>;
  save(note: VideoNote): Promise<boolean>;
  remove(id: string): Promise<boolean>;
}

export function createVideoNoteService(
  storage: Storage = localStorage,
): VideoNoteService {
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  function readAll(): VideoNote[] {
    try {
      const raw = storage.getItem(VIDEO_NOTES_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValidNote) : [];
    } catch {
      return [];
    }
  }
  function writeAll(notes: VideoNote[]): Promise<boolean> {
    const encoded = JSON.stringify(notes);
    saveQueue = saveQueue.then(() => {
      try {
        storage.setItem(VIDEO_NOTES_KEY, encoded);
        return true;
      } catch {
        return false;
      }
    });
    return saveQueue;
  }
  return {
    async list() {
      return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async listByVideo(bvid) {
      return readAll()
        .filter((n) => n.bvid === bvid)
        .sort((a, b) => a.positionSeconds - b.positionSeconds);
    },
    async save(note) {
      const all = readAll();
      const idx = all.findIndex((n) => n.id === note.id);
      if (idx >= 0) all[idx] = note;
      else all.push(note);
      return writeAll(all);
    },
    async remove(id) {
      const all = readAll();
      const next = all.filter((n) => n.id !== id);
      if (next.length === all.length) return false;
      return writeAll(next);
    },
  };
}

function isValidNote(value: unknown): value is VideoNote {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<VideoNote>;
  return typeof v.id === "string" && typeof v.bvid === "string";
}

// ============ Watch history ============

const WATCH_HISTORY_KEY = "rixia_watch_history_v1";
const WATCH_HISTORY_LIMIT = 500;

export interface WatchHistoryService {
  list(): Promise<WatchHistoryEntry[]>;
  record(entry: WatchHistoryEntry): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  clear(): Promise<boolean>;
}

export function createWatchHistoryService(
  storage: Storage = localStorage,
): WatchHistoryService {
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  function readAll(): WatchHistoryEntry[] {
    try {
      const raw = storage.getItem(WATCH_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValidWatchEntry) : [];
    } catch {
      return [];
    }
  }
  function writeAll(entries: WatchHistoryEntry[]): Promise<boolean> {
    const encoded = JSON.stringify(entries.slice(0, WATCH_HISTORY_LIMIT));
    saveQueue = saveQueue.then(() => {
      try {
        storage.setItem(WATCH_HISTORY_KEY, encoded);
        return true;
      } catch {
        return false;
      }
    });
    return saveQueue;
  }
  return {
    async list() {
      return readAll().sort((a, b) => b.watchedAt.localeCompare(a.watchedAt));
    },
    async record(entry) {
      const all = readAll().filter((e) => e.id !== entry.id);
      all.unshift(entry);
      return writeAll(all);
    },
    async remove(id) {
      const all = readAll();
      const next = all.filter((e) => e.id !== id);
      if (next.length === all.length) return false;
      return writeAll(next);
    },
    async clear() {
      return writeAll([]);
    },
  };
}

function isValidWatchEntry(value: unknown): value is WatchHistoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<WatchHistoryEntry>;
  return typeof v.id === "string" && typeof v.bvid === "string";
}

// ============ Search History ============

const SEARCH_HISTORY_KEY = "rixia_search_history_v1";
const SEARCH_HISTORY_LIMIT = 50;

export interface SearchHistoryService {
  list(): Promise<string[]>;
  record(keyword: string): Promise<boolean>;
  remove(keyword: string): Promise<boolean>;
  clear(): Promise<boolean>;
}

export function createSearchHistoryService(
  storage: Storage = localStorage,
): SearchHistoryService {
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  function readAll(): string[] {
    try {
      const raw = storage.getItem(SEARCH_HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  }
  function writeAll(entries: string[]): Promise<boolean> {
    const encoded = JSON.stringify(entries.slice(0, SEARCH_HISTORY_LIMIT));
    saveQueue = saveQueue.then(() => {
      try {
        storage.setItem(SEARCH_HISTORY_KEY, encoded);
        return true;
      } catch {
        return false;
      }
    });
    return saveQueue;
  }
  return {
    async list() {
      return readAll();
    },
    async record(keyword) {
      const trimmed = keyword.trim();
      if (!trimmed) return false;
      const all = readAll().filter((k) => k !== trimmed);
      all.unshift(trimmed);
      return writeAll(all);
    },
    async remove(keyword) {
      const all = readAll();
      const next = all.filter((k) => k !== keyword);
      if (next.length === all.length) return false;
      return writeAll(next);
    },
    async clear() {
      return writeAll([]);
    },
  };
}

// ============ Learning List ============

const LEARNING_LIST_KEY = "rixia_learning_list_v1";

export interface LearningListService {
  list(): Promise<LearningListEntry[]>;
  add(entry: LearningListEntry): Promise<boolean>;
  update(id: string, patch: Partial<LearningListEntry>): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  markOpened(id: string): Promise<boolean>;
  markCompleted(id: string): Promise<boolean>;
}

export function createLearningListService(
  storage: Storage = localStorage,
): LearningListService {
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  function readAll(): LearningListEntry[] {
    try {
      const raw = storage.getItem(LEARNING_LIST_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValidLearningEntry) : [];
    } catch {
      return [];
    }
  }
  function writeAll(entries: LearningListEntry[]): Promise<boolean> {
    const encoded = JSON.stringify(entries);
    saveQueue = saveQueue.then(() => {
      try {
        storage.setItem(LEARNING_LIST_KEY, encoded);
        return true;
      } catch {
        return false;
      }
    });
    return saveQueue;
  }
  return {
    async list() {
      return readAll().sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    },
    async add(entry) {
      const all = readAll();
      if (all.some((e) => e.bvid === entry.bvid)) return false;
      all.unshift(entry);
      return writeAll(all);
    },
    async update(id, patch) {
      const all = readAll();
      const idx = all.findIndex((e) => e.id === id);
      if (idx < 0) return false;
      all[idx] = { ...all[idx]!, ...patch };
      return writeAll(all);
    },
    async remove(id) {
      const all = readAll();
      const next = all.filter((e) => e.id !== id);
      if (next.length === all.length) return false;
      return writeAll(next);
    },
    async markOpened(id) {
      return this.update(id, { lastOpenedAt: new Date().toISOString() });
    },
    async markCompleted(id) {
      return this.update(id, { completedAt: new Date().toISOString() });
    },
  };
}

function isValidLearningEntry(value: unknown): value is LearningListEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<LearningListEntry>;
  return typeof v.id === "string" && typeof v.bvid === "string";
}

// ============ Focus Session ============

const FOCUS_SESSIONS_KEY = "rixia_focus_sessions_v1";
const FOCUS_SESSIONS_LIMIT = 1000;

export interface FocusSessionService {
  list(): Promise<FocusSession[]>;
  record(session: FocusSession): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  statistics(): Promise<FocusStatistics>;
}

export function createFocusSessionService(
  storage: Storage = localStorage,
): FocusSessionService {
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  function readAll(): FocusSession[] {
    try {
      const raw = storage.getItem(FOCUS_SESSIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValidFocusSession) : [];
    } catch {
      return [];
    }
  }
  function writeAll(entries: FocusSession[]): Promise<boolean> {
    const encoded = JSON.stringify(entries.slice(0, FOCUS_SESSIONS_LIMIT));
    saveQueue = saveQueue.then(() => {
      try {
        storage.setItem(FOCUS_SESSIONS_KEY, encoded);
        return true;
      } catch {
        return false;
      }
    });
    return saveQueue;
  }
  return {
    async list() {
      return readAll().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },
    async record(session) {
      const all = readAll();
      all.unshift(session);
      return writeAll(all);
    },
    async remove(id) {
      const all = readAll();
      const next = all.filter((e) => e.id !== id);
      if (next.length === all.length) return false;
      return writeAll(next);
    },
    async statistics() {
      const all = readAll();
      const totalSeconds = all.reduce((sum, s) => sum + s.durationSeconds, 0);
      const completed = all.filter((s) => s.completed);
      const daily: Record<string, number> = {};
      for (const s of all) {
        const day = s.startedAt.slice(0, 10);
        daily[day] = (daily[day] ?? 0) + s.durationSeconds;
      }
      const days = Object.keys(daily).sort();
      let currentStreak = 0;
      let longestStreak = 0;
      let running = 0;
      let prev: string | null = null;
      for (const day of days) {
        if (prev) {
          const gap = (new Date(day).getTime() - new Date(prev).getTime()) / 86400000;
          if (gap === 1) running += 1;
          else running = 1;
        } else {
          running = 1;
        }
        longestStreak = Math.max(longestStreak, running);
        prev = day;
      }
      // Current streak from today backwards
      const todayKey = new Date().toISOString().slice(0, 10);
      let cursor = todayKey;
      while (daily[cursor]) {
        currentStreak += 1;
        const d = new Date(cursor);
        d.setDate(d.getDate() - 1);
        cursor = d.toISOString().slice(0, 10);
      }
      return {
        totalSeconds,
        totalSessions: all.length,
        completedSessions: completed.length,
        dailyFocusSeconds: daily,
        longestStreakDays: longestStreak,
        currentStreakDays: currentStreak,
      };
    },
  };
}

function isValidFocusSession(value: unknown): value is FocusSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<FocusSession>;
  return typeof v.id === "string" && typeof v.startedAt === "string";
}

// ============ Helpers ============

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  const n = Math.trunc(value);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
