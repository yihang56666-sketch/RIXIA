import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playChime } from "./chime";
import { currentAmbience, startAmbience, stopAmbience } from "./noise";

const failure = new Error("audio device unavailable");

class AudioContextFixture {
  static instances: AudioContextFixture[] = [];
  static failAt: "resume" | "node" | "close" | undefined;
  currentTime = 0;
  sampleRate = 100;
  destination = {};
  resume = vi.fn(() => AudioContextFixture.failAt === "resume" ? Promise.reject(failure) : Promise.resolve());
  close = vi.fn(() => AudioContextFixture.failAt === "close" ? Promise.reject(failure) : Promise.resolve());
  constructor() { AudioContextFixture.instances.push(this); }
  createBuffer() { return { getChannelData: () => new Float32Array(400) }; }
  createBufferSource() { return this.node(); }
  createOscillator() { return this.node(); }
  createBiquadFilter() { return this.node(); }
  createGain() { return this.node(); }
  private node() {
    if (AudioContextFixture.failAt === "node") throw failure;
    return {
      connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
      frequency: { value: 0 },
      gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
    };
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  AudioContextFixture.instances = [];
  AudioContextFixture.failAt = undefined;
  vi.stubGlobal("AudioContext", AudioContextFixture);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  stopAmbience();
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each([
  { name: "chime", start: playChime },
  { name: "ambience", start: () => startAmbience("rain", 0.4) },
])("$name audio failure ownership", ({ start }) => {
  it("closes a context whose node initialization fails", async () => {
    AudioContextFixture.failAt = "node";
    expect(start).not.toThrow();
    await vi.runAllTimersAsync();
    expect(AudioContextFixture.instances[0].close).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it("observes a rejected resume and releases the context", async () => {
    AudioContextFixture.failAt = "resume";
    start();
    await vi.runAllTimersAsync();
    expect(AudioContextFixture.instances[0].close).toHaveBeenCalledTimes(1);
    expect(currentAmbience()).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("observes a rejected close without an unhandled rejection", async () => {
    AudioContextFixture.failAt = "close";
    start();
    stopAmbience();
    await vi.runAllTimersAsync();
    expect(AudioContextFixture.instances[0].close).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalled();
  });
});
