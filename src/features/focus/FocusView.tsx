import { Coffee, Minus, Plus, RotateCcw, SkipForward, Square, Timer, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { playChime } from "../../lib/chime";
import { NOISE_OPTIONS, setAmbienceVolume, startAmbience, stopAmbience, type NoiseKind } from "../../lib/noise";
import { focusMinutesByDay } from "../../lib/stats";
import { formatTime, lastNDates, todayKey, weekdayLabel } from "../../lib/time";
import { RixiaWorkspacePage } from "../bilibili/RixiaWorkspacePage";
import { useAppStore } from "../../store/useAppStore";
import { requestWakeLock } from "../../lib/wakeLock";
import { Capacitor } from "@capacitor/core";
import { createFocusNotificationService, nativeFocusNotification } from "../../lib/focusNotifications";

const focusNotificationService = createFocusNotificationService(
  Capacitor.getPlatform() === "android" ? nativeFocusNotification : undefined,
);

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
  // 计时状态以"锚点时间戳"为唯一真源（endsAt / countupStart），
  // 并镜像到 store 的 activeFocus —— 切换视图或重启后都能精确恢复，
  // 后台标签页被节流也不会产生累计漂移。
  const [mode, setMode] = useState<Mode>(() => activeFocus?.mode ?? "countdown");
  const [phase, setPhase] = useState<Phase>(() => activeFocus?.phase ?? "focus");
  const endsAtRef = useRef<number | null>(
    activeFocus?.mode === "countdown" && typeof activeFocus?.endsAtMs === "number" ? activeFocus.endsAtMs : null,
  );
  const countupBaseRef = useRef<number>(
    activeFocus?.mode === "countup" ? (activeFocus?.countupElapsedMs ?? 0) : 0,
  );
  const countupStartRef = useRef<number | null>(
    activeFocus?.mode === "countup" && activeFocus?.running && typeof activeFocus?.countupStartedAtMs === "number"
      ? activeFocus.countupStartedAtMs
      : null,
  );
  const startedAtRef = useRef<string>(activeFocus?.startedAt ?? "");
  const [seconds, setSeconds] = useState<number>(() => {
    if (activeFocus?.mode !== "countdown") return focusMinutes * 60;
    if (activeFocus.running && endsAtRef.current != null) {
      return Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
    }
    return activeFocus.remainingSeconds ?? focusMinutes * 60;
  });
  const [upSeconds, setUpSeconds] = useState<number>(() => {
    if (activeFocus?.mode !== "countup") return 0;
    if (activeFocus.running && countupStartRef.current != null) {
      return Math.floor((countupBaseRef.current + Date.now() - countupStartRef.current) / 1000);
    }
    return Math.floor(countupBaseRef.current / 1000);
  });
  const [active, setActive] = useState<boolean>(() => Boolean(activeFocus?.running));
  const [completedRounds, setCompletedRounds] = useState<number>(() => activeFocus?.completedRounds ?? 0);
  const [noiseKind, setNoiseKind] = useState<NoiseKind | null>(null);
  const [noiseVolume, setNoiseVolume] = useState(0.4);
  const releaseWakeLock = useRef<(() => void) | null>(null);
  const autoStartTimerRef = useRef<number | null>(null);
  const today = todayKey();

  const running = active && mode === "countdown";
  const upRunning = active && mode === "countup";
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  function persistSnapshot(options: {
    mode: Mode;
    phase: Phase;
    active: boolean;
    remainingSeconds: number;
    completedRounds: number;
  }) {
    const startedAt = startedAtRef.current || new Date().toISOString();
    startedAtRef.current = startedAt;
    setActiveFocus({
      startedAt,
      mode: options.mode,
      phase: options.phase,
      running: options.active,
      endsAtMs: options.active && options.mode === "countdown" ? endsAtRef.current : null,
      remainingSeconds:
        options.mode === "countdown" && !options.active ? options.remainingSeconds : undefined,
      countupStartedAtMs:
        options.mode === "countup" && options.active ? countupStartRef.current : null,
      countupElapsedMs:
        options.mode === "countup"
          ? (countupStartRef.current != null
              ? countupBaseRef.current + (Date.now() - countupStartRef.current)
              : countupBaseRef.current)
          : 0,
      completedRounds: options.completedRounds,
    });
  }

  function clearPersistedSnapshot() {
    setActiveFocus(null);
    startedAtRef.current = "";
  }

  const phaseMinutes =
    phase === "focus" ? focusMinutes
    : phase === "short-break" ? focusRounds.shortBreakMinutes
    : focusRounds.longBreakMinutes;
  const phaseTotal = phaseMinutes * 60;
  const isBreak = phase !== "focus";

  // 首次挂载不执行"时长变化即重置"，否则会覆盖恢复出来的暂停进度。
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (phase !== "focus" || mode !== "countdown") return;
    if (activeRef.current) return; // 运行中改时长不打断当前回合（控件已禁用）
    endsAtRef.current = null;
    setSeconds(focusMinutes * 60);
  }, [focusMinutes, phase, mode]);

  // 倒计时：锚定 endsAt 计算，不受后台标签页节流影响
  useEffect(() => {
    if (!running) return;
    const sync = () => {
      if (endsAtRef.current == null) return;
      setSeconds(Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000)));
    };
    sync();
    const timer = window.setInterval(sync, 250);
    return () => window.clearInterval(timer);
  }, [running]);

  // 正计时：同样锚定开始时间戳
  useEffect(() => {
    if (!upRunning) return;
    const sync = () => {
      const elapsedMs = countupBaseRef.current
        + (countupStartRef.current != null ? Date.now() - countupStartRef.current : 0);
      setUpSeconds(Math.floor(elapsedMs / 1000));
    };
    sync();
    const timer = window.setInterval(sync, 250);
    return () => window.clearInterval(timer);
  }, [upRunning]);

  // 屏幕常亮：计时运行期间申请，停止时释放。
  // 浏览器在页面隐藏时会自动释放 sentinel，回到前台且仍在计时则重新申请；
  // 申请是异步的，期间若已暂停/卸载，拿到句柄后立即释放（避免泄漏常亮）。
  useEffect(() => {
    const acquire = () => {
      void requestWakeLock().then((release) => {
        if (!release) return;
        if (!activeRef.current || document.visibilityState !== "visible") {
          release();
          return;
        }
        releaseWakeLock.current?.();
        releaseWakeLock.current = release;
      });
    };
    if (activeRef.current) acquire();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (activeRef.current && !releaseWakeLock.current) acquire();
      } else {
        // 隐藏时浏览器会自动释放；这里同步清空句柄以便回前台重新申请
        releaseWakeLock.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      releaseWakeLock.current?.();
      releaseWakeLock.current = null;
    };
  }, []);

  // 计时启动/暂停的常规路径：active 翻转时申请/释放常亮。
  // 上面的 effect 只在挂载/可见性变化时介入，从 UI 点"开始专注"走的是这里。
  useEffect(() => {
    if (!active) {
      releaseWakeLock.current?.();
      releaseWakeLock.current = null;
      return;
    }
    if (document.visibilityState !== "visible") return; // 回前台时由 visibilitychange 补申请
    void requestWakeLock().then((release) => {
      if (!release) return;
      if (!activeRef.current || document.visibilityState !== "visible") {
        release();
        return;
      }
      releaseWakeLock.current?.();
      releaseWakeLock.current = release;
    });
  }, [active]);

  // 离开页面时停止氛围音
  useEffect(() => () => stopAmbience(), []);

  // 卸载时清掉"自动开始休息"的挂起定时器：跳过休息/离开页面后不得自行启动下一回合
  useEffect(() => () => {
    if (autoStartTimerRef.current != null) window.clearTimeout(autoStartTimerRef.current);
  }, []);

  // 回合结束：专注 → 记录并自动进入休息；短休息 N 次后进入长休息
  useEffect(() => {
    if (!running || seconds > 0) return;
    endsAtRef.current = null;
    setActive(false);
    playChime();
    if (phase === "focus") {
      addFocusSession(focusMinutes);
      void focusNotificationService.showFocusCompleted("专注完成", `${focusMinutes} 分钟专注已完成，休息一下吧`);
      clearPersistedSnapshot();
      const newCompleted = completedRounds + 1;
      setCompletedRounds(newCompleted);
      const isLongBreak = newCompleted % focusRounds.longBreakEvery === 0;
      const nextPhase: Phase = isLongBreak ? "long-break" : "short-break";
      const nextSeconds = (isLongBreak ? focusRounds.longBreakMinutes : focusRounds.shortBreakMinutes) * 60;
      setPhase(nextPhase);
      setSeconds(nextSeconds);
      if (nextSeconds > 0) {
        autoStartTimerRef.current = window.setTimeout(() => {
          autoStartTimerRef.current = null;
          endsAtRef.current = Date.now() + nextSeconds * 1000;
          setActive(true);
          persistSnapshot({ mode, phase: nextPhase, active: true, remainingSeconds: nextSeconds, completedRounds: newCompleted });
        }, 400);
      }
    } else {
      setPhase("focus");
      setSeconds(focusMinutes * 60);
      clearPersistedSnapshot();
    }
  }, [seconds, running, phase, mode, focusMinutes, addFocusSession, completedRounds, focusRounds]);

  function toggleNoise(kind: NoiseKind) {
    if (noiseKind === kind) {
      stopAmbience();
      setNoiseKind(null);
    } else {
      startAmbience(kind, noiseVolume);
      setNoiseKind(kind);
    }
  }

  function stopNoise() {
    stopAmbience();
    setNoiseKind(null);
  }

  function changeNoiseVolume(value: number) {
    const clamped = Math.max(0, Math.min(1, value));
    setNoiseVolume(clamped);
    setAmbienceVolume(clamped);
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (autoStartTimerRef.current != null) {
      window.clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
    endsAtRef.current = null;
    countupStartRef.current = null;
    countupBaseRef.current = 0;
    setActive(false);
    setPhase("focus");
    setSeconds(focusMinutes * 60);
    setUpSeconds(0);
    setMode(next);
    clearPersistedSnapshot();
  }

  function toggleCountdown() {
    if (running) {
      const remaining = endsAtRef.current != null
        ? Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000))
        : seconds;
      endsAtRef.current = null;
      setActive(false);
      setSeconds(remaining);
      persistSnapshot({ mode, phase, active: false, remainingSeconds: remaining, completedRounds });
    } else {
      endsAtRef.current = Date.now() + Math.max(1, seconds) * 1000;
      setActive(true);
      persistSnapshot({ mode, phase, active: true, remainingSeconds: seconds, completedRounds });
    }
  }

  function toggleCountUp() {
    if (upRunning) {
      countupBaseRef.current += countupStartRef.current != null ? Date.now() - countupStartRef.current : 0;
      countupStartRef.current = null;
      setActive(false);
      persistSnapshot({ mode, phase, active: false, remainingSeconds: seconds, completedRounds });
    } else {
      countupStartRef.current = Date.now();
      setActive(true);
      persistSnapshot({ mode, phase, active: true, remainingSeconds: seconds, completedRounds });
    }
  }

  const finishingCountUpRef = useRef(false);

  function finishCountUp() {
    // 双击防抖：一次点击只记录一个回合
    if (finishingCountUpRef.current) return;
    finishingCountUpRef.current = true;
    const totalMs = countupBaseRef.current
      + (countupStartRef.current != null ? Date.now() - countupStartRef.current : 0);
    countupStartRef.current = null;
    countupBaseRef.current = 0;
    setActive(false);
    setUpSeconds(0);
    playChime();
    const minutes = Math.floor(totalMs / 60000);
    if (minutes > 0) addFocusSession(minutes);
    if (minutes > 0) void focusNotificationService.showFocusCompleted("专注完成", `${minutes} 分钟专注已记录`);
    clearPersistedSnapshot();
    finishingCountUpRef.current = false;
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
    // 跳过休息 / 重置：同时取消挂起的自动开始，避免下一回合自己跑起来
    if (autoStartTimerRef.current != null) {
      window.clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
    endsAtRef.current = null;
    setActive(false);
    setPhase("focus");
    setSeconds(focusMinutes * 60);
    clearPersistedSnapshot();
  }

  return (
    <RixiaWorkspacePage title="专注计时">
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
                disabled={running}
              >
                {item} 分钟
              </button>
            ))}
            <div className="step-control">
              <button onClick={() => adjust(-5)} aria-label="减少 5 分钟" disabled={running}><Minus size={15} /></button>
              <span className="step-value">{focusMinutes} 分钟</span>
              <button onClick={() => adjust(5)} aria-label="增加 5 分钟" disabled={running}><Plus size={15} /></button>
            </div>
          </div>
        )}
        {mode === "countdown" && isBreak && (
          <p className="muted" style={{ fontSize: 13 }}>建议离开屏幕，看看远处，喝口水</p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {mode === "countup" ? (
            <>
              <button className="primary compact" style={{ minWidth: 110 }} onClick={toggleCountUp}>
                {upRunning ? "暂停" : upSeconds === 0 ? "开始计时" : "继续"}
              </button>
              <button className="ghost-btn" onClick={finishCountUp} disabled={upSeconds === 0} title="结束并计入专注记录（满 1 分钟）">
                <Square size={15} /> 完成并记录
              </button>
            </>
          ) : isBreak ? (
            <>
              <button className="ghost-btn" onClick={toggleCountdown}>
                {running ? "暂停休息" : "继续休息"}
              </button>
              <button className="primary compact" onClick={reset}>
                <SkipForward size={15} /> 跳过休息
              </button>
            </>
          ) : (
            <>
              <button className="primary compact" style={{ minWidth: 120 }} onClick={toggleCountdown}>
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
          <button className="chip" onClick={stopNoise} style={{ order: 1 }}>
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
              <button onClick={() => adjust(-5)} aria-label="减少" disabled={running}><Minus size={13} /></button>
              <span className="step-value">{focusMinutes} 分</span>
              <button onClick={() => adjust(5)} aria-label="增加" disabled={running}><Plus size={13} /></button>
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
    </RixiaWorkspacePage>
  );
}
