import { FormEvent, useState } from "react";
import { daysUntil, formatDateLabel } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

export function CountdownsView() {
  const { countdowns, addCountdown, removeCountdown } = useAppStore();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    addCountdown(title, date);
    setTitle("");
    setDate("");
  }

  return (
    <div className="stack">
      <section className="card">
        <form className="stack" onSubmit={handleSubmit}>
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：研究生考试" />
          <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="primary" type="submit">添加倒计时</button>
        </form>
      </section>
      <section className="card">
        {countdowns.length === 0 ? (
          <p className="empty">还没有倒计时</p>
        ) : (
          [...countdowns]
            .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))
            .map((item) => {
              const days = daysUntil(item.date);
              const label = days > 0 ? `还有 ${days} 天` : days === 0 ? "就是今天" : `已过去 ${Math.abs(days)} 天`;
              return (
                <div className="item" key={item.id}>
                  <span />
                  <div>
                    <p>{item.title}</p>
                    <p className="muted">{formatDateLabel(item.date)} · {label}</p>
                  </div>
                  <button className="danger" onClick={() => removeCountdown(item.id)}>删除</button>
                </div>
              );
            })
        )}
      </section>
    </div>
  );
}
