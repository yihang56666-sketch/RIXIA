import type { CompanionBackupData } from "../types";
import { ACTIVE_KEY, HISTORY_KEY as FOCUS_HISTORY_KEY } from "./bilibili/focusServices";
import {
  LEARNING_LIST_KEY,
  VIDEO_NOTES_KEY,
  WATCH_HISTORY_KEY,
} from "./bilibili/services";
import { STORAGE_KEY as LOCAL_WATCH_HISTORY_KEY } from "./bilibili/watchHistoryService";

export const COMPANION_RESTORED_EVENT = "beid:companion-restored";

/**
 * 兄弟存储的备份采集层。主 store（rixia-v1）之外，专注历史、视频笔记、
 * 学习清单和两份观看历史各自治持久化在独立 localStorage 键里；备份导出/导入
 * 必须把它们一并带上，否则"导出数据备份"承诺的全量覆盖就是假的。
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

/** 导出：从当前设备存储读取全部兄弟数据。损坏键按空数据处理。 */
export function exportCompanionBackup(storage: Storage = localStorage): CompanionBackupData {
  return {
    focusActiveSession: readJson(storage, ACTIVE_KEY),
    focusHistory: asArray(readJson(storage, FOCUS_HISTORY_KEY)),
    videoNotes: asArray(readJson(storage, VIDEO_NOTES_KEY)),
    watchHistory: asArray(readJson(storage, WATCH_HISTORY_KEY)),
    learningList: asArray(readJson(storage, LEARNING_LIST_KEY)),
    localWatchHistory: asArray(readJson(storage, LOCAL_WATCH_HISTORY_KEY)),
  };
}

/**
 * 校验备份里的 companion 块。旧版备份没有该块时返回 null（导入时保留
 * 设备现有数据）；块存在但字段形状不对时逐字段丢弃，绝不抛错。
 */
export function sanitizeCompanionBackup(input: unknown): CompanionBackupData | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const active = value.focusActiveSession;
  return {
    focusActiveSession: typeof active === "object" && active !== null ? active : null,
    focusHistory: asArray(value.focusHistory),
    videoNotes: asArray(value.videoNotes),
    watchHistory: asArray(value.watchHistory),
    learningList: asArray(value.learningList),
    localWatchHistory: asArray(value.localWatchHistory),
  };
}

/** 导入：把 companion 数据写回设备存储。写入失败（配额等）不阻塞主备份恢复。 */
export function importCompanionBackup(
  data: CompanionBackupData,
  storage?: Storage,
): string[] {
  const targetStorage = storage ?? localStorage;
  const writes: Array<[string, string | null]> = [
    [ACTIVE_KEY, data.focusActiveSession === null ? null : JSON.stringify(data.focusActiveSession)],
    [FOCUS_HISTORY_KEY, JSON.stringify(data.focusHistory)],
    [VIDEO_NOTES_KEY, JSON.stringify(data.videoNotes)],
    [WATCH_HISTORY_KEY, JSON.stringify(data.watchHistory)],
    [LEARNING_LIST_KEY, JSON.stringify(data.learningList)],
    [LOCAL_WATCH_HISTORY_KEY, JSON.stringify(data.localWatchHistory)],
  ];
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
