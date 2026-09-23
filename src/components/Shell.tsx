import {
  Command,
  Home,
  MonitorPlay,
  Search,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useRef } from "react";
import { CommandPalette } from "./CommandPalette";
import { CaptureButton } from "./CaptureButton";
import { hasOpenOverlays } from "../lib/overlayStack";
import { useAppStore } from "../store/useAppStore";
import type { ViewKey } from "../types";
import { TOUR_PALETTE_OPEN_EVENT } from "../features/tour/FeatureTour";

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
  "cloud-player",
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
  "journal",
  "tasks",
  "focus",
  "videos",
  "countdowns",
  "tools",
  "preferences",
]);

// 桌面小插件快捷动作的目标视图
const WIDGET_VIEW_BY_ACTION: Partial<Record<string, ViewKey>> = {
  "open-app": "focus-dashboard",
  focus: "focus",
  search: "search",
  "focus-statistics": "focus-statistics",
};

function NavigationItem({ view, label, Icon }: { view: ViewKey; label: string; Icon: typeof Home }) {
  const active = useAppStore((state) => state.view === view);
  const setView = useAppStore((state) => state.setView);
  return (
    <button
      className={active ? "focubili-nav-item active" : "focubili-nav-item"}
      onClick={() => setView(view)}
      aria-current={active ? "page" : undefined}
      data-tour-target={view === "library" ? "library-nav" : view === "settings" ? "settings-nav" : undefined}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
      <span>{label}</span>
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const view = useAppStore((state) => state.view);
  const density = useAppStore((state) => state.density);
  const nowPlaying = useAppStore((state) => state.nowPlaying);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const previousViewRef = useRef<ViewKey[]>([]);
  // 播放器视图本身就是"正在看"，不需要再放一个返回按钮。
  const showNowPlayingReturn = Boolean(
    nowPlaying?.bvid && view !== "bilibili-player",
  );

  useEffect(() => {
    const previous = previousViewRef.current[previousViewRef.current.length - 1];
    if (previous !== view) previousViewRef.current.push(view);
    if (previousViewRef.current.length > 30) previousViewRef.current.shift();
  }, [view]);

  useEffect(() => {
    const parentByView: Partial<Record<ViewKey, ViewKey>> = {
      "bilibili-player": "library",
      "cloud-player": "library",
      "favorite-videos": "favorites",
      "collection-detail": "subscribed-collections",
      "creator-profile": "settings",
      "login": "settings",
      "about": "settings",
      "personalization": "settings",
      "preferences": "personalization",
      "problem-diagnostics": "about",
      "cache-management": "personalization",
      "android-permissions": "personalization",
      "windows-system-capabilities": "personalization",
      "learning-list": "settings",
      "video-notes": "settings",
      "focus-statistics": "focus-dashboard",
      "home-feed": "focus-dashboard",
    };
    const handleBack = () => {
      const fullscreenBack = new Event("beid:request-exit-fullscreen", { cancelable: true });
      window.dispatchEvent(fullscreenBack);
      if (fullscreenBack.defaultPrevented) return;
      if (paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      if (hasOpenOverlays()) {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        return;
      }
      const history = previousViewRef.current;
      while (history.length > 0) {
        const candidate = history.pop();
        if (candidate && candidate !== view) {
          useAppStore.getState().setView(candidate);
          return;
        }
      }
      useAppStore.getState().setView(parentByView[view] ?? "focus-dashboard");
    };
    handleBackRef.current = handleBack;
    const nativeFallback = () => handleBack();
    window.addEventListener("beid:request-app-back", nativeFallback);
    return () => {
      window.removeEventListener("beid:request-app-back", nativeFallback);
    };
  }, [paletteOpen, view]);

  // Home-screen widget quick actions arrive as DOM events from MainActivity.
  useEffect(() => {
    const onWidgetAction = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (!action) return;
      if (action === "continue-video") {
        window.dispatchEvent(new Event("beid:continue-learning"));
        return;
      }
      const view = WIDGET_VIEW_BY_ACTION[action];
      if (view) useAppStore.getState().setView(view);
    };
    window.addEventListener("beid:widget-action", onWidgetAction);
    return () => window.removeEventListener("beid:widget-action", onWidgetAction);
  }, []);

  // 浏览器 / 平板 PWA 的系统返回：应用内返回优先，不能一按返回就把整个应用退掉。
  // 每个视图占一条历史记录；popstate 一律转成应用内返回，走完历史再退到父级页面。
  const handleBackRef = useRef<() => void>(() => {});
  useEffect(() => {
    window.history.replaceState({ beid: true }, "");
    window.history.pushState({ beid: true }, "");
    const onPopState = (event: PopStateEvent) => {
      if ((event.state as { beid?: boolean } | null)?.beid) {
        handleBackRef.current();
        // 应用内返回消费了一条历史，重新压入占位符，
        // 否则下一次系统返回就会退出应用（浏览器/PWA 路径）。
        window.history.pushState({ beid: true }, "");
        return;
      }
      // 回退越过了应用入口的历史：重新占位，避免误触直接离开应用。
      window.history.pushState({ beid: true }, "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

  useEffect(() => {
    const onOpenFromTour = () => {
      if (!hasOpenOverlays()) setPaletteOpen(true);
    };
    window.addEventListener(TOUR_PALETTE_OPEN_EVENT, onOpenFromTour);
    return () => window.removeEventListener(TOUR_PALETTE_OPEN_EVENT, onOpenFromTour);
  }, []);

  return (
    <div className="focubili-shell" data-view={view}>
      <aside className="focubili-rail">
        <div className="focubili-brand" aria-label="BEID">
          <img className="focubili-mark" src="/beid-icon.png?v=3" alt="" />
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
          data-tour-target="palette-trigger"
        >
          <Command size={17} />
        </button>
      </aside>
      <div className="focubili-main">
        <main
          className={BEID_VIEWS.has(view) ? "focubili-stage full" : "focubili-stage padded"}
        >
          <div key={view} className="focubili-view-frame">
            {children}
          </div>
        </main>
      </div>
      {showNowPlayingReturn && nowPlaying && (
        <button
          type="button"
          className="focubili-now-playing-return"
          data-tour-target="now-playing-return"
          onClick={() => {
            useAppStore.getState().openBilibiliVideoAt(
              nowPlaying.bvid,
              nowPlaying.title,
              nowPlaying.cid,
              nowPlaying.seconds,
            );
          }}
          aria-label={`回到正在看的视频：${nowPlaying.title}`}
          title={`回到正在看的视频：${nowPlaying.title}`}
        >
          <MonitorPlay size={17} strokeWidth={1.9} />
        </button>
      )}
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
              data-tour-target={item.view === "library" ? "library-nav" : item.view === "settings" ? "settings-nav" : undefined}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="focubili-bottom-command"
          onClick={() => setPaletteOpen(true)}
          aria-label="打开命令面板"
          title="打开命令面板"
          data-tour-target="palette-trigger"
        >
          <Command size={22} strokeWidth={1.9} />
          <span>命令</span>
        </button>
      </nav>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
