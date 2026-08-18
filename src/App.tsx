import { useEffect } from "react";
import { Shell } from "./components/Shell";
import { CountdownsView } from "./features/countdowns/CountdownsView";
import { FocusView } from "./features/focus/FocusView";
import { HabitsView } from "./features/habits/HabitsView";
import { InboxView } from "./features/inbox/InboxView";
import { KaoyanView } from "./features/kaoyan/KaoyanView";
import { LibraryView } from "./features/library/LibraryView";
import { NotesView } from "./features/notes/NotesView";
import { PlanView } from "./features/plan/PlanView";
import { SettingsView } from "./features/settings/SettingsView";
import { TasksView } from "./features/tasks/TasksView";
import { TodayView } from "./features/today/TodayView";
import { ToolsView } from "./features/tools/ToolsView";
import { VideosView } from "./features/videos/VideosView";
import {
  BilibiliFavoritesView,
  BilibiliFollowedView,
  BilibiliLoginView,
  BilibiliWatchHistoryView,
} from "./features/bilibili/BilibiliAccountViews";
import { BilibiliPlayerRoute } from "./features/bilibili/BilibiliPlayerView";
import { BilibiliSearchView } from "./features/bilibili/BilibiliSearchView";
import {
  AppUpdatePage,
  CacheManagementPage,
  ProblemDiagnosticsPage,
} from "./features/bilibili/SystemPages";
import { FirstLaunchGate } from "./features/bilibili/FirstLaunchGate";
import { FocusDashboard } from "./features/bilibili/FocusDashboard";
import { FocusStatisticsView } from "./features/bilibili/FocusStatisticsView";
import { HomeFeedView } from "./features/bilibili/HomeFeedView";
import { LearningListView } from "./features/bilibili/LearningListView";
import { useAppStore } from "./store/useAppStore";
import { THEMES } from "./catalog";

export default function App() {
  const view = useAppStore((state) => state.view);
  const theme = useAppStore((state) => state.theme);
  const backgroundImage = useAppStore((state) => state.backgroundImage);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = THEMES.find((item) => item.key === theme)?.dark
      ? "dark"
      : "light";
  }, [theme]);

  return (
    <div
      className="app-background"
      data-has-background={backgroundImage ? "true" : "false"}
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : undefined}
    >
      <div className="app-overlay" />
      <FirstLaunchGate>
        <Shell>
          {view === "today" && <TodayView />}
        {view === "plan" && <PlanView />}
        {view === "library" && <LibraryView />}
        {view === "search" && <BilibiliSearchView />}
        {view === "bilibili-player" && <BilibiliPlayerRoute />}
        {view === "favorites" && <BilibiliFavoritesView />}
        {view === "followed" && <BilibiliFollowedView />}
        {view === "watch-history" && <BilibiliWatchHistoryView />}
        {view === "login" && <BilibiliLoginView />}
        {view === "app-update" && <AppUpdatePage />}
        {view === "cache-management" && <CacheManagementPage />}
        {view === "problem-diagnostics" && <ProblemDiagnosticsPage />}
        {view === "home-feed" && <HomeFeedView />}
        {view === "learning-list" && <LearningListView />}
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
        {view === "settings" && <SettingsView />}
      </Shell>
      </FirstLaunchGate>
    </div>
  );
}
