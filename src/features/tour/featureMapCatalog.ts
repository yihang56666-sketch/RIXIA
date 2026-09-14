import {
  BookOpen,
  CalendarDays,
  Flame,
  Hourglass,
  Inbox,
  ListTodo,
  MonitorPlay,
  Search,
  Settings,
  StickyNote,
  Timer,
} from "lucide-react";
import type { ViewKey } from "../../types";

export type FeatureMapCategoryId = "watch" | "focus" | "review" | "organize" | "system";

export interface FeatureMapEntry {
  id: string;
  title: string;
  purpose: string;
  how: string;
  route: ViewKey;
  icon: typeof Search;
  tourTaskId?: string;
}

export interface FeatureMapCategory {
  id: FeatureMapCategoryId;
  title: string;
  purpose: string;
  items: FeatureMapEntry[];
}

export const FEATURE_MAP_CATEGORIES: FeatureMapCategory[] = [
  {
    id: "watch",
    title: "看课",
    purpose: "找到视频、继续学习、边看边记。",
    items: [
      {
        id: "watch-search",
        title: "搜索视频",
        purpose: "按关键词、BV 号或链接找课。",
        how: "在搜索框输入内容，回车后点封面进入播放器。",
        route: "search",
        icon: Search,
        tourTaskId: "watch",
      },
      {
        id: "watch-library",
        title: "资料库",
        purpose: "集中管理继续学习和已保存内容。",
        how: "从资料库点封面回到上次的视频位置。",
        route: "library",
        icon: MonitorPlay,
      },
      {
        id: "watch-learning-list",
        title: "学习清单",
        purpose: "跟踪每一节课的完成状态。",
        how: "在清单里打开视频或标记已完成。",
        route: "learning-list",
        icon: BookOpen,
      },
      {
        id: "watch-video-notes",
        title: "时间点笔记",
        purpose: "把疑问记在视频的具体时间点。",
        how: "播放页添加笔记，资料库随时回看。",
        route: "video-notes",
        icon: StickyNote,
      },
    ],
  },
  {
    id: "focus",
    title: "专注",
    purpose: "把一段时间留给明确目标。",
    items: [
      {
        id: "focus-start",
        title: "开始专注",
        purpose: "写下目标和时长，开始一次专注。",
        how: "首页选择目标、时长，点开始专注。",
        route: "focus-dashboard",
        icon: Timer,
        tourTaskId: "focus",
      },
      {
        id: "focus-statistics",
        title: "专注数据",
        purpose: "回看专注时长和完成节奏。",
        how: "从首页打开专注数据。",
        route: "focus-statistics",
        icon: Timer,
      },
    ],
  },
  {
    id: "review",
    title: "复习",
    purpose: "把错题、任务和考试倒计时收在一起。",
    items: [
      {
        id: "review-kaoyan",
        title: "考研计划",
        purpose: "管理科目、错题、复习队列和模考。",
        how: "进入考研页，添加或完成复习项。",
        route: "kaoyan",
        icon: BookOpen,
        tourTaskId: "review",
      },
      {
        id: "review-tasks",
        title: "任务",
        purpose: "把要做的事排成明确一步。",
        how: "快速添加任务，完成后勾选。",
        route: "tasks",
        icon: ListTodo,
      },
      {
        id: "review-countdowns",
        title: "倒计时",
        purpose: "让重要日期一直可见。",
        how: "添加标题和日期，首页自动提醒。",
        route: "countdowns",
        icon: Hourglass,
      },
    ],
  },
  {
    id: "organize",
    title: "整理",
    purpose: "留住灵感、日记和每日坚持。",
    items: [
      {
        id: "organize-notes",
        title: "笔记",
        purpose: "随手记下想法和资料。",
        how: "输入内容后保存，随时搜索回看。",
        route: "notes",
        icon: StickyNote,
        tourTaskId: "organize",
      },
      {
        id: "organize-inbox",
        title: "收集箱",
        purpose: "先把想法放进来，稍后再整理。",
        how: "记录后一键转成今天的任务。",
        route: "inbox",
        icon: Inbox,
      },
      {
        id: "organize-journal",
        title: "日记",
        purpose: "按天记录学习状态和复盘。",
        how: "选择日期，写完自动保存。",
        route: "journal",
        icon: CalendarDays,
      },
      {
        id: "organize-habits",
        title: "习惯",
        purpose: "每天打卡，建立稳定节奏。",
        how: "创建习惯，今天完成后点打卡。",
        route: "habits",
        icon: Flame,
      },
    ],
  },
  {
    id: "system",
    title: "数据与系统",
    purpose: "备份、诊断和维护应用。",
    items: [
      {
        id: "system-profile",
        title: "我的",
        purpose: "登录账号、设置主题和备份数据。",
        how: "进入我的页面，选择对应操作。",
        route: "settings",
        icon: Settings,
        tourTaskId: "backup",
      },
      {
        id: "system-about",
        title: "关于",
        purpose: "查看版本、更新和系统信息。",
        how: "从我的页面进入关于。",
        route: "about",
        icon: Settings,
      },
    ],
  },
];
