import { describe, expect, it, vi } from "vitest";
import { createSubtitleService, parseSubtitleDocument } from "./subtitleService";

describe("parseSubtitleDocument", () => {
  it("parses SRT blocks with index lines and multi-line content", () => {
    const srt = [
      "1",
      "00:00:01,000 --> 00:00:03,500",
      "第一句字幕",
      "",
      "2",
      "00:00:04,200 --> 00:00:06,000",
      "第二句第一行",
      "第二句第二行",
    ].join("\n");

    expect(parseSubtitleDocument(srt)).toEqual([
      { from: 1, to: 3.5, content: "第一句字幕" },
      { from: 4.2, to: 6, content: "第二句第一行\n第二句第二行" },
    ]);
  });

  it("parses WebVTT with dot milliseconds, cue ids and inline tags", () => {
    const vtt = [
      "WEBVTT",
      "",
      "intro-cue",
      "00:01.000 --> 00:04.000 position:50%",
      "<i>欢迎来到</i> 强化班",
      "",
      "00:05.250 --> 00:07.000",
      "第二段",
    ].join("\n");

    expect(parseSubtitleDocument(vtt)).toEqual([
      { from: 1, to: 4, content: "欢迎来到 强化班" },
      { from: 5.25, to: 7, content: "第二段" },
    ]);
  });

  it("returns empty for garbage instead of throwing", () => {
    expect(parseSubtitleDocument("")).toEqual([]);
    expect(parseSubtitleDocument("这不是字幕文件")).toEqual([]);
  });
});

describe("subtitleService", () => {
  it("parses tracks and cues while ignoring locked or malformed entries", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ code: 0, data: { subtitle: { subtitles: [
        { id: 1, lan: "zh-CN", lan_doc: "中文", subtitle_url: "//example.test/sub.json", is_lock: false },
        { id: 2, lan: "en", lan_doc: "English", subtitle_url: "", is_lock: true },
      ] } } }))
      .mockResolvedValueOnce(JSON.stringify({ body: [
        { from: 0, to: 2, content: "你好" },
        { from: 3, to: 2, content: "坏数据" },
      ] }));
    const service = createSubtitleService(request);
    const tracks = await service.listTracks("BV1xx411c7mD", 12);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.url).toBe("https://example.test/sub.json");
    await expect(service.loadCues(tracks[0]!)).resolves.toEqual([{ from: 0, to: 2, content: "你好" }]);
  });
});
