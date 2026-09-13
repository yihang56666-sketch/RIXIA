import {
  ArrowRight,
  Flame,
  Hourglass,
  Inbox as InboxIcon,
  ListTodo,
  Minus,
  Play,
  Plus,
  Quote,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { buildTodaySummary, chooseNextAction } from "../../lib/today";
import { frequencyAwareStreak, frequencyAwareStrength, isHabitDueToday } from "../../lib/habitSchedule";
import { lastNDates } from "../../lib/time";
import { useCalendarDay } from "../../lib/useCalendarDay";
import {
  focusMinutesByDay,
  habitCheckinsByDay,
  taskCompletionsByDay,
  trendSummary,
} from "../../lib/stats";
import { JournalView } from "../journal/JournalView";
import { RixiaWorkspacePage } from "../bilibili/RixiaWorkspacePage";
import { useAppStore } from "../../store/useAppStore";
import { resourceSourceLabel } from "../../lib/resourceSources";
import { getDailyQuote } from "../../lib/dailyQuotes";

function TrendBadge({ summary }: { summary: ReturnType<typeof trendSummary> }) {
  if (summary.deltaPercent === null) {
    return <span className="muted" style={{ fontSize: 12 }}>—</span>;
  }
  if (summary.deltaPercent === 0) {
    return (
      <span className="muted" style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3 }}>
        <Minus size={12} /> 持平
      </span>
    );
  }
  const up = summary.deltaPercent > 0;
  return (
    <span
      style={{
        fontSize: 12,
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        color: up ? "var(--good)" : "var(--danger)",
      }}
    >
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? "+" : ""}{summary.deltaPercent}%
    </span>
  );
}

function ActionIcon({ kind }: { kind: "focus" | "task" | "resource" | "inbox" | "create-task" }) {
  if (kind === "focus") return <Timer size={20} />;
  if (kind === "task") return <ListTodo size={20} />;
  if (kind === "resource") return <Play size={20} fill="currentColor" />;
  if (kind === "inbox") return <InboxIcon size={20} />;
  return <Plus size={20} />;
}

export function TodayView() {
  const {
    inbox,
    tasks,
    habits,
    countdowns,
    subjects,
    studyUnits,
    focusSessions,
    activeFocus,
    resources,
    setView,
    focusTask,
    openBilibiliVideo,
    openCloudResource,
    toggleTask,
    toggleHabitToday,
  } = useAppStore();
  const today = useCalendarDay();
  const [showReviewChart, setShowReviewChart] = useState(false);
  const dailyQuote = useMemo(() => getDailyQuote(today), [today]);

  const summary = useMemo(
    () => buildTodaySummary({ today, tasks, habits, focusSessions, inbox, countdowns }),
    [today, tasks, habits, focusSessions, inbox, countdowns],
  );

  const action = useMemo(
    () => chooseNextAction({ today, activeFocus, tasks, habits, resources, inbox }),
    [today, activeFocus, tasks, habits, resources, inbox],
  );

  const todayTasks = tasks.filter((item) => item.due === today);
  const pendingUnits = studyUnits.filter(
    (unit) => unit.startDate <= today && today <= unit.endDate && !unit.completedDates.includes(today),
  );
  const weekDates = lastNDates(7, today);
  const prevWeekDates = lastNDates(14, today).slice(0, 7);

  const review = [
    {
      key: "tasks",
      label: "完成事项",
      current: taskCompletionsByDay(tasks, weekDates).reduce((sum, value) => sum + value, 0),
      previous: taskCompletionsByDay(tasks, prevWeekDates).reduce((sum, value) => sum + value, 0),
    },
    {
      key: "habits",
      label: "习惯打卡",
      current: habitCheckinsByDay(habits, weekDates).reduce((sum, value) => sum + value, 0),
      previous: habitCheckinsByDay(habits, prevWeekDates).reduce((sum, value) => sum + value, 0),
    },
    {
      key: "focus",
      label: "专注分钟",
      current: focusMinutesByDay(focusSessions, weekDates).reduce((sum, value) => sum + value, 0),
      previous: focusMinutesByDay(focusSessions, prevWeekDates).reduce((sum, value) => sum + value, 0),
    },
  ];

  const continueResources = resources
    .filter((r) => r.status !== "completed")
    .sort((a, b) => (b.lastOpenedAt ?? b.addedAt).localeCompare(a.lastOpenedAt ?? a.addedAt))
    .slice(0, 3);

  function handleAction() {
    if (action.kind === "focus") {
      setView("focus");
      return;
    }
    if (action.kind === "task") {
      focusTask(action.taskId);
      return;
    }
    if (action.kind === "resource") {
      const resource = resources.find((item) => item.id === action.resourceId);
      if (resource?.url) {
        openCloudResource(resource.id);
        return;
      }
      if (resource?.bvid) {
        openBilibiliVideo(resource.bvid, resource.title);
        return;
      }
      setView("library");
      return;
    }
    if (action.kind === "inbox") {
      setView("inbox");
      return;
    }
    setView("plan");
  }

  const doneHabits = habits.filter((h) => h.checkedDates.includes(today));
  // 频率感知：每周 N 次未达标 / 间隔日到期才算"今日待办"
  const pendingHabits = habits.filter((h) => isHabitDueToday(h, today));

  return (
    <RixiaWorkspacePage title="今日节奏">
    <div className="stack">
      <section className="card today-quote" data-testid="daily-quote" aria-label="每日语录">
        <Quote size={15} aria-hidden="true" />
        <blockquote>{dailyQuote.text}</blockquote>
        <span className="muted">{dailyQuote.source}</span>
      </section>

      <section className="card today-action">
        <div className="today-action-icon">
          <ActionIcon kind={action.kind} />
        </div>
        <div className="today-action-body">
          <p className="eyebrow">下一步</p>
          <strong className="today-action-label">{action.label}</strong>
          <p className="muted today-action-sub">
            {summary.tasksDone}/{summary.tasksTotal} 项任务 · {summary.focusMinutes} 分钟专注
          </p>
        </div>
        <button className="primary today-action-btn" onClick={handleAction}>
          开始 <ArrowRight size={16} />
        </button>
      </section>

      <section className="today-status-strip" aria-label="今日概览">
        <button className="status-pill" onClick={() => setView("plan")}>
          <ListTodo size={15} />
          <span><strong>{summary.tasksDone}/{summary.tasksTotal}</strong> 任务</span>
        </button>
        <button className="status-pill" onClick={() => setView("habits")}>
          <Flame size={15} />
          <span><strong>{summary.habitsChecked}/{summary.habitsTotal}</strong> 习惯</span>
        </button>
        <button className="status-pill" onClick={() => setView("focus")}>
          <Timer size={15} />
          <span><strong>{summary.focusMinutes}</strong> 分钟</span>
        </button>
        <button className="status-pill" onClick={() => setView("inbox")}>
          <InboxIcon size={15} />
          <span><strong>{summary.inboxCount}</strong> 收集</span>
        </button>
        {summary.nextCountdown && summary.nextCountdownDays !== null && (
          <button className="status-pill" onClick={() => setView("countdowns")}>
            <Hourglass size={15} />
            <span><strong>{summary.nextCountdownDays}</strong> 天 · {summary.nextCountdown.title}</span>
          </button>
        )}
      </section>

      <div className="today-columns">
        <section className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <h2>今日安排</h2>
            <button className="chip" onClick={() => setView("plan")}>查看全部</button>
          </div>
          {todayTasks.length === 0 ? (
            <p className="empty">今天还没有安排任务</p>
          ) : (
            todayTasks.slice(0, 5).map((item) => (
              <div className="item" key={item.id}>
                <button className={item.done ? "check on" : "check"} onClick={() => toggleTask(item.id)} aria-label="切换完成" />
                <span className={item.done ? "done" : ""}>{item.title}</span>
                <span />
              </div>
            ))
          )}
          {pendingUnits.length > 0 && (
            <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 4px" }}>今日考研单元</p>
          )}
          {pendingUnits.slice(0, 3).map((unit) => {
            const subject = subjects.find((s) => s.id === unit.subjectId);
            return (
              <div className="item" key={unit.id}>
                <span className="check" />
                <div>
                  <p>{unit.title}</p>
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{subject?.title ?? "考研"}</p>
                </div>
              </div>
            );
          })}
        </section>

        <section className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <h2>继续学习</h2>
            <button className="chip" onClick={() => setView("library")}>资料库</button>
          </div>
          {continueResources.length === 0 ? (
            <p className="empty">还没有进行中的课程</p>
          ) : (
            continueResources.map((resource) => {
              const progress = resource.durationSeconds && resource.progressSeconds
                ? Math.min(100, Math.round((resource.progressSeconds / resource.durationSeconds) * 100))
                : null;
              return (
                <button
                  key={resource.id}
                  className="today-resource"
                  onClick={() => setView("library")}
                >
                  <span className="today-resource-title">{resource.title}</span>
                  <span className="muted today-resource-meta">
                    {resource.source && resource.source !== "bilibili" ? resourceSourceLabel(resource.source) : resource.bvid}
                  </span>
                  {progress !== null && (
                    <div className="library-progress">
                      <div className="library-progress-bar" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </button>
              );
            })
          )}
        </section>

        <section className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <h2>今日习惯</h2>
            <button className="chip" onClick={() => setView("habits")}>管理</button>
          </div>
          {pendingHabits.length === 0 ? (
            <p className="empty">{habits.length === 0 ? "还没有添加习惯" : `${doneHabits.length} 项已打卡`}</p>
          ) : (
            pendingHabits.slice(0, 4).map((item) => (
              <div className="item" key={item.id}>
                <button className="check" onClick={() => toggleHabitToday(item.id)} aria-label="切换打卡" />
                <div>
                  <p>{item.title}</p>
                  <div className="week-dots" style={{ marginTop: 5 }}>
                    {weekDates.map((date) => (
                      <span key={date} className={item.checkedDates.includes(date) ? "week-dot on" : "week-dot"} />
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ProgressRing percent={frequencyAwareStrength(item, lastNDates(30, today))} size={40} stroke={4}>
                    <span style={{ fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>
                      {frequencyAwareStrength(item, lastNDates(30, today))}
                    </span>
                  </ProgressRing>
                  <span className="muted" style={{ fontSize: 13 }}>连续 {frequencyAwareStreak(item, today)} {item.frequency?.type === "weekly-count" ? "周" : item.frequency?.type === "interval-days" ? "轮" : "天"}</span>
                </div>
              </div>
            ))
          )}
          {doneHabits.length > 0 && pendingHabits.length > 0 && (
            <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{doneHabits.length} 项已打卡</p>
          )}
        </section>
      </div>

      <section className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <div>
            <h2>节奏回顾</h2>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>与之前 7 天相比</p>
          </div>
          <button
            className="chip"
            onClick={() => setShowReviewChart((value) => !value)}
            aria-expanded={showReviewChart}
          >
            {showReviewChart ? "收起" : "展开"}
          </button>
        </div>
        <div className="review-grid">
          {review.map((item) => {
            const result = trendSummary(item.current, item.previous);
            return (
              <div key={item.key} className="review-cell">
                <strong style={{ fontSize: 21, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                  {item.current}
                </strong>
                <span className="muted" style={{ fontSize: 12 }}>{item.label}</span>
                <TrendBadge summary={result} />
              </div>
            );
          })}
        </div>
        {showReviewChart && (
          <div className="review-bars">
            {weekDates.map((date) => {
              const focus = focusMinutesByDay(focusSessions, [date])[0] ?? 0;
              const max = Math.max(1, ...focusMinutesByDay(focusSessions, weekDates));
              const height = Math.round((focus / max) * 100);
              return (
                <div key={date} className="review-bar-col">
                  <div className="review-bar-track">
                    <div className="review-bar" style={{ height: `${height}%` }} />
                  </div>
                  <span className="muted" style={{ fontSize: 11 }}>{date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <JournalView />
    </div>
    </RixiaWorkspacePage>
  );
}
