import { Flame, Hourglass, ListTodo, MonitorPlay, StickyNote, Timer } from "lucide-react";
import type { Density, ThemeName, ToolKey, ViewKey } from "./types";

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
  { key: "tasks", title: "任务", hint: "安排今天要做的事", reason: "把想法变成清晰的下一步" },
  { key: "habits", title: "习惯", hint: "记录每天的小坚持", reason: "用连续记录建立节奏" },
  { key: "notes", title: "笔记", hint: "随手记下灵感", reason: "保持轻量、可回看的记录" },
  { key: "countdowns", title: "倒计时", hint: "记住重要的日子", reason: "让目标日期始终清晰可见" },
  { key: "focus", title: "专注", hint: "用计时器专心工作", reason: "减少切换，完成一个专注回合" },
  { key: "videos", title: "看课", hint: "收藏并观看哔哩哔哩视频", reason: "网课与教程，就在工作台里" },
];

export const VIEW_TITLES: Record<ViewKey, string> = {
  today: "今天",
  plan: "计划",
  library: "资料库",
  focus: "专注",
  settings: "设置",
  search: "搜索 B 站",
  "bilibili-player": "播放器",
  favorites: "我的收藏",
  followed: "关注 UP 主",
  "watch-history": "观看历史",
  login: "登录 B 站",
  inbox: "收集箱",
  tools: "工具",
  tasks: "任务",
  habits: "习惯",
  notes: "笔记",
  countdowns: "倒计时",
  videos: "看课",
  kaoyan: "考研",
};

export type SkinMaterial = "solid" | "translucent" | "high-contrast";

export interface ThemeOption {
  key: ThemeName;
  name: string;
  dark: boolean;
  /** 预览色板：背景、表面、强调色 */
  swatch: [string, string, string];
  material: SkinMaterial;
  /** 一句皮肤氛围描述 */
  mood: string;
}

export const THEMES: ThemeOption[] = [
  { key: "porcelain", name: "瓷白", dark: false, swatch: ["#f6f4f0", "#ffffff", "#0a84ff"], material: "solid", mood: "清透中性，彩色强调" },
  { key: "graphite", name: "石墨", dark: true, swatch: ["#131417", "#1d1f23", "#8fb8d8"], material: "solid", mood: "近黑中性，低反射" },
  { key: "sage", name: "灰绿", dark: false, swatch: ["#eef1ea", "#fbfdf8", "#3f8f5f"], material: "solid", mood: "灰绿与暖白，长时学习" },
  { key: "aurora", name: "极光", dark: false, swatch: ["#eef5f4", "#ffffff", "#2bb6a5"], material: "translucent", mood: "冷白、青绿与珊瑚" },
  { key: "rosewood", name: "玫木", dark: true, swatch: ["#1c1517", "#2a2022", "#d97773"], material: "solid", mood: "柔和玫红与深灰" },
  { key: "mono", name: "单色", dark: false, swatch: ["#ffffff", "#f3f3f3", "#111111"], material: "high-contrast", mood: "高对比黑白，最少装饰" },
  { key: "ocean", name: "深海", dark: true, swatch: ["#0d1420", "#16202e", "#38bdf8"], material: "solid", mood: "海水青、深靛与中性白" },
  { key: "ember", name: "余烬", dark: true, swatch: ["#161513", "#22201c", "#e0a040"], material: "solid", mood: "冷灰表面配琥珀强调" },
  { key: "lavender", name: "薰衣草", dark: false, swatch: ["#f4f3f8", "#ffffff", "#7c6cd1"], material: "solid", mood: "中性灰表面，少量薰衣草" },
  { key: "ink", name: "墨色", dark: true, swatch: ["#0f0f12", "#1a1a1f", "#e85d4a"], material: "high-contrast", mood: "墨黑纸白朱红点缀" },
  { key: "system", name: "跟随系统", dark: false, swatch: ["#e9e9ec", "#ffffff", "#0a84ff"], material: "solid", mood: "跟随系统深浅与强调色" },
];

/** v1 → v2 主题键映射 */
export const THEME_MIGRATION: Record<string, ThemeName> = {
  paper: "porcelain",
  mist: "aurora",
  matcha: "sage",
  sunset: "rosewood",
  ink: "ink",
  graphite: "graphite",
  dusk: "lavender",
  deep: "ocean",
};

export const DENSITIES: Array<{ key: Density; name: string; hint: string }> = [
  { key: "comfortable", name: "舒展", hint: "更大的间距与控件" },
  { key: "standard", name: "标准", hint: "默认平衡" },
  { key: "compact", name: "紧凑", hint: "信息密度更高" },
];
