import { useEffect, useState } from "react";
import { Shell } from "./components/Shell";
import { CountdownsView } from "./features/countdowns/CountdownsView";
import { FocusView } from "./features/focus/FocusView";
import { HabitsView } from "./features/habits/HabitsView";
import { InboxView } from "./features/inbox/InboxView";
import { KaoyanView } from "./features/kaoyan/KaoyanView";
import { LibraryView } from "./features/library/LibraryView";
import { NotesView } from "./features/notes/NotesView";
import { PlanView } from "./features/plan/PlanView";
import { TasksView } from "./features/tasks/TasksView";
import { TodayView } from "./features/today/TodayView";
import { ToolsView } from "./features/tools/ToolsView";
import { VideosView } from "./features/videos/VideosView";
import {
  BilibiliFavoritesView,
  BilibiliFollowedView,
  BilibiliSubscribedCollectionsView,
  FavoriteVideosRoute,
} from "./features/bilibili/BilibiliAccountViews";
import { BilibiliLoginView } from "./features/bilibili/LoginView";
import { BilibiliPlayerRoute } from "./features/bilibili/BilibiliPlayerView";
import { CloudResourceView } from "./features/videos/CloudResourceView";
import { BilibiliSearchView } from "./features/bilibili/BilibiliSearchView";
import { LocalWatchHistoryView } from "./features/bilibili/LocalWatchHistoryView";
import {
  CacheManagementPage,
  ProblemDiagnosticsPage,
  AndroidPermissionManagementPage,
  WindowsSystemCapabilitiesPage,
} from "./features/bilibili/SystemPages";
import { FirstLaunchGate } from "./features/bilibili/FirstLaunchGate";
import { M3FeedbackProvider } from "./features/bilibili/m3";
import { AppUpdateProvider, useAppUpdateController } from "./features/bilibili/AppUpdateContext";
import { FocusDashboard } from "./features/bilibili/FocusDashboard";
import { FocusStatisticsView } from "./features/bilibili/FocusStatisticsView";
import { HomeFeedView } from "./features/bilibili/HomeFeedView";
import { LearningListView } from "./features/bilibili/LearningListView";
import { VideoNotesView } from "./features/bilibili/VideoNotesView";
import { ProfileHub } from "./features/bilibili/ProfileHub";
import { FeatureTour } from "./features/tour/FeatureTour";
import { PersonalizationSettingsView } from "./features/bilibili/PersonalizationSettingsView";
import { AboutView } from "./features/bilibili/AboutView";
import { CollectionDetailRoute, CreatorProfileRoute } from "./features/bilibili/CreatorCollectionViews";
import { SettingsView } from "./features/settings/SettingsView";
import { useAppStore } from "./store/useAppStore";
import { THEMES } from "./catalog";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { routeIncomingBilibiliUrlAsync } from "./lib/bilibili/nativeDeepLink";
import { attachNativeShareIntent, getNativeShareIntent } from "./lib/bilibili/nativeShareIntent";
import { createDiagnosticsService } from "./lib/bilibili/diagnosticsService";
import { AppUpdateStatus } from "./lib/bilibili/miscServices";

function StorageWriteBanner() {
  const failed = useAppStore((state) => state.storageWriteFailed);
  const clear = useAppStore((state) => state.clearStorageWriteFailed);
  if (!failed) return null;
  return (
    <aside className="app-update-notice" role="alert">
      <span>本机存储已满或不可写，刚才的更改只留在当前会话，关闭应用后会丢失。</span>
      <button className="ghost-btn compact" onClick={clear}>知道了</button>
    </aside>
  );
}

function AppUpdateBanner() {
  const { result, hasUpdate } = useAppUpdateController();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => setDismissed(false), [result.status, result.latestVersion]);
  if (!hasUpdate || dismissed || result.status !== AppUpdateStatus.available) return null;
  return (
    <aside className="app-update-notice" role="status">
      <span>发现 BEID {result.latestVersion} 更新</span>
      <button className="ghost-btn compact" onClick={() => useAppStore.getState().setView("about")}>查看</button>
      <button className="icon-button" aria-label="关闭更新提示" onClick={() => setDismissed(true)}>×</button>
    </aside>
  );
}

export default function App() {
  const view = useAppStore((state) => state.view);
  const theme = useAppStore((state) => state.theme);
  const backgroundImage = useAppStore((state) => state.backgroundImage);

  useEffect(() => {
    const diagnostics = createDiagnosticsService();
    const onError = (event: ErrorEvent) => diagnostics.record(event.error ?? event.message, "runtime");
    const onRejection = (event: PromiseRejectionEvent) => diagnostics.record(event.reason, "promise");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    const systemPreference = theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : undefined;
    const applyTheme = () => {
      const isDark = systemPreference?.matches ?? Boolean(THEMES.find((item) => item.key === theme)?.dark);
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.m3Mode = isDark ? "dark" : "light";
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    };
    applyTheme();
    systemPreference?.addEventListener("change", applyTheme);
    return () => systemPreference?.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    const cancellation = new AbortController();
    const cleanups: Array<() => Promise<void>> = [];
    const diagnostics = createDiagnosticsService();
    const reportError = (error: unknown) => {
      if (disposed && error instanceof DOMException && error.name === "AbortError") return;
      diagnostics.record(error, "native-intent");
    };
    const runCleanup = (remove: () => Promise<void>) => {
      void Promise.resolve().then(remove).catch(reportError);
    };
    const retainCleanup = (remove: () => Promise<void>) => {
      if (disposed) runCleanup(remove);
      else cleanups.push(remove);
    };
    const route = (url: string) => {
      if (disposed) return;
      void routeIncomingBilibiliUrlAsync(url, {
        openVideo: (bvid) => {
          if (!disposed) useAppStore.getState().openBilibiliVideo(bvid);
        },
        openSearch: () => {
          if (!disposed) useAppStore.getState().setView("search");
        },
      }).catch(reportError);
    };
    void (async () => {
      const result = await CapacitorApp.getLaunchUrl();
      if (result?.url) route(result.url);
    })().catch(reportError);
    void (async () => {
      const listener = await CapacitorApp.addListener("appUrlOpen", ({ url }) => route(url));
      retainCleanup(() => listener.remove());
    })().catch(reportError);
    if (Capacitor.getPlatform() === "android") {
      void (async () => {
        const detach = await attachNativeShareIntent(getNativeShareIntent(), route, cancellation.signal);
        retainCleanup(detach);
      })().catch(reportError);
    }
    return () => {
      disposed = true;
      cancellation.abort();
      cleanups.forEach(runCleanup);
    };
  }, []);

  return (
    <div
      className="app-background"
      data-has-background={backgroundImage ? "true" : "false"}
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : undefined}
    >
      <div className="app-overlay" />
      <FirstLaunchGate>
        <M3FeedbackProvider>
        <AppUpdateProvider>
        <AppUpdateBanner />
        <StorageWriteBanner />
        <Shell>
          {view === "today" && <TodayView />}
        {view === "plan" && <PlanView />}
        {view === "library" && <LibraryView />}
        {view === "search" && <BilibiliSearchView />}
        {view === "bilibili-player" && <BilibiliPlayerRoute />}
        {view === "cloud-player" && <CloudResourceView />}
        {view === "favorites" && <BilibiliFavoritesView />}
        {view === "favorite-videos" && <FavoriteVideosRoute />}
        {view === "followed" && <BilibiliFollowedView />}
        {view === "local-watch-history" && <LocalWatchHistoryView />}
        {view === "subscribed-collections" && <BilibiliSubscribedCollectionsView />}
        {view === "creator-profile" && <CreatorProfileRoute />}
        {view === "collection-detail" && <CollectionDetailRoute />}
        {view === "login" && <BilibiliLoginView />}
        {view === "about" && <AboutView />}
        {view === "cache-management" && <CacheManagementPage />}
        {view === "problem-diagnostics" && <ProblemDiagnosticsPage />}
        {view === "android-permissions" && <AndroidPermissionManagementPage />}
        {view === "windows-system-capabilities" && <WindowsSystemCapabilitiesPage />}
        {view === "home-feed" && <HomeFeedView />}
        {view === "learning-list" && <LearningListView />}
        {view === "video-notes" && <VideoNotesView />}
        {view === "focus-dashboard" && <FocusDashboard onOpenStatistics={() => useAppStore.getState().setView("focus-statistics")} />}
        {view === "focus-statistics" && <FocusStatisticsView />}
        {view === "inbox" && <InboxView />}
        {view === "kaoyan" && <KaoyanView />}
        {view === "tools" && <ToolsView />}
        {view === "tasks" && <TasksView />}
        {view === "habits" && <HabitsView />}
        {view === "notes" && <NotesView />}
        {view === "countdowns" && <CountdownsView />}
        {view === "focus" && <FocusView />}
        {view === "videos" && <VideosView />}
        {view === "settings" && <ProfileHub />}
        {view === "personalization" && <PersonalizationSettingsView />}
        {view === "preferences" && <SettingsView />}
      </Shell>
      <FeatureTour />
      </AppUpdateProvider>
      </M3FeedbackProvider>
      </FirstLaunchGate>
    </div>
  );
}
