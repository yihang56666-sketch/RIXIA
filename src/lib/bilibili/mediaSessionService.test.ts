import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaSessionService } from "./mediaSessionService";

describe("createMediaSessionService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("updates media metadata, playback state, and system handlers", () => {
    const setActionHandler = vi.fn();
    const session = { metadata: null as unknown, playbackState: "none", setActionHandler };
    vi.stubGlobal("navigator", { mediaSession: session });
    const actions = { play: vi.fn(), pause: vi.fn(), seekBy: vi.fn() };

    const service = createMediaSessionService();
    service.sync({ title: "测试课程", artist: "测试老师", artworkUrl: "https://i0.hdslb.com/cover.jpg", isPlaying: true, actions });

    expect(session.playbackState).toBe("playing");
    expect((session.metadata as MediaMetadata).title).toBe("测试课程");
    expect(setActionHandler).toHaveBeenCalledWith("play", actions.play);
    expect(setActionHandler).toHaveBeenCalledWith("pause", actions.pause);
    expect(setActionHandler).toHaveBeenCalledWith("seekbackward", expect.any(Function));
  });

  it("does nothing when Media Session is unavailable", () => {
    vi.stubGlobal("navigator", {});
    expect(() => createMediaSessionService().sync({ title: "x", artist: "y", artworkUrl: "", isPlaying: false, actions: { play() {}, pause() {}, seekBy() {} } })).not.toThrow();
  });
});
