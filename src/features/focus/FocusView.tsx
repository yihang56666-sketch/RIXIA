import { useEffect, useState } from "react";
import { formatTime } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

const PRESETS = [25, 15, 5];

export function FocusView() {
  const { focusMinutes, setFocusMinutes } = useAppStore();
  const [seconds, setSeconds] = useState(focusMinutes * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setSeconds(focusMinutes * 60);
    setRunning(false);
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

  return (
    <div className="stack">
      <section className="card focus-face">
        <p className="eyebrow">专注计时</p>
        <div className="hero-number">{formatTime(seconds)}</div>
        <div className="row" style={{ marginTop: 18 }}>
          {PRESETS.map((item) => (
            <button key={item} className={item === focusMinutes ? "chip active" : "chip"} onClick={() => setFocusMinutes(item)}>
              {item} 分钟
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="primary" onClick={() => setRunning((value) => !value)}>
            {running ? "暂停" : seconds === 0 ? "重新开始" : "开始专注"}
          </button>
        </div>
      </section>
    </div>
  );
}
