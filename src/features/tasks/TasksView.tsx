import { useState } from "react";
import { Modal } from "../../components/Modal";
import { QuickAdd } from "../../components/QuickAdd";
import { dueLabel, lastNDates, todayKey } from "../../lib/time";
import { RixiaWorkspacePage } from "../bilibili/RixiaWorkspacePage";
import { useAppStore } from "../../store/useAppStore";
import type { TaskItem } from "../../types";

type Filter = "today" | "open" | "all";

function TaskRow({ item, today }: { item: TaskItem; today: string }) {
  const { toggleTask, removeTask, updateTask } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [due, setDue] = useState(item.due ?? "");
  const dueInfo = dueLabel(item.due, today);

  return (
    <div className="item">
      <button
        className={item.done ? "check on" : "check"}
        onClick={() => toggleTask(item.id)}
        aria-label={item.done ? "标记为未完成" : "标记为完成"}
      />
      <button className="task-edit-trigger" onClick={() => { setTitle(item.title); setDue(item.due ?? ""); setEditing(true); }} title="点击编辑">
        <p className={item.done ? "done" : ""}>{item.title}</p>
        <span className={`due-chip tone-${dueInfo.tone}`} style={{ marginTop: 5 }}>{dueInfo.text}</span>
      </button>
      <button className="danger" onClick={() => removeTask(item.id)}>删除</button>

      {editing && (
        <Modal
          title="编辑任务"
          onClose={() => {
            // 关闭即丢弃草稿，下次打开从当前值重新开始
            setTitle(item.title);
            setDue(item.due ?? "");
            setEditing(false);
          }}
        >
          <form
            className="stack"
            style={{ gap: 10 }}
            onSubmit={(event) => {
              event.preventDefault();
              updateTask(item.id, title, due || null);
              setEditing(false);
            }}
          >
            <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="任务标题" autoFocus />
            <label className="date-fields" style={{ gridTemplateColumns: "1fr" }}>
              <span className="muted" style={{ fontSize: 12 }}>到期日（留空表示无日期）</span>
              <input className="field" type="date" value={due} onChange={(event) => setDue(event.target.value)} />
            </label>
            <div className="form-actions" style={{ justifyContent: "space-between" }}>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  removeTask(item.id);
                  setEditing(false);
                }}
              >
                删除任务
              </button>
              <button className="primary compact" type="submit">保存</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function TasksView({ embedded = false }: { embedded?: boolean } = {}) {
  const { tasks, addTask, toggleTask } = useAppStore();
  const [filter, setFilter] = useState<Filter>("today");
  const today = todayKey();

  const todayTasks = tasks.filter((item) => item.due === today);
  const openTasks = tasks.filter((item) => !item.done);
  const doneToday = todayTasks.filter((item) => item.done).length;
  const percent = todayTasks.length ? Math.round((doneToday / todayTasks.length) * 100) : 0;
  const weekDates = lastNDates(7, today);
  const weekTaskCounts = weekDates.map((date) => tasks.filter((item) => item.due === date).length);

  const visible = filter === "today" ? todayTasks : filter === "open" ? openTasks : tasks;

  return (
    <RixiaWorkspacePage title="任务" embedded={embedded}>
    <div className="stack">
      <section className="card">
        <QuickAdd placeholder="添加今天要做的事" onSubmit={(text) => addTask(text, today)} />
      </section>

      <section className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <div>
            <h2>今日进度</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>
              {todayTasks.length ? `已完成 ${doneToday} / ${todayTasks.length} 项` : "今天还没有任务"}
            </p>
          </div>
          <strong style={{ fontSize: 22, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>{percent}%</strong>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${percent}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-deep))" }} />
        </div>
        <div className="week-dots" style={{ marginTop: 14, justifyContent: "space-between" }}>
          {weekDates.map((date, index) => (
            <div key={date} style={{ display: "grid", justifyItems: "center", gap: 5 }}>
              <span className={date === today ? "week-dot on" : "week-dot"} style={{ width: 8, height: 8 }} />
              <span className="muted" style={{ fontSize: 11, color: weekTaskCounts[index] ? "var(--text-2)" : "var(--text-3)" }}>
                {weekTaskCounts[index] || "·"}
              </span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8, textAlign: "center" }}>近 7 天任务分布 · 点击任务可编辑</p>
      </section>

      <section className="card">
        <div className="segmented" style={{ marginBottom: 10 }} role="tablist" aria-label="任务筛选">
          <button className={filter === "today" ? "segment active" : "segment"} role="tab" aria-selected={filter === "today"} onClick={() => setFilter("today")}>
            今天<span className="count">{todayTasks.length}</span>
          </button>
          <button className={filter === "open" ? "segment active" : "segment"} role="tab" aria-selected={filter === "open"} onClick={() => setFilter("open")}>
            待办<span className="count">{openTasks.length}</span>
          </button>
          <button className={filter === "all" ? "segment active" : "segment"} role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")}>
            全部<span className="count">{tasks.length}</span>
          </button>
        </div>
        {visible.length === 0 ? (
          <p className="empty">
            {filter === "today" ? "今天没有任务，享受当下或安排一件小事" : filter === "open" ? "没有待办任务，都完成啦" : "还没有任务，先添加一项吧"}
          </p>
        ) : (
          visible.map((item) => <TaskRow key={item.id} item={item} today={today} />)
        )}
      </section>

      {todayTasks.some((item) => !item.done) && (
        <section className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <h3>完成今天的全部任务</h3>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
              剩余 {todayTasks.filter((item) => !item.done).length} 项未完成
            </p>
          </div>
          <button
            className="ghost-btn"
            onClick={() => todayTasks.filter((item) => !item.done).forEach((item) => toggleTask(item.id))}
          >
            全部完成
          </button>
        </section>
      )}
    </div>
    </RixiaWorkspacePage>
  );
}
