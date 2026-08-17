import {
  CalendarDays,
  LayoutGrid,
  Library,
  Plus,
  Search,
  Settings as SettingsIcon,
  Timer,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { CaptureButton } from "./CaptureButton";
import { VIEW_TITLES } from "../catalog";
import { formatDateLabel, greeting, todayKey, weekdayLabel } from "../lib/time";
import { useAppStore } from "../store/useAppStore";
import type { ViewKey } from "../types";

const MAIN_NAV: Array<{ view: ViewKey; label: string; icon: typeof CalendarDays }> = [
  { view: "today", label: "今天", icon: CalendarDays },
  { view: "plan", label: "计划", icon: LayoutGrid },
  { view: "focus", label: "专注", icon: Timer },
  { view: "library", label: "资料库", icon: Library },
  { view: "settings", label: "设置", icon: SettingsIcon },
];

const TAB_NAV = MAIN_NAV;

function SideItem({ view, label, Icon }: { view: ViewKey; label: string; Icon: typeof CalendarDays }) {
  const active = useAppStore((state) => state.view === view);
  const setView = useAppStore((state) => state.setView);
  return (
    <button
      className={active ? "side-item active" : "side-item"}
      onClick={() => setView(view)}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
      <span>{label}</span>
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  const density = useAppStore((state) => state.density);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const now = new Date();

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="app-shell">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
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
        <button
          type="button"
          className="side-capture"
          onClick={() => setView("inbox")}
          aria-label="打开收集箱"
          title="收集箱"
        >
          <Plus size={16} strokeWidth={2.2} />
          <span>快速收集</span>
        </button>
        <div className="side-foot">
          <p>RIXIA · 本地优先</p>
          <p>数据仅保存在本机</p>
        </div>
      </aside>

      <div className="shell-main">
        <header className="page-head">
          <div className="page-head-row">
            <div>
              <p className="eyebrow">{formatDateLabel(todayKey(now))} · {weekdayLabel(now)}</p>
              <h1>{VIEW_TITLES[view]}</h1>
              <p className="muted page-sub">{greeting(now)}，今天也要保持节奏</p>
            </div>
            <button
              className="icon-button palette-trigger"
              onClick={() => setPaletteOpen(true)}
              aria-label="打开命令面板"
              title="命令面板 (Ctrl+K)"
            >
              <Search size={17} />
            </button>
          </div>
        </header>
        <main className="view-stage" key={view}>
          {children}
        </main>
      </div>

      <CaptureButton />

      <nav className="tabbar" aria-label="底部导航">
        {TAB_NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              className={active ? "tab active" : "tab"}
              onClick={() => setView(item.view)}
              aria-current={active ? "page" : undefined}
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
