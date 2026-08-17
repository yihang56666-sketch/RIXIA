import { buildPlayerUrl, buildSearchUrl, extractBvid } from "../bilibili";
import { createId } from "../id";
import type { CourseResource, TimestampNote } from "../../types";
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
import { ProviderErrorImpl } from "./types";

/**
 * Web 降级 Provider：使用官方 B 站嵌入播放器 + 外部打开 + RIXIA 本地进度。
 * 不读取未经允许的账号 Cookie；进度与笔记持久化在 Zustand store 中。
 */
export function createWebLearningProvider(getStore: () => {
  resources: CourseResource[];
  timestampNotes: TimestampNote[];
}): LearningProvider {
  function findResource(resourceId: string): CourseResource | undefined {
    return getStore().resources.find((r) => r.id === resourceId);
  }

  return {
    async capabilities(): Promise<LearningCapabilities> {
      return {
        canSearch: false,
        canOpenPlayer: true,
        canReadProgress: true,
        canSaveTimestampNote: true,
        source: "web",
      };
    },

    async search(query: string, _filters?: LearningFilters): Promise<CourseResult[]> {
      const keyword = query.trim();
      if (!keyword) return [];
      const url = buildSearchUrl(keyword);
      const externalUrl = url;
      return [
        {
          bvid: "",
          title: `在哔哩哔哩搜索「${keyword}」`,
          externalUrl,
        },
      ];
    },

    async resolve(input: string): Promise<CourseResourceRef> {
      const bvid = extractBvid(input);
      if (!bvid) {
        throw new ProviderErrorImpl("invalid-input", "没有识别到 BV 号", {
          retryable: false,
          externalUrl: buildSearchUrl(input.trim() || "考研"),
        }) satisfies ProviderError as ProviderError;
      }
      const existing = getStore().resources.find((r) => r.bvid === bvid);
      return {
        resourceId: existing?.id ?? bvid,
        bvid,
        title: existing?.title ?? `视频 ${bvid}`,
        externalUrl: `https://www.bilibili.com/video/${bvid}`,
      };
    },

    async openPlayer(resourceId: string, _episodeId?: string): Promise<PlayerSession> {
      const resource = findResource(resourceId);
      if (!resource) {
        throw new ProviderErrorImpl("unavailable", "未找到课程资源", { retryable: false });
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new ProviderErrorImpl("offline", "离线状态无法加载在线播放器", {
          retryable: true,
          externalUrl: `https://www.bilibili.com/video/${resource.bvid}`,
        });
      }
      return {
        resourceId: resource.id,
        bvid: resource.bvid,
        iframeUrl: buildPlayerUrl(resource.bvid),
        externalUrl: `https://www.bilibili.com/video/${resource.bvid}`,
      };
    },

    async getProgress(resourceId: string): Promise<LearningProgress | null> {
      const resource = findResource(resourceId);
      if (!resource) return null;
      if (typeof resource.progressSeconds !== "number") return null;
      return {
        resourceId,
        seconds: resource.progressSeconds,
        durationSeconds: resource.durationSeconds,
        updatedAt: resource.lastOpenedAt ?? resource.addedAt,
      };
    },

    async saveTimestampNote(note: TimestampNoteInput): Promise<TimestampNote> {
      const value = note.body.trim();
      if (!value || note.seconds < 0) {
        throw new ProviderErrorImpl("invalid-input", "时间点笔记内容不能为空", { retryable: false });
      }
      if (!findResource(note.resourceId)) {
        throw new ProviderErrorImpl("unavailable", "未找到课程资源", { retryable: false });
      }
      return {
        id: createId(),
        resourceId: note.resourceId,
        seconds: note.seconds,
        body: value,
        createdAt: new Date().toISOString(),
      };
    },
  };
}
