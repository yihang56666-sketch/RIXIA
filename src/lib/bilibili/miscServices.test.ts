import { afterEach, describe, expect, it } from "vitest";
import { checkForUpdate, exportVideoNotes, VideoNoteExportFormat, AppUpdateStatus } from "./miscServices";
import type { VideoNote } from "./types";

const baseNote: VideoNote = {
  id: "n1",
  bvid: "BV1test",
  videoTitle: "测试视频",
  ownerName: "作者",
  partCid: 1,
  partPageNumber: 1,
  partTitle: "P1",
  title: "重点",
  body: "这是正文",
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  positionSeconds: 65,
  videoCoverUrl: "",
};

describe("exportVideoNotes", () => {
  it("includes saved frame data in JSON and reports image count", () => {
    const note = { ...baseNote, framePath: "data:image/png;base64,abc" };
    const result = exportVideoNotes([note], VideoNoteExportFormat.json, "测试视频");

    expect(result.imageCount).toBe(1);
    expect(new TextDecoder().decode(result.bytes)).toContain(note.framePath);
  });

  it("adds frame image markdown when a note has a saved frame", () => {
    const note = { ...baseNote, framePath: "data:image/png;base64,abc" };
    const result = exportVideoNotes([note], VideoNoteExportFormat.markdown, "测试视频");
    const markdown = new TextDecoder().decode(result.bytes);

    expect(result.imageCount).toBe(1);
    expect(markdown).toContain(`![时间点画面](${note.framePath})`);
  });
});

describe("checkForUpdate", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("checks the repository that ships this application", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input) => {
      fetchCalls.push(String(input));
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    try {
      await checkForUpdate("0.3.0", { force: true });
      expect(fetchCalls[0]).toBe("https://api.github.com/repos/Yihang56666-sketch/clock/releases?per_page=1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("treats an empty GitHub release list as no update without requesting a missing latest release", async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input) => {
      fetchCalls.push(String(input));
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    try {
      const result = await checkForUpdate("0.3.0", { force: true });
      expect(result.status).toBe(AppUpdateStatus.upToDate);
      expect(fetchCalls[0]).toContain("/releases?per_page=1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("treats a missing GitHub repository as up to date", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("Not Found", { status: 404 })) as typeof fetch;
    try {
      const result = await checkForUpdate("0.3.0", { force: true });
      expect(result.status).toBe(AppUpdateStatus.upToDate);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("treats GitHub rate-limit responses as a quiet failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("rate limit", { status: 403 })) as typeof fetch;
    try {
      const result = await checkForUpdate("0.3.0", { force: true });
      expect(result.status).toBe(AppUpdateStatus.failed);
      expect(result.message).toBe("暂时无法检查更新，请稍后再试。");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reuses a fresh cache unless a forced check is requested", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("[]", { status: 200 });
    }) as typeof fetch;
    try {
      await checkForUpdate("0.3.0", { force: true });
      await checkForUpdate("0.3.0");
      expect(calls).toBe(1);
      await checkForUpdate("0.3.0", { force: true });
      expect(calls).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
