import { beforeEach, describe, expect, it } from "vitest";
import { createLearningListService } from "./services";
import type { LearningListEntry } from "./types";

function entry(id: string, partCid: number): LearningListEntry {
  return {
    id,
    bvid: "BV1xx411c7mD",
    title: "高等数学",
    ownerName: "数学老师",
    coverUrl: "",
    durationSeconds: 600,
    addedAt: "2026-08-19T08:00:00.000Z",
    partCid,
  } as LearningListEntry;
}

describe("LearningListService", () => {
  beforeEach(() => localStorage.clear());

  it("keeps separate entries for different parts of the same video", async () => {
    const service = createLearningListService();

    await expect(service.add(entry("p1", 101))).resolves.toBe(true);
    await expect(service.add(entry("p2", 202))).resolves.toBe(true);

    expect((await service.list()).map((item) => item.id)).toEqual(["p2", "p1"]);
  });

  it("keeps unfinished entries ahead of completed entries", async () => {
    const service = createLearningListService();

    await service.add(entry("first", 101));
    await service.add(entry("second", 202));
    await service.markCompleted("second");

    expect((await service.list()).map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("persists a reordered unfinished queue without moving completed entries", async () => {
    const service = createLearningListService();

    await service.add(entry("first", 101));
    await service.add(entry("second", 202));
    await service.add(entry("third", 303));
    await service.markCompleted("second");
    await service.reorderIncomplete(["first", "third"]);

    expect((await service.list()).map((item) => item.id)).toEqual(["first", "third", "second"]);
  });

  it("moves a completed entry back to the not-started state", async () => {
    const service = createLearningListService();

    await service.add(entry("first", 101));
    await service.markCompleted("first");
    await service.setStatus("first", "not-started");

    const [updated] = await service.list();
    expect(updated).toEqual(expect.objectContaining({ id: "first", status: "not-started" }));
    expect(updated?.completedAt).toBeUndefined();
  });
});
