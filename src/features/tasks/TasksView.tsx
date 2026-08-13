import { QuickAdd } from "../../components/QuickAdd";
import { todayKey } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

export function TasksView() {
  const { tasks, addTask, toggleTask, removeTask } = useAppStore();
  const today = todayKey();

  return (
    <div className="stack">
      <section className="card">
        <QuickAdd placeholder="添加今天要做的事" button="添加任务" onSubmit={(text) => addTask(text, today)} />
      </section>
      <section className="card">
        {tasks.length === 0 ? (
          <p className="empty">还没有任务，先添加一项吧</p>
        ) : (
          tasks.map((item) => (
            <div className="item" key={item.id}>
              <button className={item.done ? "check on" : "check"} onClick={() => toggleTask(item.id)} />
              <div>
                <p className={item.done ? "done" : ""}>{item.title}</p>
                <p className="muted">{item.due ?? "无日期"}</p>
              </div>
              <button className="danger" onClick={() => removeTask(item.id)}>
                删除
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
