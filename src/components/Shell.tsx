import {
  BookOpen,
  CalendarDays,
  Inbox,
  LayoutGrid,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { TOOLS, TOOL_ICONS, VIEW_TITLES } from "../catalog";
import { formatDateLabel, greeting, todayKey, weekdayLabel } from "../lib/time";
import { useAppStore } from "../store/useAppStore";
import type { ViewKey } from "../types";

const MAIN_NAV: Array<{ view: ViewKey; label: string; icon: typeof Inbox }> = [
  { view: "today", label: "今天", icon: CalendarDays },
  { view: "inbox", label: "收集箱", icon: Inbox },
  { view: "kaoyan", label: "考研", icon: BookOpen },
  { view: "settings", label: "设置", icon: UserRound },
];

const TAB_NAV: Array<{ view: ViewKey; label: string; icon: typeof Inbox }> = [
  { view: "today", label: "今天", icon: CalendarDays },
  { view: "inbox", label: "收集箱", icon: Inbox },
  { view: "tools", label: "工具", icon: LayoutGrid },
  { view: "kaoyan", label: "考研", icon: BookOpen },
  { view: "settings", label: "设置", icon: UserRound },
];

function SideItem({ view, label, Icon }: { view: ViewKey; label: string; Icon: typeof Inbox }) {
  const active = useAppStore((state) => state.view === view);
  const setView = useAppStore((state) => state.setView);
  return (
    <button className={active ? "side-item active" : "side-item"} onClick={() => setView(view)}>
      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
      <span>{label}</span>
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const view = useAppStore((state) => state.view);
  const enabledTools = useAppStore((state) => state.enabledTools);
  const now = new Date();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>RIXIA</strong>
            <small>个人节奏</small>
          </div>
        </div>
        <nav className="side-nav" aria-label="主导航">
          {MAIN_NAV.map((item) => (
            <SideItem key={item.view} view={item.view} label={item.label} Icon={item.icon} />
          ))}
        </nav>
        {enabledTools.length > 0 && (
          <>
            <p className="side-section-title">工具</p>
            <nav className="side-nav" aria-label="工具导航">
              {TOOLS.filter((tool) => enabledTools.includes(tool.key)).map((tool) => (
                <SideItem key={tool.key} view={tool.key} label={tool.title} Icon={TOOL_ICONS[tool.key]} />
              ))}
            </nav>
          </>
        )}
        <div className="side-foot">
          <p>RIXIA · 本地优先</p>
          <p>数据仅保存在本机</p>
        </div>
      </aside>

      <div className="shell-main">
        <header className="page-head">
          <p className="eyebrow">{formatDateLabel(todayKey(now))} · {weekdayLabel(now)}</p>
          <h1>{VIEW_TITLES[view]}</h1>
          <p className="muted page-sub">{greeting(now)}，今天也要保持节奏</p>
        </header>
        <main className="view-stage" key={view}>
          {children}
        </main>
      </div>

      <nav className="tabbar" aria-label="底部导航">
        {TAB_NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              className={active ? "tab active" : "tab"}
              onClick={() => useAppStore.getState().setView(item.view)}
            >
              <span className="tab-icon">
                <Icon size={21} strokeWidth={active ? 2.2 : 1.7} />
              </span>
              <span className="tab-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
