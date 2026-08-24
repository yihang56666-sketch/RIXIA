/**
 * 全应用唯一的专注计时控制器 — 1:1 移植 FocuBili 的
 * focus_timer_controller.dart + focus_timer_scope.dart 语义。
 *
 * FocuBili 通过根组件持有的 FocusTimerScope 让所有页面共享同一个
 * FocusTimerController；此前这里是一个 hook，每个组件各建一个实例，
 * 状态互相不同步。现在模块级单例 + 订阅通知，与原版一致。
 */

import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import type { FullFocusSession } from "../../lib/bilibili/focusSessionModel";
import {
  type FocusInterruption,
  FocusSessionStatus,
  FocusPauseReason,
  FocusInterruptionKind,
  createFocusSession,
  isActive,
  hasVideoAssociation,
  elapsedAt,
  remainingAt,
  progressAt,
  pauseAt,
  resumeAt,
  extendBy,
  associateVideo as associateVideoModel,
  updateLastSeen as updateLastSeenModel,
  addInterruption,
  finishAt,
  finishAtPartEnd,
  reopenAt,
} from "../../lib/bilibili/focusSessionModel";
import {
  type FocusStoredState,
  createFocusSessionStorageService,
} from "../../lib/bilibili/focusServices";
import { shouldAutoCompleteFocus } from "../../lib/bilibili/focusCompletionPolicy";
import {
  buildFocusStatisticsSnapshot,
  FocusStatisticsRange,
  todayCompletedCount as calcTodayCompletedCount,
  todayFocusedMs as calcTodayFocusedMs,
} from "../../lib/bilibili/focusStatisticsModel";
import { createFocusNotificationService, nativeFocusNotification } from "../../lib/focusNotifications";

const MAX_GOAL_CHARS = 60;
const MIN_DURATION_MS = 60_000;
const MAX_DURATION_MS = 3 * 3_600_000;

export interface UseFocusTimer {
  ready: boolean;
  activeSession: FullFocusSession | null;
  lastFinishedSession: FullFocusSession | null;
  history: FullFocusSession[];
  hasActiveSession: boolean;
  remainingMs: number;
  elapsedMs: number;
  progress: number;
  startFocus: (params: {
    goal: string;
    durationMs: number;
    startImmediately?: boolean;
    sourceBvid?: string;
    sourceVideoTitle?: string;
    sourcePartCid?: number;
    sourcePartPageNumber?: number;
    sourcePartTitle?: string;
    sourceFramePath?: string;
    sourcePositionMs?: number;
    completeOnPartEnd?: boolean;
  }) => Promise<boolean>;
  pauseFocus: () => Promise<void>;
  interruptFocus: (params: {
    kind: FocusInterruptionKind;
    reason: string;
    reminderAt?: string;
  }) => Promise<void>;
  resumeFocus: () => Promise<void>;
  updatePlaybackState: (params: {
    bvid: string;
    partCid: number;
    isPlaying: boolean;
  }) => Promise<void>;
  completeForPlaybackPart: (params: {
    bvid: string;
    partCid: number;
  }) => Promise<boolean>;
  associateVideo: (params: {
    bvid: string;
    videoTitle: string;
    partCid: number;
    partPageNumber: number;
    partTitle: string;
    isPlaying: boolean;
    framePath?: string;
    positionMs?: number;
  }) => Promise<void>;
  updateLastSeen: (params: {
    framePath?: string;
    positionMs: number;
  }) => Promise<void>;
  extendFocus: (extensionMs: number) => Promise<boolean>;
  extendCompletedFocus: (extensionMs: number) => Promise<boolean>;
  endFocusEarly: (reason?: string) => Promise<void>;
  dismissLastFinishedSession: () => void;
  deleteHistoryEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  todayFocusedMs: number;
  todayCompletedCount: number;
}

class FocusTimerController {
  private readonly listeners = new Set<() => void>();
  private readonly storage = createFocusSessionStorageService();
  private readonly notificationService = createFocusNotificationService(
    Capacitor.getPlatform() === "android" ? nativeFocusNotification : undefined,
  );
  private ticker: ReturnType<typeof setInterval> | null = null;
  private playingBvid: string | null = null;
  private playingPartCid: number | null = null;
  private videoPlaying = false;
  private backgroundInterruptionRecorded = false;

  ready = false;
  version = 0;
  activeSession: FullFocusSession | null = null;
  lastFinishedSession: FullFocusSession | null = null;
  history: FullFocusSession[] = [];

  constructor() {
    void this.storage.loadState().then((state: FocusStoredState) => {
      this.activeSession = state.activeSession;
      this.history = state.history;
      this.ready = true;
      this.syncTicker();
      this.notify();
    });
    document.addEventListener("visibilitychange", () => this.handleVisibility());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    this.version += 1;
    this.syncTicker();
    for (const listener of this.listeners) listener();
  }

  private persist(active: FullFocusSession | null, history: FullFocusSession[]): void {
    void this.storage.saveState(active, history);
  }

  private syncTicker(): void {
    const shouldRun = this.ready && this.activeSession?.status === FocusSessionStatus.running;
    if (!shouldRun) {
      if (this.ticker) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
      return;
    }
    if (!this.ticker) {
      this.ticker = setInterval(() => this.tick(), 1000);
    }
  }

  private tick(): void {
    const session = this.activeSession;
    if (!session || session.status !== FocusSessionStatus.running) return;
    const now = Date.now();
    const remaining = remainingAt(session, now);
    if (shouldAutoCompleteFocus(session.status, remaining)) {
      this.finishActive(now, FocusSessionStatus.completed, "时间到");
      return;
    }
    this.notify();
  }

  private handleVisibility(): void {
    if (!this.ready) return;
    if (document.visibilityState === "visible") {
      this.backgroundInterruptionRecorded = false;
      this.tick();
      this.notify();
      return;
    }
    if (
      !this.backgroundInterruptionRecorded &&
      this.activeSession?.status === FocusSessionStatus.running
    ) {
      this.backgroundInterruptionRecorded = true;
      void this.interruptFocus({
        kind: FocusInterruptionKind.appBackground,
        reason: "专注被打断",
      });
    }
  }

  private finishActive(now: number, status: FocusSessionStatus, reason: string): void {
    const session = this.activeSession;
    if (!session) return;
    const finished = finishAt(session, now, status, reason);
    const nextHistory = [finished, ...this.history.filter((s) => s.id !== finished.id)].slice(0, 200);
    this.lastFinishedSession = finished;
    this.history = nextHistory;
    this.activeSession = null;
    this.persist(null, nextHistory);
    void this.notificationService.cancelReminder(session.id);
    if (status === FocusSessionStatus.completed) {
      void this.notificationService.showFocusCompleted(
        "专注完成",
        `${Math.max(1, Math.round(finished.accumulatedFocusMs / 60000))} 分钟专注已完成，休息一下吧`,
      );
    }
    this.notify();
  }

  startFocus: UseFocusTimer["startFocus"] = async (params) => {
    if (!this.ready || (this.activeSession && isActive(this.activeSession))) return false;
    const goal = params.goal.trim().slice(0, MAX_GOAL_CHARS);
    if (!goal || params.durationMs < MIN_DURATION_MS || params.durationMs > MAX_DURATION_MS) return false;
    const now = Date.now();
    const hasSource = Boolean(params.sourceBvid?.trim()) && params.sourcePartCid != null;
    const session = createFocusSession({
      id: String(now),
      goal,
      plannedDurationMs: params.durationMs,
      now: new Date(now).toISOString(),
      startImmediately: (params.startImmediately ?? true) && hasSource,
      sourceBvid: params.sourceBvid,
      sourceVideoTitle: params.sourceVideoTitle,
      sourcePartCid: params.sourcePartCid,
      sourcePartPageNumber: params.sourcePartPageNumber,
      sourcePartTitle: params.sourcePartTitle,
      sourceFramePath: params.sourceFramePath,
      sourcePositionMs: params.sourcePositionMs,
      completeOnPartEnd: params.completeOnPartEnd && hasSource,
    });
    this.activeSession = session;
    this.lastFinishedSession = null;
    this.persist(session, this.history);
    this.notify();
    return true;
  };

  interruptFocus: UseFocusTimer["interruptFocus"] = async (params) => {
    const session = this.activeSession;
    if (!session || !isActive(session)) return;
    const now = Date.now();
    const normalizedReason = params.reason.trim() || "未填写原因";
    const interruption: FocusInterruption = {
      id: `${session.id}-${now}`,
      occurredAt: new Date(now).toISOString(),
      kind: params.kind,
      reason: normalizedReason,
      reminderAt: params.reminderAt,
    };
    const updated = addInterruption(session, now, interruption);
    this.activeSession = updated;
    this.persist(updated, this.history);
    if (params.reminderAt) {
      void this.notificationService.scheduleReminder({
        id: session.id,
        title: "回来继续专注",
        triggerAtMs: new Date(params.reminderAt).getTime(),
        reason: normalizedReason,
      });
    }
    this.notify();
  };

  pauseFocus: UseFocusTimer["pauseFocus"] = async () => {
    return this.interruptFocus({ kind: FocusInterruptionKind.manualPause, reason: "未填写原因" });
  };

  resumeFocus: UseFocusTimer["resumeFocus"] = async () => {
    const session = this.activeSession;
    if (!session || session.status !== FocusSessionStatus.paused) return;
    const matches =
      this.videoPlaying &&
      session.sourceBvid === this.playingBvid &&
      session.sourcePartCid === this.playingPartCid;
    if (!matches) {
      const paused = pauseAt(
        session,
        Date.now(),
        hasVideoAssociation(session) ? FocusPauseReason.playback : FocusPauseReason.awaitingVideo,
      );
      this.activeSession = paused;
      this.persist(paused, this.history);
      this.notify();
      return;
    }
    const resumed = resumeAt(session, Date.now());
    void this.notificationService.cancelReminder(session.id);
    this.activeSession = resumed;
    this.persist(resumed, this.history);
    this.notify();
  };

  updatePlaybackState: UseFocusTimer["updatePlaybackState"] = async (params) => {
    this.playingBvid = params.bvid;
    this.playingPartCid = params.partCid;
    this.videoPlaying = params.isPlaying;
    const session = this.activeSession;
    if (!session || !hasVideoAssociation(session)) return;
    const matches = session.sourceBvid === params.bvid && session.sourcePartCid === params.partCid;
    if (session.status === FocusSessionStatus.running && (!matches || !params.isPlaying)) {
      const paused = pauseAt(session, Date.now(), FocusPauseReason.playback);
      this.activeSession = paused;
      this.persist(paused, this.history);
      this.notify();
    } else if (
      session.status === FocusSessionStatus.paused &&
      session.pauseReason === FocusPauseReason.playback &&
      matches &&
      params.isPlaying
    ) {
      const resumed = resumeAt(session, Date.now());
      this.activeSession = resumed;
      this.persist(resumed, this.history);
      this.notify();
    }
  };

  completeForPlaybackPart: UseFocusTimer["completeForPlaybackPart"] = async (params) => {
    const session = this.activeSession;
    if (
      !session ||
      !isActive(session) ||
      !session.completeOnPartEnd ||
      session.sourceBvid !== params.bvid ||
      session.sourcePartCid !== params.partCid
    ) {
      return false;
    }
    const finished = finishAtPartEnd(session, Date.now());
    const nextHistory = [finished, ...this.history.filter((s) => s.id !== finished.id)].slice(0, 200);
    this.lastFinishedSession = finished;
    this.history = nextHistory;
    this.activeSession = null;
    void this.notificationService.cancelReminder(session.id);
    this.persist(null, nextHistory);
    this.notify();
    return true;
  };

  associateVideo: UseFocusTimer["associateVideo"] = async (params) => {
    const session = this.activeSession;
    if (!session || !isActive(session)) return;
    this.playingBvid = params.bvid;
    this.playingPartCid = params.partCid;
    this.videoPlaying = params.isPlaying;
    const updated = associateVideoModel(session, Date.now(), params);
    this.activeSession = updated;
    this.persist(updated, this.history);
    this.notify();
  };

  updateLastSeen: UseFocusTimer["updateLastSeen"] = async (params) => {
    const session = this.activeSession;
    if (!session || !hasVideoAssociation(session)) return;
    const updated = updateLastSeenModel(session, params);
    this.activeSession = updated;
    this.persist(updated, this.history);
    this.notify();
  };

  extendFocus: UseFocusTimer["extendFocus"] = async (extensionMs) => {
    const session = this.activeSession;
    if (
      !session ||
      !isActive(session) ||
      extensionMs <= 0 ||
      session.plannedDurationMs + extensionMs > MAX_DURATION_MS
    ) {
      return false;
    }
    const updated = extendBy(session, extensionMs);
    this.activeSession = updated;
    this.persist(updated, this.history);
    this.notify();
    return true;
  };

  extendCompletedFocus: UseFocusTimer["extendCompletedFocus"] = async (extensionMs) => {
    const finished = this.lastFinishedSession;
    if (
      !finished ||
      finished.status !== FocusSessionStatus.completed ||
      extensionMs <= 0 ||
      finished.plannedDurationMs + extensionMs > MAX_DURATION_MS
    ) {
      return false;
    }
    const nextHistory = this.history.filter((s) => s.id !== finished.id);
    const reopened = reopenAt(finished, Date.now(), extensionMs);
    this.activeSession = reopened;
    this.lastFinishedSession = null;
    this.history = nextHistory;
    this.persist(reopened, nextHistory);
    this.notify();
    return true;
  };

  endFocusEarly: UseFocusTimer["endFocusEarly"] = async (reason) => {
    if (!this.activeSession || !isActive(this.activeSession)) return;
    this.finishActive(Date.now(), FocusSessionStatus.endedEarly, reason ?? "未填写原因");
  };

  dismissLastFinishedSession: UseFocusTimer["dismissLastFinishedSession"] = () => {
    this.lastFinishedSession = null;
    this.notify();
  };

  deleteHistoryEntry: UseFocusTimer["deleteHistoryEntry"] = async (id) => {
    this.history = this.history.filter((s) => s.id !== id);
    if (this.lastFinishedSession?.id === id) {
      this.lastFinishedSession = null;
    }
    this.persist(this.activeSession, this.history);
    this.notify();
  };

  clearHistory: UseFocusTimer["clearHistory"] = async () => {
    this.history = [];
    this.lastFinishedSession = null;
    this.persist(this.activeSession, []);
    this.notify();
  };

  getDerived(): {
    remainingMs: number;
    elapsedMs: number;
    progress: number;
    todayFocusedMs: number;
    todayCompletedCount: number;
  } {
    const now = Date.now();
    const snapshot = buildFocusStatisticsSnapshot({
      history: this.history,
      range: FocusStatisticsRange.sevenDays,
      nowMs: now,
      activeSession: this.activeSession,
    });
    return {
      remainingMs: this.activeSession ? remainingAt(this.activeSession, now) : 0,
      elapsedMs: this.activeSession ? elapsedAt(this.activeSession, now) : 0,
      progress: this.activeSession ? progressAt(this.activeSession, now) : 0,
      todayFocusedMs: calcTodayFocusedMs(snapshot),
      todayCompletedCount: calcTodayCompletedCount(this.history, now),
    };
  }
}

export const focusTimerController = new FocusTimerController();

export function useFocusTimer(): UseFocusTimer {
  const controller = focusTimerController;
  useSyncExternalStore(controller.subscribe, () => controller.version);
  const derived = controller.getDerived();
  return {
    ready: controller.ready,
    activeSession: controller.activeSession,
    lastFinishedSession: controller.lastFinishedSession,
    history: controller.history,
    hasActiveSession: Boolean(controller.activeSession && isActive(controller.activeSession)),
    remainingMs: derived.remainingMs,
    elapsedMs: derived.elapsedMs,
    progress: derived.progress,
    startFocus: controller.startFocus,
    pauseFocus: controller.pauseFocus,
    interruptFocus: controller.interruptFocus,
    resumeFocus: controller.resumeFocus,
    updatePlaybackState: controller.updatePlaybackState,
    completeForPlaybackPart: controller.completeForPlaybackPart,
    associateVideo: controller.associateVideo,
    updateLastSeen: controller.updateLastSeen,
    extendFocus: controller.extendFocus,
    extendCompletedFocus: controller.extendCompletedFocus,
    endFocusEarly: controller.endFocusEarly,
    dismissLastFinishedSession: controller.dismissLastFinishedSession,
    deleteHistoryEntry: controller.deleteHistoryEntry,
    clearHistory: controller.clearHistory,
    todayFocusedMs: derived.todayFocusedMs,
    todayCompletedCount: derived.todayCompletedCount,
  };
}
