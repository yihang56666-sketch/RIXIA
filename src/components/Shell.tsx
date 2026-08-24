import {
  Command,
  Home,
  Search,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";
import { CaptureButton } from "./CaptureButton";
import { hasOpenOverlays } from "../lib/overlayStack";
import { useAppStore } from "../store/useAppStore";
import type { ViewKey } from "../types";

const PRIMARY_NAV: Array<{ view: ViewKey; label: string; icon: typeof Home }> = [
  { view: "focus-dashboard", label: "首页", icon: Home },
  { view: "search", label: "搜索", icon: Search },
  { view: "settings", label: "我的", icon: UserRound },
];

/** BEID 域页面：全出血、页面自己管理滚动与留白。 */
const BEID_VIEWS = new Set<ViewKey>([
  "focus-dashboard",
  "search",
  "bilibili-player",
  "favorites",
  "favorite-videos",
  "followed",
  "local-watch-history",
  "subscribed-collections",
  "creator-profile",
  "collection-detail",
  "login",
  "about",
  "cache-management",
  "problem-diagnostics",
  "android-permissions",
  "windows-system-capabilities",
  "home-feed",
  "learning-list",
  "video-notes",
  "focus-statistics",
  "personalization",
  "settings",
  "kaoyan",
  "today",
  "habits",
  "library",
  "plan",
  "inbox",
  "notes",
  "tasks",
  "focus",
  "videos",
  "countdowns",
  "tools",
  "preferences",
]);

function NavigationItem({ view, label, Icon }: { view: ViewKey; label: string; Icon: typeof Home }) {
  const active = useAppStore((state) => state.view === view);
  const setView = useAppStore((state) => state.setView);
  return (
    <button
      className={active ? "focubili-nav-item active" : "focubili-nav-item"}
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
  const density = useAppStore((state) => state.density);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        // 已有弹窗/对话框打开时不叠加命令面板，避免一次 Escape 关掉全部。
        if (hasOpenOverlays()) return;
        event.preventDefault();
        setPaletteOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="focubili-shell" data-view={view}>
      <aside className="focubili-rail">
        <div className="focubili-brand" aria-label="BEID">
          <img className="focubili-mark" src="/beid-icon.png" alt="" />
          <span>BEID</span>
        </div>
        <nav className="focubili-primary-nav" aria-label="主导航">
          {PRIMARY_NAV.map((item) => (
            <NavigationItem key={item.view} view={item.view} label={item.label} Icon={item.icon} />
          ))}
        </nav>
        <button
          className="palette-trigger icon-button"
          onClick={() => setPaletteOpen(true)}
          aria-label="打开命令面板"
          title="打开命令面板"
        >
          <Command size={17} />
        </button>
      </aside>
      <div className="focubili-main">
        <main
          className={BEID_VIEWS.has(view) ? "focubili-stage full" : "focubili-stage padded"}
        >
          {children}
        </main>
      </div>
      <CaptureButton />
      <nav className="focubili-bottom-nav" aria-label="主导航">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.view;
          return (
            <button
              key={item.view}
              className={active ? "focubili-bottom-item active" : "focubili-bottom-item"}
              onClick={() => useAppStore.getState().setView(item.view)}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
