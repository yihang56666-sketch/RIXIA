import { useState } from "react";
import {
  BarChart3,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Timer,
  Trash2,
} from "lucide-react";
import { ProgressRing } from "../../components/ProgressRing";
import { useFocusTimer } from "./useFocusTimer";
import { FocusSessionStatus, FocusInterruptionKind } from "../../lib/bilibili/focusSessionModel";

const PRESET_MINUTES = [25, 45, 60];
const EXTEND_OPTIONS = [5, 15];

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function FocusDashboard({
  onOpenStatistics,
}: {
  onOpenStatistics: () => void;
}) {
  const timer = useFocusTimer();
  const [goal, setGoal] = useState("");
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [customMinutes, setCustomMinutes] = useState<number | null>(null);
  const [showInterruption, setShowInterruption] = useState(false);
  const [interruptionReason, setInterruptionReason] = useState("");

  if (!timer.ready) {
    return (
      <div className="stack">
        <section className="card"><p className="muted">加载中...</p></section>
      </div>
    );
  }

  const durationMs = (customMinutes ?? selectedMinutes) * 60_000;
  const canStart = goal.trim().length > 0 && !timer.hasActiveSession;

  async function handleStart() {
    if (!canStart) return;
    await timer.startFocus({ goal: goal.trim(), durationMs });
    setGoal("");
  }

  async function handleInterrupt() {
    await timer.interruptFocus({
      kind: FocusInterruptionKind.manualPause,
      reason: interruptionReason.trim() || "手动暂停",
    });
    setShowInterruption(false);
    setInterruptionReason("");
  }

  if (timer.hasActiveSession && timer.activeSession) {
    const s = timer.activeSession;
    const remaining = timer.remainingMs;
    const elapsed = timer.elapsedMs;
    const progress = timer.progress;
    return (
      <div className="stack">
        <section className="card focus-active">
          <div className="row" style={{ marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <p className="eyebrow">专注中</p>
              <h2 style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.goal}</h2>
              {s.sourceVideoTitle && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {s.sourceVideoTitle}
                  {s.sourcePartPageNumber ? ` P${s.sourcePartPageNumber}` : ""}
                </p>
              )}
            </div>
            <button className="ghost-btn compact" onClick={onOpenStatistics}>
              <BarChart3 size={15} /> 统计
            </button>
          </div>

          <div className="focus-timer-display">
            <ProgressRing percent={progress * 100} size={140} stroke={10}>
              <div>
                <strong style={{ fontSize: 28, fontVariantNumeric: "tabular-nums" }}>
                  {formatDuration(remaining)}
                </strong>
                <p className="muted" style={{ fontSize: 11 }}>剩余</p>
              </div>
            </ProgressRing>
            <div className="focus-timer-meta">
              <p className="muted" style={{ fontSize: 13 }}>
                已专注 <strong style={{ color: "var(--text)" }}>{formatDuration(elapsed)}</strong>
              </p>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                计划 <strong style={{ color: "var(--text)" }}>{formatDuration(s.plannedDurationMs)}</strong>
              </p>
              {s.interruptions.length > 0 && (
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  打断 {s.interruptions.length} 次
                </p>
              )}
            </div>
          </div>

          <div className="focus-controls">
            {s.status === FocusSessionStatus.running ? (
              <button className="primary compact" onClick={() => timer.pauseFocus()}>
                <Pause size={16} /> 暂停
              </button>
            ) : (
              <button className="primary compact" onClick={() => timer.resumeFocus()}>
                <Play size={16} /> 继续
              </button>
            )}
            {EXTEND_OPTIONS.map((m) => (
              <button
                key={m}
                className="ghost-btn compact"
                onClick={() => timer.extendFocus(m * 60_000)}
              >
                <Plus size={14} /> {m}分钟
              </button>
            ))}
            <button className="ghost-btn compact" onClick={() => setShowInterruption(true)}>
              <Square size={14} /> 打断
            </button>
            <button
              className="ghost-btn compact"
              onClick={() => timer.endFocusEarly("手动终止")}
              style={{ color: "var(--danger)" }}
            >
              <RotateCcw size={14} /> 终止
            </button>
          </div>

          {showInterruption && (
            <div className="focus-interruption-dialog">
              <input
                className="field"
                value={interruptionReason}
                onChange={(e) => setInterruptionReason(e.target.value)}
                placeholder="打断原因（可选）"
              />
              <div className="row">
                <button className="ghost-btn compact" onClick={() => setShowInterruption(false)}>取消</button>
                <button className="primary compact" onClick={handleInterrupt}>确认打断</button>
              </div>
            </div>
          )}
        </section>

        {timer.lastFinishedSession && (
          <section className="card">
            <div className="row">
              <h2>刚刚完成</h2>
              <button className="ghost-btn compact" onClick={() => timer.dismissLastFinishedSession()}>关闭</button>
            </div>
            <p>{timer.lastFinishedSession.goal}</p>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              专注 {formatDuration(timer.lastFinishedSession.accumulatedFocusMs)}
              {timer.lastFinishedSession.status === FocusSessionStatus.endedEarly && "（提前结束）"}
            </p>
            <button
              className="ghost-btn compact"
              onClick={() => timer.extendCompletedFocus(10 * 60_000)}
              style={{ marginTop: 8 }}
            >
              <Plus size={14} /> 续时 10 分钟
            </button>
          </section>
        )}

        <FocusHistoryList history={timer.history} onDelete={timer.deleteHistoryEntry} onClear={timer.clearHistory} />
      </div>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>开始专注</h2>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
          设定目标和时长，进入专注模式。
        </p>
        <input
          className="field"
          value={goal}
          onChange={(e) => setGoal(e.target.value.slice(0, 60))}
          placeholder="这轮专注要做什么？（如：复习高数极限）"
          style={{ marginTop: 10 }}
          maxLength={60}
        />
        <div className="segmented" style={{ marginTop: 10 }} role="tablist" aria-label="时长">
          {PRESET_MINUTES.map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={customMinutes == null && selectedMinutes === m}
              className={customMinutes == null && selectedMinutes === m ? "segmented-item active" : "segmented-item"}
              onClick={() => { setSelectedMinutes(m); setCustomMinutes(null); }}
            >
              {m} 分钟
            </button>
          ))}
          <button
            role="tab"
            aria-selected={customMinutes != null}
            className={customMinutes != null ? "segmented-item active" : "segmented-item"}
            onClick={() => setCustomMinutes(30)}
          >
            自定义
          </button>
        </div>
        {customMinutes != null && (
          <div className="field-row" style={{ marginTop: 10 }}>
            <span>分钟</span>
            <input
              type="number"
              className="field"
              style={{ width: 80 }}
              min={1}
              max={180}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 1)))}
            />
          </div>
        )}
        <button
          className="primary"
          onClick={handleStart}
          disabled={!canStart}
          style={{ marginTop: 14 }}
        >
          <Timer size={16} /> 开始专注
        </button>
      </section>

      <section className="card">
        <div className="row">
          <div>
            <h2>今日</h2>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              已专注 {formatDuration(timer.todayFocusedMs)} · 完成 {timer.todayCompletedCount} 次
            </p>
          </div>
          <button className="ghost-btn compact" onClick={onOpenStatistics}>
            <BarChart3 size={14} /> 统计
          </button>
        </div>
      </section>

      {timer.lastFinishedSession && (
        <section className="card">
          <div className="row">
            <h2>最近完成</h2>
            <button className="ghost-btn compact" onClick={() => timer.dismissLastFinishedSession()}>关闭</button>
          </div>
          <p>{timer.lastFinishedSession.goal}</p>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            专注 {formatDuration(timer.lastFinishedSession.accumulatedFocusMs)}
          </p>
        </section>
      )}

      <FocusHistoryList history={timer.history} onDelete={timer.deleteHistoryEntry} onClear={timer.clearHistory} />
    </div>
  );
}

function FocusHistoryList({
  history,
  onDelete,
  onClear,
}: {
  history: import("../../lib/bilibili/focusSessionModel").FullFocusSession[];
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  if (history.length === 0) return null;
  return (
    <section className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2>历史记录</h2>
        <button className="ghost-btn compact" onClick={onClear} style={{ color: "var(--danger)" }}>
          <Trash2 size={13} /> 清空
        </button>
      </div>
      <ul className="focus-history-list">
        {history.slice(0, 20).map((s) => (
          <li key={s.id} className="focus-history-item">
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.goal}
              </p>
              <p className="muted" style={{ fontSize: 12 }}>
                {s.finishedAt ? formatShortDate(s.finishedAt) : ""} · {formatDuration(s.accumulatedFocusMs)}
                {s.status === FocusSessionStatus.completed ? " ✓" : " ✗"}
                {s.interruptions.length > 0 ? ` · 打断 ${s.interruptions.length}` : ""}
              </p>
            </div>
            <button className="icon-button" onClick={() => onDelete(s.id)} aria-label="删除">
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

