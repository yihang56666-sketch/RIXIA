import { describe, expect, it, vi } from "vitest";
import { createSubtitleService } from "./subtitleService";

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
