import { useState } from "react";
import { ChevronDown, Flame, Trash2 } from "lucide-react";
import { Heatmap } from "../../components/Heatmap";
import { ProgressRing } from "../../components/ProgressRing";
import { QuickAdd } from "../../components/QuickAdd";
import { bestStreak, habitStreak, lastNDates, todayKey } from "../../lib/time";
import { habitStrength } from "../../lib/stats";
import { useAppStore } from "../../store/useAppStore";
import type { HabitItem } from "../../types";

function HabitCard({ habit, today }: { habit: HabitItem; today: string }) {
  const { toggleHabitToday, removeHabit } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const checked = habit.checkedDates.includes(today);
  const streak = habitStreak(habit.checkedDates, today);
  const best = bestStreak(habit.checkedDates);
  const strength = habitStrength(habit.checkedDates, lastNDates(30, today));
  const weekDates = lastNDates(7, today);

  return (
    <div className="item" style={{ display: "block", padding: "14px 2px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center" }}>
        <button
          className={checked ? "check on" : "check"}
          onClick={() => toggleHabitToday(habit.id)}
          aria-label={checked ? "取消今日打卡" : "今日打卡"}
        />
        <div style={{ minWidth: 0 }}>
          <p>{habit.title}</p>
          <div className="week-dots" style={{ marginTop: 6 }}>
            {weekDates.map((date) => (
              <span key={date} className={habit.checkedDates.includes(date) ? "week-dot on" : "week-dot"} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ProgressRing percent={strength} size={42} stroke={4.5}>
            <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{strength}</span>
          </ProgressRing>
          <span
            className="due-chip tone-today"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            title={`最长连续 ${best} 天`}
          >
            <Flame size={13} /> {streak} 天
          </span>
          <button className="delete-icon" onClick={() => removeHabit(habit.id)} aria-label="删除习惯" title="删除习惯">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="muted"
        style={{
          display: "flex", alignItems: "center", gap: 4, border: 0, background: "transparent",
          padding: 0, marginTop: 12, fontSize: 12.5,
        }}
      >
        <ChevronDown size={14} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.3s var(--ease-spring)" }} />
        {expanded ? "收起热力图" : "查看近 15 周"}
        <span style={{ color: "var(--text-3)" }}>· 30 天强度 {strength}% · 最长连续 {best} 天 · 共 {habit.checkedDates.length} 次</span>
      </button>
      {expanded && (
        <div style={{ marginTop: 10, animation: "fadeUp 0.35s var(--ease-out) both" }}>
          <Heatmap checkedDates={habit.checkedDates} today={today} weeks={15} />
        </div>
      )}
    </div>
  );
}

export function HabitsView() {
  const { habits, addHabit, toggleHabitToday } = useAppStore();
  const today = todayKey();
  const checkedCount = habits.filter((item) => item.checkedDates.includes(today)).length;

  return (
    <div className="stack">
      <section className="card">
        <QuickAdd placeholder="添加一个每天想坚持的习惯" onSubmit={addHabit} />
      </section>

      <section className="card">
        <div className="row" style={{ marginBottom: 6 }}>
          <div>
            <h2>今日打卡</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>
              {habits.length ? `今天已完成 ${checkedCount} / ${habits.length} 个习惯` : "从一个小习惯开始"}
            </p>
          </div>
          {habits.length > 0 && (
            <button
              className="ghost-btn"
              onClick={() => habits.filter((item) => !item.checkedDates.includes(today)).forEach((item) => toggleHabitToday(item.id))}
            >
              全部打卡
            </button>
          )}
        </div>
        {habits.length === 0 ? (
          <p className="empty">还没有习惯记录</p>
        ) : (
          habits.map((habit) => <HabitCard key={habit.id} habit={habit} today={today} />)
        )}
      </section>
    </div>
  );
}
