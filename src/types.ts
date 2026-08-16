export type ThemeName =
  | "paper"
  | "mist"
  | "matcha"
  | "sunset"
  | "ink"
  | "graphite"
  | "dusk"
  | "deep";

export type ViewKey =
  | "today"
  | "inbox"
  | "tools"
  | "tasks"
  | "habits"
  | "notes"
  | "countdowns"
  | "focus"
  | "kaoyan"
  | "settings";

export type ToolKey = "tasks" | "habits" | "notes" | "countdowns" | "focus";

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
}

export interface AppState {
  theme: ThemeName;
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
}
