import { ArrowRight, Inbox as InboxIcon } from "lucide-react";
import { QuickAdd } from "../../components/QuickAdd";
import { relativeTime } from "../../lib/time";
import { RixiaWorkspacePage } from "../bilibili/RixiaWorkspacePage";
import { useAppStore } from "../../store/useAppStore";

export function InboxView() {
  const { inbox, addInbox, removeInbox, convertInboxToTask, setView } = useAppStore();

  return (
    <RixiaWorkspacePage title="收集箱">
    <div className="stack">
      <section className="card">
        <QuickAdd placeholder="输入一个想法或待办" onSubmit={addInbox} />
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          先把想法放进来，稍后再整理成今天的任务
        </p>
      </section>

      <section className="card">
        <div className="row" style={{ marginBottom: 4 }}>
          <h2>待整理</h2>
          <span className="due-chip tone-soon">{inbox.length} 条</span>
        </div>
        {inbox.length === 0 ? (
          <div className="empty" style={{ display: "grid", justifyItems: "center", gap: 10, padding: "30px 8px" }}>
            <InboxIcon size={26} color="var(--text-3)" strokeWidth={1.5} />
            <span>收集箱是空的，脑袋里想到什么就先丢进来</span>
          </div>
        ) : (
          inbox.map((item) => (
            <div className="item" key={item.id}>
              <span />
              <div>
                <p>{item.text}</p>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{relativeTime(item.createdAt)}</p>
              </div>
              <div className="inbox-item-actions">
                <button className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 5 }} onClick={() => { convertInboxToTask(item.id); setView("tasks"); }}>
                  转为任务 <ArrowRight size={13} />
                </button>
                <button className="danger" style={{ padding: "4px 10px" }} onClick={() => removeInbox(item.id)}>删除</button>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
    </RixiaWorkspacePage>
  );
}
