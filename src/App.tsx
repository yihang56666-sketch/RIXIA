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
    const isDark = Boolean(THEMES.find((item) => item.key === theme)?.dark);
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.m3Mode = isDark ? "dark" : "light";
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  }, [theme]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const route = (url: string) => void routeIncomingBilibiliUrlAsync(url, {
      openVideo: (bvid) => useAppStore.getState().openBilibiliVideo(bvid),
      openSearch: () => useAppStore.getState().setView("search"),
    });

    void CapacitorApp.getLaunchUrl().then((result) => {
      if (result?.url) route(result.url);
    });
    const listener = CapacitorApp.addListener("appUrlOpen", ({ url }) => route(url));
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, []);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let detach: (() => Promise<void>) | undefined;
    void attachNativeShareIntent(getNativeShareIntent(), (text) => {
      void routeIncomingBilibiliUrlAsync(text, {
        openVideo: (bvid) => useAppStore.getState().openBilibiliVideo(bvid),
        openSearch: () => useAppStore.getState().setView("search"),
      });
    }).then((cleanup) => {
      detach = cleanup;
    });
    return () => {
      void detach?.();
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
        <Shell>
          {view === "today" && <TodayView />}
        {view === "plan" && <PlanView />}
        {view === "library" && <LibraryView />}
        {view === "search" && <BilibiliSearchView />}
        {view === "bilibili-player" && <BilibiliPlayerRoute />}
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
      </AppUpdateProvider>
      </M3FeedbackProvider>
      </FirstLaunchGate>
    </div>
  );
}
