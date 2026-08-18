/**
 * RIXIA 播放器增强服务 — 1:1 TS 移植自 FocuBili 的
 * bilibili_player_enhancement_service.dart（294 行）。
 *
 * 提供视频章节（view_points）和互动视频剧情分支信息。
 * 使用 B 站公开网页接口，不读取或保存用户 Cookie。
 */

import type { JsonRequest } from "./types";
import type {
  PlayerEnhancementMetadata,
  VideoChapter,
  InteractiveVideoChoice,
  InteractiveVideoNode,
} from "./extendedModels";
import { createJsonRequest } from "./httpAdapter";

export class PlayerEnhancementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlayerEnhancementError";
  }
}

export interface BilibiliPlayerEnhancementService {
  loadMetadata(bvid: string, cid: number): Promise<PlayerEnhancementMetadata>;
  loadInteractiveNode(bvid: string, graphVersion: number, edgeId?: number): Promise<InteractiveVideoNode>;
}

const API_HOST = "api.bilibili.com";
const PLAYER_INFO_PATH = "/x/player/wbi/v2";
const INTERACTIVE_EDGE_PATH = "/x/stein/edgeinfo_v2";

export function createBilibiliPlayerEnhancementService(
  requestJson: JsonRequest = createJsonRequest(),
): BilibiliPlayerEnhancementService {
  return {
    async loadMetadata(bvid, cid) {
      const url = `https://${API_HOST}${PLAYER_INFO_PATH}?bvid=${encodeURIComponent(bvid)}&cid=${cid}`;
      const text = await requestJson(url);
      const data = readApiData(text, "暂时无法读取视频分段信息。");
      const chapters = parseChapters(data.view_points);
      const interaction = readMap(data.interaction);
      const graphVersion = readInt(interaction.graph_version);
      return {
        chapters,
        interaction: graphVersion > 0 ? { graphVersion } : undefined,
      };
    },

    async loadInteractiveNode(bvid, graphVersion, edgeId) {
      const params = new URLSearchParams({
        bvid,
        graph_version: String(graphVersion),
      });
      if (edgeId != null && edgeId > 0) {
        params.set("edge_id", String(edgeId));
      }
      const url = `https://${API_HOST}${INTERACTIVE_EDGE_PATH}?${params.toString()}`;
      const text = await requestJson(url);
      const data = readApiData(text, "暂时无法读取互动剧情选项。");
      const edges = readMap(data.edges);
      const questions = readList(edges.questions);
      let firstQuestion: Record<string, unknown> = {};
      for (const rawQuestion of questions) {
        const question = readMap(rawQuestion);
        if (readList(question.choices).length > 0) {
          firstQuestion = question;
          break;
        }
      }
      const choices: InteractiveVideoChoice[] = readList(firstQuestion.choices)
        .map(parseChoice)
        .filter((c): c is InteractiveVideoChoice => c != null);
      const choicePromptLeadTimeMs = parseInteractiveChoiceLeadTime(firstQuestion.start_time_r);
      const pauseVideoForChoice =
        firstQuestion.pause_video === true || readInt(firstQuestion.pause_video) === 1;
      return {
        title: readText(data.title),
        edgeId: readInt(data.edge_id),
        isLeaf: readInt(data.is_leaf) === 1,
        choices,
        choicePromptLeadTimeMs,
        pauseVideoForChoice,
      };
    },
  };
}

/** 空实现，用于离线/测试环境。 */
export function createEmptyPlayerEnhancementService(): BilibiliPlayerEnhancementService {
  return {
    async loadMetadata() {
      return { chapters: [] };
    },
    async loadInteractiveNode() {
      throw new PlayerEnhancementError("当前播放器未启用互动视频服务。");
    },
  };
}

function parseChoice(rawChoice: unknown): InteractiveVideoChoice | null {
  const choice = readMap(rawChoice);
  const cid = readInt(choice.cid);
  const edgeId = readInt(choice.id);
  if (cid <= 0 || edgeId <= 0) return null;
  const label = readText(choice.option);
  return { edgeId, cid, label: label.length === 0 ? "继续剧情" : label };
}

function parseChapters(rawChapters: unknown): VideoChapter[] {
  const chapters: VideoChapter[] = [];
  const seen = new Set<string>();
  for (const rawChapter of readList(rawChapters)) {
    const chapter = readMap(rawChapter);
    const startSeconds = Math.round(readNumber(chapter.from));
    const endSeconds = Math.round(readNumber(chapter.to));
    const title = readText(chapter.content);
    const identity = `${startSeconds}:${endSeconds}:${title}`;
    if (!title || endSeconds <= startSeconds || seen.has(identity)) continue;
    seen.add(identity);
    chapters.push({
      title,
      startMs: startSeconds * 1000,
      endMs: endSeconds * 1000,
      imageUrl: normalizeImageUrl(readChapterImageUrl(chapter)),
    });
  }
  chapters.sort((a, b) => a.startMs - b.startMs);
  return chapters;
}

function readApiData(text: string, fallbackMessage: string): Record<string, unknown> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new PlayerEnhancementError("播放器增强接口返回的 JSON 无法解析。");
  }
  const root = readMap(decoded);
  if (readInt(root.code) !== 0 || typeof root.data !== "object" || root.data === null) {
    const message = readText(root.message);
    throw new PlayerEnhancementError(!message ? fallbackMessage : message);
  }
  return readMap(root.data);
}

function normalizeImageUrl(value: string): string {
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http://")) return `https://${value.slice(7)}`;
  return value;
}

function readChapterImageUrl(chapter: Record<string, unknown>): string {
  const camelCaseUrl = readText(chapter.imgUrl);
  return camelCaseUrl.length > 0 ? camelCaseUrl : readText(chapter.img_url);
}

function parseInteractiveChoiceLeadTime(rawValue: unknown): number | undefined {
  if (rawValue == null) return undefined;
  const ms = readNumber(rawValue);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Math.round(ms);
}

function readMap(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readInt(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

function readNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const n = Number.parseFloat(String(value ?? ""));
  return Number.isNaN(n) ? 0 : n;
}

function readText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}
