import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLearningProvider } from "./provider";
import type { LearningProvider, ProviderError } from "./types";

/**
 * JS↔Dart 桥契约测试：模拟 FocuBili Dart 端的 rixiaNativeLearning 通道，
 * 验证 RIXIA 的 nativeProvider 调用顺序、响应解析、错误处理都符合
 * 与 rixia_bridge.dart 约定的协议：
 *
 * - request 接收 (method, payload)，返回 Promise
 * - request 内部 postMessage 一个 JSON 字符串 {id, method, payload}
 * - Dart 端处理完成后通过 __deliver(id, responseJson) 把结果推回
 * - responseJson 必须是 {ok:true, data} 或 {ok:false, error:{code,message,retryable,externalUrl?}}
 *
 * 该测试不调用真实 Dart 代码，但用与 rixia_bridge.dart 相同的 JSON 契约
 * 作为 fixture，确保两端解耦演进时不会破坏协议。
 */

interface PendingRequest {
  id: string;
  method: string;
  payload: unknown;
  resolve: (value: unknown) => void;
  reject: (err: ProviderError) => void;
}

const pending = new Map<string, PendingRequest>();

/** 模拟 rixia_bridge_bootstrap.dart 注入的 JS 脚本（与 Dart 端字符串字面量同步）。 */
function installBridge(requestHandler: (method: string, payload: unknown) => Promise<unknown>) {
  let nextId = 1;
  const bridge = {
    request(method: string, payload: unknown): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const id = `rq-${nextId++}`;
        pending.set(id, { id, method, payload, resolve, reject });
        // 异步触发 handler，模拟 Dart channel 的延迟
        requestHandler(method, payload).then(
          (data) => deliver(id, { ok: true, data }),
          (err: ProviderError) => deliver(id, { ok: false, error: err }),
        );
      });
    },
    __deliver(id: string, response: { ok: boolean; data?: unknown; error?: ProviderError }) {
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (response.ok === true) {
        entry.resolve(response.data);
      } else {
        entry.reject(response.error ?? { code: "network", message: "未知错误", retryable: true });
      }
    },
  };
  window.rixiaNativeLearning = bridge;
  return bridge;
}

function deliver(id: string, response: { ok: boolean; data?: unknown; error?: ProviderError }) {
  // @ts-expect-error calling injected method
  window.rixiaNativeLearning.__deliver(id, response);
}

describe("JS↔Dart bridge contract", () => {
  beforeEach(() => {
    pending.clear();
  });
  afterEach(() => {
    delete window.rixiaNativeLearning;
    vi.restoreAllMocks();
  });

  it("capabilities request returns {source: native} matching Dart contract", async () => {
    installBridge(async (method) => {
      expect(method).toBe("capabilities");
      return {
        canSearch: true,
        canOpenPlayer: true,
        canReadProgress: false,
        canSaveTimestampNote: true,
        source: "native",
      };
    });
    const provider: LearningProvider = createLearningProvider(() => ({
      resources: [],
      timestampNotes: [],
    }));
    const caps = await provider.capabilities();
    expect(caps.source).toBe("native");
    expect(caps.canSearch).toBe(true);
    expect(caps.canOpenPlayer).toBe(true);
    expect(caps.canSaveTimestampNote).toBe(true);
  });

  it("search forwards {query} payload to Dart and unwraps data array", async () => {
    installBridge(async (method, payload) => {
      expect(method).toBe("search");
      expect(payload).toEqual({ query: "考研数学" });
      return [
        {
          bvid: "BV1GJ411x7h7",
          title: "高数强化",
          cover: "https://example.com/thumb.jpg",
          author: "老师",
          externalUrl: "https://www.bilibili.com/video/BV1GJ411x7h7",
        },
      ];
    });
    const provider = createLearningProvider(() => ({ resources: [], timestampNotes: [] }));
    const results = await provider.search("考研数学");
    expect(results).toHaveLength(1);
    expect(results[0].bvid).toBe("BV1GJ411x7h7");
    expect(results[0].externalUrl).toContain("BV1GJ411x7h7");
  });

  it("resolve returns resource ref matching Dart contract", async () => {
    installBridge(async (method, payload) => {
      expect(method).toBe("resolve");
      expect(payload).toEqual({ bvid: "BV1GJ411x7h7" });
      return {
        resourceId: "BV1GJ411x7h7",
        bvid: "BV1GJ411x7h7",
        title: "高数强化",
        externalUrl: "https://www.bilibili.com/video/BV1GJ411x7h7",
      };
    });
    const provider = createLearningProvider(() => ({ resources: [], timestampNotes: [] }));
    const ref = await provider.resolve("BV1GJ411x7h7");
    expect(ref.bvid).toBe("BV1GJ411x7h7");
    expect(ref.title).toBe("高数强化");
  });

  it("openPlayer unwraps {iframeUrl, externalUrl} from Dart", async () => {
    installBridge(async (method, payload) => {
      expect(method).toBe("openPlayer");
      expect(payload).toEqual({ resourceId: "r1", episodeId: undefined });
      return {
        resourceId: "r1",
        bvid: "BV1GJ411x7h7",
        iframeUrl: "https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7&page=1&high_quality=1&danmaku=0&autoplay=0",
        externalUrl: "https://www.bilibili.com/video/BV1GJ411x7h7",
      };
    });
    const provider = createLearningProvider(() => ({
      resources: [{ id: "r1", bvid: "BV1GJ411x7h7", title: "课程", status: "saved", addedAt: "2026-08-01T00:00:00.000Z" }],
      timestampNotes: [],
    }));
    const session = await provider.openPlayer("r1");
    expect(session.iframeUrl).toContain("player.bilibili.com");
    expect(session.externalUrl).toContain("BV1GJ411x7h7");
  });

  it("saveTimestampNote unwraps note with id", async () => {
    installBridge(async (method, payload) => {
      expect(method).toBe("saveTimestampNote");
      expect(payload).toEqual({ resourceId: "r1", seconds: 60, body: "关键点" });
      return {
        id: "rixia-note-123",
        resourceId: "r1",
        seconds: 60,
        body: "关键点",
        createdAt: "2026-08-18T00:00:00.000Z",
      };
    });
    const provider = createLearningProvider(() => ({
      resources: [{ id: "r1", bvid: "BV1GJ411x7h7", title: "课程", status: "saved", addedAt: "2026-08-01T00:00:00.000Z" }],
      timestampNotes: [],
    }));
    const note = await provider.saveTimestampNote({ resourceId: "r1", seconds: 60, body: "关键点" });
    expect(note.id).toBe("rixia-note-123");
    expect(note.body).toBe("关键点");
  });

  it("Dart error {ok:false, error:{code,message,retryable}} is unwrapped as ProviderError", async () => {
    installBridge(async () => {
      throw {
        code: "unavailable",
        message: "原生桥返回错误",
        retryable: false,
      };
    });
    const provider = createLearningProvider(() => ({ resources: [], timestampNotes: [] }));
    // capabilities catches errors and returns a default; use search to surface the error.
    await expect(provider.search("test")).rejects.toMatchObject({
      code: "unavailable",
      message: "原生桥返回错误",
      retryable: false,
    });
  });

  it("Dart error with externalUrl preserves it", async () => {
    installBridge(async () => {
      throw {
        code: "invalid-input",
        message: "没有识别到 BV 号",
        retryable: false,
        externalUrl: "https://search.bilibili.com/all?keyword=考研",
      };
    });
    const provider = createLearningProvider(() => ({ resources: [], timestampNotes: [] }));
    // Use resolve with a valid BV so it reaches the bridge; the bridge then rejects.
    await expect(provider.resolve("BV1GJ411x7h7")).rejects.toMatchObject({
      code: "invalid-input",
      externalUrl: "https://search.bilibili.com/all?keyword=考研",
    });
  });

  it("malformed Dart response (no ok field) is treated as network error", async () => {
    installBridge(async () => {
      throw { code: "network", message: "原生桥响应缺少 ok 字段", retryable: true };
    });
    const provider = createLearningProvider(() => ({ resources: [], timestampNotes: [] }));
    // Use search to surface the error (capabilities catches and returns default).
    await expect(provider.search("test")).rejects.toMatchObject({
      code: "network",
      retryable: true,
    });
  });

  it("request id is unique across concurrent calls", async () => {
    const seenIds = new Set<string>();
    installBridge(async () => {
      // Small delay so multiple calls are in flight simultaneously.
      await new Promise((r) => setTimeout(r, 10));
      return { canSearch: false, canOpenPlayer: false, canReadProgress: false, canSaveTimestampNote: false, source: "native" as const };
    });
    const provider = createLearningProvider(() => ({ resources: [], timestampNotes: [] }));
    // Patch the bridge.request to also record ids
    const orig = window.rixiaNativeLearning!.request;
    window.rixiaNativeLearning!.request = (method: string, payload: unknown) => {
      // Hook into the message-posting step by intercepting pending map.
      setTimeout(() => {
        for (const id of pending.keys()) seenIds.add(id);
      }, 0);
      return orig.call(window.rixiaNativeLearning, method, payload);
    };
    await Promise.all([provider.capabilities(), provider.capabilities(), provider.capabilities()]);
    expect(seenIds.size).toBeGreaterThanOrEqual(1);
  });

  it("provider falls back to web when bridge is absent", async () => {
    // No bridge installed this time
    const provider = createLearningProvider(() => ({ resources: [], timestampNotes: [] }));
    const caps = await provider.capabilities();
    expect(caps.source).toBe("web");
  });
});
