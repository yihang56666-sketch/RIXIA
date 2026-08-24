export type FocusShareResult = "shared" | "copied" | "unavailable" | "failed";

export interface FocusShareDependencies {
  share?: (data: { title: string; text: string }) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;
}

export function buildFocusSessionShareText(input: {
  goal: string;
  focusedMs: number;
  interruptions: number;
}): string {
  const interruptionText = input.interruptions > 0 ? `，打断 ${input.interruptions} 次` : "";
  return `我在 BEID 完成了“${input.goal}”专注任务，专注 ${formatDuration(input.focusedMs)}${interruptionText}。`;
}

export function buildFocusStatisticsShareText(input: {
  totalMs: number;
  totalSessions: number;
  completedSessions: number;
  currentStreak: number;
}): string {
  return `这是我在 BEID 的专注统计：累计 ${formatDuration(input.totalMs)}，${input.totalSessions} 次专注，完成 ${input.completedSessions} 次，连续 ${input.currentStreak} 天。`;
}

export function buildVideoNoteShareText(input: {
  title: string;
  videoTitle: string;
  positionSeconds: number;
}): string {
  const safeSeconds = Math.max(0, Math.floor(input.positionSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const position = `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `来自 BEID 的时间点笔记：${input.title.trim() || "未命名笔记"}（${input.videoTitle.trim() || "未知视频"} · ${position}）`;
}

export async function shareFocusText(
  payload: { title: string; text: string },
  dependencies: FocusShareDependencies = browserShareDependencies(),
): Promise<FocusShareResult> {
  if (dependencies.share) {
    try {
      await dependencies.share(payload);
      return "shared";
    } catch (error) {
      console.warn("Focus sharing failed", error);
      return "failed";
    }
  }
  if (!dependencies.writeText) return "unavailable";
  try {
    await dependencies.writeText(payload.text);
    return "copied";
  } catch (error) {
    console.warn("Focus share clipboard fallback failed", error);
    return "failed";
  }
}

function browserShareDependencies(): FocusShareDependencies {
  if (typeof navigator === "undefined") return {};
  return {
    share: typeof navigator.share === "function" ? (data) => navigator.share(data) : undefined,
    writeText: navigator.clipboard?.writeText?.bind(navigator.clipboard),
  };
}
