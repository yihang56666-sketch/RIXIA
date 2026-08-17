import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createLearningProvider } from "./provider";
import { createWebLearningProvider } from "./webProvider";
import type { CourseResource, TimestampNote } from "../../types";

function makeStore() {
  return {
    resources: [] as CourseResource[],
    timestampNotes: [] as TimestampNote[],
  };
}

describe("LearningProvider selection", () => {
  beforeEach(() => {
    delete window.rixiaNativeLearning;
  });
  afterEach(() => {
    delete window.rixiaNativeLearning;
    vi.restoreAllMocks();
  });

  it("uses web provider when window.rixiaNativeLearning is absent", async () => {
    const store = makeStore();
    const provider = createLearningProvider(() => store);
    const caps = await provider.capabilities();
    expect(caps.source).toBe("web");
    expect(caps.canOpenPlayer).toBe(true);
  });

  it("uses native provider when window.rixiaNativeLearning is present", async () => {
    const fakeBridge = {
      request: vi.fn().mockResolvedValue({
        canSearch: true,
        canOpenPlayer: true,
        canReadProgress: true,
        canSaveTimestampNote: true,
        source: "native",
      }),
    };
    window.rixiaNativeLearning = fakeBridge;
    const provider = createLearningProvider(makeStore);
    const caps = await provider.capabilities();
    expect(caps.source).toBe("native");
    expect(caps.canSearch).toBe(true);
  });
});

describe("Web provider", () => {
  let store: ReturnType<typeof makeStore>;
  let provider: ReturnType<typeof createWebLearningProvider>;

  beforeEach(() => {
    store = makeStore();
    provider = createWebLearningProvider(() => store);
  });

  it("resolve rejects malformed BV input with retryable=false and externalUrl", async () => {
    await expect(provider.resolve("not a bv")).rejects.toMatchObject({
      code: "invalid-input",
      retryable: false,
    });
    await expect(provider.resolve("not a bv")).rejects.toMatchObject({
      externalUrl: expect.stringContaining("search.bilibili.com"),
    });
  });

  it("resolve returns resource ref for valid BV", async () => {
    const ref = await provider.resolve("https://www.bilibili.com/video/BV1GJ411x7h7");
    expect(ref.bvid).toBe("BV1GJ411x7h7");
    expect(ref.externalUrl).toContain("BV1GJ411x7h7");
  });

  it("openPlayer rejects unknown resourceId", async () => {
    await expect(provider.openPlayer("missing-id")).rejects.toMatchObject({
      code: "unavailable",
      retryable: false,
    });
  });

  it("openPlayer returns iframe + external URL for known resource", async () => {
    store.resources.push({
      id: "r1",
      bvid: "BV1GJ411x7h7",
      title: "课程",
      status: "saved",
      addedAt: "2026-08-01T00:00:00.000Z",
    });
    const session = await provider.openPlayer("r1");
    expect(session.iframeUrl).toContain("player.bilibili.com");
    expect(session.externalUrl).toContain("BV1GJ411x7h7");
  });

  it("openPlayer rejects when offline", async () => {
    store.resources.push({
      id: "r2",
      bvid: "BV1GJ411x7h7",
      title: "课程",
      status: "saved",
      addedAt: "2026-08-01T00:00:00.000Z",
    });
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    try {
      await expect(provider.openPlayer("r2")).rejects.toMatchObject({
        code: "offline",
        retryable: true,
      });
    } finally {
      Object.defineProperty(navigator, "onLine", { value: originalOnLine, configurable: true });
    }
  });

  it("getProgress returns null when no progress recorded", async () => {
    store.resources.push({
      id: "r3",
      bvid: "BV1GJ411x7h7",
      title: "课程",
      status: "saved",
      addedAt: "2026-08-01T00:00:00.000Z",
    });
    expect(await provider.getProgress("r3")).toBeNull();
  });

  it("getProgress returns recorded progress", async () => {
    store.resources.push({
      id: "r4",
      bvid: "BV1GJ411x7h7",
      title: "课程",
      status: "in-progress",
      addedAt: "2026-08-01T00:00:00.000Z",
      progressSeconds: 120,
      durationSeconds: 600,
      lastOpenedAt: "2026-08-02T00:00:00.000Z",
    });
    const progress = await provider.getProgress("r4");
    expect(progress?.seconds).toBe(120);
    expect(progress?.durationSeconds).toBe(600);
  });

  it("saveTimestampNote rejects empty body", async () => {
    store.resources.push({
      id: "r5",
      bvid: "BV1GJ411x7h7",
      title: "课程",
      status: "saved",
      addedAt: "2026-08-01T00:00:00.000Z",
    });
    await expect(provider.saveTimestampNote({ resourceId: "r5", seconds: 30, body: "   " }))
      .rejects.toMatchObject({ code: "invalid-input" });
  });

  it("saveTimestampNote rejects negative seconds", async () => {
    store.resources.push({
      id: "r6",
      bvid: "BV1GJ411x7h7",
      title: "课程",
      status: "saved",
      addedAt: "2026-08-01T00:00:00.000Z",
    });
    await expect(provider.saveTimestampNote({ resourceId: "r6", seconds: -1, body: "ok" }))
      .rejects.toMatchObject({ code: "invalid-input" });
  });

  it("saveTimestampNote returns a new note with id", async () => {
    store.resources.push({
      id: "r7",
      bvid: "BV1GJ411x7h7",
      title: "课程",
      status: "saved",
      addedAt: "2026-08-01T00:00:00.000Z",
    });
    const note = await provider.saveTimestampNote({ resourceId: "r7", seconds: 60, body: "笔记内容" });
    expect(note.id).toBeTruthy();
    expect(note.resourceId).toBe("r7");
    expect(note.seconds).toBe(60);
    expect(note.body).toBe("笔记内容");
  });

  it("search returns a single external-link result", async () => {
    const results = await provider.search("考研数学");
    expect(results).toHaveLength(1);
    expect(results[0].externalUrl).toContain("search.bilibili.com");
  });

  it("search returns empty for blank keyword", async () => {
    expect(await provider.search("  ")).toEqual([]);
  });
});

describe("Native provider timeout handling", () => {
  beforeEach(() => {
    const neverResolves = () => new Promise<string>(() => {});
    window.rixiaNativeLearning = { request: neverResolves };
  });
  afterEach(() => {
    delete window.rixiaNativeLearning;
  });

  it("falls back gracefully when capabilities times out", async () => {
    vi.useFakeTimers();
    const provider = createLearningProvider(makeStore);
    const capsPromise = provider.capabilities();
    vi.advanceTimersByTimeAsync(9000);
    const caps = await capsPromise;
    vi.useRealTimers();
    expect(caps.canSearch).toBe(false);
    expect(caps.source).toBe("native");
  });
});

export type { TimestampNote };
