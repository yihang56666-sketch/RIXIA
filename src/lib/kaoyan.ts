export interface Progress {
  completed: number;
  total: number;
  percent: number;
}

export interface DatedStudyUnit {
  startDate: string;
  endDate: string;
  completedDates: string[];
}

function dateAtMidnight(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00Z`);
}

export function dateKeysInRange(startDate: string, endDate: string): string[] {
  const start = dateAtMidnight(startDate);
  const end = dateAtMidnight(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function unitProgress(unit: DatedStudyUnit): Progress {
  const plannedDates = dateKeysInRange(unit.startDate, unit.endDate);
  const plannedDateSet = new Set(plannedDates);
  const completed = new Set(unit.completedDates.filter((date) => plannedDateSet.has(date))).size;
  const total = plannedDates.length;
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}

export function subjectProgress(units: DatedStudyUnit[]): Progress {
  const progress = units.map(unitProgress);
  const completed = progress.reduce((sum, item) => sum + item.completed, 0);
  const total = progress.reduce((sum, item) => sum + item.total, 0);
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}

// ============ 考研专注扩展：艾宾浩斯复习 + 初试倒计时 + 模考 ============

import type { MockExam, ReviewItem, StudyUnit, WrongQuestion } from "../types";

export interface KaoyanPlanOverview {
  plannedDays: number;
  completedDays: number;
  progressPercent: number;
  todayTotal: number;
  todayCompleted: number;
  dueReviews: number;
  wrongQuestions: number;
}

/** 汇总计划首页需要的可操作指标，保持 UI 不重复计算业务规则。 */
export function kaoyanPlanOverview(
  units: StudyUnit[],
  reviews: ReviewItem[],
  wrongQuestions: WrongQuestion[],
  today: string,
): KaoyanPlanOverview {
  const progress = subjectProgress(units);
  const todayUnits = units.filter((unit) => unit.startDate <= today && today <= unit.endDate);
  const todayCompleted = todayUnits.filter((unit) => unit.completedDates.includes(today)).length;
  const dueReviews = reviewStats(reviews, today).dueToday;
  return {
    plannedDays: progress.total,
    completedDays: progress.completed,
    progressPercent: progress.percent,
    todayTotal: todayUnits.length,
    todayCompleted,
    dueReviews,
    wrongQuestions: wrongQuestions.length,
  };
}

/** 艾宾浩斯复习周期（天）：记住了就进入下一档，忘了回到第 1 档重来。 */
export const REVIEW_INTERVAL_DAYS = [1, 2, 4, 7, 15, 30];

export function nextReviewDue(fromDate: string, stage: number): string {
  const base = new Date(`${fromDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return fromDate;
  const interval = REVIEW_INTERVAL_DAYS[Math.min(Math.max(stage, 0), REVIEW_INTERVAL_DAYS.length - 1)];
  base.setUTCDate(base.getUTCDate() + interval);
  return base.toISOString().slice(0, 10);
}

/** 复习一次后的新阶段：记得 → 下一档（走完最后一档视为掌握）；忘了 → 归零。 */
export function nextReviewStage(stage: number, remembered: boolean): number {
  if (!remembered) return 0;
  return Math.min(stage + 1, REVIEW_INTERVAL_DAYS.length);
}

export function isReviewMastered(item: ReviewItem): boolean {
  return item.stage >= REVIEW_INTERVAL_DAYS.length && item.history.at(-1)?.remembered === true;
}

export interface ReviewStats {
  dueToday: number;
  upcoming: number;
  mastered: number;
}

/** 已完成全部周期且最后一次记得的条目视为掌握，不再进入待复习计数。 */
export function reviewStats(items: ReviewItem[], today: string): ReviewStats {
  let dueToday = 0;
  let upcoming = 0;
  let mastered = 0;
  for (const item of items) {
    if (isReviewMastered(item)) {
      mastered += 1;
      continue;
    }
    if (item.dueDate <= today) dueToday += 1;
    else upcoming += 1;
  }
  return { dueToday, upcoming, mastered };
}

export function kaoyanCourseQuery(title: string): string {
  const value = title.trim();
  if (!value) return "考研";
  return value.includes("考研") ? value : `考研${value}`;
}

/**
 * 计算某年份考研初试首日（12 月倒数第二个周六）：
 * 12 月最后一个周日往前推 8 天即倒数第二个周六。
 * 例：2026-12 的最后一个周日是 12-27，初试首日 = 12-19。
 */
export function examDateForYear(year: number): string {
  const december = new Date(Date.UTC(year, 11, 31));
  const lastSunday = new Date(december);
  lastSunday.setUTCDate(lastSunday.getUTCDate() - lastSunday.getUTCDay());
  lastSunday.setUTCDate(lastSunday.getUTCDate() - 8);
  return lastSunday.toISOString().slice(0, 10);
}

/** 初试日所在自然年 + 1 即招生年份，例如 2026-12-19 对应 2027 考研。 */
export function kaoyanExamLabel(examDate: string): string {
  const examYear = Number.parseInt(examDate.slice(0, 4), 10);
  return Number.isFinite(examYear) ? `${examYear + 1} 考研初试` : "考研初试";
}

/** 依据今天推断当前备考对应的初试日期：已过今年初试则指向明年。 */
export function currentExamDate(today: string, override: string | null | undefined): string {
  if (override) return override;
  const year = Number.parseInt(today.slice(0, 4), 10);
  if (!Number.isFinite(year)) return examDateForYear(new Date().getUTCFullYear());
  const thisYear = examDateForYear(year);
  return today > thisYear ? examDateForYear(year + 1) : thisYear;
}

export interface KaoyanMilestone {
  name: string;
  date: string;
  note: string;
}

/** 备考关键节点（日期为经验估计，仅供参考）。 */
export function kaoyanMilestones(examDate: string): KaoyanMilestone[] {
  const exam = new Date(`${examDate}T00:00:00Z`);
  if (Number.isNaN(exam.getTime())) return [];
  const at = (month: number, day: number) => {
    const date = new Date(Date.UTC(exam.getUTCFullYear(), month - 1, day));
    return date.toISOString().slice(0, 10);
  };
  const nextYearAt = (month: number, day: number) => {
    const date = new Date(Date.UTC(exam.getUTCFullYear() + 1, month - 1, day));
    return date.toISOString().slice(0, 10);
  };
  return [
    { name: "考研大纲发布", date: at(9, 8), note: "以官方实际发布为准" },
    { name: "预报名", date: at(9, 24), note: "应届生可提前锁定报考点" },
    { name: "正式报名", date: at(10, 8), note: "10 月 8 日—25 日，截止前均可修改" },
    { name: "网上确认", date: at(11, 1), note: "各报考点时间略有差异" },
    { name: "打印准考证", date: at(12, 13), note: "考前 10 天左右开放" },
    { name: "初试", date: examDate, note: "以准考证为准" },
    { name: "成绩公布", date: nextYearAt(2, 26), note: "各省时间略有差异" },
    { name: "国家线公布", date: nextYearAt(3, 13), note: "随后开启复试调剂" },
  ];
}

export interface MockExamStats {
  subject: string;
  count: number;
  latest: number;
  average: number;
  best: number;
  trend: number;
}

/** 内置考研英语高频词汇（起步词表，可随时增删）。 */
export const DEFAULT_KAOYAN_WORDS: Array<{ word: string; meaning: string }> = [
  { word: "abandon", meaning: "v. 放弃；抛弃" },
  { word: "absurd", meaning: "adj. 荒谬的，可笑的" },
  { word: "accelerate", meaning: "v. 加速；促进" },
  { word: "accommodate", meaning: "v. 容纳；适应；提供住宿" },
  { word: "accumulate", meaning: "v. 积累，积聚" },
  { word: "acknowledge", meaning: "v. 承认；致谢；告知收到" },
  { word: "advocate", meaning: "v. 提倡 n. 拥护者；辩护律师" },
  { word: "alternative", meaning: "n. 替代方案 adj. 可替代的" },
  { word: "ambiguous", meaning: "adj. 模棱两可的，含糊不清的" },
  { word: "ambitious", meaning: "adj. 雄心勃勃的；有野心的" },
  { word: "anticipate", meaning: "v. 预期，预料；抢先" },
  { word: "apparent", meaning: "adj. 明显的；表面上的" },
  { word: "appreciate", meaning: "v. 欣赏；感激；理解" },
  { word: "approach", meaning: "v. 接近 n. 方法；途径" },
  { word: "appropriate", meaning: "adj. 适当的，恰当的" },
  { word: "arbitrary", meaning: "adj. 任意的；专断的" },
  { word: "assess", meaning: "v. 评估，评价" },
  { word: "assume", meaning: "v. 假定，认为；承担" },
  { word: "attribute", meaning: "v. 把…归因于 n. 属性，特征" },
  { word: "available", meaning: "adj. 可获得的；有空的" },
  { word: "boost", meaning: "v./n. 促进，提高；推动" },
  { word: "capacity", meaning: "n. 容量；能力；资格" },
  { word: "coherent", meaning: "adj. 连贯的；条理清楚的" },
  { word: "collapse", meaning: "v./n. 倒塌；崩溃；瓦解" },
  { word: "compensate", meaning: "v. 补偿，赔偿" },
  { word: "comprehensive", meaning: "adj. 全面的，综合的" },
  { word: "consequence", meaning: "n. 结果，后果；重要性" },
  { word: "constitute", meaning: "v. 构成，组成；设立" },
  { word: "constraint", meaning: "n. 限制，约束" },
  { word: "controversial", meaning: "adj. 有争议的" },
  { word: "crucial", meaning: "adj. 至关重要的，决定性的" },
  { word: "decline", meaning: "v./n. 下降；衰退；婉拒" },
  { word: "deliberate", meaning: "adj. 故意的；深思熟虑的" },
  { word: "demonstrate", meaning: "v. 证明；演示；示威" },
  { word: "diminish", meaning: "v. 减少，缩小；削弱" },
  { word: "distinguish", meaning: "v. 区分，辨别；使杰出" },
  { word: "domestic", meaning: "adj. 国内的；家庭的" },
  { word: "efficient", meaning: "adj. 高效的，有效率的" },
  { word: "eliminate", meaning: "v. 消除，排除；淘汰" },
  { word: "emphasize", meaning: "v. 强调，着重" },
  { word: "enhance", meaning: "v. 提高，增强" },
  { word: "explicit", meaning: "adj. 明确的，清楚的" },
  { word: "fundamental", meaning: "adj. 基本的，根本的" },
  { word: "generate", meaning: "v. 产生，引起；生成" },
  { word: "hypothesis", meaning: "n. 假设，假说" },
  { word: "implement", meaning: "v. 实施，执行 n. 工具" },
  { word: "inevitable", meaning: "adj. 不可避免的，必然的" },
  { word: "integrate", meaning: "v. 使结合，使一体化" },
  { word: "justify", meaning: "v. 证明…有理；为…辩护" },
  { word: "legitimate", meaning: "adj. 合法的；合理的" },
  { word: "maintain", meaning: "v. 维持；坚持认为；保养" },
  { word: "neglect", meaning: "v. 忽视，忽略；疏于" },
  { word: "phenomenon", meaning: "n. 现象" },
  { word: "preliminary", meaning: "adj. 初步的，预备的" },
  { word: "prevail", meaning: "v. 盛行；占上风" },
  { word: "prominent", meaning: "adj. 突出的，显著的；杰出的" },
  { word: "reluctant", meaning: "adj. 不情愿的，勉强的" },
  { word: "significant", meaning: "adj. 重要的；显著的" },
  { word: "sustain", meaning: "v. 维持；支撑；遭受" },
  { word: "transparent", meaning: "adj. 透明的；显而易见的" },
];

/** 按科目聚合模考成绩：最近一次、平均分、最高分和相对上一次的涨跌。 */
export function mockExamStats(exams: MockExam[]): MockExamStats[] {
  const bySubject = new Map<string, MockExam[]>();
  for (const exam of exams) {
    const key = exam.subject.trim() || "未分类";
    bySubject.set(key, [...(bySubject.get(key) ?? []), exam]);
  }
  return [...bySubject.entries()].map(([subject, list]) => {
    const sorted = [...list].sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
    const scores = sorted.map((item) => item.score);
    const latest = scores.at(-1) ?? 0;
    const previous = scores.at(-2);
    return {
      subject,
      count: sorted.length,
      latest,
      average: Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10,
      best: Math.max(...scores),
      trend: previous == null || previous === latest ? 0 : latest - previous,
    };
  }).sort((a, b) => b.count - a.count);
}
