import { describe, expect, it } from "vitest";
import { parsePlayUrl } from "./playurlService";

describe("parsePlayUrl", () => {
  it("preserves negative Bilibili business codes as errors", () => {
    expect(() => parsePlayUrl(JSON.stringify({ code: -403, message: "无权访问" })))
      .toThrow("无权访问（错误码：-403）");
  });

  it("parses a DASH response with video and audio tracks", () => {
    const result = parsePlayUrl(JSON.stringify({
      code: 0,
      data: {
        quality: 80,
        timelength: 1000,
        accept_quality: [80, 64],
        dash: {
          duration: 1000,
          video: [{ id: 80, baseUrl: "https://video.example/1" }],
          audio: [{ id: 30280, baseUrl: "https://audio.example/1" }],
        },
      },
    }));

    expect(result.dash?.video[0].baseUrl).toBe("https://video.example/1");
    expect(result.dash?.audio[0].baseUrl).toBe("https://audio.example/1");
  });
});
