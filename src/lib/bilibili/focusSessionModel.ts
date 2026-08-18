/**
 * RIXIA FocusSession 模型 — 1:1 TypeScript 移植自 FocuBili 的
 * lib/models/focus_session.dart（714 行）。
 *
 * 这是 FocuBili 专注功能的完整状态机：running / paused / completed /
 * endedEarly 四态，含打断记录、视频关联、每日毫秒统计、续时、暂停原因
 * 分辨（awaitingVideo / playback / manual / interruption）等。
 *
 * 之前 src/lib/bilibili/types.ts 中的 FocusSession 是简化版，仅含
 * startedAt / endedAt / durationSeconds 等基础字段；此文件保留为完整版，
 * 类型用 FullFocusSession 以避免冲突。
 */

export enum FocusSessionStatus {
  running = "running",
  paused = "paused",
  completed = "completed",
  endedEarly = "endedEarly",
}

export enum FocusPauseReason {
  awaitingVideo = "awaitingVideo",
  playback = "playback",
  manual = "manual",
  interruption = "interruption",
}

export enum FocusInterruptionKind {
  manualPause = "manualPause",
  playerExit = "playerExit",
  appBackground = "appBackground",
}

export interface FocusInterruption {
  id: string;
  occurredAt: string;
  kind: FocusInterruptionKind;
  reason: string;
  reminderAt?: string;
}

export interface FullFocusSession {
  id: string;
  goal: string;
  plannedDurationMs: number;
  startedAt: string;
  accumulatedFocusMs: number;
  currentRunStartedAt?: string;
  status: FocusSessionStatus;
  finishedAt?: string;
  pauseReason?: FocusPauseReason;
  sourceBvid?: string;
  sourceVideoTitle?: string;
  sourcePartCid?: number;
  sourcePartPageNumber?: number;
  sourcePartTitle?: string;
  sourceFramePath?: string;
  sourcePositionMs: number;
  completeOnPartEnd: boolean;
  interruptions: FocusInterruption[];
  terminationReason?: string;
  dailyFocusMilliseconds: Record<string, number>;
}

const MS_PER_DAY = 86_400_000;

export function createFocusSession(options: {
  id: string;
  goal: string;
  plannedDurationMs: number;
  now: string;
  startImmediately?: boolean;
  sourceBvid?: string;
  sourceVideoTitle?: string;
  sourcePartCid?: number;
  sourcePartPageNumber?: number;
  sourcePartTitle?: string;
  sourceFramePath?: string;
  sourcePositionMs?: number;
  completeOnPartEnd?: boolean;
}): FullFocusSession {
  const startImmediately = options.startImmediately ?? true;
  const sourcePositionMs = options.sourcePositionMs ?? 0;
  const completeOnPartEnd = options.completeOnPartEnd ?? false;
  const status = startImmediately ? FocusSessionStatus.running : FocusSessionStatus.paused;
  let pauseReason: FocusPauseReason | undefined;
  if (!startImmediately) {
    pauseReason = options.sourceBvid == null
      ? FocusPauseReason.awaitingVideo
      : FocusPauseReason.playback;
  }
  return {
    id: options.id,
    goal: options.goal,
    plannedDurationMs: options.plannedDurationMs,
    startedAt: options.now,
    accumulatedFocusMs: 0,
    currentRunStartedAt: startImmediately ? options.now : undefined,
    status,
    pauseReason,
    sourceBvid: options.sourceBvid,
    sourceVideoTitle: options.sourceVideoTitle,
    sourcePartCid: options.sourcePartCid,
    sourcePartPageNumber: options.sourcePartPageNumber,
    sourcePartTitle: options.sourcePartTitle,
    sourceFramePath: options.sourceFramePath,
    sourcePositionMs,
    completeOnPartEnd,
    interruptions: [],
    dailyFocusMilliseconds: {},
  };
}

export function isActive(session: FullFocusSession): boolean {
  return session.status === FocusSessionStatus.running || session.status === FocusSessionStatus.paused;
}

export function hasVideoAssociation(session: FullFocusSession): boolean {
  return Boolean(session.sourceBvid) && session.sourcePartCid != null;
}

export function hasBrowsableVideo(session: FullFocusSession): boolean {
  return Boolean(session.sourceBvid);
}

export function latestInterruptionReason(session: FullFocusSession): string | undefined {
  if (session.interruptions.length === 0) return undefined;
  return session.interruptions[session.interruptions.length - 1]?.reason;
}

/** 在指定时刻已用真实专注时长（毫秒）。 */
export function elapsedAt(session: FullFocusSession, nowMs: number): number {
  let elapsed = session.accumulatedFocusMs;
  if (session.status === FocusSessionStatus.running && session.currentRunStartedAt) {
    const runStartMs = Date.parse(session.currentRunStartedAt);
    const delta = Math.max(0, Math.min(nowMs - runStartMs, session.plannedDurationMs));
    elapsed += delta;
  }
  return Math.max(0, Math.min(elapsed, session.plannedDurationMs));
}

export function remainingAt(session: FullFocusSession, nowMs: number): number {
  return Math.max(0, session.plannedDurationMs - elapsedAt(session, nowMs));
}

export function progressAt(session: FullFocusSession, nowMs: number): number {
  if (session.plannedDurationMs <= 0) return 0;
  const ratio = elapsedAt(session, nowMs) / session.plannedDurationMs;
  return Math.max(0, Math.min(1, ratio));
}

export function pauseAt(
  session: FullFocusSession,
  nowMs: number,
  reason: FocusPauseReason = FocusPauseReason.manual,
): FullFocusSession {
  if (session.status !== FocusSessionStatus.running) {
    if (session.status === FocusSessionStatus.paused && session.pauseReason !== reason) {
      return { ...session, pauseReason: reason };
    }
    return session;
  }
  const elapsed = elapsedAt(session, nowMs);
  return {
    ...session,
    accumulatedFocusMs: elapsed,
    dailyFocusMilliseconds: recordCurrentRunUntil(session, nowMs),
    status: FocusSessionStatus.paused,
    currentRunStartedAt: undefined,
    pauseReason: reason,
  };
}

export function resumeAt(session: FullFocusSession, nowMs: number): FullFocusSession {
  if (session.status !== FocusSessionStatus.paused) return session;
  return {
    ...session,
    currentRunStartedAt: new Date(nowMs).toISOString(),
    status: FocusSessionStatus.running,
    pauseReason: undefined,
  };
}

export function extendBy(session: FullFocusSession, extensionMs: number): FullFocusSession {
  if (!isActive(session) || extensionMs <= 0) return session;
  return { ...session, plannedDurationMs: session.plannedDurationMs + extensionMs };
}

export function associateVideo(
  session: FullFocusSession,
  nowMs: number,
  params: {
    bvid: string;
    videoTitle: string;
    partCid: number;
    partPageNumber: number;
    partTitle: string;
    isPlaying: boolean;
    framePath?: string;
    positionMs?: number;
  },
): FullFocusSession {
  if (!isActive(session)) return session;
  const paused = session.status === FocusSessionStatus.running
    ? pauseAt(session, nowMs, FocusPauseReason.playback)
    : { ...session, pauseReason: FocusPauseReason.playback };
  const associated: FullFocusSession = {
    ...paused,
    sourceBvid: params.bvid,
    sourceVideoTitle: params.videoTitle,
    sourcePartCid: params.partCid,
    sourcePartPageNumber: params.partPageNumber,
    sourcePartTitle: params.partTitle,
    sourceFramePath: params.framePath ?? paused.sourceFramePath,
    sourcePositionMs: params.positionMs ?? 0,
  };
  return params.isPlaying ? resumeAt(associated, nowMs) : associated;
}

export function updateLastSeen(
  session: FullFocusSession,
  params: { framePath?: string; positionMs: number },
): FullFocusSession {
  if (!hasVideoAssociation(session)) return session;
  return {
    ...session,
    sourceFramePath: params.framePath ?? session.sourceFramePath,
    sourcePositionMs: params.positionMs,
  };
}

export function addInterruption(
  session: FullFocusSession,
  nowMs: number,
  interruption: FocusInterruption,
): FullFocusSession {
  if (!isActive(session)) return session;
  const paused = pauseAt(session, nowMs, FocusPauseReason.interruption);
  const updated = [...paused.interruptions, interruption];
  const trimmed = updated.length > 100
    ? updated.slice(updated.length - 100)
    : updated;
  return { ...paused, interruptions: trimmed };
}

export function finishAt(
  session: FullFocusSession,
  nowMs: number,
  finalStatus: FocusSessionStatus,
  terminationReason?: string,
): FullFocusSession {
  if (finalStatus !== FocusSessionStatus.completed && finalStatus !== FocusSessionStatus.endedEarly) {
    throw new Error(`finalStatus must be completed or endedEarly, got ${finalStatus}`);
  }
  const finalElapsed = finalStatus === FocusSessionStatus.completed
    ? session.plannedDurationMs
    : elapsedAt(session, nowMs);
  const trimmedReason = terminationReason?.trim();
  return {
    ...session,
    accumulatedFocusMs: finalElapsed,
    dailyFocusMilliseconds: session.status === FocusSessionStatus.running
      ? recordCurrentRunUntil(session, nowMs)
      : session.dailyFocusMilliseconds,
    status: finalStatus,
    finishedAt: new Date(nowMs).toISOString(),
    currentRunStartedAt: undefined,
    pauseReason: undefined,
    terminationReason: !trimmedReason ? "未填写原因" : trimmedReason,
  };
}

export function finishAtPartEnd(session: FullFocusSession, nowMs: number): FullFocusSession {
  if (!isActive(session) || !session.completeOnPartEnd) return session;
  const finalElapsed = elapsedAt(session, nowMs);
  return {
    ...session,
    accumulatedFocusMs: finalElapsed,
    dailyFocusMilliseconds: session.status === FocusSessionStatus.running
      ? recordCurrentRunUntil(session, nowMs)
      : session.dailyFocusMilliseconds,
    status: FocusSessionStatus.completed,
    finishedAt: new Date(nowMs).toISOString(),
    currentRunStartedAt: undefined,
    pauseReason: undefined,
    terminationReason: undefined,
  };
}

export function reopenAt(session: FullFocusSession, _nowMs: number, extensionMs: number): FullFocusSession {
  if (session.status !== FocusSessionStatus.completed || extensionMs <= 0) return session;
  return {
    ...session,
    plannedDurationMs: session.plannedDurationMs + extensionMs,
    accumulatedFocusMs: session.plannedDurationMs,
    status: FocusSessionStatus.paused,
    finishedAt: undefined,
    pauseReason: hasVideoAssociation(session)
      ? FocusPauseReason.playback
      : FocusPauseReason.awaitingVideo,
    completeOnPartEnd: false,
    terminationReason: undefined,
  };
}

/** 把当前连续运行片段结算进本地自然日桶。 */
function recordCurrentRunUntil(session: FullFocusSession, nowMs: number): Record<string, number> {
  const values: Record<string, number> = { ...session.dailyFocusMilliseconds };
  if (session.status !== FocusSessionStatus.running || !session.currentRunStartedAt) {
    return values;
  }
  const runStartMs = Date.parse(session.currentRunStartedAt);
  const remainingMs = session.plannedDurationMs - session.accumulatedFocusMs;
  const runMs = Math.max(0, Math.min(nowMs - runStartMs, remainingMs));
  if (runMs > 0) {
    addLocalDaySegment(values, runStartMs, runStartMs + runMs, runMs);
  }
  return values;
}

/** 将一段连续播放时间按本地午夜切开。 */
function addLocalDaySegment(
  values: Record<string, number>,
  startMs: number,
  endMs: number,
  maximumMs: number,
): void {
  let cursor = startMs;
  let remaining = maximumMs;
  while (cursor < endMs && remaining > 0) {
    const dayKey = localDayKey(cursor);
    const nextMidnight = nextLocalMidnightMs(cursor);
    const segmentEnd = Math.min(endMs, nextMidnight);
    const segmentMs = Math.min(remaining, segmentEnd - cursor);
    if (segmentMs > 0) {
      values[dayKey] = (values[dayKey] ?? 0) + segmentMs;
    }
    cursor = segmentEnd;
    remaining -= segmentMs;
  }
}

function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextLocalMidnightMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** 截至 now 的逐日投入快照。 */
export function focusedMillisecondsByLocalDayAt(session: FullFocusSession, nowMs: number): Record<string, number> {
  const values: Record<string, number> = session.status === FocusSessionStatus.running
    ? recordCurrentRunUntil(session, nowMs)
    : { ...session.dailyFocusMilliseconds };
  const elapsedMs = elapsedAt(session, nowMs);
  const recordedMs = Object.values(values).reduce((sum, v) => sum + v, 0);
  const legacyMs = elapsedMs - recordedMs;
  if (legacyMs > 0) {
    const legacyEndMs = session.status === FocusSessionStatus.running
      ? (session.currentRunStartedAt ? Date.parse(session.currentRunStartedAt) : nowMs)
      : (session.finishedAt
          ? Date.parse(session.finishedAt)
          : (session.interruptions.length > 0
              ? Date.parse(session.interruptions[session.interruptions.length - 1]!.occurredAt)
              : Date.parse(session.startedAt) + session.accumulatedFocusMs));
    addLocalDaySegment(values, legacyEndMs - legacyMs, legacyEndMs, legacyMs);
  }
  return values;
}

// 导出常量供其他模块使用
export { MS_PER_DAY };

/** FocusInterruption JSON 序列化/反序列化。 */
export function interruptionToJson(interruption: FocusInterruption): Record<string, unknown> {
  return {
    id: interruption.id,
    occurredAt: interruption.occurredAt,
    kind: interruption.kind,
    reason: interruption.reason,
    reminderAt: interruption.reminderAt,
  };
}

export function parseInterruption(json: unknown): FocusInterruption | null {
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const occurredAt = typeof obj.occurredAt === "string" ? obj.occurredAt : "";
  const kindRaw = typeof obj.kind === "string" ? obj.kind : "";
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
  if (!id || !occurredAt || !kindRaw || !reason) return null;
  const kind = Object.values(FocusInterruptionKind).find((k) => k === kindRaw);
  if (!kind) return null;
  const reminderAt = typeof obj.reminderAt === "string" ? obj.reminderAt : undefined;
  return { id, occurredAt, kind, reason, reminderAt };
}

/** FullFocusSession JSON 序列化/反序列化。 */
export function sessionToJson(session: FullFocusSession): Record<string, unknown> {
  return {
    id: session.id,
    goal: session.goal,
    plannedDurationMs: session.plannedDurationMs,
    startedAt: session.startedAt,
    accumulatedFocusMs: session.accumulatedFocusMs,
    currentRunStartedAt: session.currentRunStartedAt,
    status: session.status,
    finishedAt: session.finishedAt,
    pauseReason: session.pauseReason,
    sourceBvid: session.sourceBvid,
    sourceVideoTitle: session.sourceVideoTitle,
    sourcePartCid: session.sourcePartCid,
    sourcePartPageNumber: session.sourcePartPageNumber,
    sourcePartTitle: session.sourcePartTitle,
    sourceFramePath: session.sourceFramePath,
    sourcePositionMs: session.sourcePositionMs,
    completeOnPartEnd: session.completeOnPartEnd,
    interruptions: session.interruptions.map(interruptionToJson),
    terminationReason: session.terminationReason,
    dailyFocusMilliseconds: session.dailyFocusMilliseconds,
  };
}

export function parseSession(json: unknown): FullFocusSession | null {
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id : "";
  const goal = typeof obj.goal === "string" ? obj.goal : "";
  const plannedDurationMs = typeof obj.plannedDurationMs === "number" ? obj.plannedDurationMs : 0;
  const startedAt = typeof obj.startedAt === "string" ? obj.startedAt : "";
  if (!id || !goal || !startedAt) return null;
  const statusRaw = typeof obj.status === "string" ? obj.status : "";
  const status = Object.values(FocusSessionStatus).find((s) => s === statusRaw);
  if (!status) return null;
  const interruptions: FocusInterruption[] = Array.isArray(obj.interruptions)
    ? (obj.interruptions as unknown[])
        .map(parseInterruption)
        .filter((i): i is FocusInterruption => i != null)
    : [];
  const pauseReasonRaw = typeof obj.pauseReason === "string" ? obj.pauseReason : undefined;
  const pauseReason = pauseReasonRaw
    ? Object.values(FocusPauseReason).find((p) => p === pauseReasonRaw)
    : undefined;
  const dailyRaw = obj.dailyFocusMilliseconds;
  const dailyFocusMilliseconds: Record<string, number> = typeof dailyRaw === "object" && dailyRaw !== null
    ? Object.fromEntries(
        Object.entries(dailyRaw as Record<string, unknown>)
          .filter(([, v]) => typeof v === "number")
          .map(([k, v]) => [k, v as number]),
      )
    : {};
  return {
    id,
    goal,
    plannedDurationMs,
    startedAt,
    accumulatedFocusMs: typeof obj.accumulatedFocusMs === "number" ? obj.accumulatedFocusMs : 0,
    currentRunStartedAt: typeof obj.currentRunStartedAt === "string" ? obj.currentRunStartedAt : undefined,
    status,
    finishedAt: typeof obj.finishedAt === "string" ? obj.finishedAt : undefined,
    pauseReason,
    sourceBvid: typeof obj.sourceBvid === "string" ? obj.sourceBvid : undefined,
    sourceVideoTitle: typeof obj.sourceVideoTitle === "string" ? obj.sourceVideoTitle : undefined,
    sourcePartCid: typeof obj.sourcePartCid === "number" ? obj.sourcePartCid : undefined,
    sourcePartPageNumber: typeof obj.sourcePartPageNumber === "number" ? obj.sourcePartPageNumber : undefined,
    sourcePartTitle: typeof obj.sourcePartTitle === "string" ? obj.sourcePartTitle : undefined,
    sourceFramePath: typeof obj.sourceFramePath === "string" ? obj.sourceFramePath : undefined,
    sourcePositionMs: typeof obj.sourcePositionMs === "number" ? obj.sourcePositionMs : 0,
    completeOnPartEnd: typeof obj.completeOnPartEnd === "boolean" ? obj.completeOnPartEnd : false,
    interruptions,
    terminationReason: typeof obj.terminationReason === "string" ? obj.terminationReason : undefined,
    dailyFocusMilliseconds,
  };
}
