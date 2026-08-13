import { useEffect } from "react";
import { Shell } from "./components/Shell";
import { CountdownsView } from "./features/countdowns/CountdownsView";
import { FocusView } from "./features/focus/FocusView";
import { HabitsView } from "./features/habits/HabitsView";
import { InboxView } from "./features/inbox/InboxView";
import { NotesView } from "./features/notes/NotesView";
import { SettingsView } from "./features/settings/SettingsView";
import { TasksView } from "./features/tasks/TasksView";
import { TodayView } from "./features/today/TodayView";
import { ToolsView } from "./features/tools/ToolsView";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const view = useAppStore((state) => state.view);
  const theme = useAppStore((state) => state.theme);
  const backgroundImage = useAppStore((state) => state.backgroundImage);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div
      className="app-background"
      data-has-background={backgroundImage ? "true" : "false"}
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : undefined}
    >
      <Shell>
        {view === "today" && <TodayView />}
        {view === "inbox" && <InboxView />}
        {view === "tools" && <ToolsView />}
        {view === "tasks" && <TasksView />}
        {view === "habits" && <HabitsView />}
        {view === "notes" && <NotesView />}
        {view === "countdowns" && <CountdownsView />}
        {view === "focus" && <FocusView />}
        {view === "settings" && <SettingsView />}
      </Shell>
    </div>
  );
}
