import type { CompanionBackupData } from "../types";
import { ACTIVE_KEY, HISTORY_KEY as FOCUS_HISTORY_KEY, invalidatePendingSaves } from "./bilibili/focusServices";
import {
  LEARNING_LIST_KEY,
  VIDEO_NOTES_KEY,
  WATCH_HISTORY_KEY,
} from "./bilibili/services";
import { STORAGE_KEY as LOCAL_WATCH_HISTORY_KEY } from "./bilibili/watchHistoryService";

export const COMPANION_RESTORED_EVENT = "beid:companion-restored";

/** 分P续播进度键前缀：续播位置不在主 store，按前缀整组采集。 */
const PLAYBACK_PROGRESS_PREFIX = "focubili.playback-progress.v1:";
const SEARCH_HISTORY_KEY = "rixia_search_history_v1";
const DANMAKU_PREFERENCES_KEY = "rixia_danmaku_preferences_v1";
const PLAYBACK_PREFERENCES_KEY = "rixia_playback_preferences_v1";
const FOCUS_SESSIONS_KEY = "rixia_focus_sessions_v1";
const BILIBILI_COOKIE_KEY = "rixia_bilibili_cookie_v1";
const BILIBILI_AUTH_KEY = "rixia_bilibili_auth_v1";

/**
 * 兄弟存储的备份采集层。主 store（rixia-v1）之外，专注历史、视频笔记、
 * 学习清单、两份观看历史、分P续播进度和搜索历史各自治持久化在独立
 * localStorage 键里；备份导出/导入必须把它们一并带上，否则"导出数据备份"
 * 承诺的全量覆盖就是假的。
 *
 * 各服务自身的读取路径已经带损坏数据过滤（isValidNote / parseSession 等），
 * 所以这里只保证"数组形状"，逐条清洗交给服务在下次读取时完成。
 */

function readJson(storage: Storage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readPlaybackProgress(storage: Storage): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith(PLAYBACK_PROGRESS_PREFIX)) continue;
      const raw = storage.getItem(key);
      if (raw === null) continue;
      out[key] = raw;
    }
  } catch {
    // 隐私模式读长度失败时返回已采集部分。
  }
  return out;
}

function readSearchHistory(storage: Storage): string[] {
  const parsed = readJson(storage, SEARCH_HISTORY_KEY);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

/** 导出：从当前设备存储读取全部兄弟数据。损坏键按空数据处理。 */
export function exportCompanionBackup(storage: Storage = localStorage): CompanionBackupData {
  const focusSessions = readJson(storage, FOCUS_SESSIONS_KEY);
  const cookie = storage.getItem(BILIBILI_COOKIE_KEY);
  return {
    focusActiveSession: readJson(storage, ACTIVE_KEY),
    focusHistory: asArray(readJson(storage, FOCUS_HISTORY_KEY)),
    videoNotes: asArray(readJson(storage, VIDEO_NOTES_KEY)),
    watchHistory: asArray(readJson(storage, WATCH_HISTORY_KEY)),
    learningList: asArray(readJson(storage, LEARNING_LIST_KEY)),
    localWatchHistory: asArray(readJson(storage, LOCAL_WATCH_HISTORY_KEY)),
    playbackProgress: readPlaybackProgress(storage),
    searchHistory: readSearchHistory(storage),
    danmakuPreferences: readJson(storage, DANMAKU_PREFERENCES_KEY),
    playbackPreferences: readJson(storage, PLAYBACK_PREFERENCES_KEY),
    focusSessions: Array.isArray(focusSessions) ? focusSessions : null,
    bilibiliCookie: typeof cookie === "string" && cookie.trim() ? cookie : null,
    bilibiliAuth: readJson(storage, BILIBILI_AUTH_KEY),
  };
}

/**
 * 校验备份里的 companion 块。旧版备份没有该块时返回 null（导入时保留
 * 设备现有数据）；块存在但字段形状不对时逐字段丢弃，绝不抛错。
 * playbackProgress / searchHistory 在旧版备份里缺失时为 null：导入必须
 * 保留设备上的现有数据，不能当成"清空"。
 */
export function sanitizeCompanionBackup(input: unknown): CompanionBackupData | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const active = value.focusActiveSession;
  const rawProgress = value.playbackProgress;
  const progress: Record<string, string> | null =
    typeof rawProgress === "object" && rawProgress !== null && !Array.isArray(rawProgress)
      ? Object.fromEntries(
          Object.entries(rawProgress as Record<string, unknown>).filter(
            (entry): entry is [string, string] =>
              entry[0].startsWith(PLAYBACK_PROGRESS_PREFIX) && typeof entry[1] === "string",
          ),
        )
      : null;
  const rawSearch = value.searchHistory;
  const rawFocusSessions = value.focusSessions;
  const rawCookie = value.bilibiliCookie;
  return {
    focusActiveSession: typeof active === "object" && active !== null ? active : null,
    focusHistory: asArray(value.focusHistory),
    videoNotes: asArray(value.videoNotes),
    watchHistory: asArray(value.watchHistory),
    learningList: asArray(value.learningList),
    localWatchHistory: asArray(value.localWatchHistory),
    playbackProgress: progress,
    searchHistory: Array.isArray(rawSearch)
      ? rawSearch.filter((item): item is string => typeof item === "string")
      : null,
    danmakuPreferences: typeof value.danmakuPreferences === "object" && value.danmakuPreferences !== null
      ? value.danmakuPreferences
      : null,
    playbackPreferences: typeof value.playbackPreferences === "object" && value.playbackPreferences !== null
      ? value.playbackPreferences
      : null,
    focusSessions: Array.isArray(rawFocusSessions) ? rawFocusSessions : null,
    bilibiliCookie: typeof rawCookie === "string" && rawCookie.trim() ? rawCookie : null,
    bilibiliAuth: typeof value.bilibiliAuth === "object" && value.bilibiliAuth !== null ? value.bilibiliAuth : null,
  };
}

/** 导入：把 companion 数据写回设备存储。写入失败（配额等）不阻塞主备份恢复。 */
export function importCompanionBackup(
  data: CompanionBackupData,
  storage?: Storage,
): string[] {
  const targetStorage = storage ?? localStorage;
  // 先作废专注服务的挂起写队列：导入前一刻排队的旧状态若在导入后落盘，
  // 会把刚恢复的数据原样覆盖回去。
  invalidatePendingSaves();
  const writes: Array<[string, string | null]> = [
    [ACTIVE_KEY, data.focusActiveSession === null ? null : JSON.stringify(data.focusActiveSession)],
    [FOCUS_HISTORY_KEY, JSON.stringify(data.focusHistory)],
    [VIDEO_NOTES_KEY, JSON.stringify(data.videoNotes)],
    [WATCH_HISTORY_KEY, JSON.stringify(data.watchHistory)],
    [LEARNING_LIST_KEY, JSON.stringify(data.learningList)],
    [LOCAL_WATCH_HISTORY_KEY, JSON.stringify(data.localWatchHistory)],
  ];
  if (data.playbackProgress !== null) {
    // 先清掉设备上现有的进度键再写入备份快照，避免旧键残留。
    try {
      const staleKeys: string[] = [];
      for (let index = 0; index < targetStorage.length; index += 1) {
        const key = targetStorage.key(index);
        if (key && key.startsWith(PLAYBACK_PROGRESS_PREFIX)) staleKeys.push(key);
      }
      for (const key of staleKeys) {
        if (!(key in data.playbackProgress)) targetStorage.removeItem(key);
      }
    } catch {
      // 读取失败时只做覆盖式写入。
    }
    for (const [key, raw] of Object.entries(data.playbackProgress)) {
      writes.push([key, raw]);
    }
  }
  if (data.searchHistory !== null) {
    writes.push([SEARCH_HISTORY_KEY, JSON.stringify(data.searchHistory)]);
  }
  if (data.danmakuPreferences !== null) {
    writes.push([DANMAKU_PREFERENCES_KEY, JSON.stringify(data.danmakuPreferences)]);
  }
  if (data.playbackPreferences !== null) {
    writes.push([PLAYBACK_PREFERENCES_KEY, JSON.stringify(data.playbackPreferences)]);
  }
  if (data.focusSessions !== null) {
    writes.push([FOCUS_SESSIONS_KEY, JSON.stringify(data.focusSessions)]);
  }
  if (data.bilibiliCookie !== null) {
    writes.push([BILIBILI_COOKIE_KEY, data.bilibiliCookie]);
  }
  if (data.bilibiliAuth !== null) {
    writes.push([BILIBILI_AUTH_KEY, JSON.stringify(data.bilibiliAuth)]);
  }
  const failedKeys: string[] = [];
  for (const [key, raw] of writes) {
    try {
      if (raw === null) targetStorage.removeItem(key);
      else targetStorage.setItem(key, raw);
    } catch {
      failedKeys.push(key);
      // 单键失败（配额/隐私模式）不影响其余键；服务读取路径会容忍缺失。
    }
  }
  if (storage === undefined && typeof window !== "undefined") {
    window.dispatchEvent(new Event(COMPANION_RESTORED_EVENT));
  }
  return failedKeys;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
