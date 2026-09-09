import type {
  ActiveFocus,
  AppState,
  BackupData,
  CourseResource,
  FocusRounds,
  FocusSession,
  HabitFrequency,
  HabitItem,
  InboxItem,
  JournalEntry,
  NoteItem,
  ResourceStatus,
  ReviewItem,
  TaskItem,
  ThemeName,
  TimestampNote,
  ToolKey,
  MockExam,
  WrongQuestion,
} from "../types";
import { THEME_MIGRATION, VIEW_TITLES } from "../catalog";
import { enforceDataUrlBudget } from "./backgroundImage";
import { sanitizeCompanionBackup } from "./companionBackup";
import { identifyResourceSource, normalizeResourceLink } from "./resourceSources";
import { REVIEW_INTERVAL_DAYS } from "./kaoyan";

const NEW_THEME_KEYS = new Set<ThemeName>([
  "porcelain", "graphite", "sage", "aurora", "rosewood",
  "mono", "ocean", "ember", "lavender", "ink", "system",
]);

function asArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function migrateDayKeys(value: unknown): string[] {
  return [...new Set(asArray<unknown>(value, []).filter((entry): entry is string => {
    if (typeof entry !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(entry)) return false;
    const date = new Date(entry + "T00:00:00.000Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === entry;
  }))];
}

function migrateTheme(theme: unknown): ThemeName {
  if (typeof theme === "string") {
    if (NEW_THEME_KEYS.has(theme as ThemeName)) return theme as ThemeName;
    if (Object.prototype.hasOwnProperty.call(THEME_MIGRATION, theme)) return THEME_MIGRATION[theme];
  }
  return "porcelain";
}

function migrateResource(input: unknown): CourseResource | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" ? input.id : "";
  const bvid = typeof input.bvid === "string" ? input.bvid : "";
  const title = typeof input.title === "string" ? input.title : bvid || "未命名";
  const rawUrl = typeof input.url === "string" ? input.url : "";
  const detectedSource = rawUrl ? identifyResourceSource(rawUrl) : null;
  const url = detectedSource && detectedSource !== "bilibili" ? normalizeResourceLink(rawUrl) : null;
  if (!id || (!bvid && !url)) return null;
  const addedAt = typeof input.addedAt === "string" ? input.addedAt : new Date().toISOString();
  const statusRaw = input.status;
  const status: ResourceStatus =
    statusRaw === "in-progress" || statusRaw === "completed" ? statusRaw : "saved";
  const lastOpenedAt = typeof input.lastOpenedAt === "string" ? input.lastOpenedAt : undefined;
  const progressSeconds =
    isFiniteNumber(input.progressSeconds) && input.progressSeconds >= 0
      ? input.progressSeconds
      : undefined;
  const durationSeconds =
    isFiniteNumber(input.durationSeconds) && input.durationSeconds >= 0
      ? input.durationSeconds
      : undefined;
  const episodeId = typeof input.episodeId === "string" ? input.episodeId : undefined;
  return {
    id, bvid, title, status, addedAt,
    ...(url ? { url, source: detectedSource! } : { source: "bilibili" as const }),
    lastOpenedAt, progressSeconds, durationSeconds, episodeId,
  };
}

function migrateTimestampNote(input: unknown): TimestampNote | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" ? input.id : "";
  const resourceId = typeof input.resourceId === "string" ? input.resourceId : "";
  const seconds = isFiniteNumber(input.seconds) && input.seconds >= 0 ? input.seconds : -1;
  const body = typeof input.body === "string" ? input.body : "";
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : new Date().toISOString();
  if (!id || !resourceId || seconds < 0 || !body.trim()) return null;
  return { id, resourceId, seconds, body, createdAt };
}

function migrateFocusSession(input: unknown): FocusSession | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" ? input.id : "";
  const date = typeof input.date === "string" ? input.date : "";
  const minutes = isFiniteNumber(input.minutes) && input.minutes > 0 ? input.minutes : 0;
  const completedAt = typeof input.completedAt === "string" ? input.completedAt : "";
  if (!id || !date || !completedAt || minutes <= 0) return null;
  const resourceId = typeof input.resourceId === "string" ? input.resourceId : undefined;
  const episodeId = typeof input.episodeId === "string" ? input.episodeId : undefined;
  return { id, date, minutes, completedAt, resourceId, episodeId };
}

function migrateActiveFocus(input: unknown): ActiveFocus | null {
  if (!isObject(input)) return null;
  const startedAt = typeof input.startedAt === "string" ? input.startedAt : "";
  const mode = input.mode === "countup" ? "countup" : "countdown";
  if (!startedAt) return null;
  const resourceId = typeof input.resourceId === "string" ? input.resourceId : undefined;
  const episodeId = typeof input.episodeId === "string" ? input.episodeId : undefined;
  const phase = input.phase === "short-break" || input.phase === "long-break"
    ? input.phase
    : "focus";
  const endsAtMs = isFiniteNumber(input.endsAtMs) ? input.endsAtMs : null;
  const countupStartedAtMs = isFiniteNumber(input.countupStartedAtMs) ? input.countupStartedAtMs : null;
  const hasRunningAnchor = mode === "countup" ? countupStartedAtMs !== null : endsAtMs !== null;
  return {
    startedAt,
    mode,
    resourceId,
    episodeId,
    phase,
    running: typeof input.running === "boolean" ? input.running && hasRunningAnchor : undefined,
    endsAtMs,
    remainingSeconds:
      typeof input.remainingSeconds === "number" && Number.isFinite(input.remainingSeconds) && input.remainingSeconds >= 0
        ? Math.round(input.remainingSeconds)
        : undefined,
    countupStartedAtMs,
    countupElapsedMs:
      typeof input.countupElapsedMs === "number" && Number.isFinite(input.countupElapsedMs) && input.countupElapsedMs >= 0
        ? Math.round(input.countupElapsedMs)
        : 0,
    completedRounds:
      typeof input.completedRounds === "number" && Number.isInteger(input.completedRounds) && input.completedRounds > 0
        ? input.completedRounds
        : 0,
  };
}

const LEGACY_VIEW_REDIRECTS: Record<string, AppState["view"]> = {
  "watch-history": "local-watch-history",
  "app-update": "about",
};

function normalizeView(input: unknown): AppState["view"] {
  if (typeof input !== "string") return "focus-dashboard";
  if (Object.prototype.hasOwnProperty.call(LEGACY_VIEW_REDIRECTS, input)) return LEGACY_VIEW_REDIRECTS[input];
  // 未知的 view（损坏的快照或未来重命名的键）回退到默认首页，避免白屏。
  if (Object.prototype.hasOwnProperty.call(VIEW_TITLES, input)) {
    return input as AppState["view"];
  }
  return "focus-dashboard";
}

function migrateToolList(input: unknown): ToolKey[] {
  const valid: ToolKey[] = ["tasks", "habits", "notes", "countdowns", "focus", "videos"];
  const list = asArray<unknown>(input, []);
  const filtered = list.filter((item): item is ToolKey =>
    typeof item === "string" && (valid as string[]).includes(item),
  );
  return filtered.length ? filtered : valid;
}

function migrateHabitFrequency(input: unknown): HabitFrequency {
  if (typeof input !== "object" || input === null) return { type: "daily" };
  const obj = input as Record<string, unknown>;
  if (obj.type === "weekly-count") {
    const target = isFiniteNumber(obj.target) && obj.target > 0 ? Math.max(1, Math.min(7, Math.round(obj.target))) : 3;
    return { type: "weekly-count", target };
  }
  if (obj.type === "interval-days") {
    const interval = isFiniteNumber(obj.interval) && obj.interval > 0 ? Math.max(1, Math.min(365, Math.round(obj.interval))) : 1;
    return { type: "interval-days", interval };
  }
  return { type: "daily" };
}

function migrateHabit(input: unknown): HabitItem | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" ? input.id : "";
  const title = typeof input.title === "string" ? input.title : "";
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : "";
  if (!id || !title || !createdAt) return null;
  return {
    id,
    title,
    createdAt,
    checkedDates: migrateDayKeys(input.checkedDates),
    frequency: migrateHabitFrequency(input.frequency),
    color: typeof input.color === "string" ? input.color : undefined,
    reminderTime: typeof input.reminderTime === "string" ? input.reminderTime : undefined,
  };
}

function migrateFocusRounds(input: unknown): FocusRounds {
  const fallback: FocusRounds = { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 };
  if (!isObject(input)) return fallback;
  const obj = input as Record<string, unknown>;
  const workRaw = isFiniteNumber(obj.workMinutes) ? obj.workMinutes : fallback.workMinutes;
  const shortRaw = isFiniteNumber(obj.shortBreakMinutes) ? obj.shortBreakMinutes : fallback.shortBreakMinutes;
  const longRaw = isFiniteNumber(obj.longBreakMinutes) ? obj.longBreakMinutes : fallback.longBreakMinutes;
  const everyRaw = isFiniteNumber(obj.longBreakEvery) ? obj.longBreakEvery : fallback.longBreakEvery;
  return {
    workMinutes: Math.max(1, Math.min(120, Math.round(workRaw))),
    shortBreakMinutes: Math.max(0, Math.min(60, Math.round(shortRaw))),
    longBreakMinutes: Math.max(0, Math.min(120, Math.round(longRaw))),
    longBreakEvery: Math.max(1, Math.min(12, Math.round(everyRaw))),
  };
}

function migrateJournal(input: unknown): JournalEntry | null {
  if (!isObject(input)) return null;
  const date = typeof input.date === "string" ? input.date : "";
  const body = typeof input.body === "string" ? input.body : "";
  const updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : "";
  if (!date || !body.trim() || !updatedAt) return null;
  return { date, body, updatedAt };
}

function migrateWrongQuestion(input: unknown): WrongQuestion | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" ? input.id : "";
  const title = typeof input.title === "string" ? input.title : "";
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : "";
  if (!id || !title || !createdAt) return null;
  const wrongCount = typeof input.wrongCount === "number" && Number.isFinite(input.wrongCount)
    ? Math.max(1, Math.round(input.wrongCount))
    : 1;
  return {
    id,
    title,
    note: typeof input.note === "string" ? input.note : undefined,
    tags: asArray<unknown>(input.tags, []).filter((tag): tag is string => typeof tag === "string"),
    wrongCount,
    createdAt,
    subjectId: typeof input.subjectId === "string" ? input.subjectId : undefined,
  };
}

function migrateReviewItem(input: unknown): ReviewItem | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" ? input.id : "";
  const title = typeof input.title === "string" ? input.title : "";
  const dueDate = typeof input.dueDate === "string" ? input.dueDate : "";
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : "";
  const sourceType = input.sourceType === "wrong-question" || input.sourceType === "word" ? input.sourceType : "custom";
  if (!id || !title || !dueDate || !createdAt) return null;
  const stage = typeof input.stage === "number" && Number.isFinite(input.stage)
    ? Math.max(0, Math.min(REVIEW_INTERVAL_DAYS.length, Math.round(input.stage)))
    : 0;
  const history = asArray<unknown>(input.history, [])
    .filter(isObject)
    .filter((entry) => typeof entry.date === "string" && typeof entry.remembered === "boolean")
    .map((entry) => ({ date: entry.date as string, remembered: entry.remembered as boolean }));
  return {
    id,
    sourceType,
    title,
    dueDate,
    stage,
    history,
    createdAt,
    sourceId: typeof input.sourceId === "string" ? input.sourceId : undefined,
    subjectId: typeof input.subjectId === "string" ? input.subjectId : undefined,
  };
}

function migrateMockExam(input: unknown): MockExam | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" ? input.id : "";
  const date = typeof input.date === "string" ? input.date : "";
  const subject = typeof input.subject === "string" ? input.subject : "";
  const paperName = typeof input.paperName === "string" ? input.paperName : "";
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : "";
  const total = typeof input.total === "number" && Number.isFinite(input.total) ? Math.max(1, Math.round(input.total)) : 0;
  if (!id || !date || !subject.trim() || !paperName || !createdAt || total <= 0) return null;
  const score = typeof input.score === "number" && Number.isFinite(input.score)
    ? Math.max(0, Math.min(total, Math.round(input.score)))
    : 0;
  return { id, date, subject, paperName, score, total, createdAt };
}

function migrateIdItem<T extends { id: string; createdAt: string }>(
  input: unknown,
  build: (obj: Record<string, unknown>) => T | null,
): T[] {
  const list = asArray<unknown>(input, []);
  return list
    .map((entry) => (isObject(entry) ? build(entry) : null))
    .filter((item): item is T => item !== null);
}

/**
 * 将 v1 持久化状态迁移到 v2。纯函数，只读取输入、返回新的状态切片。
 * 不抛出异常；无法识别的字段降级为默认值。
 */
export function migratePersistedState(
  input: unknown,
  _version: number,
): Partial<AppState> {
  const state = isObject(input) ? input : {};
  const theme = migrateTheme(state.theme);
  const density: AppState["density"] =
    state.density === "comfortable" || state.density === "compact"
      ? state.density
      : "standard";

  const inbox = migrateIdItem<InboxItem>(state.inbox, (obj) => {
    const id = typeof obj.id === "string" ? obj.id : "";
    const text = typeof obj.text === "string" ? obj.text : "";
    const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : "";
    if (!id || !text || !createdAt) return null;
    return { id, text, createdAt };
  });

  const tasks = migrateIdItem<TaskItem>(state.tasks, (obj) => {
    const id = typeof obj.id === "string" ? obj.id : "";
    const title = typeof obj.title === "string" ? obj.title : "";
    const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : "";
    if (!id || !title || !createdAt) return null;
    return {
      id,
      title,
      done: obj.done === true,
      due: typeof obj.due === "string" ? obj.due : null,
      createdAt,
      completedAt: typeof obj.completedAt === "string" ? obj.completedAt : null,
    };
  });

  const habits = asArray<unknown>(state.habits, [])
    .map(migrateHabit)
    .filter((item): item is HabitItem => item !== null);

  const notes = migrateIdItem<NoteItem>(state.notes, (obj) => {
    const id = typeof obj.id === "string" ? obj.id : "";
    const body = typeof obj.body === "string" ? obj.body : "";
    const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : "";
    if (!id || !body || !createdAt) return null;
    return { id, body, createdAt };
  });

  // Resources: migrate legacy `videos` array (no status) → resources
  const legacyVideos = asArray<unknown>(state.videos, []);
  const migratedFromVideos = legacyVideos
    .map((entry) => {
      if (!isObject(entry)) return null;
      return migrateResource({
        id: entry.id,
        bvid: entry.bvid,
        title: entry.title,
        addedAt: entry.addedAt,
        status: "saved",
      });
    })
    .filter((item): item is CourseResource => item !== null);

  const migratedResources = asArray<unknown>(state.resources, [])
    .map(migrateResource)
    .filter((item): item is CourseResource => item !== null);

  // De-duplicate by id (resources win over legacy videos if id collides)
  const resourceMap = new Map<string, CourseResource>();
  for (const res of migratedFromVideos) resourceMap.set(res.id, res);
  for (const res of migratedResources) resourceMap.set(res.id, res);
  const resources = Array.from(resourceMap.values());

  const timestampNotes = asArray<unknown>(state.timestampNotes, [])
    .map(migrateTimestampNote)
    .filter((item): item is TimestampNote => item !== null);

  const focusSessions = asArray<unknown>(state.focusSessions, [])
    .map(migrateFocusSession)
    .filter((item): item is FocusSession => item !== null);

  const activeFocus = migrateActiveFocus(state.activeFocus);
  const playbackTarget = isObject(state.activeBilibiliPlaybackTarget) ? state.activeBilibiliPlaybackTarget : null;

  return {
    theme,
    density,
    backgroundImage:
      typeof state.backgroundImage === "string" ? state.backgroundImage : null,
    view: normalizeView(state.view),
    enabledTools: migrateToolList(state.enabledTools),
    inbox,
    tasks,
    habits,
    notes,
    countdowns: migrateIdItem(state.countdowns, (obj) => {
      const id = typeof obj.id === "string" ? obj.id : "";
      const title = typeof obj.title === "string" ? obj.title : "";
      const date = typeof obj.date === "string" ? obj.date : "";
      const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : "";
      if (!id || !title || !date || !createdAt) return null;
      return { id, title, date, createdAt };
    }),
    subjects: migrateIdItem(state.subjects, (obj) => {
      const id = typeof obj.id === "string" ? obj.id : "";
      const title = typeof obj.title === "string" ? obj.title : "";
      const color = typeof obj.color === "string" ? obj.color : "#888";
      const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : "";
      if (!id || !title || !createdAt) return null;
      return { id, title, color, createdAt };
    }),
    studyUnits: migrateIdItem(state.studyUnits, (obj) => {
      const id = typeof obj.id === "string" ? obj.id : "";
      const subjectId = typeof obj.subjectId === "string" ? obj.subjectId : "";
      const title = typeof obj.title === "string" ? obj.title : "";
      const startDate = typeof obj.startDate === "string" ? obj.startDate : "";
      const endDate = typeof obj.endDate === "string" ? obj.endDate : "";
      const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : "";
      if (!id || !subjectId || !title || !startDate || !endDate || !createdAt) return null;
      return {
        id, subjectId, title, startDate, endDate,
        completedDates: migrateDayKeys(obj.completedDates),
        createdAt,
      };
    }),
    wrongQuestions: asArray<unknown>(state.wrongQuestions, [])
      .map(migrateWrongQuestion)
      .filter((item): item is WrongQuestion => item !== null),
    reviewItems: asArray<unknown>(state.reviewItems, [])
      .map(migrateReviewItem)
      .filter((item): item is ReviewItem => item !== null),
    mockExams: asArray<unknown>(state.mockExams, [])
      .map(migrateMockExam)
      .filter((item): item is MockExam => item !== null),
    kaoyanWords: migrateIdItem(state.kaoyanWords, (obj) => {
      const id = typeof obj.id === "string" ? obj.id : "";
      const word = typeof obj.word === "string" ? obj.word : "";
      const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : "";
      if (!id || !word || !createdAt) return null;
      return {
        id,
        word,
        meaning: typeof obj.meaning === "string" ? obj.meaning : "",
        createdAt,
      };
    }),
    kaoyanExamDate: typeof state.kaoyanExamDate === "string" ? state.kaoyanExamDate : null,
    focusMinutes:
      isFiniteNumber(state.focusMinutes) && state.focusMinutes > 0
        ? Math.max(1, Math.min(120, state.focusMinutes))
        : 25,
    focusSessions,
    focusGoalMinutes:
      isFiniteNumber(state.focusGoalMinutes) && state.focusGoalMinutes > 0
        ? Math.max(15, Math.min(600, state.focusGoalMinutes))
        : 120,
    focusRounds: migrateFocusRounds(state.focusRounds),
    activeFocus,
    activeBilibiliBvid: typeof state.activeBilibiliBvid === "string" ? state.activeBilibiliBvid : null,
    activeBilibiliPlaybackTarget: playbackTarget ? {
      cid: typeof playbackTarget.cid === "number" && Number.isInteger(playbackTarget.cid) && playbackTarget.cid > 0
        ? playbackTarget.cid : 0,
      seconds: typeof playbackTarget.seconds === "number" && Number.isFinite(playbackTarget.seconds) && playbackTarget.seconds >= 0
        ? playbackTarget.seconds : 0,
    } : null,
    loginAutoOfficial: state.loginAutoOfficial === true,
    activeCloudResourceId: typeof state.activeCloudResourceId === "string" ? state.activeCloudResourceId : null,
    resources,
    timestampNotes,
    journals: asArray<unknown>(state.journals, [])
      .map(migrateJournal)
      .filter((item): item is JournalEntry => item !== null),
  };
}

function requireStringArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`有效的 RIXIA 备份需要包含 ${field} 数组`);
  }
  return value;
}

/** 校验导入的备份对象。失败抛出中文错误。 */
export function validateBackup(input: unknown): BackupData {
  if (!isObject(input)) {
    throw new Error("有效的 RIXIA 备份必须是对象");
  }
  const data = isObject(input.data) ? input.data : input;
  requireStringArray(data.tasks, "tasks");
  requireStringArray(data.habits, "habits");
  requireStringArray(data.notes, "notes");
  requireStringArray(data.inbox, "inbox");
  requireStringArray(data.countdowns, "countdowns");
  const migrated = migratePersistedState(data, 3);
  return {
    formatVersion: 3,
    theme: migrated.theme ?? "porcelain",
    density: migrated.density ?? "standard",
    enabledTools: migrated.enabledTools ?? ["tasks", "habits", "notes", "countdowns", "focus", "videos"],
    inbox: migrated.inbox ?? [],
    tasks: migrated.tasks ?? [],
    habits: migrated.habits ?? [],
    notes: migrated.notes ?? [],
    countdowns: migrated.countdowns ?? [],
    subjects: migrated.subjects ?? [],
    studyUnits: migrated.studyUnits ?? [],
    wrongQuestions: migrated.wrongQuestions ?? [],
    reviewItems: migrated.reviewItems ?? [],
    mockExams: migrated.mockExams ?? [],
    kaoyanWords: migrated.kaoyanWords ?? [],
    kaoyanExamDate: typeof migrated.kaoyanExamDate === "string" ? migrated.kaoyanExamDate : null,
    focusSessions: migrated.focusSessions ?? [],
    focusMinutes:
      typeof migrated.focusMinutes === "number" && migrated.focusMinutes > 0
        ? migrated.focusMinutes
        : 25,
    focusGoalMinutes: migrated.focusGoalMinutes ?? 120,
    focusRounds: migrated.focusRounds ?? { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakEvery: 4 },
    backgroundImage:
      typeof migrated.backgroundImage === "string"
        ? enforceDataUrlBudget(migrated.backgroundImage)
        : null,
    resources: migrated.resources ?? [],
    timestampNotes: migrated.timestampNotes ?? [],
    journals: migrated.journals ?? [],
    // 旧版备份没有 companion 块（返回 null）：导入时保留设备上现有的
    // 播放器/专注数据，而不是清空它们。
    companion: sanitizeCompanionBackup(data.companion),
  };
}
