import { describe, expect, it } from "vitest";
import {
  type FullFocusSession,
  FocusSessionStatus,
  FocusPauseReason,
  FocusInterruptionKind,
  createFocusSession,
  isActive,
  hasVideoAssociation,
  elapsedAt,
  remainingAt,
  progressAt,
  pauseAt,
  resumeAt,
  extendBy,
  associateVideo,
  updateLastSeen,
  addInterruption,
  finishAt,
  finishAtPartEnd,
  reopenAt,
  focusedMillisecondsByLocalDayAt,
  parseInterruption,
  parseSession,
  sessionToJson,
  interruptionToJson,
} from "./focusSessionModel";

const NOW_MS = Date.parse("2026-08-18T10:00:00.000Z");

function makeSession(overrides: Partial<FullFocusSession> = {}): FullFocusSession {
  return {
    id: "s1",
    goal: "学习高数",
    plannedDurationMs: 25 * 60_000,
    startedAt: new Date(NOW_MS).toISOString(),
    accumulatedFocusMs: 0,
    currentRunStartedAt: new Date(NOW_MS).toISOString(),
    status: FocusSessionStatus.running,
    completeOnPartEnd: false,
    interruptions: [],
    dailyFocusMilliseconds: {},
    sourcePositionMs: 0,
    ...overrides,
  };
}

describe("createFocusSession", () => {
  it("creates running session with startImmediately=true", () => {
    const s = createFocusSession({
      id: "s1",
      goal: "学习",
      plannedDurationMs: 1500000,
      now: new Date(NOW_MS).toISOString(),
    });
    expect(s.status).toBe(FocusSessionStatus.running);
    expect(s.currentRunStartedAt).toBeTruthy();
    expect(s.accumulatedFocusMs).toBe(0);
  });

  it("creates paused session with startImmediately=false", () => {
    const s = createFocusSession({
      id: "s2",
      goal: "学习",
      plannedDurationMs: 1500000,
      now: new Date(NOW_MS).toISOString(),
      startImmediately: false,
    });
    expect(s.status).toBe(FocusSessionStatus.paused);
    expect(s.currentRunStartedAt).toBeUndefined();
    expect(s.pauseReason).toBe(FocusPauseReason.awaitingVideo);
  });

  it("paused session with video has playback pauseReason", () => {
    const s = createFocusSession({
      id: "s3",
      goal: "学习",
      plannedDurationMs: 1500000,
      now: new Date(NOW_MS).toISOString(),
      startImmediately: false,
      sourceBvid: "BV1GJ411x7h7",
    });
    expect(s.pauseReason).toBe(FocusPauseReason.playback);
  });
});

describe("isActive + hasVideoAssociation", () => {
  it("running and paused are active", () => {
    expect(isActive(makeSession({ status: FocusSessionStatus.running }))).toBe(true);
    expect(isActive(makeSession({ status: FocusSessionStatus.paused }))).toBe(true);
    expect(isActive(makeSession({ status: FocusSessionStatus.completed }))).toBe(false);
    expect(isActive(makeSession({ status: FocusSessionStatus.endedEarly }))).toBe(false);
  });

  it("hasVideoAssociation requires both bvid and partCid", () => {
    expect(hasVideoAssociation(makeSession({ sourceBvid: "BV1", sourcePartCid: 1 }))).toBe(true);
    expect(hasVideoAssociation(makeSession({ sourceBvid: "BV1" }))).toBe(false);
    expect(hasVideoAssociation(makeSession({ sourcePartCid: 1 }))).toBe(false);
  });
});

describe("elapsedAt + remainingAt + progressAt", () => {
  it("elapsed grows with time when running", () => {
    const s = makeSession({ plannedDurationMs: 60_000 });
    expect(elapsedAt(s, NOW_MS)).toBe(0);
    expect(elapsedAt(s, NOW_MS + 30_000)).toBe(30_000);
    expect(elapsedAt(s, NOW_MS + 90_000)).toBe(60_000); // clamped to plannedDuration
  });

  it("elapsed does not grow when paused", () => {
    const s = makeSession({ status: FocusSessionStatus.paused, currentRunStartedAt: undefined, accumulatedFocusMs: 10000 });
    expect(elapsedAt(s, NOW_MS + 60_000)).toBe(10000);
  });

  it("remaining = plannedDuration - elapsed", () => {
    const s = makeSession({ plannedDurationMs: 60_000 });
    expect(remainingAt(s, NOW_MS + 20_000)).toBe(40_000);
    expect(remainingAt(s, NOW_MS + 90_000)).toBe(0);
  });

  it("progress is between 0 and 1", () => {
    const s = makeSession({ plannedDurationMs: 60_000 });
    expect(progressAt(s, NOW_MS)).toBe(0);
    expect(progressAt(s, NOW_MS + 30_000)).toBe(0.5);
    expect(progressAt(s, NOW_MS + 90_000)).toBe(1);
  });
});

describe("pauseAt + resumeAt", () => {
  it("pause moves running to paused with accumulated elapsed", () => {
    const s = makeSession();
    const paused = pauseAt(s, NOW_MS + 20_000, FocusPauseReason.manual);
    expect(paused.status).toBe(FocusSessionStatus.paused);
    expect(paused.accumulatedFocusMs).toBe(20_000);
    expect(paused.currentRunStartedAt).toBeUndefined();
    expect(paused.pauseReason).toBe(FocusPauseReason.manual);
  });

  it("pause on already paused changes pauseReason", () => {
    const s = makeSession({ status: FocusSessionStatus.paused, currentRunStartedAt: undefined, pauseReason: FocusPauseReason.playback });
    const updated = pauseAt(s, NOW_MS, FocusPauseReason.manual);
    expect(updated.pauseReason).toBe(FocusPauseReason.manual);
  });

  it("resume sets new currentRunStartedAt and clears pauseReason", () => {
    const s = makeSession({ status: FocusSessionStatus.paused, currentRunStartedAt: undefined, pauseReason: FocusPauseReason.manual });
    const resumed = resumeAt(s, NOW_MS + 1000);
    expect(resumed.status).toBe(FocusSessionStatus.running);
    expect(resumed.currentRunStartedAt).toBeTruthy();
    expect(resumed.pauseReason).toBeUndefined();
  });
});

describe("extendBy", () => {
  it("extends plannedDuration for active sessions", () => {
    const s = makeSession({ plannedDurationMs: 60_000 });
    expect(extendBy(s, 30_000).plannedDurationMs).toBe(90_000);
  });

  it("does not extend inactive sessions", () => {
    const s = makeSession({ plannedDurationMs: 60_000, status: FocusSessionStatus.completed });
    expect(extendBy(s, 30_000).plannedDurationMs).toBe(60_000);
  });

  it("does not extend by 0 or negative", () => {
    const s = makeSession({ plannedDurationMs: 60_000 });
    expect(extendBy(s, 0).plannedDurationMs).toBe(60_000);
    expect(extendBy(s, -10).plannedDurationMs).toBe(60_000);
  });
});

describe("associateVideo", () => {
  it("associates video and resumes if isPlaying", () => {
    const s = makeSession();
    const associated = associateVideo(s, NOW_MS + 1000, {
      bvid: "BV1GJ411x7h7",
      videoTitle: "高数",
      partCid: 100,
      partPageNumber: 1,
      partTitle: "P1",
      isPlaying: true,
    });
    expect(associated.sourceBvid).toBe("BV1GJ411x7h7");
    expect(associated.sourcePartCid).toBe(100);
    expect(associated.status).toBe(FocusSessionStatus.running);
  });

  it("associates video and stays paused if !isPlaying", () => {
    const s = makeSession({ status: FocusSessionStatus.paused, currentRunStartedAt: undefined });
    const associated = associateVideo(s, NOW_MS, {
      bvid: "BV1GJ411x7h7",
      videoTitle: "高数",
      partCid: 100,
      partPageNumber: 1,
      partTitle: "P1",
      isPlaying: false,
    });
    expect(associated.status).toBe(FocusSessionStatus.paused);
  });
});

describe("updateLastSeen", () => {
  it("updates framePath + position when associated", () => {
    const s = makeSession({ sourceBvid: "BV1", sourcePartCid: 1 });
    const updated = updateLastSeen(s, { framePath: "/frames/x.jpg", positionMs: 5000 });
    expect(updated.sourceFramePath).toBe("/frames/x.jpg");
    expect(updated.sourcePositionMs).toBe(5000);
  });

  it("no-op when no association", () => {
    const s = makeSession();
    const updated = updateLastSeen(s, { framePath: "/x", positionMs: 5000 });
    expect(updated).toBe(s);
  });
});

describe("addInterruption", () => {
  it("appends interruption and pauses", () => {
    const s = makeSession();
    const interruption = {
      id: "i1",
      occurredAt: new Date(NOW_MS + 5000).toISOString(),
      kind: FocusInterruptionKind.manualPause,
      reason: "喝水",
    };
    const withInterruption = addInterruption(s, NOW_MS + 5000, interruption);
    expect(withInterruption.interruptions).toHaveLength(1);
    expect(withInterruption.status).toBe(FocusSessionStatus.paused);
    expect(withInterruption.pauseReason).toBe(FocusPauseReason.interruption);
  });

  it("trims interruptions to last 100", () => {
    let s = makeSession();
    for (let i = 0; i < 110; i++) {
      s = addInterruption(s, NOW_MS + i * 1000, {
        id: `i${i}`,
        occurredAt: new Date(NOW_MS + i * 1000).toISOString(),
        kind: FocusInterruptionKind.manualPause,
        reason: `r${i}`,
      });
    }
    expect(s.interruptions.length).toBe(100);
    expect(s.interruptions[0]?.id).toBe("i10");
  });
});

describe("finishAt + finishAtPartEnd + reopenAt", () => {
  it("finishAt completed sets full plannedDuration", () => {
    const s = makeSession({ plannedDurationMs: 60_000 });
    const finished = finishAt(s, NOW_MS + 30_000, FocusSessionStatus.completed);
    expect(finished.status).toBe(FocusSessionStatus.completed);
    expect(finished.accumulatedFocusMs).toBe(60_000);
    expect(finished.finishedAt).toBeTruthy();
    expect(finished.currentRunStartedAt).toBeUndefined();
  });

  it("finishAt endedEarly uses actual elapsed", () => {
    const s = makeSession({ plannedDurationMs: 60_000 });
    const finished = finishAt(s, NOW_MS + 30_000, FocusSessionStatus.endedEarly, "太累");
    expect(finished.accumulatedFocusMs).toBe(30_000);
    expect(finished.terminationReason).toBe("太累");
  });

  it("finishAt with empty terminationReason defaults to 未填写原因", () => {
    const s = makeSession();
    const finished = finishAt(s, NOW_MS, FocusSessionStatus.endedEarly, "  ");
    expect(finished.terminationReason).toBe("未填写原因");
  });

  it("finishAtPartEnd honors completeOnPartEnd flag", () => {
    const s = makeSession({ completeOnPartEnd: true, plannedDurationMs: 60_000 });
    const finished = finishAtPartEnd(s, NOW_MS + 30_000);
    expect(finished.status).toBe(FocusSessionStatus.completed);
    expect(finished.accumulatedFocusMs).toBe(30_000);
  });

  it("finishAtPartEnd no-op when completeOnPartEnd is false", () => {
    const s = makeSession({ completeOnPartEnd: false });
    const result = finishAtPartEnd(s, NOW_MS + 30_000);
    expect(result).toBe(s);
  });

  it("reopenAt reopens completed session with extension", () => {
    const s = makeSession({ plannedDurationMs: 60_000, status: FocusSessionStatus.completed, finishedAt: new Date(NOW_MS).toISOString(), currentRunStartedAt: undefined });
    const reopened = reopenAt(s, NOW_MS, 30_000);
    expect(reopened.status).toBe(FocusSessionStatus.paused);
    expect(reopened.plannedDurationMs).toBe(60_000 + 30_000);
    expect(reopened.finishedAt).toBeUndefined();
  });
});

describe("focusedMillisecondsByLocalDayAt", () => {
  it("returns daily breakdown including current run", () => {
    const s = makeSession({ plannedDurationMs: 60_000 });
    const daily = focusedMillisecondsByLocalDayAt(s, NOW_MS + 30_000);
    const total = Object.values(daily).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(30_000);
  });
});

describe("JSON round-trip", () => {
  it("sessionToJson + parseSession preserves state", () => {
    const s = makeSession({ interruptions: [{ id: "i1", occurredAt: new Date(NOW_MS).toISOString(), kind: FocusInterruptionKind.manualPause, reason: "test" }] });
    const json = sessionToJson(s);
    const parsed = parseSession(json);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe(s.id);
    expect(parsed?.status).toBe(s.status);
    expect(parsed?.interruptions).toHaveLength(1);
  });

  it("parseSession rejects malformed input", () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession("string")).toBeNull();
    expect(parseSession({})).toBeNull();
    expect(parseSession({ id: "" })).toBeNull();
  });

  it("interruptionToJson + parseInterruption round-trip", () => {
    const i: FullFocusSession["interruptions"][0] = {
      id: "i1",
      occurredAt: new Date(NOW_MS).toISOString(),
      kind: FocusInterruptionKind.appBackground,
      reason: "切到后台",
    };
    const parsed = parseInterruption(interruptionToJson(i));
    expect(parsed).toEqual(i);
  });
});
