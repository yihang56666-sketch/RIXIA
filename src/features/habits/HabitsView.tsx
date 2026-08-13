import { QuickAdd } from "../../components/QuickAdd";
import { habitStreak, todayKey } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

export function HabitsView() {
  const { habits, addHabit, toggleHabitToday, removeHabit } = useAppStore();
  const today = todayKey();

  return (
    <div className="stack">
      <section className="card">
        <QuickAdd placeholder="添加一个每天想坚持的习惯" button="添加习惯" onSubmit={addHabit} />
      </section>
      <section className="card">
        {habits.length === 0 ? (
          <p className="empty">还没有习惯记录</p>
        ) : (
          habits.map((item) => {
            const checked = item.checkedDates.includes(today);
            return (
              <div className="item" key={item.id}>
                <button className={checked ? "check on" : "check"} onClick={() => toggleHabitToday(item.id)} />
                <div>
                  <p>{item.title}</p>
                  <p className="muted">连续 {habitStreak(item.checkedDates)} 天</p>
                </div>
                <button className="danger" onClick={() => removeHabit(item.id)}>
                  删除
                </button>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
