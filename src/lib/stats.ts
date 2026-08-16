import type { FocusSession, HabitItem, TaskItem } from "../types";

export interface DaySeries {
  days: string[];
  values: number[];
}

/** 近 N 天每天完成的任务数（依据完成时间戳） */
export function taskCompletionsByDay(tasks: TaskItem[], days: string[]): number[] {
  return days.map(
    (date) => tasks.filter((task) => task.completedAt?.slice(0, 10) === date).length,
  );
}

/** 近 N 天每天的专注分钟数 */
export function focusMinutesByDay(sessions: FocusSession[], days: string[]): number[] {
  return days.map(
    (date) => sessions.filter((session) => session.date === date).reduce((sum, item) => sum + item.minutes, 0),
  );
}

/** 近 N 天每天的习惯打卡次数 */
export function habitCheckinsByDay(habits: HabitItem[], days: string[]): number[] {
  return days.map((date) => habits.filter((habit) => habit.checkedDates.includes(date)).length);
}

/** 习惯强度：近 window 天的打卡率（0-100，参考 Loop Habit Tracker） */
export function habitStrength(checkedDates: string[], days: string[], window = 30): number {
  const recent = days.slice(-window);
  if (recent.length === 0) return 0;
  const set = new Set(checkedDates);
  const hits = recent.filter((date) => set.has(date)).length;
  return Math.round((hits / recent.length) * 100);
}

/** 环比摘要 */
export interface TrendSummary {
  current: number;
  previous: number;
  deltaPercent: number | null;
}

export function trendSummary(current: number, previous: number): TrendSummary {
  if (previous === 0) return { current, previous, deltaPercent: current > 0 ? 100 : null };
  return { current, previous, deltaPercent: Math.round(((current - previous) / previous) * 100) };
}
