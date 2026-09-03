import { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useOverlayInteraction } from "../lib/overlayStack";
import type { HabitFrequency, HabitItem } from "../types";

const PRESET_COLORS = ["#0a84ff", "#3f8f5f", "#d97773", "#7c6cd1", "#e0a040", "#38bdf8", "#e85d4a", "#8fb8d8"];

/**
 * 习惯频率编辑器。借鉴自 Loop Habit Tracker 的频率类型选择 UX：
 * 每日 / 每周 N 次 / 每 N 天 1 次。同时支持每个习惯的颜色标记。
 */
export function HabitFrequencyEditor({ habit, onClose }: { habit: HabitItem; onClose: () => void }) {
  const updateHabitFrequency = useAppStore((state) => state.updateHabitFrequency);
  const updateHabitColor = useAppStore((state) => state.updateHabitColor);
  // 全屏编辑器也登记浮层栈：系统返回/Escape 先关编辑器，而不是丢掉编辑状态退回上级。
  useOverlayInteraction(true, onClose);
  const [type, setType] = useState<HabitFrequency["type"]>(habit.frequency?.type ?? "daily");
  const [weeklyTarget, setWeeklyTarget] = useState(
    habit.frequency?.type === "weekly-count" ? habit.frequency.target : 3,
  );
  const [intervalDays, setIntervalDays] = useState(
    habit.frequency?.type === "interval-days" ? habit.frequency.interval : 2,
  );
  const [color, setColor] = useState<string | undefined>(habit.color);

  function apply() {
    if (type === "daily") {
      updateHabitFrequency(habit.id, { type: "daily" });
    } else if (type === "weekly-count") {
      updateHabitFrequency(habit.id, { type: "weekly-count", target: Math.max(1, Math.min(7, weeklyTarget)) });
    } else {
      updateHabitFrequency(habit.id, { type: "interval-days", interval: Math.max(1, Math.min(365, intervalDays)) });
    }
    updateHabitColor(habit.id, color);
    onClose();
  }

  return (
    <div className="habit-editor-overlay" role="dialog" aria-label="编辑习惯频率">
      <div className="habit-editor">
        <h3>{habit.title}</h3>

        <div className="segmented" role="tablist" aria-label="频率类型">
          <button
            role="tab"
            aria-selected={type === "daily"}
            className={type === "daily" ? "segmented-item active" : "segmented-item"}
            onClick={() => setType("daily")}
          >每日</button>
          <button
            role="tab"
            aria-selected={type === "weekly-count"}
            className={type === "weekly-count" ? "segmented-item active" : "segmented-item"}
            onClick={() => setType("weekly-count")}
          >每周 N 次</button>
          <button
            role="tab"
            aria-selected={type === "interval-days"}
            className={type === "interval-days" ? "segmented-item active" : "segmented-item"}
            onClick={() => setType("interval-days")}
          >每 N 天</button>
        </div>

        {type === "weekly-count" && (
          <label className="field-row">
            <span>每周目标次数</span>
            <input
              type="number"
              min={1}
              max={7}
              value={weeklyTarget}
              onChange={(e) => setWeeklyTarget(Number(e.target.value) || 1)}
              className="field"
              style={{ width: 80 }}
            />
          </label>
        )}
        {type === "interval-days" && (
          <label className="field-row">
            <span>间隔天数</span>
            <input
              type="number"
              min={1}
              max={365}
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value) || 1)}
              className="field"
              style={{ width: 80 }}
            />
          </label>
        )}

        <div className="field-row">
          <span>颜色</span>
          <div className="color-row">
            <button
              type="button"
              className={color === undefined ? "color-swatch active" : "color-swatch"}
              onClick={() => setColor(undefined)}
              aria-label="跟随强调色"
              title="跟随强调色"
              style={{ background: "var(--accent)" }}
            />
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={color === c ? "color-swatch active" : "color-swatch"}
                onClick={() => setColor(c)}
                aria-label={`选择颜色 ${c}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <div className="habit-editor-actions">
          <button className="ghost-btn compact" type="button" onClick={onClose}>取消</button>
          <button className="primary compact" type="button" onClick={apply}>保存</button>
        </div>
      </div>
    </div>
  );
}
