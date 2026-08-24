import { describe, expect, it } from "vitest";
import { shouldPauseForSleepTimer, shouldRestartLoop } from "./playbackControlPolicy";

describe("playback control policy", () => {
  it("restarts only when a paused video reaches its end and loop is enabled", () => {
    expect(shouldRestartLoop({ loopEnabled: true, playing: false, currentTime: 99.7, duration: 100 })).toBe(true);
    expect(shouldRestartLoop({ loopEnabled: true, playing: true, currentTime: 100, duration: 100 })).toBe(false);
    expect(shouldRestartLoop({ loopEnabled: false, playing: false, currentTime: 100, duration: 100 })).toBe(false);
  });

  it("pauses at the end when a sleep timer has expired", () => {
    expect(shouldPauseForSleepTimer({ remainingMinutes: 0, remainingPlays: null, currentTime: 20, duration: 100 })).toBe(true);
    expect(shouldPauseForSleepTimer({ remainingMinutes: 1, remainingPlays: null, currentTime: 100, duration: 100 })).toBe(false);
    expect(shouldPauseForSleepTimer({ remainingMinutes: null, remainingPlays: 0, currentTime: 100, duration: 100 })).toBe(true);
  });
});
