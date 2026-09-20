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
  | "preferences"
  | "personalization"
  | "search"
  | "bilibili-player"
  | "cloud-player"
  | "favorites"
  | "favorite-videos"
  | "followed"
  | "local-watch-history"
  | "subscribed-collections"
  | "creator-profile"
  | "collection-detail"
  | "login"
  | "about"
  | "cache-management"
  | "problem-diagnostics"
  | "android-permissions"
  | "windows-system-capabilities"
  | "home-feed"
  | "learning-list"
  | "video-notes"
  | "focus-statistics"
  | "focus-dashboard"
  // Legacy deep-link targets used by persisted state are normalized during migration.
  | "inbox"
  | "tools"
  | "tasks"
  | "habits"
  | "notes"
  | "journal"
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

/** 考研每日计划项：每天可勾选的固定清单（如"背 50 词""一套数学卷"）。 */
export interface KaoyanDailyItem {
  id: string;
  title: string;
  createdAt: string;
}

/** 某一天的每日计划完成情况 + 进度备注，方便下一次接着学。 */
export interface KaoyanDailyEntry {
  /** 当天勾选完成的项目 id。 */
  done: string[];
  /** 当天进度备注（学到哪、下次从哪继续）。 */
  note: string;
}

/** 错题本条目：按错误原因打标签，录入后自动进入艾宾浩斯复习队列。 */
export interface WrongQuestion {
  id: string;
  subjectId?: string;
  title: string;
  note?: string;
  tags: string[];
  wrongCount: number;
  createdAt: string;
}

/** 艾宾浩斯复习队列条目：按 1/2/4/7/15/30 天周期安排重看。 */
export interface ReviewItem {
  id: string;
  sourceType: "wrong-question" | "custom" | "word";
  sourceId?: string;
  subjectId?: string;
  title: string;
  dueDate: string;
  stage: number;
  history: { date: string; remembered: boolean }[];
  createdAt: string;
}

/** 考研英语词汇本条目：录入后按艾宾浩斯周期进入复习队列。 */
export interface KaoyanWord {
  id: string;
  word: string;
  meaning: string;
  createdAt: string;
}

/** 模考成绩记录。 */
export interface MockExam {
  id: string;
  date: string;
  subject: string;
  paperName: string;
  score: number;
  total: number;
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
  /** External HTTPS resource (夸克/百度网盘/直链). */
  source?: "bilibili" | "quark" | "baidu" | "direct";
  url?: string;
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
  /** 回合阶段（倒计时模式）。 */
  phase?: "focus" | "short-break" | "long-break";
  /** 计时器是否在运行（跨视图/重启恢复用）。 */
  running?: boolean;
  /** 倒计时运行中的绝对结束时间戳（ms）。锚定计时，后台节流不产生漂移。 */
  endsAtMs?: number | null;
  /** 暂停时的剩余秒数。 */
  remainingSeconds?: number;
  /** 正计时当前段开始时间戳（ms）。 */
  countupStartedAtMs?: number | null;
  /** 正计时此前累计毫秒（暂停时定格）。 */
  countupElapsedMs?: number;
  completedRounds?: number;
}

/** 最近一次正在看的视频快照：驱动全局"回到视频"悬浮按钮（跨重启保留）。 */
export interface NowPlayingSnapshot {
  bvid: string;
  cid: number;
  title: string;
  ownerName?: string;
  thumbnailUrl?: string;
  /** 快照时刻的播放位置（秒）。 */
  seconds: number;
  durationSeconds?: number;
  updatedAt: string;
}

export interface AppState {
  theme: ThemeName;
  density: Density;
  backgroundImage: string | null;
  view: ViewKey;
  nowPlaying: NowPlayingSnapshot | null;  enabledTools: ToolKey[];
  inbox: InboxItem[];
  tasks: TaskItem[];
  habits: HabitItem[];
  notes: NoteItem[];
  countdowns: CountdownItem[];
  subjects: StudySubject[];
  studyUnits: StudyUnit[];
  kaoyanDailyPlan: { items: KaoyanDailyItem[]; history: Record<string, KaoyanDailyEntry> };
  wrongQuestions: WrongQuestion[];
  reviewItems: ReviewItem[];
  mockExams: MockExam[];
  kaoyanWords: KaoyanWord[];
  kaoyanExamDate: string | null;
  focusMinutes: number;
  focusSessions: FocusSession[];
  focusGoalMinutes: number;
  focusRounds: FocusRounds;
  activeFocus: ActiveFocus | null;
  activeBilibiliBvid: string | null;
  activeCloudResourceId: string | null;
  activeBilibiliPlaybackTarget: { cid: number; seconds: number } | null;
  activeBilibiliCreator: { mid: number; name: string; avatarUrl: string; sign: string; officialDescription: string } | null;
  activeBilibiliCollection: {
    id: number; title: string; coverUrl: string; description: string; ownerMid: number; ownerName: string; ownerAvatarUrl: string; videoCount: number; viewCount: number;
  } | null;
  activeBilibiliFavoriteFolder: { mediaId: number; title: string; coverUrl: string; mediaCount: number; isAvailable: boolean } | null;
  loginAutoOfficial: boolean;
  pendingBilibiliSearch: string | null;
  focusedTaskId: string | null;
  storageWriteFailed: boolean;
  resources: CourseResource[];
  timestampNotes: TimestampNote[];
  journals: JournalEntry[];
}

/** 备份的兄弟存储块：主 store 之外的 B 站播放器与专注持久化数据。 */
export interface CompanionBackupData {
  focusActiveSession: unknown;
  focusHistory: unknown[];
  videoNotes: unknown[];
  watchHistory: unknown[];
  learningList: unknown[];
  localWatchHistory: unknown[];
  /** 分P续播进度（键 = focubili.playback-progress.v1:<bvid>:<cid>）。旧版备份无此字段（null）：导入时保留设备现有数据。 */
  playbackProgress: Record<string, string> | null;
  /** 搜索历史（单键 JSON 数组）。旧版备份无此字段（null）：导入时保留设备现有数据。 */
  searchHistory: string[] | null;
  /** 弹幕偏好（字号/屏蔽词等）。旧版备份无此字段（null）：导入时保留设备现有数据。 */
  danmakuPreferences: unknown;
  /** 播放偏好（双击行为/进度条皮肤/清晰度等）。旧版备份无此字段（null）：导入时保留设备现有数据。 */
  playbackPreferences: unknown;
  /** 专注服务独立持久化的会话记录（最多 1000 条）。旧版备份无此字段（null）：导入时保留设备现有数据。 */
  focusSessions: unknown[] | null;
  /** B 站登录 Cookie（SESSDATA 等）。旧版备份无此字段（null）：导入时保留设备现有登录态。 */
  bilibiliCookie: string | null;
  /** B 站账号展示信息（用户名/头像）。旧版备份无此字段（null）：导入时保留设备现有数据。 */
  bilibiliAuth: unknown;
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
  kaoyanDailyPlan: { items: KaoyanDailyItem[]; history: Record<string, KaoyanDailyEntry> };
  wrongQuestions: WrongQuestion[];
  reviewItems: ReviewItem[];
  mockExams: MockExam[];
  kaoyanWords: KaoyanWord[];
  kaoyanExamDate: string | null;
  focusSessions: FocusSession[];
  focusMinutes: number;
  focusGoalMinutes: number;
  focusRounds: FocusRounds;
  backgroundImage?: string | null;
  resources: CourseResource[];
  timestampNotes: TimestampNote[];
  journals: JournalEntry[];
  companion?: CompanionBackupData | null;
}
