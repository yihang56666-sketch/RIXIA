/**
 * RIXIA Bilibili 账号服务 — TS 移植自 FocuBili 的
 * bilibili_qr_login_service.dart + bilibili_auth_service.dart +
 * bilibili_cookie_store.dart + bilibili_account_data_service.dart
 *
 * 安全模型：
 * - 登录 Cookie 保存在 localStorage，仅用于请求 B 站 API
 * - 所有携带 Cookie 的请求都明确设置 credentials: 'include' 模拟
 * - 登出时彻底清除 Cookie
 * - 不向任何第三方暴露 Cookie
 */

import type {
  AccountDataPage,
  FavoriteFolder,
  FavoriteVideo,
  FollowedCreator,
  SubscribedCollection,
} from "./types";
import { AccountDataLoadStatus } from "./types";

// ============ QR Login ============

export interface BilibiliQrLoginSession {
  url: string;
  key: string;
}

export enum BilibiliQrLoginStatus {
  waiting = "waiting",
  scanned = "scanned",
  confirmed = "confirmed",
  expired = "expired",
}

export interface BilibiliQrLoginPollResult {
  status: BilibiliQrLoginStatus;
  message: string;
  cookieHeader: string;
}

export class BilibiliQrLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BilibiliQrLoginError";
  }
}

export interface BilibiliQrLoginService {
  generate(): Promise<BilibiliQrLoginSession>;
  poll(key: string): Promise<BilibiliQrLoginPollResult>;
}

export function createBilibiliQrLoginService(): BilibiliQrLoginService {
  return {
    async generate() {
      const response = await fetch(
        "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
        { credentials: "include", headers: { Accept: "application/json" } },
      );
      const text = await response.text();
      const data = readSuccessfulData(text);
      const url = readText(data.url);
      const key = readText(data.qrcode_key);
      if (!url || !key) {
        throw new BilibiliQrLoginError("扫码登录服务返回了无效二维码，请重试。");
      }
      return { url, key };
    },
    async poll(key) {
      const normalized = key.trim();
      if (!normalized || normalized.length > 256) {
        throw new BilibiliQrLoginError("扫码登录会话无效，请刷新二维码。");
      }
      const url = new URL("https://passport.bilibili.com/x/passport-login/web/qrcode/poll");
      url.searchParams.set("qrcode_key", normalized);
      const response = await fetch(url.toString(), {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const text = await response.text();
      const data = readSuccessfulData(text);
      const code = readInteger(data.code);
      let status: BilibiliQrLoginStatus;
      let message: string;
      switch (code) {
        case 0:
          status = BilibiliQrLoginStatus.confirmed;
          message = "登录成功";
          break;
        case 86090:
          status = BilibiliQrLoginStatus.scanned;
          message = "请在手机上确认登录";
          break;
        case 86038:
          status = BilibiliQrLoginStatus.expired;
          message = "二维码已过期，请刷新";
          break;
        default:
          status = BilibiliQrLoginStatus.waiting;
          message = "等待扫描";
      }
      // Cookie 已由浏览器自动存入；返回一个标志让调用方知道已登录。
      return { status, message, cookieHeader: status === BilibiliQrLoginStatus.confirmed ? "confirmed" : "" };
    },
  };
}

function readSuccessfulData(text: string): Record<string, unknown> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new BilibiliQrLoginError("扫码登录服务返回的数据格式不正确。");
  }
  if (typeof decoded !== "object" || decoded === null) {
    throw new BilibiliQrLoginError("扫码登录服务返回了非对象响应。");
  }
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code !== 0) {
    const message = readText(root.message);
    throw new BilibiliQrLoginError(
      message ? `${message}（错误码：${code}）` : `扫码登录失败（错误码：${code}）。`,
    );
  }
  const data = root.data;
  if (typeof data !== "object" || data === null) {
    throw new BilibiliQrLoginError("扫码登录服务返回了空数据。");
  }
  return data as Record<string, unknown>;
}

// ============ Cookie Store ============

const COOKIE_KEY = "rixia_bilibili_cookie_v1";

export interface BilibiliCookieStore {
  hasCookie(): boolean;
  getCookieHeader(): string;
  setCookieHeader(header: string): void;
  clear(): void;
}

export function createBilibiliCookieStore(
  storage: Storage = localStorage,
): BilibiliCookieStore {
  return {
    hasCookie() {
      try {
        return Boolean(storage.getItem(COOKIE_KEY));
      } catch {
        return false;
      }
    },
    getCookieHeader() {
      try {
        return storage.getItem(COOKIE_KEY) ?? "";
      } catch {
        return "";
      }
    },
    setCookieHeader(header) {
      try {
        storage.setItem(COOKIE_KEY, header);
      } catch {
        // ignore
      }
    },
    clear() {
      try {
        storage.removeItem(COOKIE_KEY);
      } catch {
        // ignore
      }
    },
  };
}

// ============ Auth Service ============

export interface BilibiliAuthState {
  signedIn: boolean;
  mid?: number;
  userName?: string;
  avatarUrl?: string;
}

export interface BilibiliAuthService {
  currentState(): BilibiliAuthState;
  signIn(cookieHeader: string, profile: { mid?: number; userName?: string; avatarUrl?: string }): void;
  signOut(): void;
  onChange(handler: (state: BilibiliAuthState) => void): () => void;
}

export function createBilibiliAuthService(
  cookieStore: BilibiliCookieStore = createBilibiliCookieStore(),
  storage: Storage = localStorage,
): BilibiliAuthService {
  const listeners = new Set<(state: BilibiliAuthState) => void>();
  let state: BilibiliAuthState = loadState();

  function loadState(): BilibiliAuthState {
    try {
      const raw = storage.getItem("rixia_bilibili_auth_v1");
      if (!raw) return { signedIn: false };
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return { signedIn: false };
      const p = parsed as Partial<BilibiliAuthState> & { signedIn?: boolean };
      return {
        signedIn: Boolean(p.signedIn) && cookieStore.hasCookie(),
        mid: typeof p.mid === "number" ? p.mid : undefined,
        userName: typeof p.userName === "string" ? p.userName : undefined,
        avatarUrl: typeof p.avatarUrl === "string" ? p.avatarUrl : undefined,
      };
    } catch {
      return { signedIn: false };
    }
  }

  function persist() {
    try {
      storage.setItem("rixia_bilibili_auth_v1", JSON.stringify(state));
    } catch {
      // ignore
    }
    listeners.forEach((fn) => fn(state));
  }

  return {
    currentState() {
      return state;
    },
    signIn(cookieHeader, profile) {
      cookieStore.setCookieHeader(cookieHeader);
      state = {
        signedIn: true,
        mid: profile.mid,
        userName: profile.userName,
        avatarUrl: profile.avatarUrl,
      };
      persist();
    },
    signOut() {
      cookieStore.clear();
      state = { signedIn: false };
      persist();
    },
    onChange(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
  };
}

// ============ Account Data Service ============

const ACCOUNT_API_HOST = "api.bilibili.com";

export interface BilibiliAccountDataService {
  listFavoriteFolders(): Promise<AccountDataPage<FavoriteFolder>>;
  listFavoriteVideos(mediaId: number, page: number): Promise<AccountDataPage<FavoriteVideo>>;
  listFollowedCreators(page: number): Promise<AccountDataPage<FollowedCreator>>;
  listSubscribedCollections(page: number): Promise<AccountDataPage<SubscribedCollection>>;
  listWatchHistory(page: number): Promise<AccountDataPage<import("./types").WatchHistoryEntry>>;
}

export function createBilibiliAccountDataService(
  auth: BilibiliAuthService,
  cookieStore: BilibiliCookieStore = createBilibiliCookieStore(),
): BilibiliAccountDataService {
  async function authenticatedFetch(url: string): Promise<string> {
    if (!auth.currentState().signedIn) {
      throw signedOutError();
    }
    const cookieHeader = cookieStore.getCookieHeader();
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
        Referer: "https://www.bilibili.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      },
    });
    if (response.status === 401 || response.status === 403) {
      throw expiredError();
    }
    if (!response.ok) {
      throw networkError(`HTTP ${response.status}`);
    }
    return response.text();
  }

  function signedOutError(): Error {
    return new AccountDataError(AccountDataLoadStatus.signedOut, "请先登录后查看。");
  }
  function expiredError(): Error {
    return new AccountDataError(AccountDataLoadStatus.expired, "登录已过期，请重新登录。");
  }
  function networkError(message: string): Error {
    return new AccountDataError(AccountDataLoadStatus.networkError, message);
  }

  return {
    async listFavoriteFolders() {
      try {
        const text = await authenticatedFetch(
          `https://${ACCOUNT_API_HOST}/x/v3/fav/folder/created/list-all`,
        );
        return parseFavoriteFolders(text);
      } catch (err) {
        return toAccountDataPage<FavoriteFolder>(err);
      }
    },
    async listFavoriteVideos(mediaId, page) {
      try {
        const text = await authenticatedFetch(
          `https://${ACCOUNT_API_HOST}/x/v3/fav/resource/list?media_id=${mediaId}&pn=${page}&ps=20`,
        );
        return parseFavoriteVideos(text, page);
      } catch (err) {
        return toAccountDataPage<FavoriteVideo>(err);
      }
    },
    async listFollowedCreators(page) {
      try {
        const text = await authenticatedFetch(
          `https://${ACCOUNT_API_HOST}/x/relation/followings?pn=${page}&ps=20&order=desc`,
        );
        return parseFollowedCreators(text, page);
      } catch (err) {
        return toAccountDataPage<FollowedCreator>(err);
      }
    },
    async listSubscribedCollections(page) {
      try {
        const text = await authenticatedFetch(
          `https://${ACCOUNT_API_HOST}/x/v3/fav/folder/created/list?pn=${page}&ps=20`,
        );
        return parseSubscribedCollections(text, page);
      } catch (err) {
        return toAccountDataPage<SubscribedCollection>(err);
      }
    },
    async listWatchHistory(page) {
      try {
        const text = await authenticatedFetch(
          `https://${ACCOUNT_API_HOST}/x/v2/history?pn=${page}&ps=20`,
        );
        return parseWatchHistory(text, page);
      } catch (err) {
        return toAccountDataPage<import("./types").WatchHistoryEntry>(err);
      }
    },
  };
}

export class AccountDataError extends Error {
  readonly status: AccountDataLoadStatus;
  constructor(status: AccountDataLoadStatus, message: string) {
    super(message);
    this.name = "AccountDataError";
    this.status = status;
  }
}

function toAccountDataPage<T>(err: unknown): AccountDataPage<T> {
  if (err instanceof AccountDataError) {
    return { status: err.status, items: [], page: 1, hasMore: false, message: err.message };
  }
  if (err instanceof Error) {
    return {
      status: AccountDataLoadStatus.networkError,
      items: [],
      page: 1,
      hasMore: false,
      message: err.message,
    };
  }
  return {
    status: AccountDataLoadStatus.unavailable,
    items: [],
    page: 1,
    hasMore: false,
    message: "账号数据服务暂时不可用。",
  };
}

function parseFavoriteFolders(text: string): AccountDataPage<FavoriteFolder> {
  const decoded = JSON.parse(text);
  if (typeof decoded !== "object" || decoded === null) {
    return { status: AccountDataLoadStatus.malformedData, items: [], page: 1, hasMore: false };
  }
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code === -101) return { status: AccountDataLoadStatus.expired, items: [], page: 1, hasMore: false, message: "登录已过期" };
  if (code !== 0) return { status: AccountDataLoadStatus.unavailable, items: [], page: 1, hasMore: false, message: readText(root.message) };
  const data = readObject(root.data);
  if (!data || typeof data !== "object") return { status: AccountDataLoadStatus.missingData, items: [], page: 1, hasMore: false };
  const list = Array.isArray(data.list) ? data.list as unknown[] : [];
  const items: FavoriteFolder[] = list.map((raw) => {
    const item = readObject(raw);
    return {
      mediaId: readInteger(item.id),
      title: readText(item.title, "未命名收藏夹"),
      coverUrl: readText(item.cover),
      mediaCount: readInteger(item.media_count),
      isAvailable: readInteger(item.state) === 0,
    };
  });
  return { status: AccountDataLoadStatus.success, items, page: 1, hasMore: false };
}

function parseFavoriteVideos(text: string, page: number): AccountDataPage<FavoriteVideo> {
  const decoded = JSON.parse(text);
  if (typeof decoded !== "object" || decoded === null) {
    return { status: AccountDataLoadStatus.malformedData, items: [], page, hasMore: false };
  }
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code === -101) return { status: AccountDataLoadStatus.expired, items: [], page, hasMore: false };
  if (code !== 0) return { status: AccountDataLoadStatus.unavailable, items: [], page, hasMore: false };
  const data = readObject(root.data);
  const medias = Array.isArray(data.medias) ? data.medias as unknown[] : [];
  const items: FavoriteVideo[] = medias.map((raw) => {
    const item = readObject(raw);
    const bvid = readText(item.bvid, "");
    const cover = readText(item.cover);
    const upper = readObject(item.upper);
    const cnt = readObject(item.cnt_info);
    return {
      bvid,
      title: readText(item.title, "未命名视频"),
      coverUrl: cover,
      ownerName: readText(upper.name, "未知 UP 主"),
      durationSeconds: parseDurationSeconds(readText(item.duration, "0:00")),
      partCount: readInteger(item.page),
      favoritedAt: parseUnixTime(readInteger(item.fav_time))?.toISOString(),
      playCount: readInteger(cnt.play),
      danmakuCount: readInteger(cnt.danmaku),
      isAvailable: readInteger(item.attr) === 0,
    };
  });
  return {
    status: AccountDataLoadStatus.success,
    items,
    page,
    hasMore: Boolean(data.has_more),
    totalCount: readInteger(data.total),
  };
}

function parseFollowedCreators(text: string, page: number): AccountDataPage<FollowedCreator> {
  const decoded = JSON.parse(text);
  if (typeof decoded !== "object" || decoded === null) {
    return { status: AccountDataLoadStatus.malformedData, items: [], page, hasMore: false };
  }
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code === -101) return { status: AccountDataLoadStatus.expired, items: [], page, hasMore: false };
  if (code !== 0) return { status: AccountDataLoadStatus.unavailable, items: [], page, hasMore: false };
  const data = readObject(root.data);
  const list = Array.isArray(data.list) ? data.list as unknown[] : [];
  const items: FollowedCreator[] = list.map((raw) => {
    const item = readObject(raw);
    const official = readObject(item.official);
    return {
      mid: readInteger(item.mid),
      name: readText(item.uname, "未知 UP 主"),
      avatarUrl: readText(item.face),
      sign: readText(item.sign, ""),
      officialDescription: readText(official.title, ""),
      followedAt: parseUnixTime(readInteger(item.mtime))?.toISOString(),
    };
  });
  return {
    status: AccountDataLoadStatus.success,
    items,
    page,
    hasMore: Boolean(data.has_more),
    totalCount: readInteger(data.total),
  };
}

function parseSubscribedCollections(text: string, page: number): AccountDataPage<SubscribedCollection> {
  const decoded = JSON.parse(text);
  if (typeof decoded !== "object" || decoded === null) {
    return { status: AccountDataLoadStatus.malformedData, items: [], page, hasMore: false };
  }
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code === -101) return { status: AccountDataLoadStatus.expired, items: [], page, hasMore: false };
  if (code !== 0) return { status: AccountDataLoadStatus.unavailable, items: [], page, hasMore: false };
  const data = readObject(root.data);
  const list = Array.isArray(data.list) ? data.list as unknown[] : [];
  const items: SubscribedCollection[] = list.map((raw) => {
    const item = readObject(raw);
    const upper = readObject(item.upper);
    return {
      id: readInteger(item.id),
      title: readText(item.title, "未命名合集"),
      coverUrl: readText(item.cover),
      description: readText(item.intro, ""),
      ownerMid: readInteger(upper.mid),
      ownerName: readText(upper.name, "未知 UP 主"),
      ownerAvatarUrl: readText(upper.face),
      videoCount: readInteger(item.episode_count),
      viewCount: readInteger(readObject(item.stat).view),
    };
  });
  return {
    status: AccountDataLoadStatus.success,
    items,
    page,
    hasMore: Boolean(data.has_more),
    totalCount: readInteger(data.total),
  };
}

function parseWatchHistory(text: string, page: number): AccountDataPage<import("./types").WatchHistoryEntry> {
  const decoded = JSON.parse(text);
  if (typeof decoded !== "object" || decoded === null) {
    return { status: AccountDataLoadStatus.malformedData, items: [], page, hasMore: false };
  }
  const root = decoded as Record<string, unknown>;
  const code = readInteger(root.code);
  if (code === -101) return { status: AccountDataLoadStatus.expired, items: [], page, hasMore: false };
  if (code !== 0) return { status: AccountDataLoadStatus.unavailable, items: [], page, hasMore: false };
  const data = readObject(root.data);
  const list = Array.isArray(data.list) ? data.list as unknown[] : [];
  const items: import("./types").WatchHistoryEntry[] = list.map((raw) => {
    const item = readObject(raw);
    const owner = readObject(item.owner);
    return {
      id: `${readText(item.bvid, "")}-${readInteger(item.cid)}`,
      bvid: readText(item.bvid, ""),
      cid: readInteger(item.cid),
      title: readText(item.title, "未命名视频"),
      ownerName: readText(owner.name, "未知 UP 主"),
      thumbnailUrl: readText(item.pic),
      durationSeconds: parseDurationSeconds(readText(item.duration, "0:00")),
      watchedAt: parseUnixTime(readInteger(item.view_at))?.toISOString() ?? new Date().toISOString(),
      positionSeconds: readInteger(item.progress),
      completed: readInteger(item.kjv ?? 0) !== 0,
    };
  });
  return {
    status: AccountDataLoadStatus.success,
    items,
    page,
    hasMore: Boolean(data.has_more),
  };
}

function parseDurationSeconds(text: string): number {
  const parts = text.split(":").map((p) => Number.parseInt(p.trim(), 10) || 0);
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts.length === 0 ? 0 : parts[parts.length - 1]!;
}

function parseUnixTime(value: unknown): Date | null {
  const seconds = readInteger(value);
  if (seconds <= 0) return null;
  return new Date(seconds * 1000);
}

function readInteger(value: unknown): number {
  if (typeof value === "number") return Math.max(0, Math.min(Math.trunc(value), 1 << 31));
  const n = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(n, 1 << 31));
}

function readText(value: unknown, fallback = ""): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length === 0 ? fallback : text;
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}
