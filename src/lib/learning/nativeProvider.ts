import type {
  CourseResourceRef,
  CourseResult,
  LearningCapabilities,
  LearningFilters,
  LearningProgress,
  LearningProvider,
  PlayerSession,
  ProviderError,
  TimestampNoteInput,
} from "./types";
import { ProviderErrorImpl, isProviderError } from "./types";
import { buildPlayerUrl, buildSearchUrl, extractBvid } from "../bilibili";
import { createId } from "../id";
import type { TimestampNote } from "../../types";

const REQUEST_TIMEOUT_MS = 8000;

interface NativeBridge {
  request(method: string, payload: unknown): Promise<string>;
}

declare global {
  interface Window {
    rixiaNativeLearning?: NativeBridge;
  }
}

function getBridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return window.rixiaNativeLearning ?? null;
}

/**
 * Native provider：通过宿主桥（FocuBili 等）调用原生搜索/播放/笔记能力。
 * 浏览器端只发请求；超时 8 秒或任何错误时由 caller 回退到 Web provider。
 * 禁止把登录 Cookie 传给 JavaScript——宿主桥只返回结构化结果。
 */
export function createNativeLearningProvider(): LearningProvider {
  async function callBridge<T>(method: string, payload: unknown): Promise<T> {
    const bridge = getBridge();
    if (!bridge) {
      throw new ProviderErrorImpl("unavailable", "原生桥不可用", { retryable: false });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const raw = await Promise.race([
        bridge.request(method, payload),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new ProviderErrorImpl("network", "原生桥请求超时", { retryable: true }));
          });
        }),
      ]);
      clearTimeout(timer);
      return parseBridgeResponse<T>(raw);
    } catch (err) {
      clearTimeout(timer);
      if (isProviderError(err)) throw err;
      throw new ProviderErrorImpl(
        "network",
        err instanceof Error ? err.message : "原生桥请求失败",
        { retryable: true },
      ) satisfies ProviderError as ProviderError;
    }
  }

  return {
    async capabilities(): Promise<LearningCapabilities> {
      try {
        return await callBridge<LearningCapabilities>("capabilities", {});
      } catch {
        return {
          canSearch: false,
          canOpenPlayer: false,
          canReadProgress: false,
          canSaveTimestampNote: false,
          source: "native",
        };
      }
    },

    async search(query: string, filters?: LearningFilters): Promise<CourseResult[]> {
      return callBridge<CourseResult[]>("search", { query, filters });
    },

    async resolve(input: string): Promise<CourseResourceRef> {
      const bvid = extractBvid(input);
      if (!bvid) {
        throw new ProviderErrorImpl("invalid-input", "没有识别到 BV 号", {
          retryable: false,
          externalUrl: buildSearchUrl(input.trim() || "考研"),
        });
      }
      return callBridge<CourseResourceRef>("resolve", { bvid });
    },

    async openPlayer(resourceId: string, episodeId?: string): Promise<PlayerSession> {
      const response = await callBridge<{ resourceId: string; bvid: string; externalUrl: string; iframeUrl?: string }>(
        "openPlayer",
        { resourceId, episodeId },
      );
      return {
        resourceId: response.resourceId,
        bvid: response.bvid,
        iframeUrl: response.iframeUrl ?? buildPlayerUrl(response.bvid),
        externalUrl: response.externalUrl,
      };
    },

    async getProgress(resourceId: string): Promise<LearningProgress | null> {
      return callBridge<LearningProgress | null>("getProgress", { resourceId });
    },

    async saveTimestampNote(note: TimestampNoteInput): Promise<TimestampNote> {
      return callBridge<TimestampNote>("saveTimestampNote", note);
    },
  };
}

function parseBridgeResponse<T>(raw: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProviderErrorImpl("network", "原生桥返回了无法解析的响应", { retryable: true });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ProviderErrorImpl("network", "原生桥返回了非对象响应", { retryable: true });
  }
  const obj = parsed as { ok?: boolean; data?: unknown; error?: { code?: string; message?: string; retryable?: boolean } };
  if (obj.ok === true) return obj.data as T;
  if (obj.ok === false && obj.error) {
    throw new ProviderErrorImpl(
      (obj.error.code as ProviderError["code"]) ?? "unavailable",
      obj.error.message ?? "原生桥返回错误",
      { retryable: obj.error.retryable ?? false },
    ) satisfies ProviderError as ProviderError;
  }
  throw new ProviderErrorImpl("network", "原生桥响应缺少 ok 字段", { retryable: true });
}

export { createId };
