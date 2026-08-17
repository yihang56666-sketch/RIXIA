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

/**
 * 由 bootstrap 注入的 JS 桥接口。request 返回 Promise<data>；
 * 失败时 reject 一个 ProviderError 形状的对象 {code, message, retryable, externalUrl?}。
 */
interface NativeBridge {
  request(method: string, payload: unknown): Promise<unknown>;
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
    const timer = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new ProviderErrorImpl("network", "原生桥请求超时", { retryable: true }));
      }, REQUEST_TIMEOUT_MS);
    });
    try {
      // Bootstrap 已把响应解析为 data 或 reject ProviderError 对象。
      // 我们直接 await，不再二次 JSON.parse。
      return await Promise.race<T>([bridge.request(method, payload) as Promise<T>, timer]);
    } catch (err) {
      if (isProviderError(err)) throw err;
      if (err instanceof Error && err.name === "ProviderError") throw err;
      // Promise<never> rejection (timeout) 已经是 ProviderError，被 isProviderError 捕获。
      // 这里只兜底网络层抛出的非 ProviderError 异常。
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

export { createId };
