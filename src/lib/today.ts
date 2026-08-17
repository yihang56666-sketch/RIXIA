import type {
  ActiveFocus,
  CountdownItem,
  CourseResource,
  FocusSession,
  HabitItem,
  InboxItem,
  TaskItem,
} from "../types";
import { daysUntil } from "./time";

const RECENT_RESOURCE_DAYS = 7;

export type TodayAction =
  | { kind: "focus"; label: string }
  | { kind: "task"; taskId: string; label: string }
  | { kind: "resource"; resourceId: string; label: string }
  | { kind: "inbox"; label: string }
  | { kind: "create-task"; label: string };

export interface TodayActionInput {
  today: string;
  activeFocus: ActiveFocus | null;
  tasks: TaskItem[];
  habits: HabitItem[];
  resources: CourseResource[];
  inbox: InboxItem[];
}

/**
 * 选择今天首页的"下一步行动"。固定优先级：
 * 1. 进行中的专注回合
 * 2. 逾期或今日到期的首个未完成任务
 * 3. 最近 7 天看过但未完成的课程
 * 4. 非空收集箱
 * 5. 兜底：创建今日任务
 */
export function chooseNextAction(input: TodayActionInput): TodayAction {
  if (input.activeFocus) {
    return { kind: "focus", label: "继续专注" };
  }

  const overdueOrToday = input.tasks
    .filter((task) => !task.done)
    .filter((task) => task.due !== null && task.due <= input.today)
    .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  if (overdueOrToday.length > 0) {
    const task = overdueOrToday[0];
    if (!task) throw new Error("unreachable");
    return { kind: "task", taskId: task.id, label: task.title };
  }

  const cutoff = new Date(input.today + "T00:00:00.000Z");
  cutoff.setUTCDate(cutoff.getUTCDate() - RECENT_RESOURCE_DAYS);
  const recentResources = input.resources
    .filter((r) => r.status !== "completed")
    .filter((r) => {
      const ref = r.lastOpenedAt ?? r.addedAt;
      return new Date(ref) >= cutoff;
    })
    .sort((a, b) => (b.lastOpenedAt ?? b.addedAt).localeCompare(a.lastOpenedAt ?? a.addedAt));
  if (recentResources.length > 0) {
    const resource = recentResources[0];
    if (!resource) throw new Error("unreachable");
    return {
      kind: "resource",
      resourceId: resource.id,
      label: `继续看：${resource.title}`,
    };
  }

  if (input.inbox.length > 0) {
    return { kind: "inbox", label: `整理 ${input.inbox.length} 条收集` };
  }

  return { kind: "create-task", label: "创建今日任务" };
}

export interface TodaySummary {
  tasksDone: number;
  tasksTotal: number;
  habitsChecked: number;
  habitsTotal: number;
  focusMinutes: number;
  inboxCount: number;
  nextCountdown: CountdownItem | null;
  nextCountdownDays: number | null;
}

export interface TodaySummaryInput {
  today: string;
  tasks: TaskItem[];
  habits: HabitItem[];
  focusSessions: FocusSession[];
  inbox: InboxItem[];
  countdowns: CountdownItem[];
}

export function buildTodaySummary(input: TodaySummaryInput): TodaySummary {
  const todays = input.tasks.filter((task) => task.due === input.today);
  const tasksDone = todays.filter((task) => task.done).length;
  const habitsChecked = input.habits.filter((habit) =>
    habit.checkedDates.includes(input.today),
  ).length;
  const focusMinutes = input.focusSessions
    .filter((session) => session.date === input.today)
    .reduce((sum, session) => sum + session.minutes, 0);

  const upcoming = input.countdowns
    .map((c) => ({ item: c, days: daysUntil(c.date, input.today) }))
    .filter((entry) => entry.days >= 0)
    .sort((a, b) => a.days - b.days);

  const next = upcoming.length > 0 ? upcoming[0] : null;

  return {
    tasksDone,
    tasksTotal: todays.length,
    habitsChecked,
    habitsTotal: input.habits.length,
    focusMinutes,
    inboxCount: input.inbox.length,
    nextCountdown: next?.item ?? null,
    nextCountdownDays: next?.days ?? null,
  };
}
