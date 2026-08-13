export type ViewKey =
  | "today"
  | "inbox"
  | "tools"
  | "tasks"
  | "habits"
  | "notes"
  | "countdowns"
  | "focus"
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

export interface AppState {
  theme: "paper" | "ink";
  backgroundImage: string | null;
  view: ViewKey;
  enabledTools: ToolKey[];
  inbox: InboxItem[];
  tasks: TaskItem[];
  habits: HabitItem[];
  notes: NoteItem[];
  countdowns: CountdownItem[];
  focusMinutes: number;
}
