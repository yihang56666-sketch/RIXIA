import { describe, expect, it } from "vitest";
import { createWatchHistoryService } from "./watchHistoryService";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const entry = {
  bvid: "BV1test",
  cid: 101,
  title: "线性代数",
  ownerName: "老师",
  thumbnailUrl: "https://example.test/cover.jpg",
  durationSeconds: 120,
  watchedAt: "2026-08-19T10:00:00.000Z",
  positionSeconds: 60,
  completed: false,
};

describe("watch history service", () => {
  it("keeps one newest local record per BV and resumes its latest part", async () => {
    const service = createWatchHistoryService(memoryStorage());
    await service.record(entry);
    await service.record({ ...entry, cid: 202, positionSeconds: 40, watchedAt: "2026-08-19T11:00:00.000Z" });

    expect(await service.list()).toEqual([{ ...entry, cid: 202, positionSeconds: 40, watchedAt: "2026-08-19T11:00:00.000Z" }]);
  });

  it("removes an individual local record without clearing unrelated records", async () => {
    const service = createWatchHistoryService(memoryStorage());
    await service.record(entry);
    await service.record({ ...entry, bvid: "BV2test", cid: 202, title: "概率论" });

    await service.remove("BV1test");

    expect(await service.list()).toEqual([{ ...entry, bvid: "BV2test", cid: 202, title: "概率论" }]);
  });
});
