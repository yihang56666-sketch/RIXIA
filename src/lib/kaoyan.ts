export interface Progress {
  completed: number;
  total: number;
  percent: number;
}

export interface DatedStudyUnit {
  startDate: string;
  endDate: string;
  completedDates: string[];
}

function dateAtMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

export function dateKeysInRange(startDate: string, endDate: string): string[] {
  const start = dateAtMidnight(startDate);
  const end = dateAtMidnight(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function unitProgress(unit: DatedStudyUnit): Progress {
  const plannedDates = dateKeysInRange(unit.startDate, unit.endDate);
  const plannedDateSet = new Set(plannedDates);
  const completed = new Set(unit.completedDates.filter((date) => plannedDateSet.has(date))).size;
  const total = plannedDates.length;
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}

export function subjectProgress(units: DatedStudyUnit[]): Progress {
  const progress = units.map(unitProgress);
  const completed = progress.reduce((sum, item) => sum + item.completed, 0);
  const total = progress.reduce((sum, item) => sum + item.total, 0);
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}
