import { useEffect, useState } from "react";
import { todayKey } from "./time";

function msUntilNextLocalMidnight(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 5, 0);
  return Math.max(250, next.getTime() - now.getTime());
}

export function useCalendarDay(): string {
  const [day, setDay] = useState(() => todayKey());

  useEffect(() => {
    let timer: number | undefined;
    const sync = () => {
      const next = todayKey();
      setDay((current) => (current === next ? current : next));
    };
    const arm = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sync();
        arm();
      }, msUntilNextLocalMidnight());
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        sync();
        arm();
      }
    };
    sync();
    arm();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", sync);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", sync);
    };
  }, []);

  // A state update (for example submitting a task) can happen immediately
  // after local midnight, before the scheduled timeout gets a chance to run.
  // Return the current key during that render so the interaction reflects the
  // new calendar day without waiting for another timer tick.
  const current = todayKey();
  return current === day ? day : current;
}
