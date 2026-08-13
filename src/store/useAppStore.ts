import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createId } from "../lib/id";
import { todayKey } from "../lib/time";
import type {
  AppState,
  CountdownItem,
  HabitItem,
  InboxItem,
  NoteItem,
  TaskItem,
  ToolKey,
  ViewKey,
} from "../types";

interface AppActions {
  setView: (view: ViewKey) => void;
  setTheme: (theme: AppState["theme"]) => void;
  setBackgroundImage: (backgroundImage: string | null) => void;
  toggleTool: (tool: ToolKey) => void;
  addInbox: (text: string) => void;
  removeInbox: (id: string) => void;
  convertInboxToTask: (id: string) => void;
  addTask: (title: string, due?: string | null) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  addHabit: (title: string) => void;
  toggleHabitToday: (id: string) => void;
  removeHabit: (id: string) => void;
  addNote: (body: string) => void;
  removeNote: (id: string) => void;
  addCountdown: (title: string, date: string) => void;
  removeCountdown: (id: string) => void;
  setFocusMinutes: (minutes: number) => void;
}

const defaultTools: ToolKey[] = ["tasks", "habits", "notes", "countdowns", "focus"];

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      theme: "paper",
      backgroundImage: null,
      view: "today",
      enabledTools: defaultTools,
      inbox: [],
      tasks: [],
      habits: [],
      notes: [],
      countdowns: [],
      focusMinutes: 25,
      setView: (view) => set({ view }),
      setTheme: (theme) => set({ theme }),
      setBackgroundImage: (backgroundImage) => set({ backgroundImage }),
      toggleTool: (tool) =>
        set((state) => {
          const enabled = state.enabledTools.includes(tool)
            ? state.enabledTools.filter((item) => item !== tool)
            : [...state.enabledTools, tool];
          return { enabledTools: enabled.length ? enabled : [tool] };
        }),
      addInbox: (text) => {
        const value = text.trim();
        if (!value) return;
        const item: InboxItem = { id: createId(), text: value, createdAt: new Date().toISOString() };
        set((state) => ({ inbox: [item, ...state.inbox] }));
      },
      removeInbox: (id) => set((state) => ({ inbox: state.inbox.filter((item) => item.id !== id) })),
      convertInboxToTask: (id) => {
        const item = get().inbox.find((entry) => entry.id === id);
        if (!item) return;
        get().addTask(item.text, todayKey());
        get().removeInbox(id);
      },
      addTask: (title, due = todayKey()) => {
        const value = title.trim();
        if (!value) return;
        const item: TaskItem = {
          id: createId(),
          title: value,
          done: false,
          due,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ tasks: [item, ...state.tasks] }));
      },
      toggleTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
        })),
      removeTask: (id) => set((state) => ({ tasks: state.tasks.filter((item) => item.id !== id) })),
      addHabit: (title) => {
        const value = title.trim();
        if (!value) return;
        const item: HabitItem = { id: createId(), title: value, createdAt: new Date().toISOString(), checkedDates: [] };
        set((state) => ({ habits: [item, ...state.habits] }));
      },
      toggleHabitToday: (id) => {
        const today = todayKey();
        set((state) => ({
          habits: state.habits.map((item) => {
            if (item.id !== id) return item;
            const checked = item.checkedDates.includes(today)
              ? item.checkedDates.filter((date) => date !== today)
              : [...item.checkedDates, today];
            return { ...item, checkedDates: checked };
          }),
        }));
      },
      removeHabit: (id) => set((state) => ({ habits: state.habits.filter((item) => item.id !== id) })),
      addNote: (body) => {
        const value = body.trim();
        if (!value) return;
        const item: NoteItem = { id: createId(), body: value, createdAt: new Date().toISOString() };
        set((state) => ({ notes: [item, ...state.notes] }));
      },
      removeNote: (id) => set((state) => ({ notes: state.notes.filter((item) => item.id !== id) })),
      addCountdown: (title, date) => {
        const value = title.trim();
        if (!value || !date) return;
        const item: CountdownItem = {
          id: createId(),
          title: value,
          date,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ countdowns: [item, ...state.countdowns] }));
      },
      removeCountdown: (id) => set((state) => ({ countdowns: state.countdowns.filter((item) => item.id !== id) })),
      setFocusMinutes: (minutes) => set({ focusMinutes: minutes }),
    }),
    { name: "rixia-v1" },
  ),
);
