import { Coffee, Minus, Plus, RotateCcw, SkipForward, Square, Timer, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { playChime } from "../../lib/chime";
import { NOISE_OPTIONS, setAmbienceVolume, startAmbience, stopAmbience, type NoiseKind } from "../../lib/noise";
import { focusMinutesByDay } from "../../lib/stats";
import { formatTime, lastNDates, todayKey, weekdayLabel } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";
import { requestWakeLock } from "../../lib/wakeLock";

const COUNTUP_LAP_SECONDS = 30 * 60;

type Phase = "focus" | "short-break" | "long-break";
type Mode = "countdown" | "countup";

export function FocusView() {
  const {
    focusMinutes,
    setFocusMinutes,
    focusGoalMinutes,
    setFocusGoalMinutes,
    focusSessions,
    addFocusSession,
    focusRounds,
    setFocusRounds,
    activeFocus,
    setActiveFocus,
  } = useAppStore();
  const [mode, setMode] = useState<Mode>("countdown");
  const [phase, setPhase] = useState<Phase>("focus");
  const [seconds, setSeconds] = useState(focusMinutes * 60);
  const [running, setRunning] = useState(false);
  const [upSeconds, setUpSeconds] = useState(0);
  const [upRunning, setUpRunning] = useState(false);
  const [completedRounds, setCompletedRounds] = useState(0);
  const [noiseKind, setNoiseKind] = useState<NoiseKind | null>(null);
  const [noiseVolume, setNoiseVolume] = useState(0.4);
  const releaseWakeLock = useRef<(() => void) | null>(null);
  const today = todayKey();

  const phaseMinutes =
    phase === "focus" ? focusMinutes
    : phase === "short-break" ? focusRounds.shortBreakMinutes
    : focusRounds.longBreakMinutes;
  const phaseTotal = phaseMinutes * 60;
  const active = running || upRunning;
  const isBreak = phase !== "focus";

  useEffect(() => {
    if (phase !== "focus" || mode !== "countdown") return;
    setSeconds(focusMinutes * 60);
    setRunning(false);
  }, [focusMinutes, phase, mode]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!upRunning) return;
    const timer = window.setInterval(() => {
      setUpSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [upRunning]);

  // 屏幕常亮：计时运行期间申请，停止时释放
  useEffect(() => {
    if (active) {
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
  }, [active]);

  // 离开页面时停止氛围音
  useEffect(() => () => stopAmbience(), []);

  // 回合结束：专注 → 记录并自动进入休息；短休息 N 次后进入长休息
  useEffect(() => {
    if (seconds !== 0 || !running) return;
    setRunning(false);
    playChime();
    if (phase === "focus") {
      addFocusSession(focusMinutes);
      setActiveFocus(null);
      const newCompleted = completedRounds + 1;
      setCompletedRounds(newCompleted);
      const isLongBreak = newCompleted % focusRounds.longBreakEvery === 0;
      const nextPhase: Phase = isLongBreak ? "long-break" : "short-break";
      const nextMinutes = isLongBreak ? focusRounds.longBreakMinutes : focusRounds.shortBreakMinutes;
      setPhase(nextPhase);
      setSeconds(nextMinutes * 60);
      window.setTimeout(() => setRunning(true), 400);
    } else {
      setPhase("focus");
      setSeconds(focusMinutes * 60);
      if (activeFocus) setActiveFocus({ ...activeFocus });
    }
  }, [seconds, running, phase, focusMinutes, addFocusSession, completedRounds, focusRounds, setActiveFocus, activeFocus]);

  function toggleNoise(kind: NoiseKind) {
    if (noiseKind === kind) {
      stopAmbience();
      setNoiseKind(null);
    } else {
      startAmbience(kind, noiseVolume);
      setNoiseKind(kind);
    }
  }

  function changeNoiseVolume(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    setNoiseVolume(clamped);
    setAmbienceVolume(clamped);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    setRunning(false);
    setUpRunning(false);
    setPhase("focus");
    setSeconds(focusMinutes * 60);
    setMode(next);
  }

  function finishCountUp() {
    setUpRunning(false);
    playChime();
    const minutes = Math.floor(upSeconds / 60);
    if (minutes > 0) addFocusSession(minutes);
    setUpSeconds(0);
  }

  const percent =
    mode === "countup"
      ? Math.round(((upSeconds % COUNTUP_LAP_SECONDS) / COUNTUP_LAP_SECONDS) * 100)
      : Math.round((seconds / phaseTotal) * 100);
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
      <section className={`card focus-face${isBreak && mode === "countdown" ? " focus-break" : ""}`}>
        <div className="segmented" style={{ width: "min(220px, 100%)", marginBottom: 4 }} role="tablist" aria-label="计时模式">
          <button className={mode === "countdown" ? "segment active" : "segment"} role="tab" aria-selected={mode === "countdown"} onClick={() => switchMode("countdown")}>
            番茄倒计时
          </button>
          <button className={mode === "countup" ? "segment active" : "segment"} role="tab" aria-selected={mode === "countup"} onClick={() => switchMode("countup")}>
            自由正计时
          </button>
        </div>

        <p className="eyebrow">
          {mode === "countup"
            ? upRunning ? "计时中" : "正计时"
            : isBreak ? (phase === "long-break" ? "长休息" : "休息一下") : running ? "专注中" : "专注计时"}
        </p>
        <ProgressRing
          percent={percent}
          size={216}
          stroke={13}
          color={isBreak && mode === "countdown" ? "var(--good)" : "var(--accent)"}
        >
          <div className="focus-time">
            {mode === "countup" ? formatTime(upSeconds) : (
              <>
                {isBreak && <Coffee size={22} style={{ marginBottom: 4 }} />}
                {formatTime(seconds)}
              </>
            )}
            <small>
              {mode === "countup"
                ? upRunning ? "按自己的节奏来" : "开始后随时可以结束"
                : isBreak ? "刚完成一个专注回合" : running ? "保持节奏" : "准备开始"}
            </small>
          </div>
        </ProgressRing>

        {mode === "countdown" && phase === "focus" && (
          <div className="focus-presets">
            {[25, 15, 5].map((item) => (
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
        {mode === "countdown" && isBreak && (
          <p className="muted" style={{ fontSize: 13 }}>建议离开屏幕，看看远处，喝口水</p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {mode === "countup" ? (
            <>
              <button className="primary compact" style={{ minWidth: 110 }} onClick={() => setUpRunning(!upRunning)}>
                {upRunning ? "暂停" : upSeconds === 0 ? "开始计时" : "继续"}
              </button>
              <button className="ghost-btn" onClick={finishCountUp} disabled={upSeconds === 0} title="结束并计入专注记录（满 1 分钟）">
                <Square size={15} /> 完成并记录
              </button>
            </>
          ) : isBreak ? (
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
        <div className="row" style={{ marginBottom: 12 }}>
          <div>
            <h2>专注氛围</h2>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>实时合成的环境音，离线可用</p>
          </div>
          <Volume2 size={17} color="var(--text-3)" />
        </div>
        <div className="noise-row">
          <button className="chip" onClick={() => toggleNoise("white")} style={{ order: 1 }}>
            停止
          </button>
          {NOISE_OPTIONS.map((option) => (
            <button
              key={option.key}
              className={noiseKind === option.key ? "chip active" : "chip"}
              onClick={() => toggleNoise(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <Volume2 size={15} color="var(--text-3)" />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(noiseVolume * 100)}
            className="noise-slider"
            onChange={(event) => changeNoiseVolume(Number(event.target.value) / 100)}
            aria-label="氛围音音量"
          />
          <span className="muted" style={{ fontSize: 12, minWidth: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(noiseVolume * 100)}%
          </span>
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
        <div className="row" style={{ marginBottom: 10 }}>
          <h2>回合循环</h2>
          <span className="muted" style={{ fontSize: 12.5 }}>
            每完成 {focusRounds.longBreakEvery} 个回合后长休息
          </span>
        </div>
        <div className="rounds-grid">
          <label className="field-row">
            <span>专注时长</span>
            <div className="step-control compact">
              <button onClick={() => setFocusMinutes(focusMinutes - 5)} aria-label="减少"><Minus size={13} /></button>
              <span className="step-value">{focusMinutes} 分</span>
              <button onClick={() => setFocusMinutes(focusMinutes + 5)} aria-label="增加"><Plus size={13} /></button>
            </div>
          </label>
          <label className="field-row">
            <span>短休息</span>
            <div className="step-control compact">
              <button onClick={() => setFocusRounds({ ...focusRounds, shortBreakMinutes: Math.max(0, focusRounds.shortBreakMinutes - 1) })} aria-label="减少"><Minus size={13} /></button>
              <span className="step-value">{focusRounds.shortBreakMinutes} 分</span>
              <button onClick={() => setFocusRounds({ ...focusRounds, shortBreakMinutes: focusRounds.shortBreakMinutes + 1 })} aria-label="增加"><Plus size={13} /></button>
            </div>
          </label>
          <label className="field-row">
            <span>长休息</span>
            <div className="step-control compact">
              <button onClick={() => setFocusRounds({ ...focusRounds, longBreakMinutes: Math.max(0, focusRounds.longBreakMinutes - 5) })} aria-label="减少"><Minus size={13} /></button>
              <span className="step-value">{focusRounds.longBreakMinutes} 分</span>
              <button onClick={() => setFocusRounds({ ...focusRounds, longBreakMinutes: focusRounds.longBreakMinutes + 5 })} aria-label="增加"><Plus size={13} /></button>
            </div>
          </label>
          <label className="field-row">
            <span>长休息间隔</span>
            <div className="step-control compact">
              <button onClick={() => setFocusRounds({ ...focusRounds, longBreakEvery: Math.max(1, focusRounds.longBreakEvery - 1) })} aria-label="减少"><Minus size={13} /></button>
              <span className="step-value">{focusRounds.longBreakEvery} 回合</span>
              <button onClick={() => setFocusRounds({ ...focusRounds, longBreakEvery: focusRounds.longBreakEvery + 1 })} aria-label="增加"><Plus size={13} /></button>
            </div>
          </label>
        </div>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          已完成 {completedRounds} 个专注回合 · 借鉴自 Super Productivity 的自动休息循环
        </p>
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
