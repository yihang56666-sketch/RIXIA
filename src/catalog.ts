import { Flame, Hourglass, ListTodo, MonitorPlay, StickyNote, Timer } from "lucide-react";
import type { ThemeName, ToolKey, ViewKey } from "./types";

export const TOOL_ICONS = {
  tasks: ListTodo,
  habits: Flame,
  notes: StickyNote,
  countdowns: Hourglass,
  focus: Timer,
  videos: MonitorPlay,
} as const;

export const TOOLS: Array<{
  key: ToolKey;
  title: string;
  hint: string;
  reason: string;
}> = [
  {
    key: "tasks",
    title: "任务",
    hint: "安排今天要做的事",
    reason: "把想法变成清晰的下一步",
  },
  {
    key: "habits",
    title: "习惯",
    hint: "记录每天的小坚持",
    reason: "用连续记录建立节奏",
  },
  {
    key: "notes",
    title: "笔记",
    hint: "随手记下灵感",
    reason: "保持轻量、可回看的记录",
  },
  {
    key: "countdowns",
    title: "倒计时",
    hint: "记住重要的日子",
    reason: "让目标日期始终清晰可见",
  },
  {
    key: "focus",
    title: "专注",
    hint: "用计时器专心工作",
    reason: "减少切换，完成一个专注回合",
  },
  {
    key: "videos",
    title: "看课",
    hint: "收藏并观看哔哩哔哩视频",
    reason: "网课与教程，就在工作台里",
  },
];

export const VIEW_TITLES: Record<ViewKey, string> = {
  today: "今天",
  inbox: "收集箱",
  tools: "工具",
  tasks: "任务",
  habits: "习惯",
  notes: "笔记",
  countdowns: "倒计时",
  focus: "专注",
  videos: "看课",
  kaoyan: "考研",
  settings: "设置",
};

export interface ThemeOption {
  key: ThemeName;
  name: string;
  dark: boolean;
  /** 预览色板：背景、卡片、强调色 */
  swatch: [string, string, string];
}

export const THEMES: ThemeOption[] = [
  { key: "paper", name: "纸张", dark: false, swatch: ["#f4efe6", "#fffdf8", "#d96b34"] },
  { key: "mist", name: "雾蓝", dark: false, swatch: ["#eef2f7", "#ffffff", "#3b82f6"] },
  { key: "matcha", name: "抹茶", dark: false, swatch: ["#eef2ea", "#fbfdf9", "#3f8f5f"] },
  { key: "sunset", name: "落霞", dark: false, swatch: ["#f9eef2", "#fffafc", "#e0567d"] },
  { key: "ink", name: "墨色", dark: true, swatch: ["#161310", "#241f19", "#e3a066"] },
  { key: "graphite", name: "石墨", dark: true, swatch: ["#141517", "#1f2124", "#8fb8d8"] },
  { key: "dusk", name: "暮紫", dark: true, swatch: ["#171423", "#221e30", "#a78bfa"] },
  { key: "deep", name: "深海", dark: true, swatch: ["#0d1420", "#16202e", "#38bdf8"] },
];
