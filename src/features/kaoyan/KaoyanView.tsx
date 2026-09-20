import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BookOpen, Brain, CalendarDays, Check, ChevronDown, ChevronUp, ClipboardList,
  Flame, GraduationCap, GripVertical, LineChart, Pencil, Plus, Trash2, TrendingDown, TrendingUp,
} from "lucide-react";
import {
  currentExamDate, dateKeysInRange, DEFAULT_KAOYAN_WORDS, kaoyanExamLabel, kaoyanMilestones, mockExamStats,
  isReviewMastered, kaoyanCourseQuery, kaoyanPlanOverview, REVIEW_INTERVAL_DAYS, reviewStats, subjectProgress, unitProgress,
} from "../../lib/kaoyan";
import { Heatmap } from "../../components/Heatmap";
import { ProgressRing } from "../../components/ProgressRing";
import { daysUntil, formatDateLabel, todayKey, weekdayLabel } from "../../lib/time";
import { RixiaWorkspacePage } from "../bilibili/RixiaWorkspacePage";
import { useFocusTimer } from "../bilibili/useFocusTimer";
import { useM3Feedback } from "../bilibili/m3";
import {
  buildFocusStatisticsSnapshot, FocusStatisticsRange, todayFocusedMs,
} from "../../lib/bilibili/focusStatisticsModel";
import { useAppStore } from "../../store/useAppStore";
import type { StudySubject, StudyUnit } from "../../types";

type Page = { kind: "subjects" } | { kind: "subject"; subjectId: string } | { kind: "unit"; unitId: string };
type Tab = "plan" | "words" | "review" | "mock" | "stats";

const SUBJECT_COLORS = ["#5B8DEF", "#A476E8", "#E88873", "#43A88B", "#D99A43", "#E06F9C"];
const WRONG_TAGS = ["计算错误", "概念不清", "思路卡壳", "审题失误", "公式遗忘"];
const COURSE_SEARCHES: Array<{ label: string; query: string; aria: string }> = [
  { label: "英语阅读", query: "考研英语阅读", aria: "搜英语阅读课" },
  { label: "数学强化", query: "考研数学", aria: "搜数学强化课" },
  { label: "政治精讲", query: "考研政治", aria: "搜政治精讲课" },
  { label: "专业课", query: "考研专业课", aria: "搜专业课" },
];

const TABS: Array<{ key: Tab; label: string; icon: typeof Brain }> = [
  { key: "plan", label: "科目计划", icon: CalendarDays },
  { key: "words", label: "单词", icon: BookOpen },
  { key: "review", label: "错题·复习", icon: Brain },
  { key: "mock", label: "模考", icon: ClipboardList },
  { key: "stats", label: "统计", icon: LineChart },
];

function dueLabel(endDate: string) {
  const days = daysUntil(endDate);
  if (days < 0) return "已结束";
  if (days === 0) return "今天结束";
  return `剩 ${days} 天`;
}

/** 每日专注目标（分钟），存本机。 */
const FOCUS_GOAL_STORAGE_KEY = "beid.kaoyan.focus-goal-v1";
const DEFAULT_FOCUS_GOAL_MINUTES = 240;

function loadFocusGoalMinutes(): number {
  try {
    const raw = localStorage.getItem(FOCUS_GOAL_STORAGE_KEY);
    const parsed = raw == null ? Number.NaN : Number(raw);
    return Number.isFinite(parsed) && parsed >= 30 && parsed <= 900 ? Math.round(parsed) : DEFAULT_FOCUS_GOAL_MINUTES;
  } catch {
    return DEFAULT_FOCUS_GOAL_MINUTES;
  }
}

/** 每日专注目标卡：把专注台（FocuBili 专注计时）的真实数据接进考研工作台。 */
function FocusGoalCard() {
  const timer = useFocusTimer();
  const setView = useAppStore((state) => state.setView);
  const [goalMinutes, setGoalMinutes] = useState(loadFocusGoalMinutes);

  const nowMs = Date.now();
  const snapshot = useMemo(
    () => buildFocusStatisticsSnapshot({
      history: timer.history,
      range: FocusStatisticsRange.thirtyDays,
      nowMs,
      activeSession: timer.activeSession,
    }),
    // remainingMs 变化代表活跃会话在推进，需要重算今日专注量。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [timer.history, timer.activeSession, timer.remainingMs],
  );
  const todayMinutes = Math.round(todayFocusedMs(snapshot) / 60000);
  const last7 = snapshot.dailyTrend.slice(-7);
  const weekAvg = Math.round(last7.reduce((sum, day) => sum + day.focusedMs, 0) / 60000 / Math.max(1, last7.length));
  const percent = Math.min(100, goalMinutes > 0 ? Math.round((todayMinutes / goalMinutes) * 100) : 0);
  const goalDone = todayMinutes >= goalMinutes;
  const maxBarMs = Math.max(...last7.map((day) => day.focusedMs), goalMinutes * 60000, 1);

  function adjust(delta: number) {
    setGoalMinutes((current) => {
      const next = Math.min(900, Math.max(30, current + delta));
      try { localStorage.setItem(FOCUS_GOAL_STORAGE_KEY, String(next)); } catch { /* 存储不可用时保持内存值 */ }
      return next;
    });
  }

  return <section className="card kaoyan-focus-goal">
    <div className="row" style={{ marginBottom: 8 }}>
      <div>
        <h3>每日专注目标</h3>
        <p className="muted">来自专注台的真实看课计时，不靠手填</p>
      </div>
      <div className="kaoyan-review-chips">
        {goalDone
          ? <span className="kaoyan-chip done">今日已达标</span>
          : <span className="kaoyan-chip accent">还差 {goalMinutes - todayMinutes} 分钟</span>}
      </div>
    </div>
    <p className="kaoyan-goal-amount">
      <strong>{todayMinutes}</strong>
      <span className="muted"> / {goalMinutes} 分钟 · {percent}%</span>
    </p>
    <ProgressBar percent={percent} color={goalDone ? "#43A88B" : "#5B8DEF"} />
    <div className="kaoyan-goal-bars" aria-label="最近 7 天专注时长">
      {last7.map((day) => {
        const label = new Date(day.date).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
        const height = Math.max(4, Math.round((day.focusedMs / maxBarMs) * 46));
        return (
          <div key={day.date} className="kaoyan-goal-bar-col" title={`${label} · ${Math.round(day.focusedMs / 60000)} 分钟`}>
            <div className="kaoyan-goal-bar" style={{ height, backgroundColor: day.focusedMs >= goalMinutes * 60000 ? "#43A88B" : "#5B8DEF" }} />
            <span>{label}</span>
          </div>
        );
      })}
    </div>
    <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
      <span className="muted" style={{ fontSize: 12.5 }}>连续专注 {snapshot.currentStreakDays} 天 · 7 天日均 {weekAvg} 分钟</span>
      <div className="row" style={{ gap: 6 }}>
        <button className="ghost-btn compact" onClick={() => adjust(-30)} aria-label="减少目标 30 分钟">-30</button>
        <button className="ghost-btn compact" onClick={() => adjust(30)} aria-label="增加目标 30 分钟">+30</button>
        <button className="primary compact" onClick={() => setView("focus-dashboard")}>去专注</button>
      </div>
    </div>
  </section>;
}

function PlanOverviewCard({ today }: { today: string }) {
  const { studyUnits, reviewItems, wrongQuestions } = useAppStore();
  const overview = kaoyanPlanOverview(studyUnits, reviewItems, wrongQuestions, today);
  const completion = overview.todayTotal ? Math.round((overview.todayCompleted / overview.todayTotal) * 100) : 0;
  return <section className="card kaoyan-plan-overview" aria-label="计划总览">
    <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
      <div><h3>计划总览</h3><p className="muted">今天先完成最重要的一步</p></div>
      <span className={completion === 100 && overview.todayTotal > 0 ? "kaoyan-chip done" : "kaoyan-chip accent"}>{completion}% 今日完成</span>
    </div>
    <div className="kaoyan-overview-grid">
      <div><strong>{overview.todayCompleted}/{overview.todayTotal}</strong><span>今日任务</span></div>
      <div><strong>{overview.progressPercent}%</strong><span>总进度</span></div>
      <div><strong>{overview.dueReviews}</strong><span>待复习</span></div>
      <div><strong>{overview.wrongQuestions}</strong><span>错题</span></div>
    </div>
    <ProgressBar percent={overview.progressPercent} color="#5B8DEF" />
  </section>;
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%`, backgroundColor: color }} /></div>;
}

/**
 * 每日计划与进度：固定清单每天勾选 + 进度备注（自动保存）。
 * 未完成项可以补到今天，也可以转成"任务"功能的今日任务；备注帮助下次接着学。
 */
function KaoyanDailyPlanCard({ today }: { today: string }) {
  const {
    kaoyanDailyPlan, addKaoyanDailyItem, removeKaoyanDailyItem,
    toggleKaoyanDailyItem, setKaoyanDailyNote, addTask,
  } = useAppStore();
  const showMessage = useM3Feedback().showMessage;
  const { items, history } = kaoyanDailyPlan;
  const entry = history[today] ?? { done: [], note: "" };
  const doneCount = items.filter((item) => entry.done.includes(item.id)).length;
  const percent = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  const [draftTitle, setDraftTitle] = useState("");
  const [noteDraft, setNoteDraft] = useState(history[today]?.note ?? "");
  const noteDirtyRef = useRef(false);
  const [taskFeedback, setTaskFeedback] = useState("");

  // 跨零点/进页面时以持久化值为准；防抖自动保存备注，未变化不落盘。
  useEffect(() => {
    setNoteDraft(history[today]?.note ?? "");
    noteDirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);
  useEffect(() => {
    if (!noteDirtyRef.current) return;
    const timer = window.setTimeout(() => {
      noteDirtyRef.current = false;
      setKaoyanDailyNote(today, noteDraft);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [noteDraft, today, setKaoyanDailyNote]);

  // 最近一个有记录的过去日期：上次进度 + 未完成项
  const lastDate = useMemo(() => (
    Object.keys(history)
      .filter((date) => date < today && (history[date]!.note.trim() || history[date]!.done.length > 0))
      .sort()
      .pop()
  ), [history, today]);
  const lastEntry = lastDate ? history[lastDate] : undefined;
  const unfinishedFromLast = lastDate && lastEntry
    ? items.filter((item) => lastEntry.done.includes(item.id) && !entry.done.includes(item.id))
    : [];

  const last7 = useMemo(() => {
    const out: Array<{ date: string; percent: number }> = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const cursor = new Date(`${today}T00:00:00`);
      cursor.setDate(cursor.getDate() - offset);
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      const dayEntry = history[key];
      const done = dayEntry ? items.filter((item) => dayEntry.done.includes(item.id)).length : 0;
      out.push({ date: key, percent: items.length ? Math.round((done / items.length) * 100) : 0 });
    }
    return out;
  }, [history, items, today]);

  function submitItem(event: FormEvent) {
    event.preventDefault();
    if (!draftTitle.trim()) return;
    addKaoyanDailyItem(draftTitle);
    setDraftTitle("");
  }

  function carryOver() {
    for (const item of unfinishedFromLast) toggleKaoyanDailyItem(item.id, today);
    showMessage(`已补上 ${unfinishedFromLast.length} 项到今天`, { durationMs: 1800 });
  }

  function pushUnfinishedToTasks() {
    const pending = items.filter((item) => !entry.done.includes(item.id));
    if (pending.length === 0) return;
    for (const item of pending) addTask(item.title, today);
    setTaskFeedback(`已把 ${pending.length} 项加入今日任务`);
    window.setTimeout(() => setTaskFeedback(""), 2400);
  }

  return <section className="card kaoyan-daily-plan" aria-label="每日计划与进度">
    <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
      <div><h3>每日计划与进度</h3><p className="muted">每天勾选完成项，写好进度，下次接着学</p></div>
      <span className={percent === 100 && items.length > 0 ? "kaoyan-chip done" : "kaoyan-chip accent"}>{percent}% 今日完成</span>
    </div>
    <ProgressBar percent={percent} color={percent === 100 && items.length > 0 ? "#43A88B" : "#5B8DEF"} />
    <label className="kaoyan-daily-note">
      <span className="muted">今日进度（学到哪、下次从哪继续）</span>
      <textarea
        className="field"
        rows={4}
        value={noteDraft}
        placeholder="例：高数刷完第 3 章例题，明天从 3.4 继续…"
        onChange={(event) => {
          noteDirtyRef.current = true;
          setNoteDraft(event.target.value);
        }}
      />
    </label>
    <div className="kaoyan-daily-items">
      {items.map((item) => {
        const done = entry.done.includes(item.id);
        return <div key={item.id} className="kaoyan-daily-item">
          <button
            type="button"
            className={done ? "day-check on" : "day-check"}
            aria-pressed={done}
            aria-label={done ? `取消完成：${item.title}` : `完成：${item.title}`}
            onClick={() => toggleKaoyanDailyItem(item.id, today)}
          >{done && <Check size={14} />}</button>
          <span className={done ? "kaoyan-daily-title done" : "kaoyan-daily-title"}>{item.title}</span>
          <button type="button" className="icon-button" aria-label={`删除计划项 ${item.title}`} title="删除计划项" onClick={() => removeKaoyanDailyItem(item.id)}>
            <Trash2 size={14} />
          </button>
        </div>;
      })}
      {items.length === 0 && <p className="muted">还没有固定计划项，先添加几条（例如：背 50 词、一套数学卷）。</p>}
    </div>
    <form className="kaoyan-form" onSubmit={submitItem}>
      <input className="field" value={draftTitle} placeholder="添加每日计划项…" aria-label="添加每日计划项" onChange={(event) => setDraftTitle(event.target.value)} />
      <button className="primary compact" type="submit" disabled={!draftTitle.trim()}>添加</button>
    </form>
    {unfinishedFromLast.length > 0 && (
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="ghost-btn compact" onClick={carryOver}>
          上次有 {unfinishedFromLast.length} 项未完成，补到今天
        </button>
      </div>
    )}
    <div className="row" style={{ justifyContent: "space-between", marginTop: 8, gap: 8 }}>
      <span className="muted" style={{ fontSize: 12 }}>
        进度自动保存{lastDate && lastEntry?.note.trim() ? ` · 上次（${lastDate.slice(5)}）：${lastEntry.note.trim().slice(0, 26)}` : ""}
      </span>
      {items.some((item) => !entry.done.includes(item.id)) && (
        <button type="button" className="ghost-btn compact" onClick={pushUnfinishedToTasks}>未完成转今日任务</button>
      )}
    </div>
    {taskFeedback && <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 0" }}>{taskFeedback}</p>}
    <div className="kaoyan-goal-bars" aria-label="最近 7 天每日计划完成率">
      {last7.map((day) => (
        <div key={day.date} className="kaoyan-goal-bar-col" title={`${day.date.slice(5)} · ${day.percent}%`}>
          <div className="kaoyan-goal-bar" style={{ height: Math.max(4, Math.round((day.percent / 100) * 46)), backgroundColor: day.percent === 100 && items.length > 0 ? "#43A88B" : "#5B8DEF" }} />
          <span>{day.date.slice(5)}</span>
        </div>
      ))}
    </div>
  </section>;
}

function SubjectForm({ subject, onDone }: { subject?: StudySubject; onDone: () => void }) {
  const { addSubject, updateSubject } = useAppStore();
  const [title, setTitle] = useState(subject?.title ?? "");
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS[0]);
  const valid = title.trim().length > 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    if (subject) updateSubject(subject.id, title, color);
    else addSubject(title, color);
    onDone();
  }

  return <form className="kaoyan-form" onSubmit={submit}>
    <input className="field" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：高数、英语、政治" />
    <div className="color-picker" aria-label="科目颜色">
      {SUBJECT_COLORS.map((value) => <button key={value} type="button" aria-label={`使用颜色 ${value}`} className={color === value ? "color-swatch active" : "color-swatch"} style={{ backgroundColor: value }} onClick={() => setColor(value)} />)}
    </div>
    <div className="form-actions">
      <button className="ghost-btn" type="button" onClick={onDone}>取消</button>
      <button className="primary compact" type="submit" disabled={!valid} title={valid ? undefined : "请填写科目名称"}>{subject ? "保存科目" : "添加科目"}</button>
    </div>
  </form>;
}

function UnitForm({ subjectId, unit, onDone }: { subjectId: string; unit?: StudyUnit; onDone: () => void }) {
  const { addStudyUnit, updateStudyUnit } = useAppStore();
  const today = todayKey();
  const [title, setTitle] = useState(unit?.title ?? "");
  const [startDate, setStartDate] = useState(unit?.startDate ?? today);
  const [endDate, setEndDate] = useState(unit?.endDate ?? today);
  // 日期必须非空："" <= "2026-09-12" 按字典序为真，缺这个检查时清空日期
  // 的表单会通过前端校验、被 store 静默拒绝，条目无声丢失。
  const valid = title.trim().length > 0 && startDate !== "" && endDate !== "" && startDate <= endDate;

  function changeStartDate(next: string) {
    setStartDate(next);
    // 开始日期越过结束日期时自动顶高结束，避免表单提交被 store 静默拒绝。
    if (next > endDate) setEndDate(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    if (unit) updateStudyUnit(unit.id, title, startDate, endDate);
    else addStudyUnit(subjectId, title, startDate, endDate);
    onDone();
  }

  return <form className="kaoyan-form" onSubmit={submit}>
    <input className="field" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：函数极限、阅读理解" />
    <div className="date-fields">
      <label>开始<input className="field" type="date" value={startDate} onChange={(event) => changeStartDate(event.target.value)} /></label>
      <label>结束<input className="field" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
    </div>
    <div className="form-actions">
      <button className="ghost-btn" type="button" onClick={onDone}>取消</button>
      <button className="primary compact" type="submit" disabled={!valid} title={valid ? undefined : "请填写名称并确保结束不早于开始"}>{unit ? "保存小类" : "添加小类"}</button>
    </div>
  </form>;
}

function ExamCountdownHero({ today }: { today: string }) {
  const kaoyanExamDate = useAppStore((state) => state.kaoyanExamDate);
  const subjects = useAppStore((state) => state.subjects);
  const setKaoyanExamDate = useAppStore((state) => state.setKaoyanExamDate);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const examDate = currentExamDate(today, kaoyanExamDate);
  const days = daysUntil(examDate);
  const examLabel = kaoyanExamLabel(examDate);
  const nextMilestones = useMemo(
    () => kaoyanMilestones(examDate).filter((item) => item.date >= today).slice(0, 3),
    [examDate, today],
  );

  return <section className="kaoyan-exam-hero card">
    <div className="kaoyan-exam-main">
      <div>
        <p className="eyebrow">{examLabel}</p>
        <p className="kaoyan-exam-date">{formatDateLabel(examDate)}</p>
        <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
          {days > 0 ? <>距离初试还有 <strong style={{ fontSize: 15 }}>{days}</strong> 天</> : "初试日已到，全力以赴"}
          {subjects.length > 0 && <> · {subjects.length} 个科目在复习</>}
        </p>
      </div>
      {!editing
        ? <button className="ghost-btn compact" onClick={() => { setDraft(examDate); setEditing(true); }}>调整日期</button>
        : <div className="kaoyan-exam-edit">
            <input className="field" type="date" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <button className="primary compact" onClick={() => { if (draft) setKaoyanExamDate(draft); setEditing(false); }}>保存</button>
            {kaoyanExamDate && <button className="ghost-btn compact" onClick={() => { setKaoyanExamDate(null); setEditing(false); }}>恢复自动</button>}
            <button className="ghost-btn compact" onClick={() => setEditing(false)}>取消</button>
          </div>}
    </div>
    {nextMilestones.length > 0 && <div className="kaoyan-milestones">
      {nextMilestones.map((item) => {
        const remaining = daysUntil(item.date);
        return <span key={item.name} className="kaoyan-milestone" title={item.note}>
          <strong>{item.name}</strong>
          <em>{remaining > 0 ? `剩 ${remaining} 天` : "进行中"}</em>
        </span>;
      })}
    </div>}
  </section>;
}

function ReviewTab({ today }: { today: string }) {
  const { subjects, wrongQuestions, reviewItems, addWrongQuestion, removeWrongQuestion, addReviewItem, removeReviewItem, reviewReviewItem } = useAppStore();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTitle, setCustomTitle] = useState("");

  const stats = reviewStats(reviewItems, today);
  const dueItems = useMemo(
    () => reviewItems
      .filter((item) => item.dueDate <= today && !isReviewMastered(item))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [reviewItems, today],
  );
  const upcoming = useMemo(
    () => reviewItems
      .filter((item) => item.dueDate > today && !isReviewMastered(item))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 6),
    [reviewItems, today],
  );

  function toggleTag(tag: string) {
    setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  function submitWrongQuestion(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    addWrongQuestion({ title, subjectId: subjectId || undefined, note, tags });
    setTitle("");
    setNote("");
    setTags([]);
  }

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const question of wrongQuestions) {
      for (const tag of question.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [wrongQuestions]);

  return <div className="stack" style={{ gap: 13 }}>
    <section className="card" data-tour-target="kaoyan-review">
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <h3>今日复习</h3>
          <p className="muted">按艾宾浩斯周期 1/2/4/7/15/30 天安排重看</p>
        </div>
        <div className="kaoyan-review-chips">
          <span className="kaoyan-chip accent">待复习 {stats.dueToday}</span>
          <span className="kaoyan-chip">未到期 {stats.upcoming}</span>
          <span className="kaoyan-chip done">已掌握 {stats.mastered}</span>
        </div>
      </div>
      {dueItems.length === 0
        ? <p className="empty">今天没有到期的复习内容。错题和笔记会在合适的时间回到这里。</p>
        : <div className="kaoyan-review-queue" data-tour-target="review-queue">
          {dueItems.slice(0, 8).map((item) => {
            const subject = subjects.find((entry) => entry.id === item.subjectId);
            const overdue = item.dueDate < today;
            return <article key={item.id} className="kaoyan-review-card">
              <div className="kaoyan-review-body">
                <strong>{item.title}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {subject ? `${subject.title} · ` : ""}第 {item.stage + 1} 轮{overdue ? ` · 原定 ${formatDateLabel(item.dueDate)}` : ""}
                </span>
              </div>
              <div className="kaoyan-review-actions">
                <button className="ghost-btn compact" onClick={() => reviewReviewItem(item.id, false)} title="回到第一轮，明天再见">忘了</button>
                <button className="primary compact" onClick={() => reviewReviewItem(item.id, true)} title={item.stage === REVIEW_INTERVAL_DAYS.length - 1 ? "记得，完成全部复习周期" : `记得，${REVIEW_INTERVAL_DAYS[item.stage + 1]} 天后再复习`}>记得</button>
              </div>
            </article>;
          })}
          {dueItems.length > 8 && <p className="muted" style={{ fontSize: 12.5 }}>还有 {dueItems.length - 8} 项待复习，完成上面的会继续出现。</p>}
        </div>}
      {upcoming.length > 0 && <div className="kaoyan-upcoming">
        <p className="muted" style={{ fontSize: 12.5 }}>接下来：</p>
        {upcoming.map((item) => <span key={item.id} className="kaoyan-chip">{item.title.slice(0, 14)} · {formatDateLabel(item.dueDate)}</span>)}
      </div>}
    </section>

    <section className="card">
      <h3>记录错题</h3>
      <p className="muted" style={{ marginBottom: 10 }}>录入后自动进入上面的复习队列</p>
      <form className="kaoyan-form" onSubmit={submitWrongQuestion}>
        <input className="field" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="错题标题，例如：2018 数一 第 12 题" />
        <input className="field" value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注（可选）：错因、正确思路、页码" />
        <div className="kaoyan-form-row">
          <select className="field" value={subjectId} onChange={(event) => setSubjectId(event.target.value)} aria-label="所属科目">
            <option value="">未指定科目</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}
          </select>
          <div className="kaoyan-tag-picker" aria-label="错误原因标签">
            {WRONG_TAGS.map((tag) => <button key={tag} type="button" className={tags.includes(tag) ? "kaoyan-tag on" : "kaoyan-tag"} onClick={() => toggleTag(tag)}>{tag}</button>)}
          </div>
        </div>
        <div className="form-actions">
          <button className="primary compact" type="submit" disabled={!title.trim()}>加入错题本</button>
        </div>
      </form>
      {tagCounts.length > 0 && <div className="kaoyan-upcoming" style={{ marginTop: 10 }}>
        <p className="muted" style={{ fontSize: 12.5 }}>薄弱点分布：</p>
        {tagCounts.map(([tag, count]) => <span key={tag} className="kaoyan-chip warn">{tag} × {count}</span>)}
      </div>}
      {wrongQuestions.length === 0
        ? <p className="empty" style={{ marginTop: 10 }}>还没有错题。做错的题记下来，比多做新题更有价值。</p>
        : <div className="kaoyan-question-list">
          {wrongQuestions.map((question) => {
            const subject = subjects.find((entry) => entry.id === question.subjectId);
            return <div key={question.id} className="kaoyan-question-row">
              <div className="kaoyan-review-body">
                <strong>{question.title}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {subject ? `${subject.title} · ` : ""}{question.tags.join(" / ") || "未打标签"} · 记录于 {formatDateLabel(todayKey(new Date(question.createdAt)))}
                </span>
              </div>
              <button title="删除错题" aria-label="删除错题" className="delete-icon" onClick={() => removeWrongQuestion(question.id)}><Trash2 size={16} /></button>
            </div>;
          })}
        </div>}
    </section>

    <section className="card">
      <h3>自定义复习内容</h3>
      <p className="muted" style={{ marginBottom: 10 }}>政治大题、作文模板、专业课名词解释……任何需要反复记的内容</p>
      <div className="kaoyan-form-row">
        <input className="field" value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="例如：马原辩证法大题模板" />
        <button className="primary compact" disabled={!customTitle.trim()} onClick={() => { addReviewItem(customTitle); setCustomTitle(""); }}>加入复习</button>
      </div>
      {reviewItems.some((item) => item.sourceType === "custom") && <div className="kaoyan-question-list" style={{ marginTop: 10 }}>
        {reviewItems.filter((item) => item.sourceType === "custom").map((item) => <div key={item.id} className="kaoyan-question-row">
          <div className="kaoyan-review-body">
            <strong>{item.title}</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>下次复习 {formatDateLabel(item.dueDate)}（{item.dueDate > today ? "未到期" : "已到期"}）</span>
          </div>
          <button title="删除复习项" aria-label="删除复习项" className="delete-icon" onClick={() => removeReviewItem(item.id)}><Trash2 size={16} /></button>
        </div>)}
      </div>}
    </section>
  </div>;
}

function MockTab({ today }: { today: string }) {
  const { subjects, mockExams, addMockExam, removeMockExam } = useAppStore();
  const [date, setDate] = useState(today);
  const [subject, setSubject] = useState("");
  const [paperName, setPaperName] = useState("");
  const [score, setScore] = useState("");
  const [total, setTotal] = useState("");

  const stats = useMemo(() => mockExamStats(mockExams), [mockExams]);
  const suggestions = useMemo(() => {
    const names = new Set(subjects.map((item) => item.title));
    ["数学", "英语", "政治", "专业课"].forEach((name) => names.add(name));
    return [...names];
  }, [subjects]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsedScore = Number.parseFloat(score);
    const parsedTotal = Number.parseFloat(total);
    if (!subject.trim() || !Number.isFinite(parsedScore) || !Number.isFinite(parsedTotal) || parsedTotal <= 0) return;
    addMockExam({ date, subject, paperName, score: parsedScore, total: parsedTotal });
    setPaperName("");
    setScore("");
    setTotal("");
  }

  const sorted = useMemo(
    () => [...mockExams].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [mockExams],
  );

  return <div className="stack" style={{ gap: 13 }}>
    <section className="card">
      <h3>记录模考</h3>
      <p className="muted" style={{ marginBottom: 10 }}>真题套卷、模拟卷都可以，趋势比单次分数更重要</p>
      <form className="kaoyan-form" onSubmit={submit}>
        <div className="kaoyan-form-row">
          <input className="field" type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="模考日期" />
          <input className="field" list="kaoyan-subject-options" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="科目" />
          <datalist id="kaoyan-subject-options">{suggestions.map((name) => <option key={name} value={name} />)}</datalist>
        </div>
        <div className="kaoyan-form-row">
          <input className="field" value={paperName} onChange={(event) => setPaperName(event.target.value)} placeholder="试卷名（例如：李林六套卷一）" />
          <input className="field kaoyan-score-input" type="number" value={score} onChange={(event) => setScore(event.target.value)} placeholder="得分" min={0} />
          <span className="muted" style={{ alignSelf: "center" }}>/</span>
          <input className="field kaoyan-score-input" type="number" value={total} onChange={(event) => setTotal(event.target.value)} placeholder="满分" min={1} />
        </div>
        <div className="form-actions">
          <button className="primary compact" type="submit" disabled={!date || !subject.trim() || !score || !total} title={date ? undefined : "请选择模考日期"}>记录这次模考</button>
        </div>
      </form>
    </section>

    {stats.length > 0 && <section className="card">
      <h3>各科走势</h3>
      <div className="kaoyan-mock-stats">
        {stats.map((item) => {
          const latestExam = [...mockExams].filter((exam) => (exam.subject.trim() || "未分类") === item.subject).sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date))).at(-1);
          return <article key={item.subject} className="kaoyan-mock-card">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
              <strong>{item.subject}</strong>
              <span className="muted" style={{ fontSize: 12 }}>{item.count} 次</span>
            </div>
            <p className="kaoyan-mock-score">{item.latest}<span className="muted"> / {latestExam?.total ?? "--"}</span></p>
            <div className="kaoyan-mock-meta">
              <span>平均 {item.average}</span>
              <span>最高 {item.best}</span>
              {item.trend !== 0 && (item.trend > 0
                ? <span className="kaoyan-trend up"><TrendingUp size={13} /> +{item.trend}</span>
                : <span className="kaoyan-trend down"><TrendingDown size={13} /> {item.trend}</span>)}
            </div>
          </article>;
        })}
      </div>
    </section>}

    {sorted.length > 0 && <section className="card">
      <h3>模考记录</h3>
      <div className="kaoyan-question-list">
        {sorted.map((exam) => <div key={exam.id} className="kaoyan-question-row">
          <div className="kaoyan-review-body">
            <strong>{exam.subject} · {exam.paperName}</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>{formatDateLabel(exam.date)} · {exam.score} / {exam.total} 分（{Math.round((exam.score / exam.total) * 100)}%）</span>
          </div>
          <button title="删除记录" aria-label="删除记录" className="delete-icon" onClick={() => removeMockExam(exam.id)}><Trash2 size={16} /></button>
        </div>)}
      </div>
    </section>}
    {mockExams.length === 0 && <p className="empty" style={{ padding: "6px 4px" }}>还没有模考记录。进入 10 月后建议每周一次整卷模考。</p>}
  </div>;
}

function WordsTab({ today }: { today: string }) {
  const { kaoyanWords, reviewItems, addWord, removeWord, reviewReviewItem } = useAppStore();
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [showAnswerId, setShowAnswerId] = useState<string | null>(null);
  const [imported, setImported] = useState(false);

  const wordById = useMemo(() => new Map(kaoyanWords.map((entry) => [entry.id, entry])), [kaoyanWords]);
  const wordReviews = useMemo(() => reviewItems.filter((item) => item.sourceType === "word"), [reviewItems]);

  // 计数用未截断的完整待复习队列，并剔除已被删除的单词留下的孤儿复习项；
  // 展示列表再截前 10 条。
  const dueQueue = useMemo(
    () => wordReviews
      .filter((item) => item.dueDate <= today && !isReviewMastered(item) && wordById.has(item.sourceId ?? ""))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, wordReviews, wordById],
  );
  const dueWords = useMemo(() => dueQueue.slice(0, 10), [dueQueue]);
  const masteredCount = wordReviews.filter((item) => isReviewMastered(item) && wordById.has(item.sourceId ?? "")).length;

  function submitWord(event: FormEvent) {
    event.preventDefault();
    if (!word.trim()) return;
    addWord(word, meaning);
    setWord("");
    setMeaning("");
  }

  function importDefaults() {
    const existing = new Set(kaoyanWords.map((entry) => entry.word.toLowerCase()));
    for (const entry of DEFAULT_KAOYAN_WORDS) {
      if (existing.has(entry.word.toLowerCase())) continue;
      addWord(entry.word, entry.meaning);
    }
    setImported(true);
  }

  return <div className="stack" style={{ gap: 13 }}>
    <section className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <h3>今日背词</h3>
          <p className="muted">按艾宾浩斯周期 1/2/4/7/15/30 天自动排期</p>
        </div>
        <div className="kaoyan-review-chips">
          <span className="kaoyan-chip accent">待复习 {dueQueue.length}</span>
          <span className="kaoyan-chip done">已掌握 {masteredCount}</span>
        </div>
      </div>
      {dueQueue.length === 0 ? (
        <p className="empty">今天没有到期的单词。先添加或导入词表，新单词会在明天进入复习。</p>
      ) : (
        <div className="kaoyan-review-queue">
          {dueWords.map((item) => {
            const entry = wordById.get(item.sourceId ?? "");
            if (!entry) return null;
            const revealed = showAnswerId === item.id;
            return <article key={item.id} className="kaoyan-review-card">
              <div className="kaoyan-review-body">
                <strong>{entry.word}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  第 {item.stage + 1} 轮 · {revealed ? entry.meaning : "点击下方按钮查看释义"}
                </span>
              </div>
              <div className="kaoyan-review-actions">
                <button className="ghost-btn compact" onClick={() => { reviewReviewItem(item.id, false); setShowAnswerId(null); }} title="忘了，明天重新来过">忘了</button>
                <button className="ghost-btn compact" onClick={() => setShowAnswerId(revealed ? null : item.id)} title="查看释义">{revealed ? "收起释义" : "看释义"}</button>
                <button className="primary compact" onClick={() => { reviewReviewItem(item.id, true); setShowAnswerId(null); }} title={item.stage === REVIEW_INTERVAL_DAYS.length - 1 ? "记得，完成全部复习周期" : `记得，${REVIEW_INTERVAL_DAYS[item.stage + 1]} 天后再复习`}>记得</button>
              </div>
            </article>;
          })}
        </div>
      )}
    </section>

    <section className="card">
      <h3>添加单词</h3>
      <p className="muted" style={{ marginBottom: 10 }}>录入后自动进入上面的背词队列</p>
      <form className="kaoyan-form" onSubmit={submitWord}>
        <input className="field" autoFocus value={word} onChange={(event) => setWord(event.target.value)} placeholder="单词，例如：meticulous" />
        <input className="field" value={meaning} onChange={(event) => setMeaning(event.target.value)} placeholder="释义（可选），例如：adj. 一丝不苟的" />
        <div className="form-actions">
          <button className="primary compact" type="submit" disabled={!word.trim()}>加入词本</button>
          <button className="ghost-btn compact" type="button" onClick={importDefaults} disabled={imported}>
            {imported ? "已导入内置词表" : "导入内置词表"}
          </button>
        </div>
      </form>
    </section>

    {kaoyanWords.length > 0 && <section className="card">
      <h3>词表 · {kaoyanWords.length}</h3>
      <div className="kaoyan-question-list" style={{ marginTop: 8 }}>
        {kaoyanWords.slice(0, 200).map((entry) => <div key={entry.id} className="kaoyan-question-row">
          <div className="kaoyan-review-body">
            <strong>{entry.word}</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>{entry.meaning}</span>
          </div>
          <button title="删除单词" aria-label="删除单词" className="delete-icon" onClick={() => removeWord(entry.id)}><Trash2 size={16} /></button>
        </div>)}
      </div>
    </section>}
  </div>;
}

function StatsTab({ today }: { today: string }) {
  const { focusSessions, studyUnits, wrongQuestions, mockExams, subjects } = useAppStore();

  const { activityDates, focusMinutesTotal, streak } = useMemo(() => {
    const dates = new Set<string>();
    let minutes = 0;
    for (const session of focusSessions) {
      dates.add(session.date);
      minutes += session.minutes;
    }
    for (const unit of studyUnits) {
      for (const date of unit.completedDates) dates.add(date);
    }
    // createdAt 是 UTC ISO 时间戳；统一转成本地日期键，避免 UTC+8 凌晨时段错一天
    for (const question of wrongQuestions) {
      const parsed = new Date(question.createdAt);
      if (!Number.isNaN(parsed.getTime())) dates.add(todayKey(parsed));
    }
    for (const exam of mockExams) dates.add(exam.date);
    let consecutive = 0;
    const cursor = new Date(`${today}T00:00:00`);
    if (!dates.has(today)) cursor.setDate(cursor.getDate() - 1);
    while (dates.has(todayKey(cursor))) {
      consecutive += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { activityDates: [...dates], focusMinutesTotal: minutes, streak: consecutive };
  }, [focusSessions, studyUnits, wrongQuestions, mockExams, today]);

  const checkedCount = studyUnits.reduce((sum, unit) => sum + unit.completedDates.length, 0);

  return <div className="stack" style={{ gap: 13 }}>
    <section className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <div>
          <h3>学习热力图</h3>
          <p className="muted">专注、打卡、错题、模考——任何一天的学习都会点亮</p>
        </div>
      </div>
      <Heatmap checkedDates={activityDates} weeks={20} today={today} />
    </section>
    <section className="card">
      <h3>累计</h3>
      <div className="kaoyan-mock-stats">
        <article className="kaoyan-mock-card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><strong>专注时长</strong><GraduationCap size={16} /></div>
          <p className="kaoyan-mock-score">{Math.floor(focusMinutesTotal / 60)}<span className="muted"> 小时 {focusMinutesTotal % 60} 分</span></p>
          <div className="kaoyan-mock-meta"><span>{focusSessions.length} 次专注</span></div>
        </article>
        <article className="kaoyan-mock-card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><strong>连续学习</strong><Flame size={16} /></div>
          <p className="kaoyan-mock-score">{streak}<span className="muted"> 天</span></p>
          <div className="kaoyan-mock-meta"><span>{activityDates.length} 天有记录</span></div>
        </article>
        <article className="kaoyan-mock-card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><strong>计划打卡</strong><Check size={16} /></div>
          <p className="kaoyan-mock-score">{checkedCount}<span className="muted"> 次</span></p>
          <div className="kaoyan-mock-meta"><span>{subjects.length} 科目 · {studyUnits.length} 小类</span></div>
        </article>
        <article className="kaoyan-mock-card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><strong>错题·模考</strong><ClipboardList size={16} /></div>
          <p className="kaoyan-mock-score">{wrongQuestions.length}<span className="muted"> 道错题</span></p>
          <div className="kaoyan-mock-meta"><span>{mockExams.length} 次模考</span></div>
        </article>
      </div>
    </section>
  </div>;
}


function KaoyanStudyActions({ title }: { title: string }) {
  const openBilibiliSearch = useAppStore((state) => state.openBilibiliSearch);
  const setView = useAppStore((state) => state.setView);
  return (
    <div className="kaoyan-study-actions">
      <button type="button" className="m3-outlined-btn" aria-label={`搜${title}课`} onClick={() => openBilibiliSearch(kaoyanCourseQuery(title))}>搜课</button>
      <button type="button" className="m3-filled-btn" aria-label={`开始专注${title}`} onClick={() => setView("focus-dashboard")}>开始专注</button>
    </div>
  );
}

export function KaoyanView({ embedded = false }: { embedded?: boolean } = {}) {
  const { subjects, studyUnits, removeSubject, removeStudyUnit, moveSubject, moveStudyUnit, toggleStudyDate, openBilibiliSearch } = useAppStore();
  const [tab, setTab] = useState<Tab>("plan");
  const [page, setPage] = useState<Page>({ kind: "subjects" });
  const [addingSubject, setAddingSubject] = useState(false);
  const [editingSubject, setEditingSubject] = useState<string | null>(null);
  const [addingUnit, setAddingUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [draggedSubjectId, setDraggedSubjectId] = useState<string | null>(null);
  const [draggedUnitId, setDraggedUnitId] = useState<string | null>(null);
  const today = todayKey();

  const subject = page.kind === "subject" ? subjects.find((item) => item.id === page.subjectId) : undefined;
  const unit = page.kind === "unit" ? studyUnits.find((item) => item.id === page.unitId) : undefined;
  const unitSubject = unit ? subjects.find((item) => item.id === unit.subjectId) : undefined;
  const subjectUnits = subject ? studyUnits.filter((item) => item.subjectId === subject.id) : [];

  function moveByDrop(ids: string[], draggedId: string, targetId: string, move: (id: string, direction: -1 | 1) => void) {
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    const direction = from < to ? 1 : -1;
    for (let step = from; step !== to; step += direction) move(draggedId, direction);
  }

  return (
    <RixiaWorkspacePage title="考研计划" embedded={embedded}>
    <div className="stack kaoyan-view">
    <section className="m3-card kaoyan-course-search">
      <div className="row" style={{ marginBottom: 8 }}>
        <div>
          <h3>专注搜课</h3>
          <p className="muted">不刷推荐，直接搜考研课</p>
        </div>
      </div>
      <div className="kaoyan-course-chips">
        {COURSE_SEARCHES.map((item) => (
          <button key={item.query} type="button" className="m3-outlined-btn" aria-label={item.aria} onClick={() => openBilibiliSearch(item.query)}>
            {item.label}
          </button>
        ))}
      </div>
    </section>
    <ExamCountdownHero today={today} />
    <FocusGoalCard />
    <PlanOverviewCard today={today} />
    <KaoyanDailyPlanCard today={today} />
    <div className="kaoyan-tabs" role="tablist" aria-label="考研功能区">
      {TABS.map(({ key, label, icon: Icon }) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "kaoyan-tab on" : "kaoyan-tab"} onClick={() => setTab(key)}><Icon size={15} /> {label}</button>)}
    </div>

    {tab === "words" && <WordsTab today={today} />}
    {tab === "review" && <ReviewTab today={today} />}
    {tab === "mock" && <MockTab today={today} />}
    {tab === "stats" && <StatsTab today={today} />}

    {tab === "plan" && page.kind === "unit" && unit && unitSubject && (() => {
      const dates = dateKeysInRange(unit.startDate, unit.endDate);
      const progress = unitProgress(unit);
      return <div className="stack" style={{ gap: 13 }}>
        <button className="back-button" onClick={() => setPage({ kind: "subject", subjectId: unit.subjectId })}><ArrowLeft size={18} /> {unitSubject.title}</button>
        <section className="kaoyan-hero card" style={{ "--subject-color": unitSubject.color } as CSSProperties}>
          <div className="hero-with-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <p className="eyebrow">学习小类</p>
              <h2>{unit.title}</h2>
              <p className="muted" style={{ marginTop: 8 }}>{formatDateLabel(unit.startDate)} 至 {formatDateLabel(unit.endDate)} · 共 {progress.total} 天</p>
              <KaoyanStudyActions title={unit.title} />
            </div>
            <ProgressRing percent={progress.percent} size={86} stroke={8} color={unitSubject.color}>
              <div>
                <strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{progress.percent}%</strong>
                <p className="muted" style={{ fontSize: 10.5 }}>{progress.completed}/{progress.total} 天</p>
              </div>
            </ProgressRing>
          </div>
        </section>
        <section className="card timeline-card">
          <div className="row"><div><h3>每日时间线</h3><p className="muted">可补打，也可取消</p></div><button title="编辑小类" aria-label="编辑小类" className="icon-button" onClick={() => setEditingUnit(unit.id)}><Pencil size={17} /></button></div>
          {editingUnit === unit.id && <UnitForm subjectId={unit.subjectId} unit={unit} onDone={() => setEditingUnit(null)} />}
          <div className="timeline">
            {dates.map((date, index) => {
              const checked = unit.completedDates.includes(date);
              const dateObject = new Date(`${date}T00:00:00`);
              const isToday = date === today;
              const weekStart = index === 0 || dateObject.getDay() === 1;
              return <div key={date}>
                {weekStart && <p className="week-label">{dateObject.getMonth() + 1} 月第 {Math.ceil(dateObject.getDate() / 7)} 周</p>}
                <button className={isToday ? "timeline-day today" : "timeline-day"} onClick={() => toggleStudyDate(unit.id, date)}>
                  <span className="date-number">{dateObject.getDate()}</span><span>{weekdayLabel(dateObject)}{isToday ? " · 今天" : ""}</span>
                  <span className={checked ? "day-check on" : "day-check"}>{checked && <Check size={14} />}</span>
                </button>
              </div>;
            })}
          </div>
        </section>
      </div>;
    })()}

    {tab === "plan" && page.kind === "subject" && subject && (() => {
      const progress = subjectProgress(subjectUnits);
      return <div className="stack" style={{ gap: 13 }}>
        <button className="back-button" onClick={() => setPage({ kind: "subjects" })}><ArrowLeft size={18} /> 全部科目</button>
        <section className="kaoyan-hero card" style={{ "--subject-color": subject.color } as CSSProperties}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div className="row">
                <div>
                  <p className="eyebrow">考研科目</p>
                  <h2>{subject.title}</h2>
                  <KaoyanStudyActions title={subject.title} />
                </div>
                <button title="编辑科目" aria-label="编辑科目" className="icon-button" onClick={() => setEditingSubject(subject.id)}><Pencil size={17} /></button>
              </div>
            </div>
            <ProgressRing percent={progress.percent} size={86} stroke={8} color={subject.color}>
              <div>
                <strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{progress.percent}%</strong>
                <p className="muted" style={{ fontSize: 10.5 }}>{progress.completed}/{progress.total} 天</p>
              </div>
            </ProgressRing>
          </div>
          {editingSubject === subject.id && <SubjectForm subject={subject} onDone={() => setEditingSubject(null)} />}
        </section>
        <section className="card"><div className="row"><div><h3>学习小类</h3><p className="muted">章节与专项计划</p></div><button title="添加小类" aria-label="添加小类" className="add-round" onClick={() => setAddingUnit(!addingUnit)}><Plus size={18} /></button></div>
          {addingUnit && <UnitForm subjectId={subject.id} onDone={() => setAddingUnit(false)} />}
          {subjectUnits.length === 0 ? <p className="empty">先添加一个学习小类</p> : <div className="study-unit-list">
            {subjectUnits.map((item, index) => {
              const itemProgress = unitProgress(item);
              const checkedToday = item.completedDates.includes(today);
              return <article key={item.id} className="study-unit" draggable onDragStart={() => setDraggedUnitId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedUnitId) moveByDrop(subjectUnits.map((entry) => entry.id), draggedUnitId, item.id, moveStudyUnit); setDraggedUnitId(null); }}>
                <button className="drag-handle" title="拖动排序" aria-label="拖动排序"><GripVertical size={18} /></button>
                <button className="unit-main" onClick={() => setPage({ kind: "unit", unitId: item.id })}><strong>{item.title}</strong><span>{formatDateLabel(item.startDate)} - {formatDateLabel(item.endDate)} · {dueLabel(item.endDate)}</span><ProgressBar percent={itemProgress.percent} color={subject.color} /></button>
                <button title="完成今天" aria-label="完成今天" className={checkedToday ? "today-check on" : "today-check"} onClick={() => toggleStudyDate(item.id, today)}><Check size={16} /></button>
                <div className="reorder-actions"><button title="上移" aria-label="上移" disabled={index === 0} onClick={() => moveStudyUnit(item.id, -1)}><ChevronUp size={15} /></button><button title="下移" aria-label="下移" disabled={index === subjectUnits.length - 1} onClick={() => moveStudyUnit(item.id, 1)}><ChevronDown size={15} /></button></div>
                <button title="删除小类" aria-label="删除小类" className="delete-icon" onClick={() => removeStudyUnit(item.id)}><Trash2 size={16} /></button>
              </article>;
            })}
          </div>}
        </section>
      </div>;
    })()}

    {tab === "plan" && page.kind === "subjects" && (() => {
      const todayPending = studyUnits.filter(
        (item) => item.startDate <= today && today <= item.endDate && !item.completedDates.includes(today),
      );
      const overall = subjectProgress(studyUnits);
      return <div className="stack" style={{ gap: 13 }}>
        {studyUnits.length > 0 && (
          <section className="kaoyan-intro">
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ProgressRing percent={overall.percent} size={64} stroke={7}>
                <strong style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{overall.percent}%</strong>
              </ProgressRing>
              <p className="muted" style={{ fontSize: 13.5 }}>
                总进度 {overall.completed} / {overall.total} 天
                {todayPending.length > 0 && <> · 今天还有 <strong style={{ color: "var(--accent)" }}>{todayPending.length}</strong> 个小类待打卡</>}
              </p>
            </div>
          </section>
        )}

        {todayPending.length > 0 && (
          <section className="card">
            <div className="row">
              <div>
                <h3>今日待打卡</h3>
                <p className="muted">快速完成今天的学习计划</p>
              </div>
            </div>
            <div className="today-units">
              {todayPending.map((item) => {
                const itemSubject = subjects.find((entry) => entry.id === item.subjectId);
                return (
                  <div key={item.id} className="today-unit-row">
                    <div className="meta">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span className="subject-dot" style={{ backgroundColor: itemSubject?.color ?? "var(--accent)" }} />
                        <strong style={{ fontSize: 14 }}>{item.title}</strong>
                      </span>
                      <span>{itemSubject?.title} · {dueLabel(item.endDate)}</span>
                    </div>
                    <button
                      className="today-check"
                      title="完成今天"
                      aria-label="完成今天"
                      onClick={() => toggleStudyDate(item.id, today)}
                    >
                      <Check size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="card"><div className="row"><div><h3>我的科目</h3><p className="muted">{subjects.length ? `${subjects.length} 个复习大类` : "从第一个科目开始"}</p></div><button title="添加科目" aria-label="添加科目" className="add-round" onClick={() => setAddingSubject(!addingSubject)}><Plus size={18} /></button></div>
          {addingSubject && <SubjectForm onDone={() => setAddingSubject(false)} />}
          {subjects.length === 0 ? <div className="kaoyan-empty"><CalendarDays size={28} /><p>添加高数、英语、政治等科目，开始安排学习小类。</p></div> : <div className="subject-list">
            {subjects.map((item, index) => {
              const itemUnits = studyUnits.filter((entry) => entry.subjectId === item.id);
              const progress = subjectProgress(itemUnits);
              const completedUnits = itemUnits.filter((entry) => unitProgress(entry).percent === 100).length;
              const nearest = itemUnits.map((entry) => entry.endDate).sort()[0];
              return <article key={item.id} className="subject-card" draggable onDragStart={() => setDraggedSubjectId(item.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedSubjectId) moveByDrop(subjects.map((entry) => entry.id), draggedSubjectId, item.id, moveSubject); setDraggedSubjectId(null); }}>
                <button className="drag-handle" title="拖动排序" aria-label="拖动排序"><GripVertical size={18} /></button><button className="subject-main" onClick={() => setPage({ kind: "subject", subjectId: item.id })}><span className="subject-dot" style={{ backgroundColor: item.color }} /><strong>{item.title}</strong><span className="subject-percent">{progress.percent}%</span><ProgressBar percent={progress.percent} color={item.color} /><small>{completedUnits} / {itemUnits.length} 小类完成{nearest ? ` · 最近 ${formatDateLabel(nearest)}` : ""}</small></button>
                <div className="reorder-actions"><button title="上移" aria-label="上移" disabled={index === 0} onClick={() => moveSubject(item.id, -1)}><ChevronUp size={15} /></button><button title="下移" aria-label="下移" disabled={index === subjects.length - 1} onClick={() => moveSubject(item.id, 1)}><ChevronDown size={15} /></button></div><button title="删除科目" aria-label="删除科目" className="delete-icon" onClick={() => removeSubject(item.id)}><Trash2 size={16} /></button>
              </article>;
            })}
          </div>}
        </section>
      </div>;
    })()}
  </div>
    </RixiaWorkspacePage>
  );
}
