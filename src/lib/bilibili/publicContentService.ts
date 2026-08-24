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
import { CreatorVideoOrder, type CreatorArticle, type CreatorCollection, type CreatorContentPage, type CreatorProfile, type CreatorVideo } from "./extendedModels";
import CryptoJS from "crypto-js";
import { normalizeBiliImageUrl, normalizeBiliThumbnailUrl } from "./imageUrl";
import { signBiliWbiUrl } from "./wbiSign";

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
  loadCreatorProfile(mid: number): Promise<CreatorProfile>;
  listCreatorVideos(mid: number, page?: number, options?: { keyword?: string; order?: CreatorVideoOrder }): Promise<CreatorContentPage<CreatorVideo>>;
  listCreatorArticles(mid: number, page?: number): Promise<CreatorContentPage<CreatorArticle>>;
  listCreatorCollections(mid: number, page?: number): Promise<CreatorContentPage<CreatorCollection>>;
  listCollectionVideos(ownerMid: number, collectionId: number, page?: number): Promise<CreatorContentPage<CreatorVideo>>;
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
      const params = { bvid };
      const tagsPromise = Promise.resolve()
        .then(() => requestJson(buildUrl(API_HOST, VIDEO_TAGS_PATH, params)))
        .then(parseVideoTags)
        .catch(() => [] as string[]);
      const responseText = await requestVideoInfo(requestJson, params);
      const video = parseVideoInfo(responseText, bvid);
      const tags = await tagsPromise;
      return tags.length === 0 ? video : { ...video, tags };
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

    async loadCreatorProfile(mid) {
      if (!Number.isFinite(mid) || mid <= 0) throw new BilibiliLookupError("UP 主编号无效。");
      const responseText = await requestJson(buildUrl(API_HOST, "/x/web-interface/card", { mid: String(Math.trunc(mid)), photo: "true" }));
      return parseCreatorProfile(responseText, mid);
    },

    async listCreatorVideos(mid, page = 1, options) {
      if (!Number.isFinite(mid) || mid <= 0) throw new BilibiliLookupError("UP 主编号无效。");
      const safePage = clamp(Math.trunc(page), 1, 50);
      const keyword = options?.keyword?.trim() ?? "";
      const order = creatorVideoOrderParameter(options?.order ?? CreatorVideoOrder.latest);
      const legacyUrl = buildUrl(API_HOST, "/x/space/arc/search", {
        mid: String(Math.trunc(mid)), pn: String(safePage), ps: "20", order, keyword,
      });
      try {
        return parseCreatorVideos(await requestJson(legacyUrl), safePage);
      } catch (error) {
        if (!isRetryableSpaceError(error)) throw error;
        try {
          return parseCreatorVideos(await requestJson(await buildCreatorVideosWbiUrl(Math.trunc(mid), safePage, requestJson, keyword, order)), safePage);
        } catch (fallbackError) {
          if (!isRetryableSpaceError(fallbackError)) throw fallbackError;
          throw new BilibiliLookupError("B 站只对“投稿”启用了额外风控，请确认已经登录，稍后刷新投稿；专栏和合集不受此限制。");
        }
      }
    },

    async listCreatorArticles(mid, page = 1) {
      if (!Number.isFinite(mid) || mid <= 0) throw new BilibiliLookupError("UP 主编号无效。");
      const safePage = clamp(Math.trunc(page), 1, 50);
      return parseCreatorArticles(await requestJson(buildUrl(API_HOST, "/x/space/article", {
        mid: String(Math.trunc(mid)), pn: String(safePage), ps: "20", sort: "publish_time",
      })), safePage);
    },

    async listCreatorCollections(mid, page = 1) {
      if (!Number.isFinite(mid) || mid <= 0) throw new BilibiliLookupError("UP 主编号无效。");
      const safePage = clamp(Math.trunc(page), 1, 50);
      const baseQuery = { mid: String(Math.trunc(mid)), page_num: String(safePage), page_size: "20" };
      try {
        return parseCreatorCollections(await requestJson(buildUrl(API_HOST, "/x/polymer/web-space/seasons_series_list", baseQuery)), Math.trunc(mid), safePage);
      } catch (error) {
        if (!isRetryableSpaceError(error)) throw error;
        const retryQuery = { ...baseQuery, platform: "web", web_location: "333.1387", dm_img_list: "[]", dm_img_str: "focubili-public", dm_cover_img_str: "focubili-public-space" };
        return parseCreatorCollections(await requestJson(buildUrl(API_HOST, "/x/polymer/web-space/seasons_series_list", retryQuery)), Math.trunc(mid), safePage);
      }
    },

    async listCollectionVideos(ownerMid, collectionId, page = 1) {
      if (!Number.isFinite(ownerMid) || ownerMid <= 0 || !Number.isFinite(collectionId) || collectionId <= 0) {
        throw new BilibiliLookupError("合集编号无效。");
      }
      const safePage = clamp(Math.trunc(page), 1, 50);
      const baseQuery = {
        mid: String(Math.trunc(ownerMid)), season_id: String(Math.trunc(collectionId)), page_num: String(safePage), page_size: "20", sort_reverse: "false",
      };
      try {
        return parseCollectionVideos(await requestJson(buildUrl(API_HOST, "/x/polymer/web-space/seasons_archives_list", baseQuery)), safePage);
      } catch (error) {
        if (!isRetryableSpaceError(error)) throw error;
        const retryQuery = { ...baseQuery, platform: "web", web_location: "333.1387", dm_img_list: "[]", dm_img_str: "focubili-public", dm_cover_img_str: "focubili-public-space" };
        return parseCollectionVideos(await requestJson(buildUrl(API_HOST, "/x/polymer/web-space/seasons_archives_list", retryQuery)), safePage);
      }
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
  const code = readSignedInteger(root.code);
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

function readSignedInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
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
        // The search API exposes the display-ready episode label separately.
        // `tag` is a comma-separated tag list and must not trigger a detail lookup.
        episodeCountText: readText(item.episode_count_text ?? item.episodeCountText, ""),
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
  const result = readObject(root.result);
  const tag = readObject(root.tag);
  const entries = Array.isArray(tag.value)
    ? tag.value
    : Array.isArray(result.tag)
      ? result.tag
      : [];
  const values: string[] = [];
  for (const raw of entries) {
    const item = readObject(raw);
    const text = readText(item.value ?? item.name ?? item.k, "");
    if (text) values.push(text);
  }
  return values;
}

function parseCreatorProfile(responseText: string, fallbackMid: number): CreatorProfile {
  const root = parseApiRoot(responseText, "UP 主名片");
  const data = readObject(root.data);
  const card = readObject(data.card);
  const name = readText(card.name, "未知 UP 主");
  return {
    mid: readIdentifier(card.mid) || fallbackMid,
    name,
    avatarUrl: normalizeImageUrl(readText(card.face, "")),
    sign: stripHtml(readText(card.sign, "")),
    officialDescription: stripHtml(readText(readObject(card.Official).desc ?? readObject(card.official).desc, "")),
    followingCount: readInteger(card.attention),
    followerCount: readInteger(data.follower),
    likeCount: readInteger(data.like_num),
    videoCount: readInteger(data.archive_count),
    articleCount: readInteger(data.article_count),
  };
}

function parseCreatorVideos(responseText: string, requestedPage: number): CreatorContentPage<CreatorVideo> {
  const root = parseApiRoot(responseText, "UP 主投稿");
  const data = readObject(root.data);
  const list = readObject(data.list);
  const items = parseCreatorVideoList(list.vlist);
  const count = readInteger(readObject(data.page).count);
  return { items, page: requestedPage, hasMore: count > 0 ? requestedPage * 20 < count : items.length === 20, totalCount: count || undefined };
}

function parseCreatorArticles(responseText: string, requestedPage: number): CreatorContentPage<CreatorArticle> {
  const root = parseApiRoot(responseText, "UP 主专栏");
  const data = readObject(root.data);
  const articles = Array.isArray(data.articles) ? data.articles.map((raw) => {
    const item = readObject(raw);
    const images = Array.isArray(item.image_urls) ? item.image_urls : [];
    return {
      id: readIdentifier(item.id),
      title: stripHtml(readText(item.title, "未命名专栏")),
      summary: stripHtml(readText(item.summary, "")),
      coverUrl: images.length > 0 ? normalizeThumbnailUrl(readText(images[0], "")) : "",
      publishedAt: parseUnixTime(readInteger(item.publish_time))?.toISOString(),
      viewCount: readInteger(item.view),
    };
  }).filter((item) => item.id > 0) : [];
  const count = readInteger(readObject(data.page).count ?? data.count);
  return { items: articles, page: requestedPage, hasMore: count > 0 ? requestedPage * 20 < count : articles.length === 20, totalCount: count || undefined };
}

function parseCollectionVideos(responseText: string, requestedPage: number): CreatorContentPage<CreatorVideo> {
  const root = parseApiRoot(responseText, "合集内容");
  const data = readObject(root.data);
  const items = parseCreatorVideoList(data.archives);
  const meta = readObject(data.meta);
  const count = readInteger(meta.total ?? data.total);
  return { items, page: requestedPage, hasMore: count > 0 ? requestedPage * 20 < count : items.length === 20, totalCount: count || undefined };
}

function parseCreatorCollections(responseText: string, ownerMid: number, requestedPage: number): CreatorContentPage<CreatorCollection> {
  const root = parseApiRoot(responseText, "UP 主合集");
  const data = readObject(root.data);
  const rawCollections = readObject(data.items_lists).seasons_list;
  const items: CreatorCollection[] = Array.isArray(rawCollections) ? rawCollections.map((raw) => {
    const item = readObject(raw);
    return {
      id: readIdentifier(item.season_id ?? item.id),
      ownerMid,
      ownerName: readText(readObject(item.upper).name, ""),
      ownerAvatarUrl: normalizeImageUrl(readText(readObject(item.upper).face, "")),
      title: stripHtml(readText(item.title, "未命名合集")),
      coverUrl: normalizeThumbnailUrl(readText(item.cover, "")),
      description: stripHtml(readText(item.description ?? item.intro, "")),
      totalCount: readInteger(item.total ?? item.episode_count),
      previewVideos: parseCreatorVideoList(item.archives),
    };
  }).filter((item) => item.id > 0) : [];
  return { items, page: requestedPage, hasMore: data.has_more === true || items.length === 20 };
}

function parseCreatorVideoList(value: unknown): CreatorVideo[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const item = readObject(raw);
    const stats = parseVideoStats(readObject(item.stat));
    return {
      bvid: readText(item.bvid, ""),
      title: stripHtml(readText(item.title, "未命名视频")),
      coverUrl: normalizeThumbnailUrl(readText(item.pic ?? item.cover, "")),
      durationSeconds: parseSearchDuration(readText(item.length, "")) || readInteger(item.duration),
      partCount: Math.max(1, readInteger(item.videos) || 1),
      publishedAt: parseUnixTime(readInteger(item.created ?? item.pubdate))?.toISOString(),
      stats: {
        ...stats,
        viewCount: stats.viewCount || readInteger(item.play) || readInteger(item.view),
        danmakuCount: stats.danmakuCount || readInteger(item.video_review) || readInteger(item.danmaku),
        replyCount: stats.replyCount || readInteger(item.comment) || readInteger(item.reply),
      },
    };
  }).filter((item) => item.bvid.length > 0);
}

function parseApiRoot(responseText: string, label: string): Record<string, unknown> {
  let decoded: unknown;
  try { decoded = JSON.parse(responseText); } catch { throw new BilibiliLookupError(`${label}接口返回的数据格式不正确。`); }
  if (typeof decoded !== "object" || decoded === null) throw new BilibiliLookupError(`${label}接口返回的数据格式不正确。`);
  const root = decoded as Record<string, unknown>;
  const code = readSignedInteger(root.code);
  if (code !== 0) throw new BilibiliLookupError(`${label}失败：${readText(root.message, "请求失败")}（错误码：${code}）。`);
  return root;
}

function creatorVideoOrderParameter(order: CreatorVideoOrder): string {
  if (order === CreatorVideoOrder.mostPlayed) return "click";
  if (order === CreatorVideoOrder.mostFavorited) return "stow";
  return "pubdate";
}

function isSpaceRiskControl(error: BilibiliLookupError): boolean {
  return /错误码：(?:-352|-799|-779)/.test(error.message) || /HTTP 412/.test(error.message);
}

function isRetryableSpaceError(error: unknown): boolean {
  if (error instanceof BilibiliLookupError) return isSpaceRiskControl(error);
  return error instanceof Error && /HTTP 412/.test(error.message);
}

function randomBase64Token(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteCount; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function parseWbiNavRoot(responseText: string): Record<string, unknown> {
  let decoded: unknown;
  try { decoded = JSON.parse(responseText); } catch { throw new BilibiliLookupError("WBI 密钥接口返回的数据格式不正确。"); }
  if (typeof decoded !== "object" || decoded === null) throw new BilibiliLookupError("WBI 密钥接口返回的数据格式不正确。");
  const root = decoded as Record<string, unknown>;
  const code = readSignedInteger(root.code);
  // 未登录时 nav 返回 -101，但仍会带上当天公开的 wbi_img 密钥。
  if (code !== 0 && code !== -101) {
    throw new BilibiliLookupError(`WBI 密钥失败：${readText(root.message, "请求失败")}（错误码：${code}）。`);
  }
  return root;
}

async function buildCreatorVideosWbiUrl(mid: number, page: number, requestJson: JsonRequest, keyword = "", order = "pubdate"): Promise<string> {
  const navRoot = parseWbiNavRoot(await requestJson(`https://${API_HOST}/x/web-interface/nav`));
  const wbi = readObject(readObject(navRoot.data).wbi_img);
  const imageKey = wbiFilename(readText(wbi.img_url, ""));
  const subKey = wbiFilename(readText(wbi.sub_url, ""));
  const rawKey = `${imageKey}${subKey}`;
  if (rawKey.length < 64) throw new BilibiliLookupError("WBI 密钥暂时不可用。");
  const mixinOrder = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
  const mixinKey = mixinOrder.map((index) => rawKey[index] ?? "").join("").slice(0, 32);
  const params: Record<string, string> = {
    dm_img_list: "[]",
    dm_img_str: randomBase64Token(24),
    dm_cover_img_str: randomBase64Token(48),
    dm_img_inter: '{"ds":[],"wh":[0,0,0],"of":[0,0,0]}',
    mid: String(mid), pn: String(page), ps: "20", tid: "0", special_type: "", order,
    keyword, order_avoided: "true", platform: "web", web_location: "333.1387",
    wts: String(Math.floor(Date.now() / 1000)),
  };
  const query = Object.keys(params).sort().map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key]!.replace(/[!'()*]/g, ""))}`).join("&");
  const rid = CryptoJS.MD5(`${query}${mixinKey}`).toString();
  return `https://${API_HOST}/x/space/wbi/arc/search?${query}&w_rid=${rid}`;
}

function wbiFilename(url: string): string {
  const match = url.match(/\/([^/]+)\.[A-Za-z0-9]+$/);
  return match?.[1] ?? "";
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
  return normalizeBiliThumbnailUrl(value);
}

function normalizeImageUrl(value: string): string {
  return normalizeBiliImageUrl(value);
}

async function requestVideoInfo(requestJson: JsonRequest, params: Record<string, string>): Promise<string> {
  try {
    const signed = await signBiliWbiUrl(API_HOST, "/x/web-interface/wbi/view", params, requestJson);
    return await requestJson(signed);
  } catch (error) {
    if (error instanceof BilibiliLookupError) throw error;
    if (error instanceof Error && /HTTP 412/.test(error.message)) throw error;
    return requestJson(buildUrl(API_HOST, VIDEO_INFO_PATH, params));
  }
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
