const DAY = 24 * 60 * 60 * 1000;

export function todayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}

/** 不带年份的短日期，例如「8月16日」 */
export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

export function daysUntil(isoDate: string, today = todayKey()): number {
  const target = new Date(`${isoDate}T00:00:00`);
  const now = new Date(`${today}T00:00:00`);
  return Math.round((target.getTime() - now.getTime()) / DAY);
}

export function weekdayLabel(date = new Date()): string {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function habitStreak(checkedDates: string[], today = todayKey()): number {
  const set = new Set(checkedDates);
  let cursor = new Date(`${today}T00:00:00`);
  if (!set.has(todayKey(cursor))) {
    cursor = new Date(cursor.getTime() - DAY);
  }
  let streak = 0;
  while (set.has(todayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY);
  }
  return streak;
}

/** 历史最长连续打卡天数 */
export function bestStreak(checkedDates: string[]): number {
  if (checkedDates.length === 0) return 0;
  const sorted = [...new Set(checkedDates)].sort();
  let best = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = daysUntil(sorted[index], sorted[index - 1]);
    run = gap === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/** 以 today 结尾（含 today）的连续 n 个日期键，旧到新排列 */
export function lastNDates(count: number, today = todayKey()): string[] {
  const base = new Date(`${today}T00:00:00`).getTime();
  const dates: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    dates.push(todayKey(new Date(base - offset * DAY)));
  }
  return dates;
}

/** 相对时间描述，例如「刚刚」「昨天 14:32」「3 天前」 */
export function relativeTime(isoTimestamp: string, now = new Date()): string {
  const time = new Date(isoTimestamp).getTime();
  if (Number.isNaN(time)) return "";
  const diff = now.getTime() - time;
  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`;
  const timeLabel = new Date(time).toTimeString().slice(0, 5);
  // 距今天数：0 = 今天，1 = 昨天，负值代表未来
  const dayGap = -daysUntil(todayKey(new Date(time)), todayKey(now));
  if (dayGap === 0) return `今天 ${timeLabel}`;
  if (dayGap === 1) return `昨天 ${timeLabel}`;
  if (dayGap > 1 && dayGap < 7) return `${dayGap} 天前`;
  return `${formatShortDate(todayKey(new Date(time)))} ${timeLabel}`;
}

export interface DueLabel {
  text: string;
  tone: "today" | "soon" | "later" | "overdue" | "none";
}

/** 任务到期日的友好展示 */
export function dueLabel(due: string | null, today = todayKey()): DueLabel {
  if (!due) return { text: "无日期", tone: "none" };
  const days = daysUntil(due, today);
  if (days < 0) return { text: `逾期 ${Math.abs(days)} 天`, tone: "overdue" };
  if (days === 0) return { text: "今天", tone: "today" };
  if (days === 1) return { text: "明天", tone: "soon" };
  if (days <= 6) return { text: weekdayLabel(new Date(`${due}T00:00:00`)), tone: "soon" };
  return { text: formatShortDate(due), tone: "later" };
}
