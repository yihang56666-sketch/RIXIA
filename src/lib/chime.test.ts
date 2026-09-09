import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playChime } from "./chime";

beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("playChime", () => {
  it("starts both tones and releases its AudioContext", async () => {
    const startTone = vi.fn();
    const closeContext = vi.fn().mockResolvedValue(undefined);
    class MockAudioContext {
      currentTime = 0;
      destination = {};
      resume = () => Promise.resolve();
      close = closeContext;
      createOscillator() {
        return { frequency: { value: 0 }, connect: vi.fn(), start: startTone, stop: vi.fn() };
      }
      createGain() {
        return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
      }
    }
    vi.stubGlobal("AudioContext", MockAudioContext);
    playChime();
    expect(startTone).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1200);
    expect(closeContext).toHaveBeenCalledTimes(1);
  });

  it("does not throw when AudioContext is unavailable", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    expect(() => playChime()).not.toThrow();
  });
});
