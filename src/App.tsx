import { useEffect } from "react";
import { Shell } from "./components/Shell";
import { CountdownsView } from "./features/countdowns/CountdownsView";
import { FocusView } from "./features/focus/FocusView";
import { HabitsView } from "./features/habits/HabitsView";
import { InboxView } from "./features/inbox/InboxView";
import { KaoyanView } from "./features/kaoyan/KaoyanView";
import { NotesView } from "./features/notes/NotesView";
import { SettingsView } from "./features/settings/SettingsView";
import { TasksView } from "./features/tasks/TasksView";
import { TodayView } from "./features/today/TodayView";
import { ToolsView } from "./features/tools/ToolsView";
import { VideosView } from "./features/videos/VideosView";
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
      <Shell>
        {view === "today" && <TodayView />}
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
    </div>
  );
}
