import type {
  ActiveFocus,
  AppState,
  BackupData,
  CourseResource,
  FocusSession,
  HabitItem,
  InboxItem,
  NoteItem,
  ResourceStatus,
  TaskItem,
  ThemeName,
  TimestampNote,
  ToolKey,
} from "../types";
import { THEME_MIGRATION } from "../catalog";

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

function migrateTheme(theme: unknown): ThemeName {
  if (typeof theme === "string") {
    if (NEW_THEME_KEYS.has(theme as ThemeName)) return theme as ThemeName;
    if (THEME_MIGRATION[theme]) return THEME_MIGRATION[theme];
  }
  return "porcelain";
}

function migrateResource(input: unknown): CourseResource | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" ? input.id : "";
  const bvid = typeof input.bvid === "string" ? input.bvid : "";
  const title = typeof input.title === "string" ? input.title : bvid || "未命名";
  if (!id || !bvid) return null;
  const addedAt = typeof input.addedAt === "string" ? input.addedAt : new Date().toISOString();
  const statusRaw = input.status;
  const status: ResourceStatus =
    statusRaw === "in-progress" || statusRaw === "completed" ? statusRaw : "saved";
  const lastOpenedAt = typeof input.lastOpenedAt === "string" ? input.lastOpenedAt : undefined;
  const progressSeconds =
    typeof input.progressSeconds === "number" && input.progressSeconds >= 0
      ? input.progressSeconds
      : undefined;
  const durationSeconds =
    typeof input.durationSeconds === "number" && input.durationSeconds >= 0
      ? input.durationSeconds
      : undefined;
  const episodeId = typeof input.episodeId === "string" ? input.episodeId : undefined;
  return {
    id, bvid, title, status, addedAt,
    lastOpenedAt, progressSeconds, durationSeconds, episodeId,
  };
}

function migrateTimestampNote(input: unknown): TimestampNote | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" ? input.id : "";
  const resourceId = typeof input.resourceId === "string" ? input.resourceId : "";
  const seconds = typeof input.seconds === "number" && input.seconds >= 0 ? input.seconds : -1;
  const body = typeof input.body === "string" ? input.body : "";
  const createdAt = typeof input.createdAt === "string" ? input.createdAt : new Date().toISOString();
  if (!id || !resourceId || seconds < 0 || !body.trim()) return null;
  return { id, resourceId, seconds, body, createdAt };
}

function migrateFocusSession(input: unknown): FocusSession | null {
  if (!isObject(input)) return null;
  const id = typeof input.id === "string" ? input.id : "";
  const date = typeof input.date === "string" ? input.date : "";
  const minutes = typeof input.minutes === "number" && input.minutes > 0 ? input.minutes : 0;
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
  return { startedAt, mode, resourceId, episodeId };
}

function migrateToolList(input: unknown): ToolKey[] {
  const valid: ToolKey[] = ["tasks", "habits", "notes", "countdowns", "focus", "videos"];
  const list = asArray<unknown>(input, []);
  const filtered = list.filter((item): item is ToolKey =>
    typeof item === "string" && (valid as string[]).includes(item),
  );
  return filtered.length ? filtered : valid;
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
): Partial<AppState> & { version: 2 } {
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

  const habits = migrateIdItem<HabitItem>(state.habits, (obj) => {
    const id = typeof obj.id === "string" ? obj.id : "";
    const title = typeof obj.title === "string" ? obj.title : "";
    const createdAt = typeof obj.createdAt === "string" ? obj.createdAt : "";
    if (!id || !title || !createdAt) return null;
    return {
      id,
      title,
      createdAt,
      checkedDates: asArray<string>(obj.checkedDates, []),
    };
  });

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

  return {
    version: 2,
    theme,
    density,
    backgroundImage:
      typeof state.backgroundImage === "string" ? state.backgroundImage : null,
    view: typeof state.view === "string" ? (state.view as AppState["view"]) : "today",
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
        completedDates: asArray<string>(obj.completedDates, []),
        createdAt,
      };
    }),
    focusMinutes:
      typeof state.focusMinutes === "number" && state.focusMinutes > 0
        ? state.focusMinutes
        : 25,
    focusSessions,
    focusGoalMinutes:
      typeof state.focusGoalMinutes === "number" && state.focusGoalMinutes > 0
        ? state.focusGoalMinutes
        : 120,
    activeFocus,
    resources,
    timestampNotes,
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
  const migrated = migratePersistedState(data, 2);
  return {
    formatVersion: 2,
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
    focusSessions: migrated.focusSessions ?? [],
    focusGoalMinutes: migrated.focusGoalMinutes ?? 120,
    resources: migrated.resources ?? [],
    timestampNotes: migrated.timestampNotes ?? [],
  };
}
