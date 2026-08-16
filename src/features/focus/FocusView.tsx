import { Coffee, Minus, Plus, RotateCcw, SkipForward, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { playChime } from "../../lib/chime";
import { focusMinutesByDay } from "../../lib/stats";
import { formatTime, lastNDates, todayKey, weekdayLabel } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";
import { requestWakeLock } from "../../lib/wakeLock";

const PRESETS = [25, 15, 5];
const BREAK_MINUTES = 5;

type Phase = "focus" | "break";

export function FocusView() {
  const {
    focusMinutes,
    setFocusMinutes,
    focusGoalMinutes,
    setFocusGoalMinutes,
    focusSessions,
    addFocusSession,
  } = useAppStore();
  const [phase, setPhase] = useState<Phase>("focus");
  const [seconds, setSeconds] = useState(focusMinutes * 60);
  const [running, setRunning] = useState(false);
  const releaseWakeLock = useRef<(() => void) | null>(null);
  const today = todayKey();

  const phaseTotal = (phase === "focus" ? focusMinutes : BREAK_MINUTES) * 60;

  useEffect(() => {
    if (phase !== "focus") return;
    setSeconds(focusMinutes * 60);
    setRunning(false);
  }, [focusMinutes, phase]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  // 屏幕常亮：计时运行期间申请，停止时释放
  useEffect(() => {
    if (running) {
      void requestWakeLock().then((release) => {
        releaseWakeLock.current = release;
      });
    } else {
      releaseWakeLock.current?.();
      releaseWakeLock.current = null;
    }
    return () => {
      releaseWakeLock.current?.();
      releaseWakeLock.current = null;
    };
  }, [running]);

  // 回合结束：专注 → 记录并自动进入休息；休息 → 就绪下一回合
  useEffect(() => {
    if (seconds !== 0 || !running) return;
    setRunning(false);
    playChime();
    if (phase === "focus") {
      addFocusSession(focusMinutes);
      setPhase("break");
      setSeconds(BREAK_MINUTES * 60);
      window.setTimeout(() => setRunning(true), 400);
    } else {
      setPhase("focus");
      setSeconds(focusMinutes * 60);
    }
  }, [seconds, running, phase, focusMinutes, addFocusSession]);

  const percent = Math.round((seconds / phaseTotal) * 100);
  const todaySessions = focusSessions.filter((item) => item.date === today);
  const todayMinutes = todaySessions.reduce((sum, item) => sum + item.minutes, 0);
  const totalMinutes = focusSessions.reduce((sum, item) => sum + item.minutes, 0);
  const goalPercent = Math.min(100, Math.round((todayMinutes / focusGoalMinutes) * 100));
  const weekDays = lastNDates(7, today);
  const weekMinutes = focusMinutesByDay(focusSessions, weekDays);
  const weekMax = Math.max(30, ...weekMinutes);

  function adjust(delta: number) {
    setFocusMinutes(Math.min(90, Math.max(5, focusMinutes + delta)));
  }

  function adjustGoal(delta: number) {
    setFocusGoalMinutes(focusGoalMinutes + delta);
  }

  function reset() {
    setRunning(false);
    setPhase("focus");
    setSeconds(focusMinutes * 60);
  }

  return (
    <div className="stack">
      <section className={`card focus-face${phase === "break" ? " focus-break" : ""}`}>
        <p className="eyebrow">
          {phase === "break" ? "休息一下" : running ? "专注中" : "专注计时"}
        </p>
        <ProgressRing
          percent={percent}
          size={216}
          stroke={13}
          color={phase === "break" ? "var(--good)" : "var(--accent)"}
        >
          <div className="focus-time">
            {phase === "break" && <Coffee size={22} style={{ marginBottom: 4 }} />}
            {formatTime(seconds)}
            <small>
              {phase === "break" ? "刚完成一个专注回合" : running ? "保持节奏" : "准备开始"}
            </small>
          </div>
        </ProgressRing>

        {phase === "focus" && (
          <div className="focus-presets">
            {PRESETS.map((item) => (
              <button
                key={item}
                className={item === focusMinutes ? "chip active" : "chip"}
                onClick={() => setFocusMinutes(item)}
              >
                {item} 分钟
              </button>
            ))}
            <div className="step-control">
              <button onClick={() => adjust(-5)} aria-label="减少 5 分钟"><Minus size={15} /></button>
              <span className="step-value">{focusMinutes} 分钟</span>
              <button onClick={() => adjust(5)} aria-label="增加 5 分钟"><Plus size={15} /></button>
            </div>
          </div>
        )}
        {phase === "break" && (
          <p className="muted" style={{ fontSize: 13 }}>建议离开屏幕，看看远处，喝口水</p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {phase === "break" ? (
            <>
              <button className="ghost-btn" onClick={() => setRunning(!running)}>
                {running ? "暂停休息" : "继续休息"}
              </button>
              <button className="primary compact" onClick={reset}>
                <SkipForward size={15} /> 跳过休息
              </button>
            </>
          ) : (
            <>
              <button className="primary compact" style={{ minWidth: 120 }} onClick={() => setRunning(!running)}>
                {running ? "暂停" : seconds === phaseTotal ? "开始专注" : "继续"}
              </button>
              <button className="ghost-btn" onClick={reset} aria-label="重置计时">
                <RotateCcw size={16} /> 重置
              </button>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="row" style={{ marginBottom: 13 }}>
          <div>
            <h2>今日目标</h2>
            <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>
              已专注 {todayMinutes} / {focusGoalMinutes} 分钟 · {todaySessions.length} 个回合
            </p>
          </div>
          <ProgressRing percent={goalPercent} size={58} stroke={6}>
            <strong style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{goalPercent}%</strong>
          </ProgressRing>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${goalPercent}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-deep))" }} />
        </div>
        <div className="step-control" style={{ marginTop: 12 }}>
          <button onClick={() => adjustGoal(-30)} aria-label="减少目标 30 分钟"><Minus size={15} /></button>
          <span className="step-value">目标 {focusGoalMinutes} 分钟/天</span>
          <button onClick={() => adjustGoal(30)} aria-label="增加目标 30 分钟"><Plus size={15} /></button>
        </div>
      </section>

      <section className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <h2>近 7 天专注</h2>
          <span className="muted" style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Timer size={14} /> 累计 {totalMinutes} 分钟
          </span>
        </div>
        <div className="bar-chart">
          {weekDays.map((date, index) => (
            <div key={date} className="bar-col" title={`${date} · ${weekMinutes[index]} 分钟`}>
              <div
                className={date === today ? "bar on" : "bar"}
                style={{ height: `${Math.max(4, (weekMinutes[index] / weekMax) * 96)}px` }}
              />
              <span className="bar-label">{weekdayLabel(new Date(`${date}T00:00:00`)).slice(1)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
