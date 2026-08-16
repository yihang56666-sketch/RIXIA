import { type CSSProperties, type FormEvent, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronUp, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { dateKeysInRange, subjectProgress, unitProgress } from "../../lib/kaoyan";
import { ProgressRing } from "../../components/ProgressRing";
import { daysUntil, formatDateLabel, todayKey, weekdayLabel } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";
import type { StudySubject, StudyUnit } from "../../types";

type Page = { kind: "subjects" } | { kind: "subject"; subjectId: string } | { kind: "unit"; unitId: string };

const SUBJECT_COLORS = ["#5B8DEF", "#A476E8", "#E88873", "#43A88B", "#D99A43", "#E06F9C"];

function dueLabel(endDate: string) {
  const days = daysUntil(endDate);
  if (days < 0) return "已结束";
  if (days === 0) return "今天结束";
  return `剩 ${days} 天`;
}

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%`, backgroundColor: color }} /></div>;
}

function SubjectForm({ subject, onDone }: { subject?: StudySubject; onDone: () => void }) {
  const { addSubject, updateSubject } = useAppStore();
  const [title, setTitle] = useState(subject?.title ?? "");
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS[0]);

  function submit(event: FormEvent) {
    event.preventDefault();
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
      <button className="primary compact" type="submit">{subject ? "保存科目" : "添加科目"}</button>
    </div>
  </form>;
}

function UnitForm({ subjectId, unit, onDone }: { subjectId: string; unit?: StudyUnit; onDone: () => void }) {
  const { addStudyUnit, updateStudyUnit } = useAppStore();
  const today = todayKey();
  const [title, setTitle] = useState(unit?.title ?? "");
  const [startDate, setStartDate] = useState(unit?.startDate ?? today);
  const [endDate, setEndDate] = useState(unit?.endDate ?? today);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (unit) updateStudyUnit(unit.id, title, startDate, endDate);
    else addStudyUnit(subjectId, title, startDate, endDate);
    onDone();
  }

  return <form className="kaoyan-form" onSubmit={submit}>
    <input className="field" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：函数极限、阅读理解" />
    <div className="date-fields">
      <label>开始<input className="field" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
      <label>结束<input className="field" type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
    </div>
    <div className="form-actions">
      <button className="ghost-btn" type="button" onClick={onDone}>取消</button>
      <button className="primary compact" type="submit">{unit ? "保存小类" : "添加小类"}</button>
    </div>
  </form>;
}

export function KaoyanView() {
  const { subjects, studyUnits, removeSubject, removeStudyUnit, moveSubject, moveStudyUnit, toggleStudyDate } = useAppStore();
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

  if (page.kind === "unit" && unit && unitSubject) {
    const dates = dateKeysInRange(unit.startDate, unit.endDate);
    const progress = unitProgress(unit);
    return <div className="stack kaoyan-view">
      <button className="back-button" onClick={() => setPage({ kind: "subject", subjectId: unit.subjectId })}><ArrowLeft size={18} /> {unitSubject.title}</button>
      <section className="kaoyan-hero card" style={{ "--subject-color": unitSubject.color } as CSSProperties}>
        <div className="hero-with-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <p className="eyebrow">学习小类</p>
            <h2>{unit.title}</h2>
            <p className="muted" style={{ marginTop: 8 }}>{formatDateLabel(unit.startDate)} 至 {formatDateLabel(unit.endDate)} · 共 {progress.total} 天</p>
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
  }

  if (page.kind === "subject" && subject) {
    const progress = subjectProgress(subjectUnits);
    return <div className="stack kaoyan-view">
      <button className="back-button" onClick={() => setPage({ kind: "subjects" })}><ArrowLeft size={18} /> 全部科目</button>
      <section className="kaoyan-hero card" style={{ "--subject-color": subject.color } as CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div className="row">
              <div>
                <p className="eyebrow">考研科目</p>
                <h2>{subject.title}</h2>
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
  }

  const todayPending = studyUnits.filter(
    (item) => item.startDate <= today && today <= item.endDate && !item.completedDates.includes(today),
  );
  const overall = subjectProgress(studyUnits);

  return <div className="stack kaoyan-view">
    <section className="kaoyan-intro">
      <p className="eyebrow">2026 考研计划</p>
      <h2>每天推进一点<br />终会走到终点</h2>
      {studyUnits.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
          <ProgressRing percent={overall.percent} size={64} stroke={7}>
            <strong style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{overall.percent}%</strong>
          </ProgressRing>
          <p className="muted" style={{ fontSize: 13.5 }}>
            总进度 {overall.completed} / {overall.total} 天
            {todayPending.length > 0 && <> · 今天还有 <strong style={{ color: "var(--accent)" }}>{todayPending.length}</strong> 个小类待打卡</>}
          </p>
        </div>
      )}
    </section>

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
}
