import { Flame, Hourglass, Inbox, ListTodo, Minus, Timer, TrendingDown, TrendingUp } from "lucide-react";
import { ProgressRing } from "../../components/ProgressRing";
import { daysUntil, habitStreak, lastNDates, todayKey } from "../../lib/time";
import {
  focusMinutesByDay,
  habitCheckinsByDay,
  habitStrength,
  taskCompletionsByDay,
  trendSummary,
} from "../../lib/stats";
import { useAppStore } from "../../store/useAppStore";

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
        fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3,
        color: up ? "var(--good)" : "var(--danger)",
      }}
    >
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? "+" : ""}{summary.deltaPercent}%
    </span>
  );
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
    enabledTools,
    setView,
    toggleTask,
    toggleHabitToday,
  } = useAppStore();
  const today = todayKey();
  const todayTasks = tasks.filter((item) => item.due === today);
  const openTasks = todayTasks.filter((item) => !item.done);
  const doneTasks = todayTasks.length - openTasks.length;
  const taskPercent = todayTasks.length ? Math.round((doneTasks / todayTasks.length) * 100) : 0;
  const checkedHabits = habits.filter((item) => item.checkedDates.includes(today)).length;
  const focusMinutesToday = focusSessions
    .filter((item) => item.date === today)
    .reduce((sum, item) => sum + item.minutes, 0);
  const nextCountdown = [...countdowns].sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];
  const weekDates = lastNDates(7, today);
  const prevWeekDates = lastNDates(14, today).slice(0, 7);
  const pendingUnits = studyUnits.filter(
    (unit) => unit.startDate <= today && today <= unit.endDate && !unit.completedDates.includes(today),
  );

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

  return (
    <div className="stack">
      <section className="card">
        <div className="hero-split">
          <div>
            <p className="eyebrow">今日概览</p>
            <div className="hero-number" style={{ marginTop: 10 }}>{openTasks.length}</div>
            <p className="muted" style={{ marginTop: 6 }}>
              项待完成 · 已完成 {doneTasks}/{todayTasks.length || 0}
            </p>
          </div>
          <ProgressRing percent={taskPercent} size={104} stroke={10}>
            <div>
              <strong style={{ fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{taskPercent}%</strong>
              <p className="muted" style={{ fontSize: 11 }}>完成度</p>
            </div>
          </ProgressRing>
        </div>
      </section>

      <section className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <div>
            <h2>近 7 天回顾</h2>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>与之前 7 天相比</p>
          </div>
        </div>
        <div className="review-grid">
          {review.map((item) => {
            const summary = trendSummary(item.current, item.previous);
            return (
              <div key={item.key} className="review-cell">
                <strong style={{ fontSize: 21, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                  {item.current}
                </strong>
                <span className="muted" style={{ fontSize: 12 }}>{item.label}</span>
                <TrendBadge summary={summary} />
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid">
        <button className="card tool-card stat-tile" onClick={() => setView("tasks")}>
          <span className="stat-value"><ListTodo size={17} color="var(--text-2)" />{openTasks.length}<small>项</small></span>
          <span className="stat-label">今日待办</span>
        </button>
        <button className="card tool-card stat-tile" onClick={() => setView("habits")}>
          <span className="stat-value"><Flame size={17} color="var(--text-2)" />{habits.length ? `${checkedHabits}/${habits.length}` : "0"}<small>个</small></span>
          <span className="stat-label">习惯打卡</span>
        </button>
        <button className="card tool-card stat-tile" onClick={() => setView("focus")}>
          <span className="stat-value"><Timer size={17} color="var(--text-2)" />{focusMinutesToday}<small>分钟</small></span>
          <span className="stat-label">今日专注</span>
        </button>
        <button className="card tool-card stat-tile" onClick={() => setView("inbox")}>
          <span className="stat-value"><Inbox size={17} color="var(--text-2)" />{inbox.length}<small>条</small></span>
          <span className="stat-label">待整理想法</span>
        </button>
        {nextCountdown && (
          <button className="card tool-card stat-tile" onClick={() => setView("countdowns")}>
            <span className="stat-value"><Hourglass size={17} color="var(--text-2)" />{Math.max(0, daysUntil(nextCountdown.date))}<small>天</small></span>
            <span className="stat-label">{nextCountdown.title}</span>
          </button>
        )}
        {subjects.length > 0 && (
          <button className="card tool-card stat-tile" onClick={() => setView("kaoyan")}>
            <span className="stat-value"><small style={{ fontSize: 14 }}>{pendingUnits.length}</small><small>个小类</small></span>
            <span className="stat-label">考研今日待打卡</span>
          </button>
        )}
      </div>

      {enabledTools.includes("tasks") && (
        <section className="card">
          <div className="row">
            <h2>今日任务</h2>
            <button className="chip" onClick={() => setView("tasks")}>查看全部</button>
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
        </section>
      )}

      {enabledTools.includes("habits") && (
        <section className="card">
          <div className="row">
            <h2>今日习惯</h2>
            <button className="chip" onClick={() => setView("habits")}>管理习惯</button>
          </div>
          {habits.length === 0 ? (
            <p className="empty">还没有添加习惯</p>
          ) : (
            habits.slice(0, 4).map((item) => {
              const checked = item.checkedDates.includes(today);
              const strength = habitStrength(item.checkedDates, lastNDates(30, today));
              return (
                <div className="item" key={item.id}>
                  <button className={checked ? "check on" : "check"} onClick={() => toggleHabitToday(item.id)} aria-label="切换打卡" />
                  <div>
                    <p>{item.title}</p>
                    <div className="week-dots" style={{ marginTop: 5 }}>
                      {weekDates.map((date) => (
                        <span key={date} className={item.checkedDates.includes(date) ? "week-dot on" : "week-dot"} />
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <ProgressRing percent={strength} size={40} stroke={4}>
                      <span style={{ fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>{strength}</span>
                    </ProgressRing>
                    <span className="muted" style={{ fontSize: 13 }}>连续 {habitStreak(item.checkedDates)} 天</span>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}
