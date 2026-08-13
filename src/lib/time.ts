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
