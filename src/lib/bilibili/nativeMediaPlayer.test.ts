import { describe, expect, it, vi } from "vitest";
import { createNativeMediaPlayer, type NativeMediaPlayerBridge } from "./nativeMediaPlayer";

describe("native media player bridge", () => {
  it("opens DASH tracks and forwards bounds and controls", async () => {
    const calls: Array<{ method: string; args?: unknown }> = [];
    const bridge: NativeMediaPlayerBridge = {
      addListener: vi.fn(async () => ({ remove: async () => undefined })),
      call: vi.fn(async (method, args) => {
        calls.push({ method, args });
        return { ready: true };
      }),
    };
    const player = createNativeMediaPlayer(bridge);

    await player.initialize();
    await player.setBounds({ left: 2, top: 3, width: 400, height: 225 });
    await player.open({
      bvid: "BV1GJ411x7h7",
      cid: 123,
      videoUrl: "https://cdn.example/video.m4s",
      audioUrl: "https://cdn.example/audio.m4s",
      positionSeconds: 12,
      headers: { Referer: "https://www.bilibili.com/video/BV1GJ411x7h7/" },
    });
    await player.play();
    await player.seek(18);
    await player.pause();
    await player.setVolume(0.4);
    await player.setDanmaku([{ text: "重点", startTimeSeconds: 1, mode: 1, color: 0xffffff }]);
    await player.dispose();

    expect(calls.map((call) => call.method)).toEqual([
      "initialize",
      "setBounds",
      "open",
      "play",
      "seek",
      "pause",
      "setVolume",
      "setDanmaku",
      "dispose",
    ]);
    expect(calls[2]?.args).toEqual({
      bvid: "BV1GJ411x7h7",
      cid: 123,
      videoUrl: "https://cdn.example/video.m4s",
      audioUrl: "https://cdn.example/audio.m4s",
      positionSeconds: 12,
      headers: { Referer: "https://www.bilibili.com/video/BV1GJ411x7h7/" },
    });
  });

  it("passes only bounded danmaku payloads to native playback", async () => {
    const bridge: NativeMediaPlayerBridge = {
      addListener: vi.fn(async () => ({ remove: async () => undefined })),
      call: vi.fn(async () => undefined),
    };
    const player = createNativeMediaPlayer(bridge);
    await player.setDanmaku([{ text: "  hello  ", startTimeSeconds: 2, mode: 5, color: 1 }]);
    expect(bridge.call).toHaveBeenCalledWith("setDanmaku", {
      entries: [{ text: "hello", startTimeSeconds: 2, mode: 5, color: 1 }],
    });
  });

  it("rejects malformed media bounds and normalizes volume", async () => {
    const bridge: NativeMediaPlayerBridge = {
      addListener: vi.fn(async () => ({ remove: async () => undefined })),
      call: vi.fn(async () => undefined),
    };
    const player = createNativeMediaPlayer(bridge);

    await expect(player.setBounds({ left: 0, top: 0, width: 0, height: 20 })).rejects.toThrow(
      "播放器区域尺寸必须大于零",
    );
    await player.setVolume(2);
    expect(bridge.call).toHaveBeenCalledWith("setVolume", { volume: 1 });
  });
});
