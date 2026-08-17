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
  activeFocus: ActiveFocus | null;
  resources: CourseResource[];
  timestampNotes: TimestampNote[];
}

export interface BackupData {
  formatVersion: 2;
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
  resources: CourseResource[];
  timestampNotes: TimestampNote[];
}
