import { useState } from "react";
import type { ViewKey } from "../../types";
import { TasksView } from "../tasks/TasksView";
import { HabitsView } from "../habits/HabitsView";
import { CountdownsView } from "../countdowns/CountdownsView";
import { KaoyanView } from "../kaoyan/KaoyanView";

type Tab = ViewKey;

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "tasks", label: "任务" },
  { key: "habits", label: "习惯" },
  { key: "kaoyan", label: "考研" },
  { key: "countdowns", label: "倒计时" },
];

/**
 * Plan is the unified planning surface — segmented control switches between
 * task, habit, kaoyan and countdown views without changing the URL route.
 * Reuses the existing domain components; the segmentation is presentation only.
 */
export function PlanView() {
  const [tab, setTab] = useState<Tab>("tasks");

  return (
    <div className="stack">
      <section className="card plan-segmented">
        <div className="segmented" role="tablist" aria-label="计划视图">
          {TABS.map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? "segmented-item active" : "segmented-item"}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {tab === "tasks" && <TasksView />}
      {tab === "habits" && <HabitsView />}
      {tab === "kaoyan" && <KaoyanView />}
      {tab === "countdowns" && <CountdownsView />}
    </div>
  );
}
