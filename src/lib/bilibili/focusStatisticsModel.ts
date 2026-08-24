/**
 * 1:1 React 移植自 FocuBili 的 models/focus_statistics.dart。
 * 把本机专注记录转换为看板需要的汇总指标和逐日趋势。
 */

import { FocusSessionStatus, focusedMillisecondsByLocalDayAt, type FullFocusSession } from "./focusSessionModel";

export enum FocusStatisticsRange {
  sevenDays = "sevenDays",
  thirtyDays = "thirtyDays",
  all = "all",
}

export interface FocusDailyStatistic {
  /** 本地自然日零点的时间戳（毫秒） */
  date: number;
  focusedMs: number;
  sessionCount: number;
}

export interface FocusStatisticsSnapshot {
  range: FocusStatisticsRange;
  totalFocusedMs: number;
  averageFocusedMs: number;
  longestFocusedMs: number;
  completedCount: number;
  endedEarlyCount: number;
  focusDayCount: number;
  currentStreakDays: number;
  linkedVideoCount: number;
  interruptionCount: number;
  dailyTrend: FocusDailyStatistic[];
}

export function sessionCount(snapshot: FocusStatisticsSnapshot): number {
  return snapshot.completedCount + snapshot.endedEarlyCount;
}

export function completionRate(snapshot: FocusStatisticsSnapshot): number {
  const count = sessionCount(snapshot);
  return count === 0 ? 0 : Math.min(1, Math.max(0, snapshot.completedCount / count));
}

const DAY_MS = 86_400_000;

function dayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

interface MutableDailyStatistic {
  focusedMs: number;
  sessionCount: number;
}

function addFocusBuckets(
  daily: Map<number, MutableDailyStatistic>,
  values: Record<string, number>,
  rangeStart: number | null,
  rangeEnd: number,
): number {
  let includedMs = 0;
  for (const [key, value] of Object.entries(values)) {
    const parsed = Date.parse(key);
    if (Number.isNaN(parsed) || value <= 0) continue;
    const day = dayStart(parsed);
    if ((rangeStart !== null && day < rangeStart) || day > rangeEnd) continue;
    let item = daily.get(day);
    if (!item) {
      item = { focusedMs: 0, sessionCount: 0 };
      daily.set(day, item);
    }
    item.focusedMs += value;
    includedMs += value;
  }
  return includedMs;
}

function calculateCurrentStreak(daily: Map<number, MutableDailyStatistic>, today: number): number {
  let cursor = today;
  if ((daily.get(cursor)?.focusedMs ?? 0) <= 0) {
    cursor -= DAY_MS;
  }
  let streak = 0;
  while ((daily.get(cursor)?.focusedMs ?? 0) > 0) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

export function buildFocusStatisticsSnapshot(options: {
  history: FullFocusSession[];
  range: FocusStatisticsRange;
  nowMs: number;
  activeSession?: FullFocusSession | null;
}): FocusStatisticsSnapshot {
  const { history, range, nowMs, activeSession } = options;
  const today = dayStart(nowMs);
  const rangeStart =
    range === FocusStatisticsRange.sevenDays
      ? today - 6 * DAY_MS
      : range === FocusStatisticsRange.thirtyDays
        ? today - 29 * DAY_MS
        : null;

  const filteredHistory = history.filter((session) => {
    if (!session.finishedAt) return false;
    const finishedMs = Date.parse(session.finishedAt);
    if (Number.isNaN(finishedMs)) return false;
    return rangeStart === null || finishedMs >= rangeStart;
  });

  let totalMs = 0;
  let longestMs = 0;
  let completedCount = 0;
  let endedEarlyCount = 0;
  let linkedVideoCount = 0;
  let interruptionCount = 0;
  const daily = new Map<number, MutableDailyStatistic>();

  for (const session of filteredHistory) {
    const focusedMs = addFocusBuckets(
      daily,
      focusedMillisecondsByLocalDayAt(session, nowMs),
      rangeStart,
      today,
    );
    totalMs += focusedMs;
    if (focusedMs > longestMs) longestMs = focusedMs;
    if (session.status === FocusSessionStatus.completed) completedCount += 1;
    else if (session.status === FocusSessionStatus.endedEarly) endedEarlyCount += 1;
    if (session.sourceBvid?.trim()) linkedVideoCount += 1;
    interruptionCount += session.interruptions.length;
    const finishedDay = dayStart(Date.parse(session.finishedAt!));
    let item = daily.get(finishedDay);
    if (!item) {
      item = { focusedMs: 0, sessionCount: 0 };
      daily.set(finishedDay, item);
    }
    item.sessionCount += 1;
  }
  const finishedTotalMs = totalMs;

  if (activeSession) {
    totalMs += addFocusBuckets(
      daily,
      focusedMillisecondsByLocalDayAt(activeSession, nowMs),
      rangeStart,
      today,
    );
  }

  const count = completedCount + endedEarlyCount;
  const averageMs = count === 0 ? 0 : Math.floor(finishedTotalMs / count);
  const trendStart =
    range === FocusStatisticsRange.sevenDays ? today - 6 * DAY_MS : today - 29 * DAY_MS;
  const trendDays = Math.floor((today - trendStart) / DAY_MS) + 1;
  const dailyTrend: FocusDailyStatistic[] = [];
  for (let index = 0; index < trendDays; index += 1) {
    const date = trendStart + index * DAY_MS;
    const item = daily.get(date);
    dailyTrend.push({
      date,
      focusedMs: item?.focusedMs ?? 0,
      sessionCount: item?.sessionCount ?? 0,
    });
  }

  return {
    range,
    totalFocusedMs: totalMs,
    averageFocusedMs: averageMs,
    longestFocusedMs: longestMs,
    completedCount,
    endedEarlyCount,
    focusDayCount: [...daily.values()].filter((item) => item.focusedMs > 0).length,
    currentStreakDays: calculateCurrentStreak(daily, today),
    linkedVideoCount,
    interruptionCount,
    dailyTrend,
  };
}

export function todayFocusedMs(snapshot: FocusStatisticsSnapshot): number {
  const trend = snapshot.dailyTrend;
  return trend.length === 0 ? 0 : trend[trend.length - 1]!.focusedMs;
}

export function todayCompletedCount(history: FullFocusSession[], nowMs: number): number {
  const todayKey = new Date(nowMs);
  const start = new Date(todayKey.getFullYear(), todayKey.getMonth(), todayKey.getDate()).getTime();
  const end = start + DAY_MS;
  return history.filter((session) => {
    if (session.status !== FocusSessionStatus.completed || !session.finishedAt) return false;
    const finishedMs = Date.parse(session.finishedAt);
    return finishedMs >= start && finishedMs < end;
  }).length;
}
