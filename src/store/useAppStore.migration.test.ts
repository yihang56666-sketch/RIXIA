import { describe, expect, it, beforeEach } from "vitest";
import { useAppStore } from "./useAppStore";

describe("useAppStore v2 migration and resources", () => {
  beforeEach(() => {
    useAppStore.setState({
      theme: "porcelain",
      density: "standard",
      backgroundImage: null,
      view: "today",
      enabledTools: ["tasks", "habits", "notes", "countdowns", "focus", "videos"],
      inbox: [],
      tasks: [],
      habits: [],
      notes: [],
      countdowns: [],
      subjects: [],
      studyUnits: [],
      focusMinutes: 25,
      focusSessions: [],
      focusGoalMinutes: 120,
      activeFocus: null,
      resources: [],
      timestampNotes: [],
    });
  });

  it("adds a course resource and rejects duplicates", () => {
    const first = useAppStore.getState().addResource("https://www.bilibili.com/video/BV1abcdefg12");
    expect(first?.bvid).toBe("BV1abcdefg12");
    const second = useAppStore.getState().addResource("BV1abcdefg12");
    expect(second).toBeNull();
    expect(useAppStore.getState().resources).toHaveLength(1);
  });

  it("clamps resource progress and promotes saved → in-progress", () => {
    const res = useAppStore.getState().addResource("BV2abcdefg34");
    useAppStore.getState().updateResourceProgress(res!.id, -5, 600);
    const after = useAppStore.getState().resources.find((item) => item.id === res!.id);
    expect(after?.progressSeconds).toBe(0);
    expect(after?.status).toBe("in-progress");
  });

  it("marks resource completed when progress reaches 95% of duration", () => {
    const res = useAppStore.getState().addResource("BV3abcdefg56");
    useAppStore.getState().updateResourceProgress(res!.id, 580, 600);
    const after = useAppStore.getState().resources.find((item) => item.id === res!.id);
    expect(after?.status).toBe("completed");
  });

  it("records a timestamp note sorted by seconds", () => {
    const res = useAppStore.getState().addResource("BV4abcdefg78");
    useAppStore.getState().addTimestampNote(res!.id, 90, "later note");
    useAppStore.getState().addTimestampNote(res!.id, 30, "first note");
    const notes = useAppStore.getState().timestampNotes;
    expect(notes.map((n) => n.seconds)).toEqual([30, 90]);
  });

  it("rejects empty timestamp notes", () => {
    const res = useAppStore.getState().addResource("BV5abcdefg9X");
    useAppStore.getState().addTimestampNote(res!.id, 30, "   ");
    expect(useAppStore.getState().timestampNotes).toHaveLength(0);
  });

  it("imports and exports a v2 backup round-trip", () => {
    const backup = {
      formatVersion: 2,
      theme: "graphite",
      density: "compact",
      enabledTools: ["tasks", "focus"],
      inbox: [{ id: "i1", text: "想法", createdAt: "2026-08-01T00:00:00.000Z" }],
      tasks: [{ id: "t1", title: "读书", done: false, due: null, createdAt: "2026-08-01T00:00:00.000Z" }],
      habits: [],
      notes: [],
      countdowns: [],
      subjects: [],
      studyUnits: [],
      focusSessions: [],
      focusGoalMinutes: 90,
      resources: [{ id: "r1", bvid: "BV1", title: "课", status: "saved", addedAt: "2026-08-01T00:00:00.000Z" }],
      timestampNotes: [],
    };
    useAppStore.getState().importBackup(backup);
    const state = useAppStore.getState();
    expect(state.theme).toBe("graphite");
    expect(state.density).toBe("compact");
    expect(state.tasks).toHaveLength(1);
    useAppStore.getState().addResource("BV1", "dup");
    expect(useAppStore.getState().resources).toHaveLength(1);
  });

  it("clears activeFocus when a focus session is added", () => {
    useAppStore.getState().setActiveFocus({ startedAt: "2026-08-01T00:00:00.000Z", mode: "countdown" });
    useAppStore.getState().addFocusSession(25);
    expect(useAppStore.getState().activeFocus).toBeNull();
    expect(useAppStore.getState().focusSessions).toHaveLength(1);
  });
});
