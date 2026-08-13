import { daysUntil, habitStreak, todayKey } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

export function TodayView() {
  const { inbox, tasks, habits, countdowns, enabledTools, setView, toggleTask, toggleHabitToday } =
    useAppStore();
  const today = todayKey();
  const todayTasks = tasks.filter((item) => item.due === today);
  const openTasks = todayTasks.filter((item) => !item.done);
  const nextCountdown = [...countdowns].sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];

  return (
    <div className="stack">
      <section className="card">
        <p className="eyebrow">今日概览</p>
        <div className="hero-number">{openTasks.length}</div>
        <p className="muted">项待完成任务</p>
      </section>

      {enabledTools.includes("tasks") && (
        <section className="card">
          <div className="row">
            <h2>今日任务</h2>
            <button className="chip" onClick={() => setView("tasks")}>
              查看全部
            </button>
          </div>
          {todayTasks.length === 0 ? (
            <p className="empty">今天还没有安排任务</p>
          ) : (
            todayTasks.slice(0, 5).map((item) => (
              <div className="item" key={item.id}>
                <button className={item.done ? "check on" : "check"} onClick={() => toggleTask(item.id)} />
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
            <button className="chip" onClick={() => setView("habits")}>
              管理习惯
            </button>
          </div>
          {habits.length === 0 ? (
            <p className="empty">还没有添加习惯</p>
          ) : (
            habits.slice(0, 4).map((item) => {
              const checked = item.checkedDates.includes(today);
              return (
                <div className="item" key={item.id}>
                  <button className={checked ? "check on" : "check"} onClick={() => toggleHabitToday(item.id)} />
                  <span>{item.title}</span>
                  <span className="muted">连续 {habitStreak(item.checkedDates)} 天</span>
                </div>
              );
            })
          )}
        </section>
      )}

      <section className="grid">
        <button className="card tool-card" onClick={() => setView("inbox")}>
          <strong>收集箱</strong>
          <span className="muted">{inbox.length} 条待整理</span>
        </button>
        {enabledTools.includes("countdowns") && (
          <button className="card tool-card" onClick={() => setView("countdowns")}>
            <strong>{nextCountdown ? nextCountdown.title : "添加倒计时"}</strong>
            <span className="muted">
              {nextCountdown ? (daysUntil(nextCountdown.date) === 0 ? "就是今天" : `${daysUntil(nextCountdown.date)} 天`) : "记录一个重要日期"}
            </span>
          </button>
        )}
      </section>
    </div>
  );
}
