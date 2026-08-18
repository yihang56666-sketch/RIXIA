/**
 * RIXIA Bilibili 公开内容 API 客户端 — TypeScript 移植自 FocuBili 的
 * lib/services/bilibili_service.dart。
 *
 * 实现的接口：
 * - lookupVideo(input) → VideoPreview（含 tags）
 * - searchVideos(keyword, filter, page) → VideoSearchPage
 * - suggestKeywords(input) → string[]
 * - searchUsers(keyword, filter, page) → UserSearchPage
 *
 * 行为与 FocuBili 一致：
 * - 不读取或保存用户 Cookie
 * - 桌面 User-Agent
 * - 公开 JSON 请求
 * - 失败抛 BilibiliLookupError 含中文说明
 * - 字段缺失时使用安全默认值
 */

import {
  type Bvid,
  type VideoPreview,
  type VideoPart,
  type VideoStats,
  type VideoCollection,
  type VideoCollectionEntry,
  type VideoDescriptionSegment,
  type VideoSearchFilter,
  type VideoSearchPage,
  type VideoSearchResult,
  type UserSearchFilter,
  type UserSearchPage,
  type UserSearchResult,
  type JsonRequest,
  VideoSearchOrder,
  VideoPublishedRange,
  VideoDurationRange,
  UserSearchOrder,
  UserSearchType,
  BilibiliLookupError,
} from "./types";
import { createJsonRequest } from "./httpAdapter";

const API_HOST = "api.bilibili.com";
const SUGGEST_HOST = "s.search.bilibili.com";
const VIDEO_INFO_PATH = "/x/web-interface/view";
const VIDEO_TAGS_PATH = "/x/tag/archive/tags";
const VIDEO_SEARCH_PATH = "/x/web-interface/wbi/search/type";
const SEARCH_SUGGEST_PATH = "/main/suggest";
const BVID_PATTERN = /BV[0-9A-Za-z]{10}/;

const TRAILING_PUNCTUATION = ".,!?;:\"'，。！？；：、）)]}》】」』";
const URL_PATTERN = /https?:\/\/[^\s<>　]+/gi;

export interface BilibiliPublicContentService {
  lookupVideo(input: string): Promise<VideoPreview>;
  searchVideos(keyword: string, page?: number, filter?: VideoSearchFilter): Promise<VideoSearchPage>;
  suggestKeywords(input: string): Promise<string[]>;
  searchUsers(keyword: string, page?: number, filter?: UserSearchFilter): Promise<UserSearchPage>;
}

/** 默认实现：浏览器 fetch 公开 B 站 API。 */
export function createBilibiliPublicContentService(
  requestJson: JsonRequest = defaultRequestJson,
): BilibiliPublicContentService {
  return {
    async lookupVideo(input: string): Promise<VideoPreview> {
      const bvid = extractBvid(input);
      if (!bvid) {
        throw new BilibiliLookupError(
          "没有找到有效的 BV 号。请粘贴类似 BV1GJ411x7h7 的编号或 B 站视频链接。",
        );
      }
      const url = buildUrl(API_HOST, VIDEO_INFO_PATH, { bvid });
      const responseText = await requestJson(url);
      const video = parseVideoInfo(responseText, bvid);
      try {
        const tagResponse = await requestJson(
          buildUrl(API_HOST, VIDEO_TAGS_PATH, { bvid: video.bvid }),
        );
        const tags = parseVideoTags(tagResponse);
        return tags.length === 0 ? video : { ...video, tags };
      } catch {
        return video;
      }
    },

    async searchVideos(keyword, page = 1, filter) {
      const normalizedKeyword = keyword.trim();
      if (!normalizedKeyword) {
        throw new BilibiliLookupError("请输入要搜索的视频关键词。");
      }
      const safePage = clamp(page, 1, 50);
      const query: Record<string, string> = {
        search_type: "video",
        keyword: normalizedKeyword,
        page: String(safePage),
        order: searchOrderValue(filter?.order ?? VideoSearchOrder.relevance),
        duration: String(durationRangeValue(filter?.durationRange ?? VideoDurationRange.any)),
      };
      if (filter?.categoryId != null) query.tids = String(filter.categoryId);
      appendPublishedRange(query, filter?.publishedRange ?? VideoPublishedRange.any);
      const responseText = await requestJson(buildUrl(API_HOST, VIDEO_SEARCH_PATH, query));
      return parseVideoSearchPage(responseText, safePage);
    },

    async suggestKeywords(input) {
      const normalized = input.trim();
      if (!normalized) return [];
      const url = buildUrl(SUGGEST_HOST, SEARCH_SUGGEST_PATH, {
        term: normalized,
        main_ver: "v1",
      });
      const responseText = await requestJson(url);
      return parseSearchSuggestions(responseText);
    },

    async searchUsers(keyword, page = 1, filter) {
      const normalized = keyword.trim();
      if (!normalized) {
        throw new BilibiliLookupError("请输入要搜索的用户名。");
      }
      const safePage = clamp(page, 1, 50);
      const url = buildUrl(API_HOST, VIDEO_SEARCH_PATH, {
        search_type: "bili_user",
        keyword: normalized,
        page: String(safePage),
        order: userSearchOrderValue(filter?.order ?? UserSearchOrder.defaultOrder),
        user_type: String(userSearchTypeValue(filter?.type ?? UserSearchType.all)),
      });
      const responseText = await requestJson(url);
      return parseUserSearchPage(responseText, safePage);
    },
  };
}

/** 从任意输入提取 BV 号，对齐 FocuBili 的 _extractBvid。 */
export function extractBvid(input: string): Bvid | null {
  const match = input.trim().match(BVID_PATTERN);
  if (!match) return null;
  const raw = match[0];
  return `BV${raw.slice(2)}`;
}

function buildUrl(host: string, path: string, query: Record<string, string>): string {
  const qs = new URLSearchParams(query).toString();
  return `https://${host}${path}?${qs}`;
}

async function defaultRequestJson(url: string): Promise<string> {
  return createJsonRequest()(url);
}

function searchOrderValue(order: VideoSearchOrder): string {
  return order;
}

function userSearchOrderValue(order: UserSearchOrder): string {
  switch (order) {
    case UserSearchOrder.defaultOrder: return "totalrank";
    case UserSearchOrder.fansDescending: return "fans";
    case UserSearchOrder.fansAscending: return "fans_asc";
    case UserSearchOrder.levelDescending: return "level";
    case UserSearchOrder.levelAscending: return "level_asc";
  }
}

function userSearchTypeValue(type: UserSearchType): number {
  switch (type) {
    case UserSearchType.all: return 0;
    case UserSearchType.uploader: return 1;
    case UserSearchType.normal: return 2;
    case UserSearchType.certified: return 3;
  }
}

function durationRangeValue(range: VideoDurationRange): number {
  switch (range) {
    case VideoDurationRange.any: return 0;
    case VideoDurationRange.underTenMinutes: return 1;
    case VideoDurationRange.tenToThirtyMinutes: return 2;
    case VideoDurationRange.thirtyToSixtyMinutes: return 3;
    case VideoDurationRange.overSixtyMinutes: return 4;
  }
}

function appendPublishedRange(query: Record<string, string>, range: VideoPublishedRange): void {
  if (range === VideoPublishedRange.any) return;
  const nowSeconds = Math.floor(Date.now() / 1000);
  let rangeSeconds = 0;
  if (range === VideoPublishedRange.lastDay) rangeSeconds = 86400;
  else if (range === VideoPublishedRange.lastWeek) rangeSeconds = 86400 * 7;
  else if (range === VideoPublishedRange.lastHalfYear) rangeSeconds = 86400 * 183;
  else return;
  query.pubtime_begin_s = String(nowSeconds - rangeSeconds);
  query.pubtime_end_s = String(nowSeconds);
}

function parseVideoTags(responseText: string): string[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(responseText);
  } catch {
    return [];
  }
  if (typeof decoded !== "object" || decoded === null) return [];
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code !== 0 || !Array.isArray(root.data)) return [];
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of root.data as unknown[]) {
    const tag = readText(readObject(rawTag).tag_name, "");
    if (!tag || tag.length > 30 || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= 16) break;
  }
  return tags;
}

function parseVideoSearchPage(responseText: string, requestedPage: number): VideoSearchPage {
  const decoded = JSON.parse(responseText);
  if (typeof decoded !== "object" || decoded === null) {
    throw new BilibiliLookupError("视频搜索接口返回的数据格式不正确。");
  }
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code !== 0) {
    const message = readText(root.message, "视频搜索失败");
    throw new BilibiliLookupError(`${message}（错误码：${code}）。`);
  }
  const data = readObject(root.data);
  const results: VideoSearchResult[] = [];
  if (Array.isArray(data.result)) {
    for (const rawResult of data.result as unknown[]) {
      const item = readObject(rawResult);
      const bvid = extractBvid(readText(item.bvid, ""));
      if (!bvid) continue;
      const durationSeconds = parseSearchDuration(readText(item.duration, "0:00"));
      results.push({
        bvid,
        title: stripHtml(readText(item.title, "未命名视频")),
        ownerName: stripHtml(readText(item.author, "未知 UP 主")),
        durationSeconds,
        thumbnailUrl: normalizeThumbnailUrl(readText(item.pic, "")),
        publishedAt: parseUnixTime(readInteger(item.pubdate))?.toISOString(),
        playCount: readInteger(item.play),
        danmakuCount: readInteger(item.video_review),
        episodeCountText: readText(item.tag, ""),
      });
    }
  }
  const resolvedPage = clamp(readInteger(data.page), 1, 50);
  const totalPages = clamp(
    readInteger(data.numPages ?? data.num_pages ?? resolvedPage),
    resolvedPage,
    50,
  );
  return {
    results,
    page: resolvedPage === 1 && requestedPage > 1 ? requestedPage : resolvedPage,
    totalPages,
  };
}

function parseUserSearchPage(responseText: string, requestedPage: number): UserSearchPage {
  const decoded = JSON.parse(responseText);
  if (typeof decoded !== "object" || decoded === null) {
    throw new BilibiliLookupError("用户搜索接口返回的数据格式不正确。");
  }
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code !== 0) {
    const message = readText(root.message, "用户搜索失败");
    throw new BilibiliLookupError(`${message}（错误码：${code}）。`);
  }
  const data = readObject(root.data);
  const results: UserSearchResult[] = [];
  if (Array.isArray(data.result)) {
    for (const rawResult of data.result as unknown[]) {
      const item = readObject(rawResult);
      const mid = readIdentifier(item.mid);
      if (mid <= 0) continue;
      const official = readObject(item.official_verify);
      const certification = stripHtml(readText(official.desc ?? item.official_desc, ""));
      results.push({
        mid,
        name: stripHtml(readText(item.uname, "未知用户")),
        avatarUrl: normalizeImageUrl(readText(item.upic, "")),
        signature: stripHtml(readText(item.usign, "")),
        followerCount: readInteger(item.fans),
        videoCount: readInteger(item.videos),
        level: readInteger(item.level),
        isUploader: readInteger(item.is_upuser) === 1,
        certification,
      });
    }
  }
  const resolvedPage = clamp(readInteger(data.page), 1, 50);
  const totalPages = clamp(
    readInteger(data.numPages ?? data.num_pages ?? resolvedPage),
    resolvedPage,
    50,
  );
  return {
    results,
    page: resolvedPage === 1 && requestedPage > 1 ? requestedPage : resolvedPage,
    totalPages,
  };
}

function parseSearchSuggestions(responseText: string): string[] {
  const decoded = JSON.parse(responseText);
  if (typeof decoded !== "object" || decoded === null) return [];
  const root = decoded as Record<string, unknown>;
  const tag = readObject(root.tag ?? root.result);
  const values: string[] = [];
  if (Array.isArray(tag.value)) {
    for (const raw of tag.value as unknown[]) {
      const item = readObject(raw);
      const text = readText(item.name ?? item.k, "");
      if (text) values.push(text);
    }
  }
  return values;
}

function parseVideoInfo(responseText: string, requestedBvid: string): VideoPreview {
  const decoded = JSON.parse(responseText);
  if (typeof decoded !== "object" || decoded === null) {
    throw new BilibiliLookupError("视频详情接口返回的数据格式不正确。");
  }
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code !== 0) {
    const serverMessage = typeof root.message === "string" ? (root.message as string) : "";
    throw new BilibiliLookupError(
      !serverMessage || serverMessage === "0"
        ? `无法查询这支公开视频（错误码：${code}）。`
        : `无法查询这支公开视频：${serverMessage}（错误码：${code}）。`,
    );
  }
  const rawData = root.data;
  if (typeof rawData !== "object" || rawData === null) {
    throw new BilibiliLookupError("接口没有返回视频详情。");
  }
  const data = rawData as Record<string, unknown>;
  const owner = readObject(data.owner);
  const durationSeconds = readInteger(data.duration);
  const cid = readIdentifier(data.cid);
  if (cid <= 0) {
    throw new BilibiliLookupError("接口没有返回可播放的分P编号。");
  }
  const parts = parseVideoParts(data.pages, {
    fallbackCid: cid,
    fallbackTitle: readText(data.title, "未命名视频"),
    fallbackDurationSeconds: durationSeconds,
  });
  const initialPart = parts.find((p) => p.cid === cid) ?? parts[0]!;
  const resolvedBvid = typeof data.bvid === "string" ? (data.bvid as string) : requestedBvid;
  const rawDescription = readText(data.desc, "");
  const descriptionSegments = parseDescriptionSegments(data.desc_v2, rawDescription);
  const resolvedDescription = rawDescription.length > 0
    ? rawDescription
    : descriptionSegments.map((s) => s.text).join("");
  return {
    aid: readIdentifier(data.aid),
    bvid: resolvedBvid,
    cid: initialPart.cid,
    title: readText(data.title, "未命名视频"),
    ownerName: readText(owner.name, "未知 UP 主"),
    ownerMid: readIdentifier(owner.mid),
    ownerAvatarUrl: normalizeImageUrl(readText(owner.face, "")),
    description: resolvedDescription,
    descriptionSegments,
    publishedAt: parseUnixTime(readInteger(data.pubdate))?.toISOString(),
    stats: parseVideoStats(readObject(data.stat)),
    collection: parseVideoCollection(readObject(data.ugc_season), resolvedBvid),
    durationSeconds: initialPart.durationSeconds,
    thumbnailUrl: normalizeThumbnailUrl(readText(data.pic, "")),
    parts,
    tags: [],
  };
}

function parseVideoParts(
  rawPages: unknown,
  fallback: { fallbackCid: number; fallbackTitle: string; fallbackDurationSeconds: number },
): VideoPart[] {
  const parts: VideoPart[] = [];
  if (Array.isArray(rawPages)) {
    for (const rawPart of rawPages) {
      if (typeof rawPart !== "object" || rawPart === null) continue;
      const part = rawPart as Record<string, unknown>;
      const cid = readIdentifier(part.cid);
      if (cid <= 0) continue;
      const pageNumber = readInteger(part.page) || parts.length + 1;
      const durationSeconds = readInteger(part.duration);
      parts.push({
        pageNumber: pageNumber <= 0 ? parts.length + 1 : pageNumber,
        cid,
        title: readText(part.part, `P${parts.length + 1}`),
        durationSeconds: durationSeconds < 0 ? 0 : durationSeconds,
      });
    }
  }
  if (parts.length === 0) {
    parts.push({
      pageNumber: 1,
      cid: fallback.fallbackCid,
      title: fallback.fallbackTitle,
      durationSeconds: fallback.fallbackDurationSeconds < 0 ? 0 : fallback.fallbackDurationSeconds,
    });
  }
  return parts;
}

function parseVideoStats(value: Record<string, unknown>): VideoStats {
  return {
    viewCount: readInteger(value.view),
    danmakuCount: readInteger(value.danmaku),
    replyCount: readInteger(value.reply),
    favoriteCount: readInteger(value.favorite),
    coinCount: readInteger(value.coin),
    shareCount: readInteger(value.share),
    likeCount: readInteger(value.like),
  };
}

function parseVideoCollection(value: Record<string, unknown>, _requestedBvid: string): VideoCollection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const id = readInteger(value.id);
  if (id <= 0) return undefined;
  const entries: VideoCollectionEntry[] = [];
  if (Array.isArray(value.episodes)) {
    for (const rawEpisode of value.episodes as unknown[]) {
      const episode = readObject(rawEpisode);
      const arc = readObject(episode.arc);
      const bvid = readText(episode.bvid, "");
      if (!bvid) continue;
      entries.push({
        aid: readIdentifier(episode.aid),
        bvid,
        cid: readIdentifier(episode.cid),
        title: readText(episode.title, "未命名视频"),
        thumbnailUrl: normalizeImageUrl(readText(episode.cover, "")),
        durationSeconds: readInteger(episode.duration) || readInteger(arc.duration),
        publishedAt: parseUnixTime(readInteger(arc.pubdate ?? episode.pubdate))?.toISOString(),
        stats: parseVideoStats(readObject(arc.stat)),
      });
    }
  }
  return {
    id,
    title: readText(value.title, "未命名合集"),
    description: readText(value.intro, ""),
    coverUrl: normalizeImageUrl(readText(value.cover, "")),
    ownerMid: readInteger(readObject(value.upper).mid),
    totalCount: readInteger(value.episode_count),
    stats: parseVideoStats(readObject(value.stat)),
    entries,
  };
}

function parseDescriptionSegments(value: unknown, fallbackDescription: string): VideoDescriptionSegment[] {
  const segments: VideoDescriptionSegment[] = [];
  const mentions: VideoDescriptionSegment[] = [];
  if (Array.isArray(value)) {
    for (const rawSegment of value) {
      const segment = readObject(rawSegment);
      const text = readText(segment.raw_text, "");
      if (!text) continue;
      const mentionedMid = readIdentifier(segment.biz_id);
      const type = readInteger(segment.type);
      if (mentionedMid > 0 && (type === 1 || type === 2 || text.trimStart().startsWith("@"))) {
        mentions.push({ text, mentionedMid });
      }
    }
  }

  if (fallbackDescription) {
    let cursor = 0;
    for (const mention of mentions) {
      const match = findDescriptionMentionMatch(fallbackDescription, mention.text, cursor);
      if (!match) continue;
      appendDescriptionTextSegments(segments, fallbackDescription.slice(cursor, match.start));
      segments.push({
        text: fallbackDescription.slice(match.start, match.end),
        mentionedMid: mention.mentionedMid,
      });
      cursor = match.end;
    }
    appendDescriptionTextSegments(segments, fallbackDescription.slice(cursor));
  } else if (Array.isArray(value)) {
    for (const rawSegment of value) {
      const segment = readObject(rawSegment);
      const text = readText(segment.raw_text, "");
      if (!text) continue;
      const mentionedMid = readIdentifier(segment.biz_id);
      const type = readInteger(segment.type);
      if (mentionedMid > 0 && (type === 1 || type === 2 || text.trimStart().startsWith("@"))) {
        const normalizedText = text.trim();
        segments.push({
          text: normalizedText.startsWith("@") ? normalizedText : `@${normalizedText}`,
          mentionedMid,
        });
      } else {
        appendDescriptionTextSegments(segments, text);
      }
    }
  }
  return segments;
}

function findDescriptionMentionMatch(
  description: string,
  metadataText: string,
  cursor: number,
): { start: number; end: number } | null {
  const normalizedText = metadataText.trim();
  if (!normalizedText) return null;
  const accountName = normalizedText.startsWith("@")
    ? normalizedText.slice(1).trimStart()
    : normalizedText;
  if (!accountName) return null;
  const markedText = `@${accountName}`;
  const markedStart = description.indexOf(markedText, cursor);
  if (markedStart >= 0) {
    return { start: markedStart, end: markedStart + markedText.length };
  }
  const plainStart = description.indexOf(normalizedText, cursor);
  if (plainStart < 0) return null;
  return { start: plainStart, end: plainStart + normalizedText.length };
}

function appendDescriptionTextSegments(output: VideoDescriptionSegment[], text: string): void {
  if (!text) return;
  let cursor = 0;
  URL_PATTERN.lastIndex = 0;
  const matches = text.match(URL_PATTERN);
  if (matches) {
    for (const match of matches) {
      const start = text.indexOf(match, cursor);
      if (start < 0) continue;
      let linkEnd = start + match.length;
      while (linkEnd > start && TRAILING_PUNCTUATION.includes(text[linkEnd - 1]!)) {
        linkEnd -= 1;
      }
      const linkText = text.slice(start, linkEnd);
      let uri: URL | null = null;
      try {
        uri = new URL(linkText);
      } catch {
        uri = null;
      }
      if (!uri || !uri.host || (uri.protocol !== "http:" && uri.protocol !== "https:")) continue;
      if (start > cursor) {
        output.push({ text: text.slice(cursor, start) });
      }
      output.push({ text: linkText, linkUri: uri.toString() });
      cursor = linkEnd;
    }
  }
  if (cursor < text.length) {
    output.push({ text: text.slice(cursor) });
  }
}

function parseSearchDuration(text: string): number {
  const parts = text.split(":").map((p) => Number.parseInt(p.trim(), 10) || 0);
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts.length === 0 ? 0 : parts[parts.length - 1]!;
}

function normalizeThumbnailUrl(value: string): string {
  const normalized = normalizeImageUrl(value);
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized;
  return `${normalized}@320w_200h_1c.webp`;
}

function normalizeImageUrl(value: string): string {
  const withScheme = value.startsWith("//") ? `https:${value}` : value;
  let parsed: URL | null = null;
  try {
    parsed = new URL(withScheme);
  } catch {
    parsed = null;
  }
  const trustedHost = parsed != null && (
    parsed.host.endsWith(".hdslb.com") || parsed.host.endsWith(".biliimg.com")
  );
  if (!parsed || !trustedHost) return "";
  const uri = parsed.protocol === "http:" ? new URL(parsed.toString().replace("http://", "https://")) : parsed;
  return uri.protocol === "https:" ? uri.toString() : "";
}

function readInteger(value: unknown): number {
  if (typeof value === "number") return Math.max(0, Math.min(Math.trunc(value), 2 ** 31));
  const n = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(n, 2 ** 31));
}

function readIdentifier(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
}

function parseUnixTime(value: unknown): Date | null {
  const seconds = readInteger(value);
  if (seconds <= 0) return null;
  return new Date(seconds * 1000);
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

function readText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length === 0 ? fallback : text;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
