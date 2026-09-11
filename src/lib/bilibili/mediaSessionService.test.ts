import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaSessionService } from "./mediaSessionService";

describe("createMediaSessionService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("updates media metadata, playback state, and system handlers", () => {
    const setActionHandler = vi.fn();
    const session = { metadata: null as unknown, playbackState: "none", setActionHandler };
    vi.stubGlobal("navigator", { mediaSession: session });
    const actions = { play: vi.fn(), pause: vi.fn(), seekBy: vi.fn(), seekTo: vi.fn() };

    const service = createMediaSessionService();
    service.sync({ title: "测试课程", artist: "测试老师", artworkUrl: "https://i0.hdslb.com/cover.jpg", isPlaying: true, actions });

    expect(session.playbackState).toBe("playing");
    expect((session.metadata as MediaMetadata).title).toBe("测试课程");
    expect(setActionHandler).toHaveBeenCalledWith("play", actions.play);
    expect(setActionHandler).toHaveBeenCalledWith("pause", actions.pause);
    expect(setActionHandler).toHaveBeenCalledWith("seekbackward", expect.any(Function));
    expect(setActionHandler).toHaveBeenCalledWith("seekto", expect.any(Function));

    // seekto 处理器只在拿到有限数值时转发，且转发的就是该数值本身。
    const seekToHandler = setActionHandler.mock.calls.find(([action]) => action === "seekto")?.[1] as (details: { seekTime?: number }) => void;
    seekToHandler({ seekTime: 42 });
    expect(actions.seekTo).toHaveBeenCalledWith(42);
    seekToHandler({});
    expect(actions.seekTo).toHaveBeenCalledTimes(1);
  });

  it("does nothing when Media Session is unavailable", () => {
    vi.stubGlobal("navigator", {});
    expect(() => createMediaSessionService().sync({ title: "x", artist: "y", artworkUrl: "", isPlaying: false, actions: { play() {}, pause() {}, seekBy() {}, seekTo() {} } })).not.toThrow();
  });
});
