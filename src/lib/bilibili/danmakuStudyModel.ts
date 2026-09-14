import type { DanmakuEntry, DanmakuPreferences } from "./types";

export type DanmakuStudyStrength = "standard" | "high";

export interface DanmakuStudyConfig {
  windowSeconds: number;
  highSignalLimit: number;
  signalStrength: DanmakuStudyStrength;
}

export interface DanmakuStudyEntry {
  id: number;
  text: string;
  startTimeSeconds: number;
  score: number;
}

export interface DanmakuStudySummary {
  windowLabel: string;
  totalCount: number;
  visibleCount: number;
  highSignalEntries: DanmakuStudyEntry[];
}

export const DEFAULT_DANMAKU_STUDY_CONFIG: DanmakuStudyConfig = {
  windowSeconds: 12,
  highSignalLimit: 5,
  signalStrength: "standard",
};

const QUESTION_CUES = ["?", "？", "为什么", "怎么", "如何", "吗", "什么"];
const TIMESTAMP_CUES = ["时间", "分钟", "秒", "第", "章", "节", "点"];
const LOW_INFORMATION_CUES = ["哈哈哈", "来了", "前方高能", "打卡", "赞", "顶"];

function clampNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function scoreText(text: string, repetitions: number): number {
  let score = 1;
  if (QUESTION_CUES.some((cue) => text.includes(cue))) score += 5;
  if (TIMESTAMP_CUES.some((cue) => text.includes(cue))) score += 4;
  if (LOW_INFORMATION_CUES.some((cue) => text.includes(cue))) score -= 3;
  score += clampNumber((repetitions - 1) * 0.4, 0, 3);
  return score;
}

export function buildDanmakuStudySummary(
  entries: DanmakuEntry[] | null | undefined,
  currentTimeSeconds: number,
  preferences: DanmakuPreferences,
  config: DanmakuStudyConfig = DEFAULT_DANMAKU_STUDY_CONFIG,
): DanmakuStudySummary {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const time = clampNumber(currentTimeSeconds, 0, Number.MAX_SAFE_INTEGER);
  const windowSeconds = clampNumber(config.windowSeconds, 1, 120);
  const inWindow = safeEntries.filter((item) => {
    if (!item || typeof item.text !== "string" || !Number.isFinite(item.startTimeSeconds)) return false;
    if (preferences.blockedKeywords.some((keyword) => item.text.includes(keyword))) return false;
    return Math.abs(item.startTimeSeconds - time) <= windowSeconds;
  });

  const grouped = new Map<string, DanmakuStudyEntry & { repetitions: number }>();
  for (const item of inWindow) {
    const text = normalizeText(item.text);
    if (!text) continue;
    const key = text.toLowerCase();
    const current = grouped.get(key);
    if (current) {
      current.repetitions += 1;
      current.score = scoreText(text, current.repetitions);
      continue;
    }
    grouped.set(key, {
      id: item.id,
      text,
      startTimeSeconds: item.startTimeSeconds,
      score: scoreText(text, 1),
      repetitions: 1,
    });
  }

  const threshold = config.signalStrength === "high" ? 2 : 1;
  const highSignalEntries = Array.from(grouped.values())
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score || a.startTimeSeconds - b.startTimeSeconds || a.id - b.id)
    .slice(0, clampNumber(config.highSignalLimit, 1, 10))
    .map(({ id, text, startTimeSeconds, score }) => ({ id, text, startTimeSeconds, score }));

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return {
    windowLabel: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} 附近`,
    totalCount: safeEntries.length,
    visibleCount: inWindow.length,
    highSignalEntries,
  };
}
