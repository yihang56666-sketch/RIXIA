export type ThemeName =
  | "porcelain"
  | "graphite"
  | "sage"
  | "aurora"
  | "rosewood"
  | "mono"
  | "ocean"
  | "ember"
  | "lavender"
  | "ink"
  | "system";

export type ViewKey =
  | "today"
  | "plan"
  | "library"
  | "focus"
  | "settings"
  | "search"
  | "bilibili-player"
  | "favorites"
  | "followed"
  | "watch-history"
  | "login"
  | "app-update"
  | "cache-management"
  | "problem-diagnostics"
  | "home-feed"
  | "learning-list"
  | "focus-statistics"
  | "focus-dashboard"
  | "first-launch"
  // Legacy deep-link targets (kept for command palette / persisted state)
  | "inbox"
  | "tools"
  | "tasks"
  | "habits"
  | "notes"
  | "countdowns"
  | "videos"
  | "kaoyan";

export type ToolKey = "tasks" | "habits" | "notes" | "countdowns" | "focus" | "videos";

export type Density = "comfortable" | "standard" | "compact";

export type ResourceStatus = "saved" | "in-progress" | "completed";

/** 习惯频率类型。借鉴自 Loop Habit Tracker 的数据模型。 */
export type HabitFrequency =
  | { type: "daily" }
  | { type: "weekly-count"; target: number } // 每周 N 次
  | { type: "interval-days"; interval: number }; // 每 N 天 1 次

/** 专注回合循环配置。借鉴自 Super Productivity。 */
export interface FocusRounds {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  /** 每完成 N 个短休息后插入一次长休息 */
  longBreakEvery: number;
}

/** 日记页一条目。借鉴自 usememos/memos 与 AFFiNE 的 daily-doc 概念。 */
export interface JournalEntry {
  /** 日期作为主键 "YYYY-MM-DD" */
  date: string;
  body: string;
  updatedAt: string;
}

export interface InboxItem {
  id: string;
  text: string;
  createdAt: string;
}

export interface TaskItem {
  id: string;
  title: string;
  done: boolean;
  due: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface HabitItem {
  id: string;
  title: string;
  createdAt: string;
  checkedDates: string[];
  frequency?: HabitFrequency;
  color?: string;
  reminderTime?: string;
}

export interface NoteItem {
  id: string;
  body: string;
  createdAt: string;
}

export interface CountdownItem {
  id: string;
  title: string;
  date: string;
  createdAt: string;
}

export interface StudySubject {
  id: string;
  title: string;
  color: string;
  createdAt: string;
}

export interface StudyUnit {
  id: string;
  subjectId: string;
  title: string;
  startDate: string;
  endDate: string;
  completedDates: string[];
  createdAt: string;
}

export interface FocusSession {
  id: string;
  date: string;
  minutes: number;
  completedAt: string;
  resourceId?: string;
  episodeId?: string;
}

/** 收藏的哔哩哔哩视频/课程资源（学习区） */
export interface CourseResource {
  id: string;
  bvid: string;
  title: string;
  status: ResourceStatus;
  addedAt: string;
  lastOpenedAt?: string;
  progressSeconds?: number;
  durationSeconds?: number;
  episodeId?: string;
}

export interface TimestampNote {
  id: string;
  resourceId: string;
  seconds: number;
  body: string;
  createdAt: string;
}

export interface ActiveFocus {
  startedAt: string;
  mode: "countdown" | "countup";
  resourceId?: string;
  episodeId?: string;
}

export interface AppState {
  theme: ThemeName;
  density: Density;
  backgroundImage: string | null;
  view: ViewKey;
  enabledTools: ToolKey[];
  inbox: InboxItem[];
  tasks: TaskItem[];
  habits: HabitItem[];
  notes: NoteItem[];
  countdowns: CountdownItem[];
  subjects: StudySubject[];
  studyUnits: StudyUnit[];
  focusMinutes: number;
  focusSessions: FocusSession[];
  focusGoalMinutes: number;
  focusRounds: FocusRounds;
  activeFocus: ActiveFocus | null;
  resources: CourseResource[];
  timestampNotes: TimestampNote[];
  journals: JournalEntry[];
}

export interface BackupData {
  formatVersion: 3;
  theme: ThemeName;
  density: Density;
  enabledTools: ToolKey[];
  inbox: InboxItem[];
  tasks: TaskItem[];
  habits: HabitItem[];
  notes: NoteItem[];
  countdowns: CountdownItem[];
  subjects: StudySubject[];
  studyUnits: StudyUnit[];
  focusSessions: FocusSession[];
  focusGoalMinutes: number;
  focusRounds: FocusRounds;
  resources: CourseResource[];
  timestampNotes: TimestampNote[];
  journals: JournalEntry[];
}
