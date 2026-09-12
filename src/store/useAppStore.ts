import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { extractBvid } from "../lib/bilibili";
import { identifyResourceSource, normalizeResourceLink } from "../lib/resourceSources";
import { backupDropCounts, migratePersistedState, validateBackup } from "../lib/migrations";
import { exportCompanionBackup, importCompanionBackup } from "../lib/companionBackup";
import { enforceDataUrlBudget } from "../lib/backgroundImage";
import { createId } from "../lib/id";
import { todayKey } from "../lib/time";
import { nextReviewDue, nextReviewStage } from "../lib/kaoyan";
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
  KaoyanWord,
  MockExam,
  NoteItem,
  ResourceStatus,
  ReviewItem,
  StudySubject,
  StudyUnit,
  TaskItem,
  TimestampNote,
  ToolKey,
  ViewKey,
  WrongQuestion,
} from "../types";

interface AppActions {
  setView: (view: ViewKey) => void;
  focusTask: (taskId: string) => void;
  clearStorageWriteFailed: () => void;
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
  addWrongQuestion: (input: { title: string; subjectId?: string; note?: string; tags: string[] }) => void;
  removeWrongQuestion: (id: string) => void;
  addReviewItem: (title: string, subjectId?: string) => void;
  removeReviewItem: (id: string) => void;
  reviewReviewItem: (id: string, remembered: boolean) => void;
  addMockExam: (input: { date: string; subject: string; paperName: string; score: number; total: number }) => void;
  removeMockExam: (id: string) => void;
  addWord: (word: string, meaning: string) => void;
  removeWord: (id: string) => void;
  setKaoyanExamDate: (date: string | null) => void;
  setFocusMinutes: (minutes: number) => void;
  setFocusRounds: (rounds: FocusRounds) => void;
  addFocusSession: (minutes: number, resourceId?: string) => void;
  setFocusGoalMinutes: (minutes: number) => void;
  addResource: (input: string, title?: string) => CourseResource | null;
  openBilibiliVideo: (bvid: string, title?: string) => void;
  openCloudResource: (resourceId: string) => void;
  openBilibiliVideoAt: (bvid: string, title: string | undefined, cid: number, seconds: number) => void;
  openBilibiliCreator: (creator: AppState["activeBilibiliCreator"] extends infer T ? Exclude<T, null> : never) => void;
  openBilibiliCollection: (collection: AppState["activeBilibiliCollection"] extends infer T ? Exclude<T, null> : never) => void;
  openBilibiliFavoriteFolder: (folder: AppState["activeBilibiliFavoriteFolder"] extends infer T ? Exclude<T, null> : never) => void;
  openLogin: (autoOfficial?: boolean) => void;
  openBilibiliSearch: (query: string) => void;
  consumePendingBilibiliSearch: () => void;
  removeResource: (id: string) => void;
  updateResourceProgress: (id: string, seconds: number, durationSeconds?: number) => void;
  setResourceStatus: (id: string, status: ResourceStatus) => void;
  touchResource: (id: string) => void;
  addTimestampNote: (resourceId: string, seconds: number, body: string) => void;
  removeTimestampNote: (id: string) => void;
  setActiveFocus: (focus: ActiveFocus | null) => void;
  saveJournal: (date: string, body: string) => void;
  getJournal: (date: string) => JournalEntry | undefined;
  importBackup: (input: unknown) => { droppedTotal: number };
  exportBackup: () => BackupData;
  resetAll: () => void;
}

const defaultTools: ToolKey[] = ["tasks", "habits", "notes", "countdowns", "focus", "videos"];
let lastStorageWriteFailed = false;

/** 配额超限等写入异常不应炸掉调用方（否则每个 store action 都会抛错）。 */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    lastStorageWriteFailed = false;
    try {
      localStorage.setItem(name, value);
      queueMicrotask(() => {
        if (useAppStore.getState().storageWriteFailed) {
          useAppStore.setState({ storageWriteFailed: false });
        }
      });
    } catch (error) {
      lastStorageWriteFailed = true;
      // QuotaExceededError 等：保留内存态，等待下次成功写入。
      // 完全静默会让"数据早已不再落盘"无从察觉（重启后全部回退），至少留痕。
      console.warn(`[beid] 持久化写入失败（${name}），数据仅保留在内存中`, error);
      queueMicrotask(() => {
        if (!useAppStore.getState().storageWriteFailed) {
          useAppStore.setState({ storageWriteFailed: true });
        }
      });
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

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
  activeBilibiliFavoriteFolder: null,
  loginAutoOfficial: false,
  pendingBilibiliSearch: null,
  focusedTaskId: null,
  storageWriteFailed: false,
  enabledTools: defaultTools,
  inbox: [],
  tasks: [],
  habits: [],
  notes: [],
  countdowns: [],
  subjects: [],
  studyUnits: [],
  wrongQuestions: [],
  reviewItems: [],
  mockExams: [],
  kaoyanWords: [],
  kaoyanExamDate: null,
  focusMinutes: 25,
  focusSessions: [],
  focusGoalMinutes: 120,
  focusRounds: { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
  activeFocus: null,
  activeBilibiliBvid: null,
  activeCloudResourceId: null,
  activeBilibiliPlaybackTarget: null,
  resources: [],
  timestampNotes: [],
  journals: [],
};

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      setView: (view) => set({
        view,
        focusedTaskId: view === "plan" ? get().focusedTaskId : null,
      }),
      focusTask: (taskId) => set({ view: "plan", focusedTaskId: taskId }),
      clearStorageWriteFailed: () => set({ storageWriteFailed: false }),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      // 超预算的背景 data URL 会把整个持久化炸成静默失败，在唯一变更点拦截。
      setBackgroundImage: (backgroundImage) =>
        set({
          backgroundImage:
            backgroundImage === null ? null : enforceDataUrlBudget(backgroundImage),
        }),
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
        // 先移除收集项再建任务：双击/重复触发时第二次找不到条目直接返回，
        // 不会创建两条相同任务。
        get().removeInbox(id);
        get().addTask(item.text, todayKey());
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
        wrongQuestions: state.wrongQuestions.map((item) =>
          item.subjectId === id ? { ...item, subjectId: undefined } : item,
        ),
        reviewItems: state.reviewItems.map((item) =>
          item.subjectId === id ? { ...item, subjectId: undefined } : item,
        ),
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
      addWrongQuestion: ({ title, subjectId, note, tags }) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        const today = todayKey();
        const question: WrongQuestion = {
          id: createId(),
          subjectId,
          title: trimmed,
          note: note?.trim() || undefined,
          tags,
          wrongCount: 1,
          createdAt: new Date().toISOString(),
        };
        const review: ReviewItem = {
          id: createId(),
          sourceType: "wrong-question",
          sourceId: question.id,
          subjectId,
          title: trimmed,
          dueDate: nextReviewDue(today, 0),
          stage: 0,
          history: [],
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          wrongQuestions: [question, ...state.wrongQuestions],
          reviewItems: [review, ...state.reviewItems],
        }));
      },
      removeWrongQuestion: (id) => set((state) => ({
        wrongQuestions: state.wrongQuestions.filter((item) => item.id !== id),
        reviewItems: state.reviewItems.filter((item) => item.sourceId !== id),
      })),
      addReviewItem: (title, subjectId) => {
        const trimmed = title.trim();
        if (!trimmed) return;
        const duplicate = get().reviewItems.some((item) =>
          item.sourceType === "custom"
          && item.title === trimmed
          && (item.subjectId ?? "") === (subjectId ?? "")
          && item.history.length === 0
        );
        if (duplicate) return;
        const review: ReviewItem = {
          id: createId(),
          sourceType: "custom",
          subjectId,
          title: trimmed,
          dueDate: nextReviewDue(todayKey(), 0),
          stage: 0,
          history: [],
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ reviewItems: [review, ...state.reviewItems] }));
      },
      removeReviewItem: (id) => set((state) => ({
        reviewItems: state.reviewItems.filter((item) => item.id !== id),
      })),
      reviewReviewItem: (id, remembered) => set((state) => ({
        reviewItems: state.reviewItems.map((item) => {
          if (item.id !== id) return item;
          const today = todayKey();
          const stage = nextReviewStage(item.stage, remembered);
          return {
            ...item,
            stage,
            dueDate: nextReviewDue(today, stage),
            history: [...item.history, { date: today, remembered }],
          };
        }),
      })),
      addMockExam: ({ date, subject, paperName, score, total }) => {
        const trimmedSubject = subject.trim();
        if (!date || !trimmedSubject || !Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return;
        const exam: MockExam = {
          id: createId(),
          date,
          subject: trimmedSubject,
          paperName: paperName.trim() || "未命名试卷",
          score: Math.max(0, Math.min(Math.round(score), Math.round(total))),
          total: Math.round(total),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ mockExams: [...state.mockExams, exam] }));
      },
      removeMockExam: (id) => set((state) => ({
        mockExams: state.mockExams.filter((item) => item.id !== id),
      })),
      addWord: (word, meaning) => {
        const trimmed = word.trim();
        if (!trimmed) return;
        const entry: KaoyanWord = {
          id: createId(),
          word: trimmed,
          meaning: meaning.trim() || "释义待补充",
          createdAt: new Date().toISOString(),
        };
        const review: ReviewItem = {
          id: createId(),
          sourceType: "word",
          sourceId: entry.id,
          title: trimmed,
          dueDate: nextReviewDue(todayKey(), 0),
          stage: 0,
          history: [],
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          kaoyanWords: [entry, ...state.kaoyanWords],
          reviewItems: [review, ...state.reviewItems],
        }));
      },
      removeWord: (id) => set((state) => ({
        kaoyanWords: state.kaoyanWords.filter((item) => item.id !== id),
        reviewItems: state.reviewItems.filter((item) => item.sourceId !== id),
      })),
      setKaoyanExamDate: (date) => set({ kaoyanExamDate: date }),
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
        const source = identifyResourceSource(input);
        if (source && source !== "bilibili") {
          const url = normalizeResourceLink(input);
          if (!url) return null;
          if (get().resources.some((item) => item.url === url)) return null;
          const external: CourseResource = {
            id: createId(),
            bvid: "",
            source,
            url,
            title: title?.trim() || `${source === "quark" ? "夸克网盘" : source === "baidu" ? "百度网盘" : "直链"}资源`,
            status: "saved",
            addedAt: new Date().toISOString(),
          };
          set((state) => ({ resources: [external, ...state.resources] }));
          return external;
        }
        const bvid = extractBvid(input);
        if (!bvid) return null;
        if (get().resources.some((item) => item.bvid === bvid && !item.url)) return null;
        const item: CourseResource = {
          id: createId(),
          bvid,
          source: "bilibili",
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
      openCloudResource: (resourceId) => {
        if (!get().resources.some((item) => item.id === resourceId && Boolean(item.url))) return;
        get().touchResource(resourceId);
        set({ activeCloudResourceId: resourceId, view: "cloud-player" });
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
      openBilibiliFavoriteFolder: (folder) => set({ activeBilibiliFavoriteFolder: folder, view: "favorite-videos" }),
      openLogin: (autoOfficial = false) => set({ view: "login", loginAutoOfficial: autoOfficial }),
      openBilibiliSearch: (query) => {
        const value = query.trim();
        set({ pendingBilibiliSearch: value || null, view: "search" });
      },
      consumePendingBilibiliSearch: () => set({ pendingBilibiliSearch: null }),
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
        // 与 rehydrate 迁移契约对齐（空正文不保留）：清空正文等同删除该日日记，
        // 否则"保存成功→重启消失"。
        if (!body.trim()) {
          if (!existing) return {};
          return { journals: state.journals.filter((entry) => entry.date !== date) };
        }
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
        // 形状异常的条目会被逐项过滤：把丢弃数带给调用方，不能宣称"全部恢复"。
        const drops = backupDropCounts(input, data);
        const droppedTotal = Object.values(drops).reduce((sum, count) => sum + count, 0);
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
          wrongQuestions: data.wrongQuestions,
          reviewItems: data.reviewItems,
          mockExams: data.mockExams,
          kaoyanWords: data.kaoyanWords,
          kaoyanExamDate: data.kaoyanExamDate,
          focusSessions: data.focusSessions,
          focusMinutes: data.focusMinutes,
          focusGoalMinutes: data.focusGoalMinutes,
          focusRounds: data.focusRounds,
          backgroundImage: data.backgroundImage ?? null,
          resources: data.resources,
          timestampNotes: data.timestampNotes,
          journals: data.journals,
        });
        // 播放器笔记/学习清单/专注历史/观看历史住在独立存储键里；
        // companion 块存在才覆盖（旧版备份没有这块，保留设备现有数据）。
        const rootWriteFailed = lastStorageWriteFailed;
        const failedKeys = data.companion ? importCompanionBackup(data.companion) : [];
        if (rootWriteFailed || failedKeys.length > 0) {
          throw new Error("备份未完整写入本机存储。请勿关闭应用或删除原始备份；释放存储空间后重新导入。");
        }
        return { droppedTotal };
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
          wrongQuestions: state.wrongQuestions,
          reviewItems: state.reviewItems,
          mockExams: state.mockExams,
          kaoyanWords: state.kaoyanWords,
          kaoyanExamDate: state.kaoyanExamDate,
          focusSessions: state.focusSessions,
          focusMinutes: state.focusMinutes,
          focusGoalMinutes: state.focusGoalMinutes,
          focusRounds: state.focusRounds,
          backgroundImage: state.backgroundImage,
          resources: state.resources,
          timestampNotes: state.timestampNotes,
          journals: state.journals,
          companion: exportCompanionBackup(),
        };
      },
      resetAll: () => {
        // "重置"必须连 companion 键一起清（观看历史/学习清单/专注/笔记/续播进度），
        // 否则主 store 清空后隐私数据仍留在 localStorage。
        try {
          const storage = localStorage;
          const staleKeys: string[] = [];
          for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (key && (key.startsWith("rixia_") || key.startsWith("focubili."))) staleKeys.push(key);
          }
          for (const key of staleKeys) storage.removeItem(key);
        } catch {
          // 隐私模式下清不掉也不阻塞主 store 重置。
        }
        set({ ...initialState });
      },
    }),
    {
      name: "rixia-v1",
      version: 3,
      storage: createJSONStorage(() => safeStorage),
      // 只持久化持久数据与恢复类状态（view/activeFocus 支撑重启后回到原页面与
      // 恢复专注会话）；B 站导航指针（creator/collection/folder/search）是会话
      // 临时态，跨标签页 rehydrate 时会把别的标签页的导航位置带过来。
      partialize: (state) => ({
        theme: state.theme,
        density: state.density,
        backgroundImage: state.backgroundImage,
        view: state.view,
        loginAutoOfficial: state.loginAutoOfficial,
        enabledTools: state.enabledTools,
        inbox: state.inbox,
        tasks: state.tasks,
        habits: state.habits,
        notes: state.notes,
        countdowns: state.countdowns,
        subjects: state.subjects,
        studyUnits: state.studyUnits,
        wrongQuestions: state.wrongQuestions,
        reviewItems: state.reviewItems,
        mockExams: state.mockExams,
        kaoyanWords: state.kaoyanWords,
        kaoyanExamDate: state.kaoyanExamDate,
        focusMinutes: state.focusMinutes,
        focusSessions: state.focusSessions,
        focusGoalMinutes: state.focusGoalMinutes,
        focusRounds: state.focusRounds,
        activeFocus: state.activeFocus,
        activeBilibiliBvid: state.activeBilibiliBvid,
        activeBilibiliPlaybackTarget: state.activeBilibiliPlaybackTarget,
        activeCloudResourceId: state.activeCloudResourceId,
        resources: state.resources,
        timestampNotes: state.timestampNotes,
        journals: state.journals,
      }),
      migrate: (persisted, version) => migratePersistedState(persisted, version) as unknown as AppState & AppActions,
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object" || Array.isArray(persisted)) return current;
        return { ...current, ...migratePersistedState(persisted, 3) };
      },
    },
  ),
);

// 多标签页同步：其他标签页写入持久化状态时，本标签页重新水合，
// 避免"整份快照互相覆盖"造成的静默数据丢失。
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "rixia-v1" || event.key === null) {
      void useAppStore.persist.rehydrate();
    }
  });
}
