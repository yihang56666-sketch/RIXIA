import type { ToolKey, ViewKey } from "./types";

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
  kaoyan: "考研",
  settings: "设置",
};
