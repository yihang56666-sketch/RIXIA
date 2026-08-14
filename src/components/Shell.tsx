import { BookOpen, CalendarDays, Inbox, LayoutGrid, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { VIEW_TITLES } from "../catalog";
import { greeting, weekdayLabel } from "../lib/time";
import { useAppStore } from "../store/useAppStore";
import type { ViewKey } from "../types";

const NAV: Array<{ view: ViewKey; label: string; icon: typeof Inbox }> = [
  { view: "today", label: "今天", icon: CalendarDays },
  { view: "inbox", label: "收集箱", icon: Inbox },
  { view: "tools", label: "工具", icon: LayoutGrid },
  { view: "kaoyan", label: "考研", icon: BookOpen },
  { view: "settings", label: "设置", icon: UserRound },
];

export function Shell({ children }: { children: ReactNode }) {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  const now = new Date();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">RIXIA · 个人节奏</p>
          <h1>{VIEW_TITLES[view]}</h1>
          <p className="muted">
            {greeting(now)} · {weekdayLabel(now)}
          </p>
        </div>
      </header>
      {children}
      <nav className="nav">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              className={view === item.view ? "active" : ""}
              onClick={() => setView(item.view)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
