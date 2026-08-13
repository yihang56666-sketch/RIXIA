import { QuickAdd } from "../../components/QuickAdd";
import { useAppStore } from "../../store/useAppStore";

export function InboxView() {
  const { inbox, addInbox, removeInbox, convertInboxToTask } = useAppStore();

  return (
    <div className="stack">
      <section className="card">
        <p className="muted">先把想法放进来，稍后再整理成任务</p>
        <div style={{ height: 12 }} />
        <QuickAdd placeholder="输入一个想法或待办" onSubmit={addInbox} />
      </section>
      <section className="card">
        {inbox.length === 0 ? (
          <p className="empty">收集箱是空的</p>
        ) : (
          inbox.map((item) => (
            <div className="item" key={item.id}>
              <span />
              <div>
                <p>{item.text}</p>
                <p className="muted">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
              </div>
              <div className="stack">
                <button className="chip" onClick={() => convertInboxToTask(item.id)}>
                  转为任务
                </button>
                <button className="danger" onClick={() => removeInbox(item.id)}>
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
