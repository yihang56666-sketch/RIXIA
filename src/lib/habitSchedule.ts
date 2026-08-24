import type { HabitFrequency, HabitItem } from "../types";
import { habitStrength } from "./stats";
import { bestStreak, habitStreak, todayKey } from "./time";

const DAY = 24 * 60 * 60 * 1000;

function parseDayKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function shiftDayKey(key: string, days: number): string {
  return todayKey(new Date(parseDayKey(key).getTime() + days * DAY));
}

/** 以周一为一周起点，返回包含 today 的那一周的 7 个日期键（旧→新）。 */
export function weekDatesContaining(today: string): string[] {
  const base = parseDayKey(today);
  const weekdayIndex = (base.getDay() + 6) % 7; // 周一 = 0
  const monday = base.getTime() - weekdayIndex * DAY;
  return Array.from({ length: 7 }, (_, index) => todayKey(new Date(monday + index * DAY)));
}

function countCheckedInRange(habit: HabitItem, startKey: string, endKey: string): number {
  return habit.checkedDates.filter((date) => date >= startKey && date <= endKey).length;
}

/**
 * 今天是否需要打卡（频率感知）：
 * - daily：每天都需要
 * - weekly-count N：本周已打次数 < N 时需要
 * - interval-days N：距上次打卡 ≥ N 天（或从未打过）时需要；已打卡的当天不再提醒
 */
export function isHabitDueToday(habit: HabitItem, today: string): boolean {
  if (habit.checkedDates.includes(today)) return false;
  const frequency: HabitFrequency = habit.frequency ?? { type: "daily" };
  if (frequency.type === "daily") return true;
  if (frequency.type === "weekly-count") {
    const week = weekDatesContaining(today);
    const doneThisWeek = countCheckedInRange(habit, week[0], today);
    return doneThisWeek < frequency.target;
  }
  // interval-days
  const sorted = [...habit.checkedDates].sort();
  const last = sorted[sorted.length - 1];
  if (!last) return true;
  return daysBetween(last, today) >= frequency.interval;
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((parseDayKey(toKey).getTime() - parseDayKey(fromKey).getTime()) / DAY);
}

/** 本周是否已达到每周目标。 */
function isWeekTargetMet(habit: HabitItem, anyDayOfWeek: string, target: number): boolean {
  const week = weekDatesContaining(anyDayOfWeek);
  return countCheckedInRange(habit, week[0], week[6]) >= target;
}

/**
 * 频率感知的连续记录：
 * - daily：按自然日连续（与原行为一致）
 * - weekly-count：连续达标的周数（本周未达标不扣，从上周起算）
 * - interval-days：连续满足"每 N 天至少一次"的轮数
 */
export function frequencyAwareStreak(habit: HabitItem, today: string): number {
  const frequency: HabitFrequency = habit.frequency ?? { type: "daily" };
  if (frequency.type === "daily") return habitStreak(habit.checkedDates, today);

  if (frequency.type === "weekly-count") {
    const target = Math.max(1, frequency.target);
    let streak = 0;
    let weekMonday = weekDatesContaining(today)[0];
    // 当前周尚未达标不扣连击，从上一周起算
    if (!isWeekTargetMet(habit, today, target)) {
      weekMonday = shiftDayKey(weekMonday, -7);
    }
    for (;;) {
      const weekEnd = shiftDayKey(weekMonday, 6);
      if (countCheckedInRange(habit, weekMonday, weekEnd) < target) break;
      streak += 1;
      // 习惯创建之前不可能有更早的达标周
      const created = habit.createdAt ? new Date(habit.createdAt) : null;
      if (created && !Number.isNaN(created.getTime()) && parseDayKey(weekMonday).getTime() < created.getTime()) break;
      weekMonday = shiftDayKey(weekMonday, -7);
    }
    return streak;
  }

  // interval-days：从今天往回找每个长度为 interval 的窗口是否含打卡
  const interval = Math.max(1, frequency.interval);
  const dates = [...habit.checkedDates].sort();
  if (dates.length === 0) return 0;
  let streak = 0;
  let windowEnd = today;
  for (;;) {
    const windowStart = shiftDayKey(windowEnd, -(interval - 1));
    const hasCheck = dates.some((date) => date >= windowStart && date <= windowEnd);
    if (!hasCheck) break;
    streak += 1;
    windowEnd = shiftDayKey(windowStart, -1);
  }
  return streak;
}

/**
 * 频率感知的强度（0-100）：实际打卡数 / 按频率推算的期望次数。
 */
export function frequencyAwareStrength(habit: HabitItem, days: string[]): number {
  const frequency: HabitFrequency = habit.frequency ?? { type: "daily" };
  if (frequency.type === "daily") return habitStrength(habit.checkedDates, days);
  if (days.length === 0) return 0;

  const hits = habit.checkedDates.filter((date) => days.includes(date)).length;
  if (frequency.type === "weekly-count") {
    const weeks = Math.ceil(days.length / 7);
    const expected = Math.max(1, weeks * Math.max(1, frequency.target));
    return Math.min(100, Math.round((hits / expected) * 100));
  }
  const expected = Math.max(1, Math.ceil(days.length / Math.max(1, frequency.interval)));
  return Math.min(100, Math.round((hits / expected) * 100));
}

export { bestStreak };
