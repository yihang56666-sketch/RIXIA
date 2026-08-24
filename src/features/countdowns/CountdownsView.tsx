import { FormEvent, useState } from "react";
import { Trash2 } from "lucide-react";
import { daysUntil, formatShortDate, todayKey } from "../../lib/time";
import { RixiaWorkspacePage } from "../bilibili/RixiaWorkspacePage";
import { useAppStore } from "../../store/useAppStore";

export function CountdownsView({ embedded = false }: { embedded?: boolean } = {}) {
  const { countdowns, addCountdown, removeCountdown } = useAppStore();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const today = todayKey();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    addCountdown(title, date);
    setTitle("");
    setDate("");
  }

  return (
    <RixiaWorkspacePage title="倒计时" embedded={embedded}>
    <div className="stack">
      <section className="card">
        <form className="stack" onSubmit={handleSubmit} style={{ gap: 10 }}>
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：研究生考试" />
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="primary compact" type="submit">添加倒计时</button>
        </form>
      </section>

      {countdowns.length === 0 ? (
        <section className="card">
          <p className="empty">还没有倒计时，记录一个重要的日子</p>
        </section>
      ) : (
        <div className="countdown-grid">
          {[...countdowns]
            .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))
            .map((item) => {
              const days = daysUntil(item.date, today);
              const past = days < 0;
              return (
                <article key={item.id} className={`card countdown-card${past ? " past" : ""}`}>
                  <div className="count-days">
                    {Math.abs(days)}
                    <small>{days === 0 ? "" : past ? "天前" : "天后"}</small>
                  </div>
                  <strong style={{ fontSize: 14.5 }}>{item.title}</strong>
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    {formatShortDate(item.date)} · {days === 0 ? "就是今天" : past ? "已过去" : "倒计时中"}
                  </span>
                  <button className="delete-icon" style={{ alignSelf: "flex-start", marginTop: 4 }} onClick={() => removeCountdown(item.id)} aria-label="删除倒计时" title="删除倒计时">
                    <Trash2 size={15} />
                  </button>
                </article>
              );
            })}
        </div>
      )}
    </div>
    </RixiaWorkspacePage>
  );
}
