/**
 * RIXIA Bilibili 模块 — 把 FocuBili (Dart) 的 bilibili_service.dart +
 * bilibili_public_content_service.dart + bilibili_account_data_service.dart
 * + bilibili_auth_service.dart 等服务用 TypeScript 重写。
 *
 * 类型与字段命名与 FocuBili 模型一一对应，便于后续按 FocuBili 行为
 * 做端到端测试。
 */

export type Bvid = string;

export interface VideoStats {
  viewCount: number;
  danmakuCount: number;
  replyCount: number;
  favoriteCount: number;
  coinCount: number;
  shareCount: number;
  likeCount: number;
}

export interface VideoPart {
  pageNumber: number;
  cid: number;
  title: string;
  durationSeconds: number;
}

export interface VideoCollectionEntry {
  aid: number;
  bvid: string;
  cid: number;
  title: string;
  thumbnailUrl: string;
  durationSeconds: number;
  publishedAt?: string;
  stats: VideoStats;
}

export interface VideoCollection {
  id: number;
  title: string;
  description: string;
  coverUrl: string;
  ownerMid: number;
  totalCount: number;
  stats: VideoStats;
  entries: VideoCollectionEntry[];
}

export interface VideoDescriptionSegment {
  text: string;
  mentionedMid?: number;
  linkUri?: string;
}

export interface VideoPreview {
  aid: number;
  bvid: Bvid;
  cid: number;
  title: string;
  ownerName: string;
  ownerMid: number;
  ownerAvatarUrl: string;
  description: string;
  descriptionSegments: VideoDescriptionSegment[];
  publishedAt?: string;
  stats: VideoStats;
  collection?: VideoCollection;
  durationSeconds: number;
  thumbnailUrl: string;
  parts: VideoPart[];
  tags: string[];
}

export enum VideoSearchOrder {
  relevance = "relevance",
  mostPlayed = "mostplayed",
  newest = "pubdate",
  mostDanmaku = "danmaku",
  mostFavorited = "stow",
}

export enum VideoPublishedRange {
  any = "any",
  lastDay = "lastDay",
  lastWeek = "lastWeek",
  lastHalfYear = "lastHalfYear",
}

export enum VideoDurationRange {
  any = "any",
  underTenMinutes = "underTenMinutes",
  tenToThirtyMinutes = "tenToThirtyMinutes",
  thirtyToSixtyMinutes = "thirtyToSixtyMinutes",
  overSixtyMinutes = "overSixtyMinutes",
}

export interface VideoSearchFilter {
  order: VideoSearchOrder;
  durationRange: VideoDurationRange;
  publishedRange: VideoPublishedRange;
  categoryId?: number;
}

export const DEFAULT_VIDEO_SEARCH_FILTER: VideoSearchFilter = {
  order: VideoSearchOrder.relevance,
  durationRange: VideoDurationRange.any,
  publishedRange: VideoPublishedRange.any,
};

export interface VideoSearchResult {
  bvid: Bvid;
  title: string;
  ownerName: string;
  durationSeconds: number;
  thumbnailUrl: string;
  publishedAt?: string;
  playCount: number;
  danmakuCount: number;
  episodeCountText: string;
}

export interface VideoSearchPage {
  results: VideoSearchResult[];
  page: number;
  totalPages: number;
}

export enum UserSearchOrder {
  defaultOrder = "defaultOrder",
  fansDescending = "fansDescending",
  fansAscending = "fansAscending",
  levelDescending = "levelDescending",
  levelAscending = "levelAscending",
}

export enum UserSearchType {
  all = "all",
  uploader = "uploader",
  normal = "normal",
  certified = "certified",
}

export interface UserSearchFilter {
  order: UserSearchOrder;
  type: UserSearchType;
}

export const DEFAULT_USER_SEARCH_FILTER: UserSearchFilter = {
  order: UserSearchOrder.defaultOrder,
  type: UserSearchType.all,
};

export interface UserSearchResult {
  mid: number;
  name: string;
  avatarUrl: string;
  signature: string;
  followerCount: number;
  videoCount: number;
  level: number;
  isUploader: boolean;
  certification: string;
}

export interface UserSearchPage {
  results: UserSearchResult[];
  page: number;
  totalPages: number;
}

/** 时间点笔记 — 对应 FocuBili 的 VideoNote。 */
export interface VideoNote {
  id: string;
  bvid: Bvid;
  videoTitle: string;
  ownerName: string;
  partCid: number;
  partPageNumber: number;
  partTitle: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  positionSeconds: number;
  videoCoverUrl: string;
  framePath?: string;
}

/** 学习列表条目 — 对应 FocuBili 的 LearningListEntry。 */
export interface LearningListEntry {
  id: string;
  bvid: Bvid;
  title: string;
  ownerName: string;
  coverUrl: string;
  durationSeconds: number;
  addedAt: string;
  lastOpenedAt?: string;
  completedAt?: string;
  note?: string;
}

/** 观看历史 — 对应 FocuBili 的 WatchHistoryEntry。 */
export interface WatchHistoryEntry {
  id: string;
  bvid: Bvid;
  cid: number;
  title: string;
  ownerName: string;
  thumbnailUrl: string;
  durationSeconds: number;
  watchedAt: string;
  positionSeconds: number;
  completed: boolean;
}

/** 关注 UP 主 — 对应 FocuBili 的 FollowedCreator。 */
export interface FollowedCreator {
  mid: number;
  name: string;
  avatarUrl: string;
  sign: string;
  officialDescription: string;
  followedAt?: string;
}

/** 收藏夹 — 对应 FocuBili 的 FavoriteFolder。 */
export interface FavoriteFolder {
  mediaId: number;
  title: string;
  coverUrl: string;
  mediaCount: number;
  isAvailable: boolean;
}

/** 收藏夹中的视频 — 对应 FocuBili 的 FavoriteVideo。 */
export interface FavoriteVideo {
  bvid: Bvid;
  title: string;
  coverUrl: string;
  ownerName: string;
  durationSeconds: number;
  partCount: number;
  favoritedAt?: string;
  playCount: number;
  danmakuCount: number;
  isAvailable: boolean;
}

/** 订阅的 UGC 合集 — 对应 FocuBili 的 SubscribedCollection。 */
export interface SubscribedCollection {
  id: number;
  title: string;
  coverUrl: string;
  description: string;
  ownerMid: number;
  ownerName: string;
  ownerAvatarUrl: string;
  videoCount: number;
  viewCount: number;
}

/** 弹幕条目 — 对应 FocuBili 弹幕渲染基础结构。 */
export interface DanmakuEntry {
  id: number;
  text: string;
  startTimeSeconds: number;
  durationSeconds: number;
  mode: DanmakuMode;
  color: number;
  fontSize: number;
  pool: number;
  midHash: string;
}

export enum DanmakuMode {
  scrolling = 1,
  bottom = 4,
  top = 5,
  reverse = 6,
  advanced = 7,
  code = 8,
  bas = 9,
}

export interface DanmakuSegment {
  segmentIndex: number;
  entries: DanmakuEntry[];
}

/** 专注会话 — 对应 FocuBili 的 FocusSession。 */
export interface FocusSession {
  id: string;
  bvid?: Bvid;
  videoTitle?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  completed: boolean;
  interruptedReason?: string;
}

/** 专注统计 — 对应 FocuBili 的 FocusStatistics。 */
export interface FocusStatistics {
  totalSeconds: number;
  totalSessions: number;
  completedSessions: number;
  dailyFocusSeconds: Record<string, number>;
  longestStreakDays: number;
  currentStreakDays: number;
}

/** 弹幕偏好 — 对应 FocuBili 的 DanmakuPreferences。 */
export interface DanmakuPreferences {
  enabled: boolean;
  opacity: number;
  fontSize: number;
  laneCount: number;
  scrollDurationSeconds: number;
  displayArea: number;
  strokeWidth: number;
  showScrolling: boolean;
  showTop: boolean;
  showBottom: boolean;
  mergeRepeated: boolean;
  blockedKeywords: string[];
}

export const DEFAULT_DANMAKU_PREFERENCES: DanmakuPreferences = {
  enabled: true,
  opacity: 1,
  fontSize: 22,
  laneCount: 8,
  scrollDurationSeconds: 9,
  displayArea: 0.7,
  strokeWidth: 2,
  showScrolling: true,
  showTop: true,
  showBottom: true,
  mergeRepeated: true,
  blockedKeywords: [],
};

/** 播放偏好 — 对应 FocuBili 的 PlaybackPreferences。 */
export interface PlaybackPreferences {
  autoplayNext: boolean;
  resumeFromLastPosition: boolean;
  defaultQuality: number;
  defaultVolume: number;
  playbackRate: number;
}

export const DEFAULT_PLAYBACK_PREFERENCES: PlaybackPreferences = {
  autoplayNext: false,
  resumeFromLastPosition: true,
  defaultQuality: 80,
  defaultVolume: 1,
  playbackRate: 1,
};

/** 账号数据加载状态 — 对应 FocuBili 的 AccountDataLoadStatus。 */
export enum AccountDataLoadStatus {
  success = "success",
  signedOut = "signedOut",
  expired = "expired",
  networkError = "networkError",
  permissionDenied = "permissionDenied",
  missingData = "missingData",
  unavailable = "unavailable",
  malformedData = "malformedData",
}

export interface AccountDataPage<T> {
  status: AccountDataLoadStatus;
  items: T[];
  page: number;
  hasMore: boolean;
  totalCount?: number;
  message?: string;
}

export class BilibiliLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BilibiliLookupError";
  }
}

/** 网络请求函数，便于测试注入。 */
export type JsonRequest = (url: string) => Promise<string>;
