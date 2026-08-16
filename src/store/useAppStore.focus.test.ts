import { beforeEach, describe, expect, it } from "vitest";
import { todayKey } from "../lib/time";
import { useAppStore } from "./useAppStore";

describe("Focus store", () => {
  beforeEach(() => {
    useAppStore.setState({ focusMinutes: 25, focusSessions: [] });
  });

  it("records a completed focus session for today", () => {
    useAppStore.getState().addFocusSession(25);

    const sessions = useAppStore.getState().focusSessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ date: todayKey(), minutes: 25 });
  });

  it("ignores non-positive sessions", () => {
    useAppStore.getState().addFocusSession(0);
    expect(useAppStore.getState().focusSessions).toHaveLength(0);
  });
});
