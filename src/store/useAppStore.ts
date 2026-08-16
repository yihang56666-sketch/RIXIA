import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createId } from "../lib/id";
import { todayKey } from "../lib/time";
import type {
  AppState,
  CountdownItem,
  FocusSession,
  HabitItem,
  InboxItem,
  NoteItem,
  StudySubject,
  StudyUnit,
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
  addSubject: (title: string, color: string) => void;
  updateSubject: (id: string, title: string, color: string) => void;
  removeSubject: (id: string) => void;
  moveSubject: (id: string, direction: -1 | 1) => void;
  addStudyUnit: (subjectId: string, title: string, startDate: string, endDate: string) => void;
  updateStudyUnit: (id: string, title: string, startDate: string, endDate: string) => void;
  removeStudyUnit: (id: string) => void;
  moveStudyUnit: (id: string, direction: -1 | 1) => void;
  toggleStudyDate: (id: string, date: string) => void;
  setFocusMinutes: (minutes: number) => void;
  addFocusSession: (minutes: number) => void;
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
      subjects: [],
      studyUnits: [],
      focusMinutes: 25,
      focusSessions: [],
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
      addSubject: (title, color) => {
        const value = title.trim();
        if (!value) return;
        const item: StudySubject = { id: createId(), title: value, color, createdAt: new Date().toISOString() };
        set((state) => ({ subjects: [...state.subjects, item] }));
      },
      updateSubject: (id, title, color) => {
        const value = title.trim();
        if (!value) return;
        set((state) => ({
          subjects: state.subjects.map((item) => (item.id === id ? { ...item, title: value, color } : item)),
        }));
      },
      removeSubject: (id) => set((state) => ({
        subjects: state.subjects.filter((item) => item.id !== id),
        studyUnits: state.studyUnits.filter((item) => item.subjectId !== id),
      })),
      moveSubject: (id, direction) => set((state) => {
        const index = state.subjects.findIndex((item) => item.id === id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= state.subjects.length) return state;
        const subjects = [...state.subjects];
        [subjects[index], subjects[target]] = [subjects[target], subjects[index]];
        return { subjects };
      }),
      addStudyUnit: (subjectId, title, startDate, endDate) => {
        const value = title.trim();
        if (!value || !startDate || !endDate || startDate > endDate) return;
        const item: StudyUnit = {
          id: createId(), subjectId, title: value, startDate, endDate, completedDates: [], createdAt: new Date().toISOString(),
        };
        set((state) => ({ studyUnits: [...state.studyUnits, item] }));
      },
      updateStudyUnit: (id, title, startDate, endDate) => {
        const value = title.trim();
        if (!value || !startDate || !endDate || startDate > endDate) return;
        set((state) => ({
          studyUnits: state.studyUnits.map((item) => (item.id === id ? { ...item, title: value, startDate, endDate } : item)),
        }));
      },
      removeStudyUnit: (id) => set((state) => ({ studyUnits: state.studyUnits.filter((item) => item.id !== id) })),
      moveStudyUnit: (id, direction) => set((state) => {
        const unit = state.studyUnits.find((item) => item.id === id);
        if (!unit) return state;
        const peerIndexes = state.studyUnits.map((item, index) => item.subjectId === unit.subjectId ? index : -1).filter((index) => index >= 0);
        const localIndex = peerIndexes.indexOf(state.studyUnits.findIndex((item) => item.id === id));
        const targetLocalIndex = localIndex + direction;
        if (targetLocalIndex < 0 || targetLocalIndex >= peerIndexes.length) return state;
        const studyUnits = [...state.studyUnits];
        const targetIndex = peerIndexes[targetLocalIndex];
        const currentIndex = peerIndexes[localIndex];
        [studyUnits[currentIndex], studyUnits[targetIndex]] = [studyUnits[targetIndex], studyUnits[currentIndex]];
        return { studyUnits };
      }),
      toggleStudyDate: (id, date) => set((state) => ({
        studyUnits: state.studyUnits.map((item) => {
          if (item.id !== id) return item;
          const completedDates = item.completedDates.includes(date)
            ? item.completedDates.filter((entry) => entry !== date)
            : [...item.completedDates, date];
          return { ...item, completedDates };
        }),
      })),
      setFocusMinutes: (minutes) => set({ focusMinutes: minutes }),
      addFocusSession: (minutes) => {
        if (minutes <= 0) return;
        const session: FocusSession = {
          id: createId(),
          date: todayKey(),
          minutes,
          completedAt: new Date().toISOString(),
        };
        set((state) => ({ focusSessions: [session, ...state.focusSessions] }));
      },
    }),
    {
      name: "rixia-v1",
      version: 1,
      migrate: (persisted) => {
        const state = persisted as Partial<AppState>;
        return {
          ...state,
          focusSessions: state.focusSessions ?? [],
        };
      },
    },
  ),
);
