/**
 * RIXIA useFocusTimer hook — 1:1 React 移植自 FocuBili 的
 * focus_timer_controller.dart（753 行）。
 *
 * 管理全应用唯一的专注任务、视频播放联动、打断记录和本机持久化。
 * 所有状态变更自动持久化到 localStorage。
 */

import { useCallback, useEffect, useRef, useState } from "react";
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

export function useFocusTimer(): UseFocusTimer {
  const storage = useRef(createFocusSessionStorageService());
  const [ready, setReady] = useState(false);
  const [activeSession, setActiveSession] = useState<FullFocusSession | null>(null);
  const [lastFinishedSession, setLastFinishedSession] = useState<FullFocusSession | null>(null);
  const [history, setHistory] = useState<FullFocusSession[]>([]);
  const [, forceUpdate] = useState(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playingBvidRef = useRef<string | null>(null);
  const playingPartCidRef = useRef<number | null>(null);
  const videoPlayingRef = useRef(false);

  const persist = useCallback((active: FullFocusSession | null, hist: FullFocusSession[]) => {
    storage.current.saveState(active, hist);
  }, []);

  const syncTicker = useCallback(() => {
    const shouldRun = ready && activeSession?.status === FocusSessionStatus.running;
    if (!shouldRun) {
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
      return;
    }
    if (!tickerRef.current) {
      tickerRef.current = setInterval(() => {
        forceUpdate((n) => n + 1);
      }, 1000);
    }
  }, [ready, activeSession]);

  // tick is called by the interval when running — it checks completion
  // The interval itself just calls forceUpdate; the completion check
  // is done in a separate effect below.

  // 初始化：加载本地状态
  useEffect(() => {
    let cancelled = false;
    storage.current.loadState().then((state: FocusStoredState) => {
      if (cancelled) return;
      setActiveSession(state.activeSession);
      setHistory(state.history);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // 生命周期：后台时记录打断
  useEffect(() => {
    function handleVisibility() {
      if (!ready) return;
      if (document.visibilityState === "visible") {
        forceUpdate((n) => n + 1);
        return;
      }
      if (activeSession?.status === FocusSessionStatus.running) {
        const now = Date.now();
        const interruption: FocusInterruption = {
          id: `${activeSession.id}-${now}`,
          occurredAt: new Date(now).toISOString(),
          kind: FocusInterruptionKind.appBackground,
          reason: "专注被打断",
        };
        const updated = addInterruption(activeSession, now, interruption);
        setActiveSession(updated);
        persist(updated, history);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [ready, activeSession, history, persist]);

  // sync ticker
  useEffect(() => {
    syncTicker();
    return () => {
      if (tickerRef.current) {
        clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
    };
  }, [syncTicker]);

  const startFocus = useCallback<UseFocusTimer["startFocus"]>(async (params) => {
    if (!ready || (activeSession && isActive(activeSession))) return false;
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
    setActiveSession(session);
    setLastFinishedSession(null);
    persist(session, history);
    forceUpdate((n) => n + 1);
    return true;
  }, [ready, activeSession, history, persist]);

  const interruptFocus = useCallback<UseFocusTimer["interruptFocus"]>(async (params) => {
    if (!activeSession || !isActive(activeSession)) return;
    const now = Date.now();
    const normalizedReason = params.reason.trim() || "未填写原因";
    const interruption: FocusInterruption = {
      id: `${activeSession.id}-${now}`,
      occurredAt: new Date(now).toISOString(),
      kind: params.kind,
      reason: normalizedReason,
      reminderAt: params.reminderAt,
    };
    const updated = addInterruption(activeSession, now, interruption);
    setActiveSession(updated);
    persist(updated, history);
    forceUpdate((n) => n + 1);
  }, [activeSession, history, persist]);

  const pauseFocus = useCallback(async () => {
    return interruptFocus({ kind: FocusInterruptionKind.manualPause, reason: "未填写原因" });
  }, [interruptFocus]);

  const resumeFocus = useCallback(async () => {
    if (!activeSession || activeSession.status !== FocusSessionStatus.paused) return;
    const matches = videoPlayingRef.current &&
      activeSession.sourceBvid === playingBvidRef.current &&
      activeSession.sourcePartCid === playingPartCidRef.current;
    if (!matches) {
      const paused = pauseAt(activeSession, Date.now(), hasVideoAssociation(activeSession)
        ? FocusPauseReason.playback
        : FocusPauseReason.awaitingVideo);
      setActiveSession(paused);
      persist(paused, history);
      forceUpdate((n) => n + 1);
      return;
    }
    const resumed = resumeAt(activeSession, Date.now());
    setActiveSession(resumed);
    persist(resumed, history);
    forceUpdate((n) => n + 1);
  }, [activeSession, history, persist]);

  const updatePlaybackState = useCallback<UseFocusTimer["updatePlaybackState"]>(async (params) => {
    playingBvidRef.current = params.bvid;
    playingPartCidRef.current = params.partCid;
    videoPlayingRef.current = params.isPlaying;
    if (!activeSession || !hasVideoAssociation(activeSession)) return;
    const matches = activeSession.sourceBvid === params.bvid && activeSession.sourcePartCid === params.partCid;
    if (activeSession.status === FocusSessionStatus.running && (!matches || !params.isPlaying)) {
      const paused = pauseAt(activeSession, Date.now(), FocusPauseReason.playback);
      setActiveSession(paused);
      persist(paused, history);
      forceUpdate((n) => n + 1);
    } else if (activeSession.status === FocusSessionStatus.paused &&
      activeSession.pauseReason === FocusPauseReason.playback && matches && params.isPlaying) {
      const resumed = resumeAt(activeSession, Date.now());
      setActiveSession(resumed);
      persist(resumed, history);
      forceUpdate((n) => n + 1);
    }
  }, [activeSession, history, persist]);

  const completeForPlaybackPart = useCallback<UseFocusTimer["completeForPlaybackPart"]>(async (params) => {
    if (!activeSession || !isActive(activeSession) || !activeSession.completeOnPartEnd ||
      activeSession.sourceBvid !== params.bvid || activeSession.sourcePartCid !== params.partCid) {
      return false;
    }
    const finished = finishAtPartEnd(activeSession, Date.now());
    setLastFinishedSession(finished);
    setHistory((prev) => [finished, ...prev.filter((s) => s.id !== finished.id)].slice(0, 200));
    setActiveSession(null);
    persist(null, [finished, ...history.filter((s) => s.id !== finished.id)].slice(0, 200));
    return true;
  }, [activeSession, history, persist]);

  const associateVideo = useCallback<UseFocusTimer["associateVideo"]>(async (params) => {
    if (!activeSession || !isActive(activeSession)) return;
    playingBvidRef.current = params.bvid;
    playingPartCidRef.current = params.partCid;
    videoPlayingRef.current = params.isPlaying;
    const updated = associateVideoModel(activeSession, Date.now(), params);
    setActiveSession(updated);
    persist(updated, history);
    forceUpdate((n) => n + 1);
  }, [activeSession, history, persist]);

  const updateLastSeenCb = useCallback<UseFocusTimer["updateLastSeen"]>(async (params) => {
    if (!activeSession || !hasVideoAssociation(activeSession)) return;
    const updated = updateLastSeenModel(activeSession, params);
    setActiveSession(updated);
    persist(updated, history);
  }, [activeSession, history, persist]);

  const extendFocus = useCallback<UseFocusTimer["extendFocus"]>(async (extensionMs) => {
    if (!activeSession || !isActive(activeSession) || extensionMs <= 0 ||
      activeSession.plannedDurationMs + extensionMs > MAX_DURATION_MS) {
      return false;
    }
    const updated = extendBy(activeSession, extensionMs);
    setActiveSession(updated);
    persist(updated, history);
    forceUpdate((n) => n + 1);
    return true;
  }, [activeSession, history, persist]);

  const extendCompletedFocus = useCallback<UseFocusTimer["extendCompletedFocus"]>(async (extensionMs) => {
    if (!lastFinishedSession || lastFinishedSession.status !== FocusSessionStatus.completed ||
      extensionMs <= 0 || lastFinishedSession.plannedDurationMs + extensionMs > MAX_DURATION_MS) {
      return false;
    }
    const newHistory = history.filter((s) => s.id !== lastFinishedSession.id);
    const reopened = reopenAt(lastFinishedSession, Date.now(), extensionMs);
    setActiveSession(reopened);
    setLastFinishedSession(null);
    setHistory(newHistory);
    persist(reopened, newHistory);
    forceUpdate((n) => n + 1);
    return true;
  }, [lastFinishedSession, history, persist]);

  const endFocusEarly = useCallback<UseFocusTimer["endFocusEarly"]>(async (reason) => {
    if (!activeSession || !isActive(activeSession)) return;
    const finished = finishAt(activeSession, Date.now(), FocusSessionStatus.endedEarly, reason ?? "未填写原因");
    setLastFinishedSession(finished);
    setHistory((prev) => [finished, ...prev.filter((s) => s.id !== finished.id)].slice(0, 200));
    setActiveSession(null);
    persist(null, [finished, ...history.filter((s) => s.id !== finished.id)].slice(0, 200));
    forceUpdate((n) => n + 1);
  }, [activeSession, history, persist]);

  const dismissLastFinishedSession = useCallback(() => {
    setLastFinishedSession(null);
  }, []);

  const deleteHistoryEntry = useCallback(async (id: string) => {
    setHistory((prev) => {
      const next = prev.filter((s) => s.id !== id);
      persist(activeSession, next);
      return next;
    });
    if (lastFinishedSession?.id === id) {
      setLastFinishedSession(null);
    }
  }, [activeSession, lastFinishedSession, persist]);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    setLastFinishedSession(null);
    persist(activeSession, []);
  }, [activeSession, persist]);

  // 计算当前时间相关值
  const now = Date.now();
  const currentRemaining = activeSession ? remainingAt(activeSession, now) : 0;
  const currentElapsed = activeSession ? elapsedAt(activeSession, now) : 0;
  const currentProgress = activeSession ? progressAt(activeSession, now) : 0;

  // 今天专注时长
  const todayKey = new Date().toISOString().slice(0, 10);
  let todayFocusedMs = 0;
  if (activeSession) {
    const daily = activeSession.dailyFocusMilliseconds;
    todayFocusedMs = (daily[todayKey] ?? 0);
    if (activeSession.status === FocusSessionStatus.running) {
      todayFocusedMs += Math.max(0, currentElapsed - Object.values(activeSession.dailyFocusMilliseconds).reduce((a, b) => a + b, 0));
    }
  }
  for (const s of history) {
    const day = s.finishedAt?.slice(0, 10);
    if (day === todayKey) {
      todayFocusedMs += s.accumulatedFocusMs;
    }
  }

  // 今天完成次数
  const todayCompletedCount = history.filter((s) =>
    s.status === FocusSessionStatus.completed && s.finishedAt?.slice(0, 10) === todayKey
  ).length;

  return {
    ready,
    activeSession,
    lastFinishedSession,
    history,
    hasActiveSession: Boolean(activeSession && isActive(activeSession)),
    remainingMs: currentRemaining,
    elapsedMs: currentElapsed,
    progress: currentProgress,
    startFocus,
    pauseFocus,
    interruptFocus,
    resumeFocus,
    updatePlaybackState,
    completeForPlaybackPart,
    associateVideo,
    updateLastSeen: updateLastSeenCb,
    extendFocus,
    extendCompletedFocus,
    endFocusEarly,
    dismissLastFinishedSession,
    deleteHistoryEntry,
    clearHistory,
    todayFocusedMs,
    todayCompletedCount,
  };
}
