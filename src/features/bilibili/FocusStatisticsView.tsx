import { useMemo } from "react";
import { Flame, Target, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useFocusTimer } from "./useFocusTimer";
import { FocusSessionStatus } from "../../lib/bilibili/focusSessionModel";
import type { FullFocusSession } from "../../lib/bilibili/focusSessionModel";

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h${minutes}m`;
  return `${minutes}m`;
}

function formatDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(key: string): string {
  const parts = key.split("-");
  return `${parts[1]}/${parts[2]}`;
}

interface DailyTrend {
  dayKey: string;
  label: string;
  focusedMs: number;
  sessionCount: number;
}

interface StatisticsData {
  totalMs: number;
  totalSessions: number;
  completedSessions: number;
  endedEarlySessions: number;
  currentStreak: number;
  longestStreak: number;
  dailyTrend: DailyTrend[];
}

function computeStatistics(history: FullFocusSession[]): StatisticsData {
  const dailyMap: Record<string, { focusedMs: number; sessionCount: number }> = {};
  let totalMs = 0;
  let completedSessions = 0;
  let endedEarlySessions = 0;

  for (const s of history) {
    if (!s.finishedAt) continue;
    const dayKey = s.finishedAt.slice(0, 10);
    if (!dailyMap[dayKey]) dailyMap[dayKey] = { focusedMs: 0, sessionCount: 0 };
    dailyMap[dayKey]!.focusedMs += s.accumulatedFocusMs;
    dailyMap[dayKey]!.sessionCount += 1;
    totalMs += s.accumulatedFocusMs;
    if (s.status === FocusSessionStatus.completed) completedSessions++;
    else if (s.status === FocusSessionStatus.endedEarly) endedEarlySessions++;
  }

  const days = Object.keys(dailyMap).sort();
  let longestStreak = 0;
  let running = 0;
  let prev: string | null = null;
  for (const day of days) {
    if (prev) {
      const prevDate = new Date(prev);
      const currDate = new Date(day);
      const gap = (currDate.getTime() - prevDate.getTime()) / 86400000;
      if (gap === 1) running += 1;
      else running = 1;
    } else {
      running = 1;
    }
    longestStreak = Math.max(longestStreak, running);
    prev = day;
  }

  let currentStreak = 0;
  let cursor = formatDayKey(new Date());
  while (dailyMap[cursor]) {
    currentStreak += 1;
    const d = new Date(cursor);
    d.setDate(d.getDate() - 1);
    cursor = formatDayKey(d);
  }

  const trend: DailyTrend[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = formatDayKey(d);
    const data = dailyMap[key];
    trend.push({
      dayKey: key,
      label: formatDayLabel(key),
      focusedMs: data?.focusedMs ?? 0,
      sessionCount: data?.sessionCount ?? 0,
    });
  }

  return {
    totalMs,
    totalSessions: history.length,
    completedSessions,
    endedEarlySessions,
    currentStreak,
    longestStreak,
    dailyTrend: trend,
  };
}

export function FocusStatisticsView() {
  const timer = useFocusTimer();
  const stats = useMemo(() => computeStatistics(timer.history), [timer.history]);
  const maxDailyMs = Math.max(1, ...stats.dailyTrend.map((d) => d.focusedMs));

  return (
    <div className="stack">
      <section className="card">
        <h2>专注统计</h2>
        <div className="focus-stats-grid">
          <div className="focus-stat-item">
            <Clock size={18} color="var(--text-3)" />
            <strong style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{formatDuration(stats.totalMs)}</strong>
            <span className="muted" style={{ fontSize: 12 }}>总时长</span>
          </div>
          <div className="focus-stat-item">
            <Target size={18} color="var(--text-3)" />
            <strong style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{stats.totalSessions}</strong>
            <span className="muted" style={{ fontSize: 12 }}>总次数</span>
          </div>
          <div className="focus-stat-item">
            <CheckCircle2 size={18} color="var(--good)" />
            <strong style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{stats.completedSessions}</strong>
            <span className="muted" style={{ fontSize: 12 }}>完成</span>
          </div>
          <div className="focus-stat-item">
            <XCircle size={18} color="var(--danger)" />
            <strong style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{stats.endedEarlySessions}</strong>
            <span className="muted" style={{ fontSize: 12 }}>提前结束</span>
          </div>
          <div className="focus-stat-item">
            <Flame size={18} color="var(--accent)" />
            <strong style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{stats.currentStreak}</strong>
            <span className="muted" style={{ fontSize: 12 }}>当前连续（天）</span>
          </div>
          <div className="focus-stat-item">
            <Flame size={18} color="var(--text-2)" />
            <strong style={{ fontSize: 20, fontVariantNumeric: "tabular-nums" }}>{stats.longestStreak}</strong>
            <span className="muted" style={{ fontSize: 12 }}>最长连续（天）</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>近 7 天</h2>
        <div className="focus-trend-chart">
          {stats.dailyTrend.map((d) => (
            <div key={d.dayKey} className="focus-trend-bar-col">
              <div className="focus-trend-bar-track">
                <div
                  className="focus-trend-bar"
                  style={{ height: `${Math.max(2, (d.focusedMs / maxDailyMs) * 100)}%` }}
                  title={formatDuration(d.focusedMs)}
                />
              </div>
              <span className="muted" style={{ fontSize: 11 }}>{d.label}</span>
              <span className="muted" style={{ fontSize: 10 }}>
                {d.focusedMs > 0 ? formatDuration(d.focusedMs) : "—"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>历史记录</h2>
        {timer.history.length === 0 ? (
          <p className="muted">还没有历史记录</p>
        ) : (
          <ul className="focus-history-list">
            {timer.history.map((s) => (
              <li key={s.id} className="focus-history-item">
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 550, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.goal}
                  </p>
                  <p className="muted" style={{ fontSize: 12 }}>
                    {s.finishedAt ? s.finishedAt.slice(0, 16).replace("T", " ") : ""}
                    {" "}<span style={{ color: s.status === FocusSessionStatus.completed ? "var(--good)" : "var(--danger)" }}>
                      {s.status === FocusSessionStatus.completed ? "完成" : "提前结束"}
                    </span>
                    {" "}<span style={{ color: "var(--text)" }}>{formatDuration(s.accumulatedFocusMs)}</span>
                    {s.interruptions.length > 0 && ` · 打断 ${s.interruptions.length}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

