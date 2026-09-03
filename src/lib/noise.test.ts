import { describe, expect, it } from "vitest";
import { NOISE_OPTIONS, currentAmbience, setAmbienceVolume, startAmbience, stopAmbience } from "./noise";

describe("noise", () => {
  it("exposes the available ambience options", () => {
    expect(NOISE_OPTIONS).toEqual([
      { key: "white", label: "白噪音" },
      { key: "rain", label: "雨声" },
      { key: "waves", label: "海浪" },
    ]);
  });

  it("returns null when no ambience is running", () => {
    expect(currentAmbience()).toBeNull();
  });

  it("ignores missing AudioContext support without throwing", () => {
    const audioContext = window.AudioContext;
    const webkitAudioContext = (window as unknown as Record<string, unknown>).webkitAudioContext;

    Object.defineProperty(window, "AudioContext", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitAudioContext", { value: undefined, configurable: true });

    try {
      expect(() => startAmbience("rain", 0.4)).not.toThrow();
    } finally {
      Object.defineProperty(window, "AudioContext", { value: audioContext, configurable: true });
      Object.defineProperty(window, "webkitAudioContext", { value: webkitAudioContext, configurable: true });
    }
  });

  it("clears the running ambience without throwing when there is no engine", () => {
    expect(() => stopAmbience()).not.toThrow();
    expect(currentAmbience()).toBeNull();
  });

  it("ignores volume changes when no ambience is running", () => {
    expect(() => setAmbienceVolume(0.8)).not.toThrow();
    expect(currentAmbience()).toBeNull();
  });
});
