import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ProgressRing } from "../../components/ProgressRing";
import { formatTime, todayKey } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

const PRESETS = [25, 15, 5];

export function FocusView() {
  const { focusMinutes, setFocusMinutes, focusSessions, addFocusSession } = useAppStore();
  const [seconds, setSeconds] = useState(focusMinutes * 60);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const today = todayKey();

  useEffect(() => {
    setSeconds(focusMinutes * 60);
    setRunning(false);
    setFinished(false);
  }, [focusMinutes]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          setRunning(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (seconds !== 0 || finished) return;
    setFinished(true);
    addFocusSession(focusMinutes);
  }, [seconds, finished, focusMinutes, addFocusSession]);

  const total = focusMinutes * 60;
  const percent = Math.round((seconds / total) * 100);
  const todaySessions = focusSessions.filter((item) => item.date === today);
  const todayMinutes = todaySessions.reduce((sum, item) => sum + item.minutes, 0);
  const totalMinutes = focusSessions.reduce((sum, item) => sum + item.minutes, 0);

  function adjust(delta: number) {
    const next = Math.min(90, Math.max(5, focusMinutes + delta));
    setFocusMinutes(next);
  }

  return (
    <div className="stack">
      <section className={`card focus-face${finished ? " focus-done" : ""}`}>
        <p className="eyebrow">{finished ? "专注完成" : running ? "专注中" : "专注计时"}</p>
        <ProgressRing percent={percent} size={216} stroke={13} color={finished ? "var(--good)" : "var(--accent)"}>
          <div className="focus-time">
            {finished ? "🎉" : formatTime(seconds)}
            <small>{finished ? `完成了一个 ${focusMinutes} 分钟的回合` : running ? "保持节奏" : "准备开始"}</small>
          </div>
        </ProgressRing>

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

        <div style={{ display: "flex", gap: 10 }}>
          <button className="primary compact" style={{ minWidth: 120 }} onClick={() => {
            if (finished) {
              setSeconds(focusMinutes * 60);
              setFinished(false);
              return;
            }
            setRunning(!running);
          }}>
            {finished ? "再来一回合" : running ? "暂停" : seconds === total ? "开始专注" : "继续"}
          </button>
          <button className="ghost-btn" onClick={() => {
            setSeconds(focusMinutes * 60);
            setRunning(false);
            setFinished(false);
          }} aria-label="重置计时">
            <RotateCcw size={16} /> 重置
          </button>
        </div>
      </section>

      <section className="card">
        <h2>专注记录</h2>
        <div className="focus-stats" style={{ marginTop: 13 }}>
          <div className="focus-stat">
            <strong>{todaySessions.length}</strong>
            <span>今日回合</span>
          </div>
          <div className="focus-stat">
            <strong>{todayMinutes}</strong>
            <span>今日分钟</span>
          </div>
          <div className="focus-stat">
            <strong>{totalMinutes}</strong>
            <span>累计分钟</span>
          </div>
        </div>
        {focusSessions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {focusSessions.slice(0, 4).map((item) => (
              <div className="item" key={item.id} style={{ padding: "9px 2px" }}>
                <span />
                <p style={{ fontSize: 13.5 }}>{item.date === today ? "今天" : item.date} 的专注回合</p>
                <span className="muted" style={{ fontSize: 13 }}>{item.minutes} 分钟</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
