import type { ViewKey } from "../../types";

export type TourTaskId = "watch" | "focus" | "review" | "organize" | "backup";

export interface TourStep {
  view: ViewKey;
  label: string;
  title: string;
  description: string;
  target?: string;
}

export const TOUR_TASKS: Record<TourTaskId, TourStep[]> = {
  watch: [
    {
      view: "focus-dashboard",
      label: "看课",
      title: "从首页找到入口",
      description: "点搜索或继续学习，进入视频。",
      target: "home-search",
    },
    {
      view: "search",
      label: "搜索",
      title: "输入要学的内容",
      description: "关键词、BV 号或链接都可以，回车搜索。",
      target: "search-input",
    },
    {
      view: "bilibili-player",
      label: "播放器",
      title: "在这里看课",
      description: "点播放器进入全屏或用弹幕控制。",
      target: "player-fullscreen",
    },
    {
      view: "bilibili-player",
      label: "弹幕",
      title: "弹幕随时可开关",
      description: "点常驻弹幕按钮控制显示。",
      target: "player-danmaku-toggle",
    },
  ],
  focus: [
    {
      view: "focus-dashboard",
      label: "专注",
      title: "写下目标",
      description: "先填一个明确目标。",
      target: "focus-goal",
    },
    {
      view: "focus-dashboard",
      label: "专注",
      title: "选择时长",
      description: "25、45、60 分钟或自定义。",
      target: "focus-duration",
    },
    {
      view: "focus-dashboard",
      label: "专注",
      title: "开始一次专注",
      description: "点开始专注后计时会自动开始。",
      target: "focus-start",
    },
  ],
  review: [
    {
      view: "kaoyan",
      label: "复习",
      title: "进入考研计划",
      description: "这里管理科目、错题和复习队列。",
      target: "kaoyan-review",
    },
    {
      view: "kaoyan",
      label: "复习",
      title: "完成今天的复习",
      description: "点复习项标记记得或不记得。",
      target: "review-queue",
    },
  ],
  organize: [
    {
      view: "notes",
      label: "整理",
      title: "添加一条笔记",
      description: "输入想法，点保存。",
      target: "notes-input",
    },
    {
      view: "notes",
      label: "整理",
      title: "保存后可回看",
      description: "笔记会按时间排列。",
      target: "notes-list",
    },
  ],
  backup: [
    {
      view: "settings",
      label: "数据",
      title: "进入我的页面",
      description: "这里管理账号和备份。",
      target: "settings-nav",
    },
    {
      view: "preferences",
      label: "备份",
      title: "导出或导入数据",
      description: "导出文件保存到本机。",
      target: "backup-export",
    },
  ],
};
