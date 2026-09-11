/**
 * RIXIA 专注会话存储服务 — 1:1 TS 移植自 FocuBili 的
 * focus_session_service.dart（131 行）+ focus_preferences_service.dart（79 行）
 * + playback_resume_policy.dart（36 行）+ app_theme_mode_service.dart（65 行）。
 *
 * 所有数据持久化在 localStorage，行为与 FocuBili 的 SharedPreferences 版一致：
 * - 损坏数据跳过不阻塞启动
 * - 历史记录最多 200 条
 * - 写入串行排队
 */

import type { FullFocusSession } from "./focusSessionModel";
import { isActive, parseSession, sessionToJson } from "./focusSessionModel";

// ============ Focus Session Storage ============

export const ACTIVE_KEY = "rixia_focus_active_session";
export const HISTORY_KEY = "rixia_focus_history";
const MAX_HISTORY = 200;

export interface FocusStoredState {
  activeSession: FullFocusSession | null;
  history: FullFocusSession[];
}

export interface FocusSessionStorageService {
  loadState(): Promise<FocusStoredState>;
  saveState(activeSession: FullFocusSession | null, history: FullFocusSession[]): Promise<boolean>;
}

/** 各实例的作废器：导入备份前统一调用，丢弃尚未落盘的挂起写入。 */
const pendingSaveInvalidators = new Set<() => void>();

/**
 * 丢掉所有专注存储实例里尚未落盘的写入（备份导入前调用）：导入前一刻
 * 排队的旧状态若在导入完成后落盘，会把刚恢复的数据原样覆盖回去。
 */
export function invalidatePendingSaves(): void {
  for (const invalidate of [...pendingSaveInvalidators]) invalidate();
}

export function createFocusSessionStorageService(
  storage: Storage = localStorage,
): FocusSessionStorageService {
  let saveQueue: Promise<boolean> = Promise.resolve(true);
  let queueGeneration = 0;
  const invalidate = () => {
    queueGeneration += 1;
  };
  pendingSaveInvalidators.add(invalidate);
  return {
    async loadState() {
      try {
        const activeRaw = storage.getItem(ACTIVE_KEY);
        let activeSession: FullFocusSession | null = null;
        if (activeRaw && activeRaw.trim()) {
          try {
            const parsed = JSON.parse(activeRaw);
            const session = parseSession(parsed);
            activeSession = session && isActive(session) ? session : null;
          } catch {
            // 损坏数据跳过
          }
        }
        const historyRaw = storage.getItem(HISTORY_KEY);
        let history: FullFocusSession[] = [];
        if (historyRaw && historyRaw.trim()) {
          try {
            const parsed = JSON.parse(historyRaw);
            if (Array.isArray(parsed)) {
              const seenIds = new Set<string>();
              for (const item of parsed) {
                const session = parseSession(item);
                if (!session || isActive(session) || seenIds.has(session.id)) continue;
                seenIds.add(session.id);
                history.push(session);
                if (history.length >= MAX_HISTORY) break;
              }
            }
          } catch {
            // 损坏数据跳过
          }
        }
        return { activeSession, history };
      } catch {
        return { activeSession: null, history: [] };
      }
    },
    async saveState(activeSession, history) {
      const generation = queueGeneration;
      saveQueue = saveQueue.then(() => {
        // 入队后发生了作废（如备份导入）：本次写入必须丢弃，否则会用旧状态覆盖新数据。
        if (generation !== queueGeneration) return false;
        try {
          if (activeSession == null) {
            storage.removeItem(ACTIVE_KEY);
          } else {
            storage.setItem(ACTIVE_KEY, JSON.stringify(sessionToJson(activeSession)));
          }
          const limited = history
            .filter((s) => !isActive(s))
            .slice(0, MAX_HISTORY)
            .map(sessionToJson);
          storage.setItem(HISTORY_KEY, JSON.stringify(limited));
          return true;
        } catch {
          return false;
        }
      });
      return saveQueue;
    },
  };
}

// ============ Focus Preferences ============

export interface FocusPreferences {
  enableDoNotDisturb: boolean;
  hasSeenPlayerDoNotDisturbGuide: boolean;
  hasSeenBackgroundReminderGuide: boolean;
}

export const DEFAULT_FOCUS_PREFERENCES: FocusPreferences = {
  enableDoNotDisturb: false,
  hasSeenPlayerDoNotDisturbGuide: false,
  hasSeenBackgroundReminderGuide: false,
};

const DND_KEY = "rixia_focus_preferences.enable_do_not_disturb";
const PLAYER_DND_GUIDE_KEY = "rixia_focus_preferences.has_seen_player_do_not_disturb_guide";
const BG_REMINDER_GUIDE_KEY = "rixia_focus_preferences.has_seen_background_reminder_guide";

export interface FocusPreferencesStorageService {
  load(): Promise<FocusPreferences>;
  saveDoNotDisturbEnabled(enabled: boolean): Promise<boolean>;
  markPlayerDoNotDisturbGuideSeen(): Promise<boolean>;
  markBackgroundReminderGuideSeen(): Promise<boolean>;
}

export function createFocusPreferencesService(
  storage: Storage = localStorage,
): FocusPreferencesStorageService {
  return {
    async load() {
      try {
        return {
          enableDoNotDisturb: storage.getItem(DND_KEY) === "true",
          hasSeenPlayerDoNotDisturbGuide: storage.getItem(PLAYER_DND_GUIDE_KEY) === "true",
          hasSeenBackgroundReminderGuide: storage.getItem(BG_REMINDER_GUIDE_KEY) === "true",
        };
      } catch {
        return { ...DEFAULT_FOCUS_PREFERENCES };
      }
    },
    async saveDoNotDisturbEnabled(enabled) {
      try {
        storage.setItem(DND_KEY, String(enabled));
        return true;
      } catch {
        return false;
      }
    },
    async markPlayerDoNotDisturbGuideSeen() {
      try {
        storage.setItem(PLAYER_DND_GUIDE_KEY, "true");
        return true;
      } catch {
        return false;
      }
    },
    async markBackgroundReminderGuideSeen() {
      try {
        storage.setItem(BG_REMINDER_GUIDE_KEY, "true");
        return true;
      } catch {
        return false;
      }
    },
  };
}

// ============ Playback Resume Policy ============

const COMPLETED_REMAINING_THRESHOLD_MS = 3000; // 3 seconds

export function normalizeStoredPosition(positionMs: number, durationMs: number): number {
  if (positionMs <= 0 || durationMs <= 0) return 0;
  const clamped = positionMs > durationMs ? durationMs : positionMs;
  if (durationMs - clamped <= COMPLETED_REMAINING_THRESHOLD_MS) return 0;
  return clamped;
}

export function normalizeRequestedPosition(positionMs: number): number {
  if (positionMs <= 0) return 0;
  return positionMs;
}

// ============ App Theme Mode ============

export type ThemeMode = "light" | "dark" | "system";

const THEME_MODE_KEY = "rixia_appearance.theme_mode";

export interface AppThemeModeStorageService {
  load(): Promise<ThemeMode>;
  save(mode: ThemeMode): Promise<boolean>;
}

export function createAppThemeModeService(
  storage: Storage = localStorage,
): AppThemeModeStorageService {
  return {
    async load() {
      try {
        const value = storage.getItem(THEME_MODE_KEY);
        if (value === "light" || value === "dark") return value;
        return "system";
      } catch {
        return "system";
      }
    },
    async save(mode) {
      try {
        storage.setItem(THEME_MODE_KEY, mode);
        return true;
      } catch {
        return false;
      }
    },
  };
}
