/**
 * 专注数据页 — 1:1 React 移植自 FocuBili 的
 * focus_statistics_page.dart（1026 行）。
 *
 * 结构：范围切换 → 四项指标网格 → 折线趋势图 → 完成情况分析 →
 * 记录管理（搜索 / 状态筛选 / 排序 / 删除 / 清空）。
 * 宽屏（≥900px 且横向）双栏，手机单列。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTimer } from "./useFocusTimer";
import {
  FocusSessionStatus,
  hasBrowsableVideo,
  type FullFocusSession,
} from "../../lib/bilibili/focusSessionModel";
import {
  buildFocusStatisticsSnapshot,
  completionRate,
  FocusStatisticsRange,
  sessionCount,
  type FocusStatisticsSnapshot,
} from "../../lib/bilibili/focusStatisticsModel";
import { useAppStore } from "../../store/useAppStore";
import { M3Dialog, Mi, useM3Feedback } from "./m3";
import { FocusSharePreview } from "./FocusSharePreview";
import { buildFocusStatisticsShareText } from "../../lib/bilibili/focusShareService";

type StatusFilter = "all" | "completed" | "endedEarly";
type RecordOrder = "newest" | "oldest" | "longest";

const ORDER_LABEL: Record<RecordOrder, string> = {
  newest: "最新",
  oldest: "最早",
  longest: "时长最多",
};

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes} 分`;
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "--";
  const local = new Date(iso);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")} ${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
}

// ============ 趋势折线图（_FocusTrendPainter） ============

const PREFERRED_STEP_MINUTES = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 480, 720, 1440];

function trendAxisStepMinutes(maximumMs: number): number {
  const maximumMinutes = maximumMs <= 0 ? 1 : Math.ceil(maximumMs / 60_000);
  const target = Math.ceil(maximumMinutes / 3);
  for (const value of PREFERRED_STEP_MINUTES) {
    if (value >= target) return value;
  }
  return Math.ceil(target / 1440) * 1440;
}

function formatTrendAxisDuration(minutes: number): string {
  if (minutes === 0) return "0";
  if (minutes < 60) return `${minutes} 分`;
  if (minutes % 60 === 0) return `${minutes / 60} 时`;
  return `${(minutes / 60).toFixed(1)} 时`;
}

function adaptiveDateLabelIndexes(itemCount: number, availableWidth: number): number[] {
  if (itemCount <= 0) return [];
  if (itemCount === 1) return [0];
  const maximumLabels = Math.min(itemCount, Math.max(2, Math.floor(availableWidth / 42)));
  const step = Math.ceil((itemCount - 1) / (maximumLabels - 1));
  const indexes: number[] = [];
  for (let index = 0; index < itemCount; index += step) indexes.push(index);
  if (indexes[indexes.length - 1] !== itemCount - 1) indexes.push(itemCount - 1);
  return indexes;
}

function TrendLineChart({ snapshot }: { snapshot: FocusStatisticsSnapshot }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const trend = snapshot.dailyTrend;
    const width = canvas.clientWidth;
    const height = 170;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (trend.length === 0 || width <= 0 || height <= 0) return;

    const styles = getComputedStyle(document.documentElement);
    const lineColor = styles.getPropertyValue("--m3-primary").trim() || "#0b57d0";
    const gridColor = styles.getPropertyValue("--m3-outline-variant").trim() || "#c4c6d0";
    const labelColor = styles.getPropertyValue("--m3-on-surface-variant").trim() || "#43474e";

    const maximumMs = trend.reduce((current, item) => Math.max(current, item.focusedMs), 0);
    const verticalStepMinutes = trendAxisStepMinutes(maximumMs);
    const verticalMaximumMinutes = verticalStepMinutes * 3;
    const axisLabelStyle = "9px Roboto, sans-serif";

    // 最宽纵轴标签决定左边距。
    ctx.font = axisLabelStyle;
    const widestLabel = ctx.measureText(formatTrendAxisDuration(verticalMaximumMinutes)).width;
    const left = widestLabel + 12;
    const right = 4;
    const top = 8;
    const bottom = 28;
    const chartLeft = left;
    const chartRight = width - right;
    const chartTop = top;
    const chartBottom = height - bottom;
    const chartWidth = chartRight - chartLeft;
    const chartHeight = chartBottom - chartTop;

    // 网格 + 纵轴标签。
    ctx.strokeStyle = gridColor;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.fillStyle = labelColor;
    ctx.globalAlpha = 1;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let row = 0; row <= 3; row += 1) {
      const y = chartTop + (chartHeight * row) / 3;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y);
      ctx.lineTo(chartRight, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const minutes = verticalMaximumMinutes - verticalStepMinutes * row;
      ctx.fillText(formatTrendAxisDuration(minutes), chartLeft - 7, y);
    }

    // 数据点。
    const points = trend.map((item, index) => {
      const x = trend.length === 1 ? chartLeft + chartWidth / 2 : chartLeft + (chartWidth * index) / (trend.length - 1);
      const ratio = item.focusedMs / (verticalMaximumMinutes * 60_000);
      const clamped = Math.min(1, Math.max(0, ratio));
      return { x, y: chartBottom - chartHeight * clamped };
    });

    // 渐变填充。
    const areaPath = new Path2D();
    areaPath.moveTo(points[0]!.x, points[0]!.y);
    for (const point of points.slice(1)) areaPath.lineTo(point.x, point.y);
    areaPath.lineTo(points[points.length - 1]!.x, chartBottom);
    areaPath.lineTo(points[0]!.x, chartBottom);
    areaPath.closePath();
    const gradient = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
    gradient.addColorStop(0, lineColor + "47");
    gradient.addColorStop(1, lineColor + "05");
    ctx.fillStyle = gradient;
    ctx.fill(areaPath);

    // 折线。
    const linePath = new Path2D();
    linePath.moveTo(points[0]!.x, points[0]!.y);
    for (const point of points.slice(1)) linePath.lineTo(point.x, point.y);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(linePath);

    // 数据点圆心。
    ctx.fillStyle = lineColor;
    const dotRadius = trend.length === 7 ? 3.5 : 2;
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 抽样日期标签。
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const labelIndexes = adaptiveDateLabelIndexes(trend.length, chartWidth);
    for (const index of labelIndexes) {
      const date = new Date(trend[index]!.date);
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      const labelWidth = ctx.measureText(label).width;
      const x = Math.min(chartRight - labelWidth, Math.max(chartLeft, points[index]!.x - labelWidth / 2));
      ctx.fillText(label, x, chartBottom + 7);
    }
  }, [snapshot]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: 170, display: "block" }} aria-hidden="true" />;
}

// ============ 指标卡（_FocusMetricCard） ============

function MetricCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <section className="m3-card" style={{ padding: 16 }}>
      <Mi name={icon} className="fb-primary-color" />
      <p className="m3-body-md" style={{ marginTop: 12 }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{value}</p>
    </section>
  );
}

// ============ 主页面 ============

export function FocusStatisticsView() {
  const timer = useFocusTimer();
  const showMessage = useM3Feedback().showMessage;
  const openBilibiliVideoAt = useAppStore((state) => state.openBilibiliVideoAt);
  const setView = useAppStore((state) => state.setView);

  const [range, setRange] = useState<FocusStatisticsRange>(FocusStatisticsRange.sevenDays);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [order, setOrder] = useState<RecordOrder>("newest");
  const [keyword, setKeyword] = useState("");
  const [orderMenuOpen, setOrderMenuOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FullFocusSession | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showSharePreview, setShowSharePreview] = useState(false);

  const nowMs = Date.now();
  const snapshot = useMemo(
    () =>
      buildFocusStatisticsSnapshot({
        history: timer.history,
        range,
        nowMs,
        activeSession: timer.activeSession,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timer.history, timer.activeSession, range, timer.remainingMs],
  );

  const visibleHistory = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const rangeStart =
      range === FocusStatisticsRange.sevenDays
        ? startOfToday - 6 * 86_400_000
        : range === FocusStatisticsRange.thirtyDays
          ? startOfToday - 29 * 86_400_000
          : null;
    const visible = timer.history.filter((session) => {
      if (!session.finishedAt) return false;
      const finishedMs = new Date(session.finishedAt).getTime();
      if (rangeStart !== null && finishedMs < rangeStart) return false;
      if (statusFilter === "completed" && session.status !== FocusSessionStatus.completed) return false;
      if (statusFilter === "endedEarly" && session.status !== FocusSessionStatus.endedEarly) return false;
      if (query.length === 0) return true;
      return (
        session.goal.toLowerCase().includes(query) ||
        (session.sourceVideoTitle?.toLowerCase().includes(query) ?? false) ||
        (session.sourcePartTitle?.toLowerCase().includes(query) ?? false) ||
        (session.sourceBvid?.toLowerCase().includes(query) ?? false)
      );
    });
    const timeOf = (session: FullFocusSession) =>
      new Date(session.finishedAt ?? session.startedAt).getTime();
    visible.sort((left, right) => {
      if (order === "newest") return timeOf(right) - timeOf(left);
      if (order === "oldest") return timeOf(left) - timeOf(right);
      return right.accumulatedFocusMs - left.accumulatedFocusMs;
    });
    return visible;
  }, [timer.history, range, statusFilter, keyword, order]);

  const sevenDay = snapshot.dailyTrend.length === 7;
  const shareSummary = buildFocusStatisticsShareText({
    totalMs: snapshot.totalFocusedMs,
    totalSessions: sessionCount(snapshot),
    completedSessions: snapshot.completedCount,
    currentStreak: snapshot.currentStreakDays,
  });

  function openLinkedSession(session: FullFocusSession) {
    if (!hasBrowsableVideo(session)) return;
    openBilibiliVideoAt(
      session.sourceBvid!,
      session.sourceVideoTitle,
      session.sourcePartCid ?? 0,
      Math.floor((session.sourcePositionMs ?? 0) / 1000),
    );
  }

  function MetricBoard() {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <div style={{ flex: "1 1 calc(50% - 6px)", minWidth: 0 }}>
          <MetricCard icon="timer" label="专注总时长" value={formatDuration(snapshot.totalFocusedMs)} />
        </div>
        <div style={{ flex: "1 1 calc(50% - 6px)", minWidth: 0 }}>
          <MetricCard icon="check_circle" label="专注记录" value={`${sessionCount(snapshot)} 次`} />
        </div>
        <div style={{ flex: "1 1 calc(50% - 6px)", minWidth: 0 }}>
          <MetricCard icon="track_changes" label="按时完成率" value={`${Math.round(completionRate(snapshot) * 100)}%`} />
        </div>
        <div style={{ flex: "1 1 calc(50% - 6px)", minWidth: 0 }}>
          <MetricCard icon="calendar_today" label="投入天数" value={`${snapshot.focusDayCount} 天`} />
        </div>
      </div>
    );
  }

  function InsightCard() {
    return (
      <section className="m3-card" style={{ padding: 18 }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>完成情况</p>
        <div className="m3-linear-progress" style={{ marginTop: 12, minHeight: 8 }}>
          <div style={{ width: `${completionRate(snapshot) * 100}%` }} />
        </div>
        <p className="m3-body-md" style={{ marginTop: 8 }}>
          按时完成 {snapshot.completedCount} 次 · 提前结束 {snapshot.endedEarlyCount} 次 · 打断 {snapshot.interruptionCount} 次
        </p>
        <hr className="m3-divider" />
        <div className="m3-body-md" style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px" }}>
          <span>平均 {formatDuration(snapshot.averageFocusedMs)}</span>
          <span>最长 {formatDuration(snapshot.longestFocusedMs)}</span>
          <span>连续 {snapshot.currentStreakDays} 天</span>
          <span>关联视频 {snapshot.linkedVideoCount} 个</span>
        </div>
      </section>
    );
  }

  function TrendCard() {
    return (
      <section className="m3-card" style={{ padding: 18 }}>
        <p style={{ fontSize: 18, fontWeight: 700 }}>{sevenDay ? "近 7 天趋势" : "近 30 天趋势"}</p>
        <p className="m3-body-sm" style={{ marginTop: 4 }}>
          {snapshot.range === FocusStatisticsRange.all
            ? "全部指标使用完整历史，趋势图展示最近 30 天"
            : "折线表示每天实际投入的专注时间"}
        </p>
        <div style={{ marginTop: 16 }}>
          <TrendLineChart snapshot={snapshot} />
        </div>
      </section>
    );
  }

  function ActiveSessionCard() {
    if (!timer.activeSession) return null;
    return (
      <section className="m3-card" style={{ background: "var(--m3-primary-container)", color: "var(--m3-on-primary-container)" }}>
        <div className="m3-list-tile" style={{ cursor: "default" }}>
          <span className="m3-tile-leading"><Mi name="adjust" /></span>
          <span className="m3-tile-body">
            <span className="m3-title-md">当前专注已计入今日趋势</span>
            <span className="m3-body-sm">{timer.activeSession.goal}</span>
          </span>
        </div>
      </section>
    );
  }

  function RangeSelector() {
    return (
      <div className="m3-segmented" style={{ width: "100%" }}>
        {(
          [
            [FocusStatisticsRange.sevenDays, "7 天"],
            [FocusStatisticsRange.thirtyDays, "30 天"],
            [FocusStatisticsRange.all, "全部"],
          ] as Array<[FocusStatisticsRange, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            className={range === value ? "m3-segmented-item selected" : "m3-segmented-item"}
            style={{ flex: 1, justifyContent: "center" }}
            onClick={() => setRange(value)}
          >
            {label}
          </button>
        ))}
      </div>
    );
  }

  function renderRecordFilters() {
    return (
      <div>
        <div className="m3-field">
          <Mi name="search" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索目标、视频标题、分P或 BV 号"
          />
          {keyword.length > 0 && (
            <button className="m3-icon-btn" onClick={() => setKeyword("")} aria-label="清除搜索" title="清除搜索" style={{ width: 32, height: 32 }}>
              <Mi name="close" size={20} />
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, flex: 1 }}>
            {(
              [
                ["all", "全部"],
                ["completed", "按时完成"],
                ["endedEarly", "提前结束"],
              ] as Array<[StatusFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                className={statusFilter === value ? "m3-chip selected" : "m3-chip"}
                onClick={() => setStatusFilter(value)}
              >
                {statusFilter === value && <Mi name="check" size={18} />}
                {label}
              </button>
            ))}
          </div>
          <div className="m3-menu-anchor">
            <button className="m3-text-btn" onClick={() => setOrderMenuOpen((open) => !open)} aria-label="记录排序" title="记录排序">
              <Mi name="sort" size={18} /> {ORDER_LABEL[order]}
            </button>
            {orderMenuOpen && (
              <div className="m3-menu">
                {(Object.keys(ORDER_LABEL) as RecordOrder[]).map((value) => (
                  <button
                    key={value}
                    className="m3-menu-item"
                    onClick={() => {
                      setOrder(value);
                      setOrderMenuOpen(false);
                    }}
                  >
                    <Mi name={order === value ? "check_circle" : "circle"} size={18} />
                    {ORDER_LABEL[value]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function HistoryCard({ session }: { session: FullFocusSession }) {
    const completed = session.status === FocusSessionStatus.completed;
    return (
      <section className="m3-card">
        <div
          className="m3-list-tile"
          style={{ padding: "14px 6px 14px 16px", alignItems: "flex-start", cursor: hasBrowsableVideo(session) ? "pointer" : "default" }}
          onClick={() => openLinkedSession(session)}
        >
          <span className="m3-tile-leading" style={{ marginTop: 4 }}>
            <span className="m3-avatar"><Mi name={completed ? "check" : "stop"} size={20} /></span>
          </span>
          <span className="m3-tile-body">
            <span style={{ fontSize: 16, fontWeight: 700 }}>{session.goal}</span>
            <span className="m3-body-md" style={{ marginTop: 4 }}>
              {completed ? "按时完成" : "提前结束"} · {formatDuration(session.accumulatedFocusMs)} / {formatDuration(session.plannedDurationMs)}
            </span>
            <span className="m3-body-md" style={{ marginTop: 3 }}>{formatDateTime(session.finishedAt)}</span>
            {session.sourceVideoTitle && (
              <span className="m3-body-sm" style={{ marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                视频：{session.sourceVideoTitle}
                {session.sourcePartPageNumber != null && ` · P${session.sourcePartPageNumber}`}
                {session.sourcePartTitle && ` ${session.sourcePartTitle}`}
              </span>
            )}
            {session.interruptions.length > 0 && (
              <span className="m3-body-sm fb-tertiary-color" style={{ marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                打断 {session.interruptions.length} 次 · 最近原因：{session.interruptions[session.interruptions.length - 1]?.reason}
              </span>
            )}
            {session.terminationReason && (
              <span className="m3-body-sm" style={{ marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                终止原因：{session.terminationReason}
              </span>
            )}
          </span>
          <span className="m3-tile-trailing">
            <button
              className="m3-icon-btn"
              onClick={(event) => {
                event.stopPropagation();
                setPendingDelete(session);
              }}
              aria-label="删除记录"
              title="删除记录"
            >
              <Mi name="delete" />
            </button>
          </span>
        </div>
      </section>
    );
  }

  function OverviewPane() {
    return (
      <>
        <RangeSelector />
        {timer.activeSession && (
          <>
            <div style={{ height: 12 }} />
            <ActiveSessionCard />
          </>
        )}
        <div style={{ height: 12 }} />
        <MetricBoard />
        <div style={{ height: 12 }} />
        <TrendCard />
        <div style={{ height: 12 }} />
        <InsightCard />
      </>
    );
  }

  function renderHistoryPane() {
    return (
      <>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h1 style={{ flex: 1, fontSize: 20, fontWeight: 800 }}>专注记录管理</h1>
          <span className="m3-body-md">{visibleHistory.length} 条</span>
        </div>
        <div style={{ height: 10 }} />
        {renderRecordFilters()}
        <div style={{ height: 10 }} />
        {visibleHistory.length === 0 ? (
          <section className="m3-card" style={{ padding: 28, textAlign: "center" }}>
            <span className="m3-body-md">当前条件下没有专注记录</span>
          </section>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {visibleHistory.map((session) => (
              <HistoryCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="fb fb-page">
      <header className="fb-appbar">
        <button className="m3-icon-btn" onClick={() => setView("focus-dashboard")} aria-label="返回首页" title="返回首页">
          <Mi name="arrow_back" />
        </button>
        <h1 className="m3-title-lg" style={{ flex: 1 }}>专注数据</h1>
        <button className="m3-icon-btn" onClick={() => setShowSharePreview(true)} aria-label="分享专注统计" title="分享专注统计">
          <Mi name="ios_share" />
        </button>
        <button
          className="m3-icon-btn"
          onClick={() => setConfirmClear(true)}
          disabled={timer.history.length === 0}
          aria-label="清空专注历史"
          title="清空专注历史"
        >
          <Mi name="delete_sweep" />
        </button>
      </header>

      <div className="fb-statistics-frame" style={{ maxWidth: 1180, margin: "0 auto", width: "100%" }}>
        <div className="fb-statistics-narrow">
          <div style={{ display: "grid", gap: 12, padding: "8px 16px 32px" }}>
            <OverviewPane />
            <div style={{ height: 10 }} />
            {renderHistoryPane()}
          </div>
        </div>
        <div className="fb-statistics-wide">
          <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
            <div className="fb-scroll-page" style={{ flex: 6, padding: "8px 14px 32px 16px", display: "grid", gap: 12, alignContent: "start" }}>
              <OverviewPane />
            </div>
            <span className="m3-vertical-divider" style={{ width: 1 }} />
            <div className="fb-scroll-page" style={{ flex: 5, padding: "8px 16px 32px 14px", display: "grid", gap: 10, alignContent: "start" }}>
              {renderHistoryPane()}
            </div>
          </div>
        </div>
      </div>

      {pendingDelete && (
        <M3Dialog
          title="删除这条专注记录？"
          onClose={() => setPendingDelete(null)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setPendingDelete(null)}>取消</button>
              <button
                className="m3-tonal-btn"
                onClick={async () => {
                  const deleted = await timer.deleteHistoryEntry(pendingDelete.id);
                  if (!deleted) {
                    showMessage("删除失败，请重试。");
                    return;
                  }
                  setPendingDelete(null);
                }}
              >
                删除
              </button>
            </>
          }
        >
          “{pendingDelete.goal}”删除后无法恢复。
        </M3Dialog>
      )}

      {confirmClear && (
        <M3Dialog
          title="清空全部专注历史？"
          onClose={() => setConfirmClear(false)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setConfirmClear(false)}>取消</button>
              <button
                className="m3-tonal-btn"
                onClick={async () => {
                  const cleared = await timer.clearHistory();
                  if (!cleared) {
                    showMessage("清空失败，请稍后重试。");
                    return;
                  }
                  setConfirmClear(false);
                  showMessage("已清空全部专注历史");
                }}
              >
                全部清空
              </button>
            </>
          }
        >
          已结束记录和统计会被清空，当前正在进行的专注会保留。
        </M3Dialog>
      )}

      {showSharePreview && (
        <FocusSharePreview
          title="专注统计"
          summary={shareSummary}
          fileName="focubili_focus_statistics"
          onClose={() => setShowSharePreview(false)}
        >
          <h3>我的专注统计</h3>
          <div className="focus-share-metrics">
            <span>累计 <strong>{formatDuration(snapshot.totalFocusedMs)}</strong></span>
            <span>完成 <strong>{snapshot.completedCount} 次</strong></span>
            <span>连续 <strong>{snapshot.currentStreakDays} 天</strong></span>
          </div>
        </FocusSharePreview>
      )}
    </div>
  );
}
