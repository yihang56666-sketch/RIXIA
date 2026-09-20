/**
 * 首页专注台 — 1:1 React 移植自 FocuBili 的：
 * - focus_dashboard.dart（1192 行）
 * - home_page.dart（316 行，首页包装继续学习卡片与账号头像）
 *
 * 结构：首屏欢迎区（搜索按钮 + 我的入口 + 上滑提示）→ 吸附滚动展开
 * 卡片区（继续学习 / 专注状态 / 今日汇总 / 最近记录 / 辅助入口）。
 * 横屏宽窗口使用工作台双栏布局。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LearningListEntry, LearningListStatus } from "../../lib/bilibili/types";
import type { ViewKey } from "../../types";
import { createLearningListService } from "../../lib/bilibili/services";
import { createBilibiliAuthService } from "../../lib/bilibili/accountService";
import { useAppStore } from "../../store/useAppStore";
import { useFocusTimer } from "./useFocusTimer";
import {
  FocusSessionStatus,
  FocusPauseReason,
  FocusInterruptionKind,
  hasVideoAssociation,
  latestInterruptionReason,
  type FullFocusSession,
} from "../../lib/bilibili/focusSessionModel";
import { currentExamDate, reviewStats } from "../../lib/kaoyan";
import { daysUntil, todayKey } from "../../lib/time";
import { getDailyQuote } from "../../lib/dailyQuotes";
import { M3Dialog, Mi, useM3Feedback } from "./m3";
import {
  CustomFocusDurationDialog,
  FocusCompletionDialog,
  FocusInterruptionFlow,
  FocusTerminationDialog,
} from "./FocusDialogs";

const PRESET_MINUTES = [25, 45, 60] as const;
const HOME_SNAP_TRIGGER_DISTANCE = 48;
const HOME_SNAP_OVERSHOOT = 220;
const HOME_REVERSE_SNAP_DISTANCE = 120;
const HOME_HERO_FALL_RATIO = 1.32;
const HOME_HERO_BLUR_MAX = 7;
const HOME_HERO_FADE_MAX = 0.88;

const LEARNING_STATUS_LABEL: Record<LearningListStatus, string> = {
  "not-started": "未开始",
  learning: "学习中",
  completed: "已完成",
};

function formatCountdown(ms: number): string {
  const totalSeconds = Math.min(24 * 3600, Math.max(0, Math.floor((ms + 999) / 1000)));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPosition(ms: number): string {
  const seconds = Math.min(24 * 3600, Math.max(0, Math.floor(ms / 1000)));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatRecordedAt(iso: string | undefined): string {
  if (!iso) return "--";
  const local = new Date(iso);
  return `${local.getMonth() + 1}月${local.getDate()}日 ${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
}

function activeStatusLabel(session: FullFocusSession): string {
  if (session.status === FocusSessionStatus.running) return "正在专注";
  switch (session.pauseReason) {
    case FocusPauseReason.awaitingVideo: return "等待关联视频";
    case FocusPauseReason.playback: return "等待视频播放";
    case FocusPauseReason.interruption: return "专注被打断";
    default: return "已暂停";
  }
}

/** 窗口尺寸监听 — 对应 MediaQuery.sizeOf。 */
function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/** 从 900 逻辑像素起且横屏使用工作台布局。 */
function usesWorkspace(width: number, height: number): boolean {
  return width >= 900 && width > height;
}

// ============ 继续学习卡片（home_page.dart _buildContinueLearningCard） ============

function ContinueLearningCard({
  entry,
  loading,
  onOpen,
  onOpenList,
}: {
  entry: LearningListEntry | null;
  loading: boolean;
  onOpen: (entry: LearningListEntry) => void;
  onOpenList: () => void;
}) {
  if (loading) {
    return (
      <section className="m3-card primary-card motion-card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 12 }}>
        <span className="m3-circular-progress" />
        <span className="m3-body-md">正在读取继续学习任务…</span>
      </section>
    );
  }
  if (!entry) {
    return (
      <section className="m3-card primary-card motion-card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 10 }}>
        <Mi name="menu_book" />
        <div style={{ flex: 1 }} className="m3-body-md">
          继续学习<br />还没有未完成的学习任务。
        </div>
        <button className="m3-text-btn" onClick={onOpenList}>学习清单</button>
      </section>
    );
  }
  const durationMs = entry.durationSeconds * 1000;
  const positionMs = (entry.positionSeconds ?? 0) * 1000;
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
  return (
    <section className="m3-card primary-card motion-card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Mi name="play_circle" fill className="fb-primary-color" />
        <span className="m3-title-md" style={{ fontWeight: 800 }}>继续学习</span>
        <span style={{ flex: 1 }} />
        <button className="m3-text-btn" onClick={onOpenList}>查看清单</button>
      </div>
      <p className="m3-title-sm" style={{ fontWeight: 700, marginTop: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {entry.title}
      </p>
      <p className="m3-body-sm" style={{ marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        P{entry.partPageNumber ?? 1} {entry.partTitle ?? ""} · {LEARNING_STATUS_LABEL[entry.status ?? inferStatus(entry)]}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <div className="m3-linear-progress" style={{ minHeight: 7 }}>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="m3-label-sm">
          {formatPosition(positionMs)} / {formatPosition(durationMs)}
        </span>
      </div>
      <button className="m3-filled-btn full motion-feedback" style={{ marginTop: 14 }} onClick={() => onOpen(entry)}>
        <Mi name="play_arrow" size={18} /> 继续学习
      </button>
    </section>
  );
}

function inferStatus(entry: LearningListEntry): LearningListStatus {
  if (entry.completedAt) return "completed";
  if (entry.lastOpenedAt) return "learning";
  return "not-started";
}

// ============ 准备专注卡片（_buildReadyCard） ============

function ReadyCard({
  goal,
  onGoalChange,
  selectedMinutes,
  onSelectMinutes,
  onSelectCustom,
  onStart,
  onOpenVideo,
}: {
  goal: string;
  onGoalChange: (value: string) => void;
  selectedMinutes: number;
  onSelectMinutes: (minutes: number) => void;
  onSelectCustom: () => void;
  onStart: () => void;
  onOpenVideo: () => void;
}) {
  const canStart = goal.trim().length > 0;
  const customSelected = !PRESET_MINUTES.includes(selectedMinutes as (typeof PRESET_MINUTES)[number]);
  return (
    <section className="m3-card primary-card motion-card" style={{ padding: 20 }}>
      <h2 className="m3-headline-sm">准备专注</h2>
      <p className="m3-body-md" style={{ marginTop: 6 }}>先写下这段时间唯一要完成的事。</p>
      <div className="m3-field m3-field-floating" style={{ margin: "18px 0 8px" }}>
        <input
          data-tour-target="focus-goal"
          value={goal}
          onChange={(e) => onGoalChange(e.target.value.slice(0, 60))}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder=" "
        />
        <label>专注目标</label>
        <Mi name="flag" />
      </div>
      <h3 className="m3-title-md" style={{ marginTop: 8 }}>计划时长</h3>
      <div data-tour-target="focus-duration" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {PRESET_MINUTES.map((minutes) => (
          <button
            key={minutes}
            className={selectedMinutes === minutes ? "m3-chip selected" : "m3-chip"}
            onClick={() => onSelectMinutes(minutes)}
          >
            {minutes} 分钟
          </button>
        ))}
        <button
          className={customSelected ? "m3-chip selected" : "m3-chip"}
          onClick={onSelectCustom}
        >
          {customSelected ? `${selectedMinutes} 分钟` : "自定义"}
        </button>
      </div>
      <button
        className="m3-filled-btn full motion-feedback"
        style={{ marginTop: 20 }}
        disabled={!canStart}
        onClick={onStart}
        data-tour-target="focus-start"
      >
        <Mi name="timer" size={18} /> 开始专注
      </button>
      <button className="m3-text-btn full" style={{ marginTop: 6 }} onClick={onOpenVideo}>
        <Mi name="search" size={18} /> 打开视频
      </button>
    </section>
  );
}

// ============ 进行中卡片（_buildActiveCard） ============

function ActiveCard({
  session,
  remainingMs,
  progress,
  onPause,
  onResume,
  onEnd,
  onExtend,
  onOpenLinkedVideo,
}: {
  session: FullFocusSession;
  remainingMs: number;
  progress: number;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onExtend: () => void;
  onOpenLinkedVideo: () => void;
}) {
  const paused = session.status === FocusSessionStatus.paused;
  const lastReason = latestInterruptionReason(session);
  return (
    <section className="m3-card primary-card motion-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }} className="m3-body-md">
        <Mi
          name={paused ? "pause_circle" : "adjust"}
          className={paused ? "fb-tertiary-color" : "fb-success-color"}
        />
        {activeStatusLabel(session)}
      </div>
      <h2
        className="m3-title-lg"
        style={{ fontWeight: 800, marginTop: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {session.goal}
      </h2>
      <p
        className="m3-display-md"
        style={{
          fontWeight: 800,
          textAlign: "center",
          marginTop: 18,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {session.completeOnPartEnd
          ? `等待当前分P完播 · ${formatCountdown(remainingMs)}`
          : formatCountdown(remainingMs)}
      </p>
      <div className="m3-linear-progress" style={{ marginTop: 12, minHeight: 8 }}>
        <div style={{ width: `${progress * 100}%` }} />
      </div>
      {lastReason && (
        <p className="m3-body-md fb-tertiary-color" style={{ marginTop: 10 }}>
          上次打断：{lastReason}
        </p>
      )}
      {hasVideoAssociation(session) && (
        <button
          className="fb-linked-video-pin"
          style={{ marginTop: 14, width: "100%", textAlign: "left" }}
          onClick={onOpenLinkedVideo}
        >
          <div style={{ padding: 8, display: "grid", gap: 2 }}>
            <span className="m3-title-sm" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {session.sourceVideoTitle ?? "关联视频"}
            </span>
            <span className="m3-body-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              P{session.sourcePartPageNumber ?? 1} {session.sourcePartTitle ?? ""}
            </span>
            <span className="m3-body-sm" style={{ marginTop: 6 }}>上次看到</span>
            <span className="m3-body-sm">视频时间点 {formatPosition(session.sourcePositionMs)}</span>
            <div className="m3-clip-16-9" style={{ marginTop: 6 }}>
              {session.sourceFramePath ? (
                <img src={session.sourceFramePath} alt="" />
              ) : (
                <Mi name="ondemand_video" />
              )}
            </div>
          </div>
        </button>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          className={paused ? "m3-filled-btn full motion-feedback" : "m3-filled-btn full motion-feedback"}
          onClick={paused ? onResume : onPause}
        >
          <Mi name={paused ? "play_arrow" : "pause"} size={18} /> {paused ? "继续" : "暂停"}
        </button>
        <button className="m3-outlined-btn full" onClick={onEnd}>
          <Mi name="stop" size={18} /> 结束
        </button>
      </div>
      <button className="m3-outlined-btn full" style={{ marginTop: 10 }} onClick={onExtend}>
        <Mi name="more_time" size={18} /> +5 分钟
      </button>
    </section>
  );
}

// ============ 完成提示卡片（_buildFinishedCard） ============

function FinishedCard({ session, onClose }: { session: FullFocusSession; onClose: () => void }) {
  const completed = session.status === FocusSessionStatus.completed;
  return (
    <section className="m3-card motion-card">
      <div className="m3-list-tile" style={{ padding: "10px 8px 10px 18px" }}>
        <span className="m3-tile-leading"><span className="m3-avatar"><Mi name={completed ? "check" : "stop"} size={20} /></span></span>
        <span className="m3-tile-body">
          <span className="m3-title-md">{completed ? "专注完成" : "已提前结束"}</span>
          <span className="m3-body-sm" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {session.goal}
            <br />
            实际专注 {Math.floor(session.accumulatedFocusMs / 60_000)} 分钟
          </span>
        </span>
        <span className="m3-tile-trailing">
          <button className="m3-icon-btn" onClick={onClose} aria-label="关闭" title="关闭">
            <Mi name="close" />
          </button>
        </span>
      </div>
    </section>
  );
}

// ============ 今日汇总（_buildTodaySummary + _FocusMetric） ============

function FocusMetric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <p className="m3-body-md">{label}</p>
      <p className="m3-headline-md" style={{ fontWeight: 800 }}>
        {value} <span className="m3-body-md">{unit}</span>
      </p>
    </div>
  );
}

function TodaySummaryCard({ focusedMinutes, completedCount }: { focusedMinutes: number; completedCount: number }) {
  return (
    <section className="m3-card motion-card" style={{ padding: 18, display: "flex", alignItems: "center" }}>
      <div style={{ flex: 1 }}>
        <FocusMetric label="今日专注" value={String(focusedMinutes)} unit="分钟" />
      </div>
      <span className="m3-vertical-divider" style={{ height: 46, margin: "0 8px" }} />
      <div style={{ flex: 1 }}>
        <FocusMetric label="按时完成" value={String(completedCount)} unit="次" />
      </div>
    </section>
  );
}

// ============ 最近记录（_buildRecentHistory） ============

function RecentHistoryCard({ history }: { history: FullFocusSession[] }) {
  const recent = history.slice(0, 5);
  return (
    <section className="m3-card motion-card" style={{ padding: "8px 0" }}>
      <p style={{ padding: "10px 18px 8px", fontSize: 18, fontWeight: 700 }}>最近记录</p>
      {recent.length === 0 ? (
        <p className="m3-body-md" style={{ padding: "4px 18px 14px" }}>
          完成或结束一次专注后，记录会保存在当前设备。
        </p>
      ) : (
        recent.map((session) => (
          <div className="m3-list-tile compact-item" key={session.id}>
            <span className="m3-tile-leading">
              <Mi name={session.status === FocusSessionStatus.completed ? "check_circle" : "timelapse"} />
            </span>
            <span className="m3-tile-body">
              <span className="m3-body-lg" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {session.goal}
              </span>
              <span className="m3-body-sm">
                {formatRecordedAt(session.finishedAt)} · {Math.floor(session.accumulatedFocusMs / 60_000)} 分钟
              </span>
            </span>
          </div>
        ))
      )}
    </section>
  );
}

// ============ 今日考研卡 ============

function KaoyanTodayCard({ onOpen }: { onOpen: () => void }) {
  const kaoyanExamDate = useAppStore((state) => state.kaoyanExamDate);
  const reviewItems = useAppStore((state) => state.reviewItems);
  const today = todayKey();
  const examDate = currentExamDate(today, kaoyanExamDate);
  const days = daysUntil(examDate, today);
  const dueToday = reviewStats(reviewItems, today).dueToday;
  const countdown = days > 0 ? `距初试 ${days} 天` : "初试已到";
  return (
    <section className="m3-card motion-card">
      <button className="m3-list-tile" type="button" onClick={onOpen} aria-label={`今日考研 ${countdown} · 待复习 ${dueToday}`}>
        <span className="m3-tile-leading"><span className="m3-avatar"><Mi name="school" /></span></span>
        <span className="m3-tile-body">
          <span className="m3-body-lg">今日考研</span>
          <span className="m3-body-sm">{countdown} · 待复习 {dueToday}</span>
        </span>
        <Mi name="chevron_right" />
      </button>
    </section>
  );
}

// ============ 按意图分组的首页入口（_buildHomeIntentGroups） ============

const HOME_INTENT_GROUPS = [
  {
    id: "watch",
    title: "继续看课",
    description: "找到视频、继续学习、边看边记。",
    actions: [
      { label: "学习清单", icon: "menu_book", action: "learning-list" as ViewKey },
      { label: "搜索", icon: "search", action: "search" as ViewKey },
      { label: "B站发现", icon: "trending_up", action: "home-feed" as ViewKey },
    ],
  },
  {
    id: "focus",
    title: "留一段专注",
    description: "把一段时间留给明确目标。",
    actions: [
      { label: "准备专注", icon: "timer", action: "focus" as ViewKey },
      { label: "专注数据", icon: "insights", action: "focus-statistics" as ViewKey },
    ],
  },
  {
    id: "review",
    title: "安排复习",
    description: "错题、任务和倒计时收在一起。",
    actions: [
      { label: "考研计划", icon: "school", action: "kaoyan" as ViewKey },
      { label: "任务", icon: "list_alt", action: "tasks" as ViewKey },
      { label: "倒计时", icon: "hourglass_empty", action: "countdowns" as ViewKey },
    ],
  },
  {
    id: "organize",
    title: "整理想法",
    description: "笔记、收集箱、日记和习惯。",
    actions: [
      { label: "笔记", icon: "sticky_note_2", action: "notes" as ViewKey },
      { label: "收集箱", icon: "inbox", action: "inbox" as ViewKey },
      { label: "日记", icon: "calendar_today", action: "journal" as ViewKey },
      { label: "习惯", icon: "local_fire_department", action: "habits" as ViewKey },
    ],
  },
  {
    id: "system",
    title: "数据与系统",
    description: "备份、诊断和维护。",
    actions: [
      { label: "我的", icon: "person", action: "settings" as ViewKey },
      { label: "工具", icon: "build", action: "tools" as ViewKey },
    ],
  },
] as const;

function HomeIntentGroups({
  onOpen,
  onOpenStatistics,
}: {
  onOpen: (view: ViewKey) => void;
  onOpenStatistics: () => void;
}) {
  return (
    <section aria-label="功能分组入口" className="home-intent-groups">
      {HOME_INTENT_GROUPS.map((group) => (
        <section key={group.id} className="home-intent-group">
          <h3>{group.title}</h3>
          <p>{group.description}</p>
          <div className="home-intent-actions">
            {group.actions.map((action) => (
              <button
                key={`${group.id}-${action.label}`}
                className="ghost-btn compact"
                onClick={() => action.action === "focus-statistics" ? onOpenStatistics() : onOpen(action.action)}
              >
                <Mi name={action.icon} size={16} /> {action.label}
              </button>
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

// ============ 首屏欢迎区（_buildHomeHero） ============

function HomeHero({
  height,
  scrollOffset,
  profileAvatarUrl,
  onOpenProfile,
  onOpenSearch,
}: {
  height: number;
  scrollOffset: number;
  profileAvatarUrl: string | undefined;
  onOpenProfile: () => void;
  onOpenSearch: () => void;
}) {
  const progress = Math.min(1, Math.max(0, scrollOffset / 280));
  const fallOffset = scrollOffset * HOME_HERO_FALL_RATIO;
  return (
    <div
      className="fb-home-hero"
      style={{
        height,
        position: "relative",
        overflow: "hidden",
        flex: "0 0 auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          filter: progress > 0.01 ? `blur(${progress * HOME_HERO_BLUR_MAX}px)` : undefined,
          opacity: 1 - progress * HOME_HERO_FADE_MAX,
          transform: `translateY(${fallOffset}px)`,
          display: "flex",
          flexDirection: "column",
          padding: "20px 24px 18px",
        }}
      >
        <div className="fb-home-masthead">
          <div>
            <h1 className="m3-headline-sm" style={{ fontWeight: 800 }}>BEID</h1>
            <span>今日更新</span>
          </div>
          <button
            className="m3-icon-btn-filled"
            onClick={onOpenProfile}
            aria-label="我的"
            title="我的"
          >
            {profileAvatarUrl ? (
              <img src={profileAvatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
            <Mi name="person" />
          )}
        </button>
        </div>
        <div className="fb-home-editorial">
          <div className="fb-home-editorial-copy">
            <h2 className="m3-headline-md" style={{ fontWeight: 650 }}>今天要学点什么？</h2>
            <p>从一个明确的视频开始，把注意力留给真正想完成的事。</p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="m3-filled-btn"
                style={{ minWidth: 160, height: 52, borderRadius: 26, padding: "0 26px" }}
                onClick={onOpenSearch}
                data-tour-target="home-search"
              >
                开始搜索
              </button>
            </div>
            <p
              className="fb-home-quote"
              data-testid="daily-quote"
              data-tour-target="daily-quote"
              aria-label="每日语录"
            >
              <Mi name="format_quote" size={14} />
              <span>{getDailyQuote(todayKey()).text}</span>
            </p>
          </div>
          <aside className="fb-home-featured">
            <span>今日节奏</span>
            <strong>看一节，专注一段</strong>
            <p>把视频、笔记和计时收在同一条线上。</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ============ 工作台介绍卡（_buildWorkspaceIntro） ============

function WorkspaceIntro({ onOpenSearch }: { onOpenSearch: () => void }) {
  return (
    <section className="fb-home-editorial" aria-label="今日更新">
      <div className="fb-home-editorial-copy">
        <div className="fb-home-masthead">
          <div>
            <h2 className="m3-title-lg" style={{ fontWeight: 800 }}>BEID</h2>
            <span>今日更新</span>
          </div>
        </div>
        <h3 className="m3-headline-md" style={{ fontWeight: 650 }}>今天要学点什么？</h3>
        <p>从一个明确的视频开始，把注意力留给真正想完成的事。</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            className="m3-filled-btn"
            style={{ minWidth: 176, height: 52, borderRadius: 26, padding: "0 26px" }}
            onClick={onOpenSearch}
            data-tour-target="home-search"
          >
            <Mi name="search" size={18} /> 开始搜索
          </button>
        </div>
        <p className="fb-home-quote" data-testid="daily-quote" data-tour-target="daily-quote">
          <Mi name="format_quote" size={15} />
          <span>{getDailyQuote(todayKey()).text}</span>
        </p>
      </div>
      <aside className="fb-home-featured">
        <span>今日节奏</span>
        <strong>看一节，专注一段</strong>
        <p>把视频、笔记和计时收在同一条线上。</p>
      </aside>
    </section>
  );
}

// ============ 主组件 ============

export function FocusDashboard({ onOpenStatistics }: { onOpenStatistics: () => void }) {
  const timer = useFocusTimer();
  const showMessage = useM3Feedback().showMessage;
  const setView = useAppStore((state) => state.setView);
  const openBilibiliVideoAt = useAppStore((state) => state.openBilibiliVideoAt);

  const learningList = useMemo(() => createLearningListService(), []);
  const auth = useMemo(() => createBilibiliAuthService(), []);

  const [goal, setGoal] = useState("");
  const [selectedMinutes, setSelectedMinutes] = useState(25);
  const [continueEntry, setContinueEntry] = useState<LearningListEntry | null>(null);
  const [learningListLoading, setLearningListLoading] = useState(true);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | undefined>();

  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [showCreatedDialog, setShowCreatedDialog] = useState(false);
  const [showInterruption, setShowInterruption] = useState(false);
  const [showTermination, setShowTermination] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const cardsSnappedRef = useRef(false);
  const snappingRef = useRef(false);
  const gestureStartRef = useRef<number | null>(null);
  const [snapTick, setSnapTick] = useState(0);

  const windowSize = useWindowSize();
  const workspace = usesWorkspace(windowSize.width, windowSize.height);

  const needsCompactHeight = windowSize.width >= 600 || windowSize.height < 648;
  const heroHeight = needsCompactHeight
    ? Math.min(420, Math.max(260, windowSize.height - 64))
    : Math.min(460, Math.max(300, windowSize.height - 88));

  useEffect(() => {
    let active = true;
    void learningList.list().then((entries) => {
      if (!active) return;
      setContinueEntry(entries.find((entry) => entry.completedAt == null) ?? null);
      setLearningListLoading(false);
    });
    return () => {
      active = false;
    };
  }, [learningList, snapTick]);

  useEffect(() => {
    const update = () => setProfileAvatarUrl(auth.currentState().signedIn ? auth.currentState().avatarUrl : undefined);
    update();
    return auth.onChange(update);
  }, [auth]);

  const openSearch = useCallback(() => setView("search"), [setView]);
  const openProfile = useCallback(() => setView("settings"), [setView]);
  const openLearningList = useCallback(() => setView("learning-list"), [setView]);

  const openLinkedVideo = useCallback(
    (session: FullFocusSession | LearningListEntry) => {
      if ("status" in session && "goal" in session) {
        openBilibiliVideoAt(
          session.sourceBvid!,
          session.sourceVideoTitle,
          session.sourcePartCid ?? 0,
          Math.floor((session.sourcePositionMs ?? 0) / 1000),
        );
        return;
      }
      openBilibiliVideoAt(
        session.bvid,
        session.title,
        session.partCid ?? 0,
        session.positionSeconds ?? 0,
      );
    },
    [openBilibiliVideoAt],
  );

  const continueLearning = useCallback(
    (entry: LearningListEntry) => {
      void learningList.markOpened(entry.id);
      openLinkedVideo(entry);
      setSnapTick((n) => n + 1);
    },
    [learningList, openLinkedVideo],
  );

  async function startFocus() {
    const started = await timer.startFocus({
      goal,
      durationMs: selectedMinutes * 60_000,
      startImmediately: false,
    });
    if (!started) {
      showMessage("请填写目标，并选择 1 到 180 分钟。");
      return;
    }
    setGoal("");
    (document.activeElement as HTMLElement | null)?.blur();
    setShowCreatedDialog(true);
  }

  async function pauseWithEncouragement() {
    setShowInterruption(true);
  }

  function continueFocus(session: FullFocusSession) {
    if (hasVideoAssociation(session)) {
      openLinkedVideo(session);
      return;
    }
    showMessage("请先打开一个视频并确认关联，播放后计时会自动继续。");
    openSearch();
  }

  async function extendFocus() {
    const extended = await timer.extendFocus(5 * 60_000);
    if (!extended) {
      showMessage("计划总时长最多为 180 分钟。");
    }
  }

  // ---- 吸附滚动（_handleHomeScrollEnd） ----
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollOffset(el.scrollTop);
  }, []);

  const handleScrollEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el || snappingRef.current) return;
    const currentOffset = el.scrollTop;
    const maxOffset = el.scrollHeight - el.clientHeight;
    const startOffset = gestureStartRef.current ?? currentOffset;
    // 下滑（回向首屏）的真实手势距离；上滑为负。
    const reverseDistance = startOffset - currentOffset;
    if (currentOffset <= 24) {
      cardsSnappedRef.current = false;
      return;
    }
    const firstCardOffset = Math.min(maxOffset, heroHeight + 12);
    let targetOffset: number | null = null;
    if (!cardsSnappedRef.current && currentOffset > HOME_SNAP_TRIGGER_DISTANCE && currentOffset <= firstCardOffset + HOME_SNAP_OVERSHOOT) {
      targetOffset = firstCardOffset;
    } else if (!cardsSnappedRef.current && currentOffset > firstCardOffset + HOME_SNAP_OVERSHOOT) {
      cardsSnappedRef.current = true;
      return;
    } else if (
      cardsSnappedRef.current &&
      currentOffset > 24 &&
      reverseDistance >= HOME_REVERSE_SNAP_DISTANCE
    ) {
      targetOffset = 0;
    } else {
      if (currentOffset >= heroHeight) cardsSnappedRef.current = true;
      return;
    }
    if (Math.abs(targetOffset - currentOffset) < 2) {
      cardsSnappedRef.current = targetOffset > 0;
      return;
    }
    snappingRef.current = true;
    const from = currentOffset;
    const delta = targetOffset - from;
    const duration = 420;
    const startTime = performance.now();
    let rafId: number | null = null;
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.scrollTop = from + delta * eased;
      if (t < 1 && snappingRef.current) {
        rafId = requestAnimationFrame(step);
      } else {
        snappingRef.current = false;
        cardsSnappedRef.current = targetOffset! > 0;
        gestureStartRef.current = null;
        setScrollOffset(el.scrollTop);
      }
    };
    rafId = requestAnimationFrame(step);
    // 组件卸载时终止吸附动画，避免向已卸载组件写状态
    cleanupSnapRafRef.current = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      snappingRef.current = false;
    };
  }, [heroHeight]);

  const cleanupSnapRafRef = useRef<(() => void) | null>(null);
  useEffect(() => () => {
    cleanupSnapRafRef.current?.();
  }, []);

  // ---- 首页下拉弹性过渡（iOS 手感）----
  // 在滚动顶部继续下拉时，内容跟随手指以阻尼曲线位移 + 轻微放大 + 轻微模糊，
  // 松手后以弹簧曲线回弹。仅作用于移动/窄屏单栏首页，且尊重系统减弱动态设置。
  const HOME_PULL_RANGE = 240;
  const [pullState, setPullState] = useState({ distance: 0, dragging: false });
  const pullStartRef = useRef<number | null>(null);
  const pullDraggingRef = useRef(false);
  const reducedMotionRef = useRef(false);
  useEffect(() => {
    reducedMotionRef.current = typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  /** iOS 橡皮筋阻尼：距离越远增长越慢，渐近 HOME_PULL_RANGE。 */
  const dampPull = useCallback((distance: number) => {
    return (1 - 1 / (distance / HOME_PULL_RANGE + 1)) * HOME_PULL_RANGE;
  }, []);

  const resetPull = useCallback(() => {
    pullStartRef.current = null;
    if (!pullDraggingRef.current) return;
    pullDraggingRef.current = false;
    // dragging=false 时 CSS 弹簧过渡接管，回弹到 0。
    setPullState({ distance: 0, dragging: false });
  }, []);

  const updatePull = useCallback((clientY: number | undefined | null) => {
    const el = scrollRef.current;
    if (!el || pullStartRef.current == null || clientY == null) return;
    if (el.scrollTop > 0) {
      // 已经滚离顶部：取消本次下拉跟踪。
      pullStartRef.current = null;
      if (pullDraggingRef.current) {
        pullDraggingRef.current = false;
        setPullState({ distance: 0, dragging: false });
      }
      return;
    }
    const distance = clientY - pullStartRef.current;
    if (distance > 4) {
      pullDraggingRef.current = true;
      setPullState({ distance: dampPull(distance), dragging: true });
    } else if (pullDraggingRef.current) {
      // 手指回到起点以上：即时归零，保持跟手。
      setPullState({ distance: 0, dragging: true });
    }
  }, [dampPull]);

  const beginPullTracking = useCallback((clientY: number | undefined | null) => {
    if (reducedMotionRef.current || clientY == null) return;
    const el = scrollRef.current;
    if (el && el.scrollTop <= 0) pullStartRef.current = clientY;
  }, []);

  const activeSession = timer.activeSession;
  const finishedSession = timer.lastFinishedSession;

  const coreCards = (
    <>
      {finishedSession && (
        <FinishedCard session={finishedSession} onClose={timer.dismissLastFinishedSession} />
      )}
      {activeSession ? (
        <ActiveCard
          session={activeSession}
          remainingMs={timer.remainingMs}
          progress={timer.progress}
          onPause={() => void pauseWithEncouragement()}
          onResume={() => continueFocus(activeSession)}
          onEnd={() => setShowTermination(true)}
          onExtend={() => void extendFocus()}
          onOpenLinkedVideo={() => openLinkedVideo(activeSession)}
        />
      ) : (
        <ReadyCard
          goal={goal}
          onGoalChange={setGoal}
          selectedMinutes={selectedMinutes}
          onSelectMinutes={setSelectedMinutes}
          onSelectCustom={() => setShowCustomDuration(true)}
          onStart={() => void startFocus()}
          onOpenVideo={openSearch}
        />
      )}
      <TodaySummaryCard
        focusedMinutes={Math.floor(timer.todayFocusedMs / 60_000)}
        completedCount={timer.todayCompletedCount}
      />
      <RecentHistoryCard history={timer.history} />
      <KaoyanTodayCard onOpen={() => setView("kaoyan")} />
      <HomeIntentGroups onOpen={setView} onOpenStatistics={onOpenStatistics} />
    </>
  );

  const continueCard = (
    <ContinueLearningCard
      entry={continueEntry}
      loading={learningListLoading}
      onOpen={continueLearning}
      onOpenList={openLearningList}
    />
  );

  const cardsStyle: React.CSSProperties = {
    display: "grid",
    gap: 14,
    padding: "12px 24px 32px",
    maxWidth: 840,
    margin: "0 auto",
    width: "100%",
  };

  const pull = pullState.distance;
  const pullStyle: React.CSSProperties = {
    transformOrigin: "top center",
    willChange: "transform",
    transform: pull > 0
      ? `translateY(${pull.toFixed(1)}px) scale(${(1 + pull / 2200).toFixed(4)})`
      : undefined,
    filter: pull > 0 ? `blur(${Math.min(3, pull / 70).toFixed(2)}px)` : undefined,
    // 拖动中即时跟手；松手后交给弹簧曲线回弹（Apple 同款缓动）。
    transition: pullState.dragging
      ? "none"
      : "transform 0.65s var(--ease-spring), filter 0.65s var(--ease-spring)",
  };

  const content = workspace ? (
    <div style={{ display: "flex", gap: 20, padding: 20, height: "100%", overflow: "hidden" }}>
      <div className="fb-scroll-page" style={{ flex: 5, display: "grid", gap: 14, alignContent: "start", overflowY: "auto" }}>
        <WorkspaceIntro onOpenSearch={openSearch} />
        <ContinueLearningCard
          entry={continueEntry}
          loading={learningListLoading}
          onOpen={continueLearning}
          onOpenList={openLearningList}
        />
      </div>
      <div className="fb-scroll-page" style={{ flex: 7, display: "grid", gap: 14, alignContent: "start", overflowY: "auto" }}>
        {!timer.ready ? (
          <section className="m3-card" style={{ padding: 32, display: "grid", placeItems: "center" }}>
            <span className="m3-circular-progress lg" />
          </section>
        ) : (
          coreCards
        )}
      </div>
    </div>
  ) : (
    <div
      ref={scrollRef}
      className="fb-scroll-page"
      style={{ overscrollBehaviorY: "contain" }}
      onScroll={handleScroll}
      onTouchStart={(event) => {
        gestureStartRef.current = scrollRef.current?.scrollTop ?? null;
        beginPullTracking(event.touches[0]?.clientY);
      }}
      onTouchMove={(event) => updatePull(event.touches[0]?.clientY)}
      onTouchEnd={() => {
        resetPull();
        handleScrollEnd();
      }}
      onTouchCancel={resetPull}
      // 鼠标路径必须重置手势起点：否则 touch 滑动残留的旧起点会被之后的
      // 一次普通点击当作手势开始，误触发回顶吸附动画。
      onMouseDown={(event) => {
        gestureStartRef.current = scrollRef.current?.scrollTop ?? null;
        if (event.button === 0) beginPullTracking(event.clientY);
      }}
      onMouseMove={(event) => updatePull(event.clientY)}
      onMouseUp={() => {
        resetPull();
        handleScrollEnd();
      }}
      onMouseLeave={resetPull}
    >
      <div className="fb-home-pull" style={pullStyle}>
        <HomeHero
          height={heroHeight}
          scrollOffset={scrollOffset}
          profileAvatarUrl={profileAvatarUrl}
          onOpenProfile={openProfile}
          onOpenSearch={openSearch}
        />
        <div style={cardsStyle}>{timer.ready ? (
          <>
            {coreCards}
            {continueCard}
          </>
        ) : (
          <section className="m3-card" style={{ padding: 32, display: "grid", placeItems: "center" }}>
            <span className="m3-circular-progress lg" />
          </section>
        )}</div>
      </div>
    </div>
  );

  return (
    <div className="fb fb-page">
      {content}

      {showCreatedDialog && (
        <M3Dialog
          title="专注任务已创建"
          onClose={() => setShowCreatedDialog(false)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setShowCreatedDialog(false)}>稍后</button>
              <button
                className="m3-filled-btn"
                onClick={() => {
                  setShowCreatedDialog(false);
                  openSearch();
                }}
              >
                <Mi name="ondemand_video" size={18} /> 打开视频
              </button>
            </>
          }
        >
          请打开一个视频关联本次专注任务
        </M3Dialog>
      )}

      {showCustomDuration && (
        <CustomFocusDurationDialog
          initialMinutes={selectedMinutes}
          onCancel={() => setShowCustomDuration(false)}
          onConfirm={(minutes) => {
            setSelectedMinutes(minutes);
            setShowCustomDuration(false);
          }}
        />
      )}

      {showInterruption && (
        <FocusInterruptionFlow
          kind={FocusInterruptionKind.manualPause}
          onDone={() => setShowInterruption(false)}
        />
      )}

      {showTermination && (
        <FocusTerminationDialog
          onCancel={() => setShowTermination(false)}
          onConfirm={(reason) => {
            setShowTermination(false);
            void timer.endFocusEarly(reason);
          }}
        />
      )}

      {finishedSession && finishedSession.status === FocusSessionStatus.completed && !activeSession && (
        <FocusCompletionDialog
          session={finishedSession}
          onClose={timer.dismissLastFinishedSession}
          onExtend={timer.extendCompletedFocus}
        />
      )}
    </div>
  );
}
