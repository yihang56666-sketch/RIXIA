import { create } from "zustand";
import { persist } from "zustand/middleware";
import { extractBvid } from "../lib/bilibili";
import { migratePersistedState, validateBackup } from "../lib/migrations";
import { createId } from "../lib/id";
import { todayKey } from "../lib/time";
import type {
  ActiveFocus,
  AppState,
  BackupData,
  CountdownItem,
  CourseResource,
  Density,
  FocusRounds,
  FocusSession,
  HabitFrequency,
  HabitItem,
  InboxItem,
  JournalEntry,
  NoteItem,
  ResourceStatus,
  StudySubject,
  StudyUnit,
  TaskItem,
  TimestampNote,
  ToolKey,
  ViewKey,
} from "../types";

interface AppActions {
  setView: (view: ViewKey) => void;
  setTheme: (theme: AppState["theme"]) => void;
  setDensity: (density: Density) => void;
  setBackgroundImage: (backgroundImage: string | null) => void;
  toggleTool: (tool: ToolKey) => void;
  addInbox: (text: string) => void;
  removeInbox: (id: string) => void;
  convertInboxToTask: (id: string) => void;
  addTask: (title: string, due?: string | null) => void;
  updateTask: (id: string, title: string, due: string | null) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  addHabit: (title: string, frequency?: HabitFrequency, color?: string) => void;
  updateHabitFrequency: (id: string, frequency: HabitFrequency) => void;
  updateHabitColor: (id: string, color: string | undefined) => void;
  toggleHabitToday: (id: string) => void;
  removeHabit: (id: string) => void;
  addNote: (body: string) => void;
  updateNote: (id: string, body: string) => void;
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
  setFocusRounds: (rounds: FocusRounds) => void;
  addFocusSession: (minutes: number, resourceId?: string) => void;
  setFocusGoalMinutes: (minutes: number) => void;
  addResource: (input: string, title?: string) => CourseResource | null;
  openBilibiliVideo: (bvid: string, title?: string) => void;
  openBilibiliVideoAt: (bvid: string, title: string | undefined, cid: number, seconds: number) => void;
  openBilibiliCreator: (creator: AppState["activeBilibiliCreator"] extends infer T ? Exclude<T, null> : never) => void;
  openBilibiliCollection: (collection: AppState["activeBilibiliCollection"] extends infer T ? Exclude<T, null> : never) => void;
  removeResource: (id: string) => void;
  updateResourceProgress: (id: string, seconds: number, durationSeconds?: number) => void;
  setResourceStatus: (id: string, status: ResourceStatus) => void;
  touchResource: (id: string) => void;
  addTimestampNote: (resourceId: string, seconds: number, body: string) => void;
  removeTimestampNote: (id: string) => void;
  setActiveFocus: (focus: ActiveFocus | null) => void;
  saveJournal: (date: string, body: string) => void;
  getJournal: (date: string) => JournalEntry | undefined;
  importBackup: (input: unknown) => void;
  exportBackup: () => BackupData;
  resetAll: () => void;
}

const defaultTools: ToolKey[] = ["tasks", "habits", "notes", "countdowns", "focus", "videos"];

const initialState: Omit<
  AppState,
  | keyof AppActions
> = {
  theme: "system",
  density: "standard",
  backgroundImage: null,
  view: "focus-dashboard",
  activeBilibiliCreator: null,
  activeBilibiliCollection: null,
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
  focusGoalMinutes: 120,
  focusRounds: { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
  activeFocus: null,
  activeBilibiliBvid: null,
  activeBilibiliPlaybackTarget: null,
  resources: [],
  timestampNotes: [],
  journals: [],
};

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      setView: (view) => set({ view }),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
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
          completedAt: null,
        };
        set((state) => ({ tasks: [item, ...state.tasks] }));
      },
      updateTask: (id, title, due) => {
        const value = title.trim();
        if (!value) return;
        set((state) => ({
          tasks: state.tasks.map((item) => (item.id === id ? { ...item, title: value, due } : item)),
        }));
      },
      toggleTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((item) =>
            item.id === id
              ? { ...item, done: !item.done, completedAt: !item.done ? new Date().toISOString() : null }
              : item,
          ),
        })),
      removeTask: (id) => set((state) => ({ tasks: state.tasks.filter((item) => item.id !== id) })),
      addHabit: (title, frequency, color) => {
        const value = title.trim();
        if (!value) return;
        const item: HabitItem = {
          id: createId(),
          title: value,
          createdAt: new Date().toISOString(),
          checkedDates: [],
          frequency: frequency ?? { type: "daily" },
          color,
        };
        set((state) => ({ habits: [item, ...state.habits] }));
      },
      updateHabitFrequency: (id, frequency) => set((state) => ({
        habits: state.habits.map((item) =>
          item.id === id ? { ...item, frequency } : item,
        ),
      })),
      updateHabitColor: (id, color) => set((state) => ({
        habits: state.habits.map((item) =>
          item.id === id ? { ...item, color } : item,
        ),
      })),
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
      updateNote: (id, body) => {
        const value = body.trim();
        if (!value) return;
        set((state) => ({
          notes: state.notes.map((item) => (item.id === id ? { ...item, body: value } : item)),
        }));
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
      setFocusMinutes: (minutes) => set({ focusMinutes: Math.max(1, Math.min(120, minutes)) }),
      addFocusSession: (minutes, resourceId) => {
        if (minutes <= 0) return;
        const session: FocusSession = {
          id: createId(),
          date: todayKey(),
          minutes,
          completedAt: new Date().toISOString(),
          resourceId,
        };
        set((state) => ({
          focusSessions: [session, ...state.focusSessions],
          activeFocus: null,
        }));
      },
      setFocusGoalMinutes: (minutes) => set({ focusGoalMinutes: Math.max(15, Math.min(600, minutes)) }),
      setFocusRounds: (rounds) => set({
        focusRounds: {
          workMinutes: Math.max(1, Math.min(120, Math.round(rounds.workMinutes))),
          shortBreakMinutes: Math.max(0, Math.min(60, Math.round(rounds.shortBreakMinutes))),
          longBreakMinutes: Math.max(0, Math.min(120, Math.round(rounds.longBreakMinutes))),
          longBreakEvery: Math.max(1, Math.min(12, Math.round(rounds.longBreakEvery))),
        },
      }),
      addResource: (input, title) => {
        const bvid = extractBvid(input);
        if (!bvid) return null;
        if (get().resources.some((item) => item.bvid === bvid)) return null;
        const item: CourseResource = {
          id: createId(),
          bvid,
          title: title?.trim() || `视频 ${bvid}`,
          status: "saved",
          addedAt: new Date().toISOString(),
        };
        set((state) => ({ resources: [item, ...state.resources] }));
        return item;
      },
      openBilibiliVideo: (bvid, title) => {
        get().addResource(bvid, title);
        set({ activeBilibiliBvid: bvid, activeBilibiliPlaybackTarget: null, view: "bilibili-player" });
      },
      openBilibiliVideoAt: (bvid, title, cid, seconds) => {
        get().addResource(bvid, title);
        set({
          activeBilibiliBvid: bvid,
          activeBilibiliPlaybackTarget: {
            cid: Number.isInteger(cid) && cid > 0 ? cid : 0,
            seconds: Number.isFinite(seconds) && seconds >= 0 ? seconds : 0,
          },
          view: "bilibili-player",
        });
      },
      openBilibiliCreator: (creator) => set({ activeBilibiliCreator: creator, view: "creator-profile" }),
      openBilibiliCollection: (collection) => set({ activeBilibiliCollection: collection, view: "collection-detail" }),
      removeResource: (id) => set((state) => ({
        resources: state.resources.filter((item) => item.id !== id),
        timestampNotes: state.timestampNotes.filter((item) => item.resourceId !== id),
      })),
      updateResourceProgress: (id, seconds, durationSeconds) => set((state) => ({
        resources: state.resources.map((item) =>
          item.id === id
            ? {
                ...item,
                progressSeconds: Math.max(0, seconds),
                durationSeconds: durationSeconds ?? item.durationSeconds,
                lastOpenedAt: new Date().toISOString(),
                status:
                  durationSeconds && seconds >= durationSeconds * 0.95
                    ? "completed"
                    : item.status === "saved"
                      ? "in-progress"
                      : item.status,
              }
            : item,
        ),
      })),
      setResourceStatus: (id, status) => set((state) => ({
        resources: state.resources.map((item) =>
          item.id === id ? { ...item, status, lastOpenedAt: new Date().toISOString() } : item,
        ),
      })),
      touchResource: (id) => set((state) => ({
        resources: state.resources.map((item) =>
          item.id === id ? { ...item, lastOpenedAt: new Date().toISOString() } : item,
        ),
      })),
      addTimestampNote: (resourceId, seconds, body) => {
        const value = body.trim();
        if (!value || seconds < 0) return;
        if (!get().resources.some((item) => item.id === resourceId)) return;
        const item: TimestampNote = {
          id: createId(),
          resourceId,
          seconds,
          body: value,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          timestampNotes: [...state.timestampNotes, item].sort((a, b) => a.seconds - b.seconds),
        }));
      },
      removeTimestampNote: (id) => set((state) => ({
        timestampNotes: state.timestampNotes.filter((item) => item.id !== id),
      })),
      setActiveFocus: (focus) => set({ activeFocus: focus }),
      saveJournal: (date, body) => set((state) => {
        const existing = state.journals.find((entry) => entry.date === date);
        const updatedAt = new Date().toISOString();
        if (existing) {
          return {
            journals: state.journals.map((entry) =>
              entry.date === date ? { ...entry, body, updatedAt } : entry,
            ),
          };
        }
        return { journals: [...state.journals, { date, body, updatedAt }] };
      }),
      getJournal: (date) => get().journals.find((entry) => entry.date === date),
      importBackup: (input) => {
        const data = validateBackup(input);
        set({
          theme: data.theme,
          density: data.density,
          enabledTools: data.enabledTools,
          inbox: data.inbox,
          tasks: data.tasks,
          habits: data.habits,
          notes: data.notes,
          countdowns: data.countdowns,
          subjects: data.subjects,
          studyUnits: data.studyUnits,
          focusSessions: data.focusSessions,
          focusGoalMinutes: data.focusGoalMinutes,
          focusRounds: data.focusRounds,
          resources: data.resources,
          timestampNotes: data.timestampNotes,
          journals: data.journals,
        });
      },
      exportBackup: () => {
        const state = get();
        return {
          formatVersion: 3,
          theme: state.theme,
          density: state.density,
          enabledTools: state.enabledTools,
          inbox: state.inbox,
          tasks: state.tasks,
          habits: state.habits,
          notes: state.notes,
          countdowns: state.countdowns,
          subjects: state.subjects,
          studyUnits: state.studyUnits,
          focusSessions: state.focusSessions,
          focusGoalMinutes: state.focusGoalMinutes,
          focusRounds: state.focusRounds,
          resources: state.resources,
          timestampNotes: state.timestampNotes,
          journals: state.journals,
        };
      },
      resetAll: () => set({ ...initialState }),
    }),
    {
      name: "rixia-v1",
      version: 3,
      migrate: (persisted, version) => migratePersistedState(persisted, version) as unknown as AppState & AppActions,
    },
  ),
);
