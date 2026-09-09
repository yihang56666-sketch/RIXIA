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
import { createJsonRequest, getCapacitorHttp, isNativeEnvironment, requestJsonWithHeaders, type HeaderedJsonResponse } from "./httpAdapter";
import { normalizeBiliImageUrl, normalizeBiliThumbnailUrl } from "./imageUrl";

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
  /** 确认登录时从 poll 响应解析出的账号 UID（可能缺失）。 */
  mid?: number;
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
  const requestJson = createJsonRequest();
  return {
    async generate() {
      const text = await requestJson(
        "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
      );
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
      const response = await requestJsonWithHeaders(url.toString());
      const data = readSuccessfulData(response.body);
      if (typeof data.code !== "number" || !Number.isInteger(data.code)) {
        throw new BilibiliQrLoginError("扫码登录服务返回了无效状态码，请重试。");
      }
      const code = data.code;
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
      // 确认登录时从响应头提取真实 Cookie（本地代理会把 passport 的
      // Set-Cookie 合入 x-bili-set-cookie；原生环境读 set-cookie）。
      // 提取不到时返回空串，调用方回退到 "confirmed" 标记（原生 Cookie Jar 模式）。
      const cookieHeader =
        status === BilibiliQrLoginStatus.confirmed ? extractLoginCookieHeader(response, data) : "";
      const mid = readInteger(data.mid);
      return { status, message, cookieHeader, mid: mid > 0 ? mid : undefined };
    },
  }
}

/** 具备登录效力的 B 站 Cookie 字段，其余（过期时间/路径等）全部丢弃。 */
const LOGIN_COOKIE_FIELDS = /(SESSDATA|bili_jct|DedeUserID|DedeUserID__ckMd5|buvid3|buvid4)=([^;\s,]+)/g;

function extractLoginCookieHeader(
  response: HeaderedJsonResponse,
  data: Record<string, unknown>,
): string {
  const raw = response.header("x-bili-set-cookie") ?? response.header("set-cookie") ?? "";
  const pairs: string[] = [];
  const seen = new Set<string>();
  for (const match of raw.matchAll(LOGIN_COOKIE_FIELDS)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      pairs.push(`${match[1]}=${match[2]}`);
    }
  }
  if (pairs.length > 0) return pairs.join("; ");
  // 部分环境读不到响应头时，尝试从 poll 成功后返回的 url 参数补齐 UID 信息。
  const redirectUrl = readText(data.url);
  if (redirectUrl) {
    try {
      const parsed = new URL(redirectUrl);
      const dede = parsed.searchParams.get("DedeUserID");
      const ckMd5 = parsed.searchParams.get("DedeUserID__ckMd5");
      const fallback: string[] = [];
      if (dede) fallback.push(`DedeUserID=${dede}`);
      if (ckMd5) fallback.push(`DedeUserID__ckMd5=${ckMd5}`);
      if (fallback.length > 0) return fallback.join("; ");
    } catch {
      // url 无效时忽略，交给调用方按未捕获处理。
    }
  }
  return "";
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
  loadCurrentUser(): Promise<Pick<BilibiliAuthState, "mid" | "userName" | "avatarUrl"> | null>;
  listFavoriteFolders(): Promise<AccountDataPage<FavoriteFolder>>;
  listFavoriteVideos(mediaId: number, page: number): Promise<AccountDataPage<FavoriteVideo>>;
  listFollowedCreators(page: number): Promise<AccountDataPage<FollowedCreator>>;
  listSubscribedCollections(page: number): Promise<AccountDataPage<SubscribedCollection>>;
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
    const headers: Record<string, string> = {
      Accept: "application/json",
      Referer: "https://www.bilibili.com/",
      Origin: "https://www.bilibili.com",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    };
    // QR 确认只保存标记；真实 Cookie 由浏览器 / 原生网络栈的 Cookie Jar 持有。
    if (cookieHeader && cookieHeader !== "confirmed") {
      headers.Cookie = cookieHeader;
    }
    // Capacitor WebView 通常也使用 localhost 作为应用 origin，但原生请求
    // 必须保留真实 API 地址，不能误改写到仅供 Vite 开发服务器使用的代理。
    const useLocalProxy = isLocalBrowser() && !isNativeEnvironment();
    if (useLocalProxy) {
      if (cookieHeader && cookieHeader !== "confirmed") {
        headers["X-Beid-Cookie"] = cookieHeader;
      }
      delete headers.Cookie;
      url = url.replace(`https://${ACCOUNT_API_HOST}`, "/bili-api");
    }
    const capacitorHttp = getCapacitorHttp();
    if (isNativeEnvironment() && capacitorHttp) {
      const response = await capacitorHttp.request({ url, method: "GET", headers });
      if (response.status === 401 || response.status === 403) {
        throw expiredError();
      }
      if (!response.status || response.status < 200 || response.status >= 300) {
        throw networkError(`HTTP ${response.status}`);
      }
      return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
    }
    const response = await fetch(url, {
      credentials: "include",
      headers,
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

  // FocuBili 的账号数据接口都要求以本人 mid 作为查询参数（up_mid / vmid）。
  // Cookie 手动导入等场景可能还没有 mid，这里先通过 nav 接口补齐并回写会话。
  // mid 恰好等于 2^31 视为无效：早前版本的 readInteger 把超出 2^31 的新账号
  // mid 全部钳位成了这个值，必须重新解析真实 mid。
  async function resolveMid(): Promise<number> {
    const current = auth.currentState();
    if (current.signedIn && current.mid && current.mid > 0 && current.mid !== 2 ** 31) {
      return current.mid;
    }
    const cookieAtRequest = cookieStore.getCookieHeader();
    try {
      const text = await authenticatedFetch(`https://${ACCOUNT_API_HOST}/x/web-interface/nav`);
      const latest = auth.currentState();
      if (!latest.signedIn) throw signedOutError();
      if (cookieStore.getCookieHeader() !== cookieAtRequest || latest.mid !== current.mid) {
        throw new AccountDataError(AccountDataLoadStatus.unavailable, "账号已切换，请刷新后重试。");
      }
      const profile = parseCurrentUser(text);
      if (profile?.mid) {
        auth.signIn(cookieAtRequest, profile);
        return profile.mid;
      }
      throw classifyCurrentUserResponse(text);
    } catch (err) {
      if (err instanceof AccountDataError) throw err;
      // nav 解析失败时交给各调用方按"账号信息缺失"提示。
    }
    return 0;
  }

  function missingAccountPage<T>(page: number): AccountDataPage<T> {
    return {
      status: AccountDataLoadStatus.unavailable,
      items: [],
      page,
      hasMore: false,
      message: "账号信息缺失，请重新登录后再试。",
    };
  }

  return {
    async loadCurrentUser() {
      try {
        const text = await authenticatedFetch(`https://${ACCOUNT_API_HOST}/x/web-interface/nav`);
        const profile = parseCurrentUser(text);
        if (profile) return profile;
        throw classifyCurrentUserResponse(text);
      } catch (err) {
        if (err instanceof AccountDataError) throw err;
        throw networkError(err instanceof Error ? err.message : "账号信息请求失败，请稍后重试。" );
      }
    },
    async listFavoriteFolders() {
      try {
        const mid = await resolveMid();
        if (mid <= 0) return missingAccountPage<FavoriteFolder>(1);
        try {
          const detailed = await authenticatedFetch(
            `https://${ACCOUNT_API_HOST}/x/v3/fav/folder/created/list?up_mid=${mid}&pn=1&ps=50&platform=web`,
          );
          const page = parseFavoriteFolders(detailed);
          if (page.status === AccountDataLoadStatus.success && page.items.length > 0) return page;
        } catch {
          // created/list 在部分账号下会失败，回退到不含封面的 list-all。
        }
        const text = await authenticatedFetch(
          `https://${ACCOUNT_API_HOST}/x/v3/fav/folder/created/list-all?up_mid=${mid}`,
        );
        return parseFavoriteFolders(text);
      } catch (err) {
        return toAccountDataPage<FavoriteFolder>(err);
      }
    },
    async listFavoriteVideos(mediaId, page) {
      try {
        const text = await authenticatedFetch(
          `https://${ACCOUNT_API_HOST}/x/v3/fav/resource/list?media_id=${mediaId}&platform=web&pn=${page}&ps=20&order=mtime&type=0&tid=0`,
        );
        return parseFavoriteVideos(text, page);
      } catch (err) {
        return toAccountDataPage<FavoriteVideo>(err);
      }
    },
    async listFollowedCreators(page) {
      try {
        const mid = await resolveMid();
        if (mid <= 0) return missingAccountPage<FollowedCreator>(page);
        const text = await authenticatedFetch(
          `https://${ACCOUNT_API_HOST}/x/relation/followings?vmid=${mid}&pn=${page}&ps=50&order=desc`,
        );
        return parseFollowedCreators(text, page);
      } catch (err) {
        return toAccountDataPage<FollowedCreator>(err);
      }
    },
    async listSubscribedCollections(page) {
      try {
        const mid = await resolveMid();
        if (mid <= 0) return missingAccountPage<SubscribedCollection>(page);
        const text = await authenticatedFetch(
          `https://${ACCOUNT_API_HOST}/x/v3/fav/folder/collected/list?up_mid=${mid}&pn=${page}&ps=20&platform=web`,
        );
        return parseSubscribedCollections(text, page);
      } catch (err) {
        return toAccountDataPage<SubscribedCollection>(err);
      }
    },
  };
}

function parseCurrentUser(text: string): { mid?: number; userName?: string; avatarUrl?: string } | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return null;
  }
  const root = readObject(decoded);
  if (readInteger(root.code) !== 0) return null;
  const data = readObject(root.data);
  if (data.isLogin === false) return null;
  const mid = readInteger(data.mid);
  const userName = readText(data.uname);
  const avatarUrl = readText(data.face);
  if (mid <= 0 && !userName && !avatarUrl) return null;
  return {
    mid: mid > 0 ? mid : undefined,
    userName: userName || undefined,
    avatarUrl: avatarUrl || undefined,
  };
}

function classifyCurrentUserResponse(text: string): AccountDataError {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    return new AccountDataError(AccountDataLoadStatus.malformedData, "账号信息返回格式不正确，请稍后重试。");
  }
  const root = readObject(decoded);
  const code = readErrorCode(root.code);
  if (code === -101) {
    return new AccountDataError(AccountDataLoadStatus.expired, "登录已过期，请重新登录。");
  }
  if (code !== 0) {
    return new AccountDataError(AccountDataLoadStatus.unavailable, readText(root.message, "暂时无法读取账号信息。"));
  }
  const data = readObject(root.data);
  if (data.isLogin === false) {
    return new AccountDataError(AccountDataLoadStatus.expired, "登录已过期，请重新登录。");
  }
  return new AccountDataError(AccountDataLoadStatus.missingData, "账号信息缺失，请重新登录后再试。");
}

function isLocalBrowser(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
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
  const code = readErrorCode(root.code);
  if (code === -101) return { status: AccountDataLoadStatus.expired, items: [], page: 1, hasMore: false, message: "登录已过期" };
  if (code !== 0) return { status: AccountDataLoadStatus.unavailable, items: [], page: 1, hasMore: false, message: readText(root.message) };
  const data = readObject(root.data);
  if (!data || typeof data !== "object") return { status: AccountDataLoadStatus.missingData, items: [], page: 1, hasMore: false };
  const list = Array.isArray(data.list) ? data.list as unknown[] : [];
  const items: FavoriteFolder[] = [];
  for (const raw of list) {
    const item = readObject(raw);
    const mediaId = readInteger(item.id);
    if (mediaId <= 0) continue;
    items.push({
      mediaId,
      title: readText(item.title, "未命名收藏夹"),
      coverUrl: normalizeBiliThumbnailUrl(readText(item.cover || item.cover_url)),
      mediaCount: readInteger(item.media_count),
      isAvailable: readErrorCode(item.state ?? item.status) >= 0,
    });
  }
  return {
    status: AccountDataLoadStatus.success,
    items,
    page: 1,
    hasMore: false,
    totalCount: readInteger(data.count) || items.length,
  };
}

function parseFavoriteVideos(text: string, page: number): AccountDataPage<FavoriteVideo> {
  const decoded = JSON.parse(text);
  if (typeof decoded !== "object" || decoded === null) {
    return { status: AccountDataLoadStatus.malformedData, items: [], page, hasMore: false };
  }
  const root = decoded as Record<string, unknown>;
  const code = readErrorCode(root.code);
  if (code === -101) return { status: AccountDataLoadStatus.expired, items: [], page, hasMore: false };
  if (code !== 0) return { status: AccountDataLoadStatus.unavailable, items: [], page, hasMore: false };
  const data = readObject(root.data);
  const medias = Array.isArray(data.medias) ? data.medias as unknown[] : [];
  const items: FavoriteVideo[] = [];
  for (const raw of medias) {
    const item = readObject(raw);
    const bvid = readText(item.bvid ?? item.bv_id);
    if (!/^BV[0-9A-Za-z]{10}$/.test(bvid)) continue;
    const upper = readObject(item.upper);
    const cnt = readObject(item.cnt_info);
    items.push({
      bvid,
      title: readText(item.title, "未命名视频"),
      coverUrl: normalizeBiliThumbnailUrl(readText(item.cover || item.pic)),
      ownerName: readText(upper.name, "未知 UP 主"),
      durationSeconds: readInteger(item.duration),
      partCount: readInteger(item.page) || 1,
      favoritedAt: parseUnixTime(readInteger(item.fav_time))?.toISOString(),
      playCount: readInteger(cnt.play),
      danmakuCount: readInteger(cnt.danmaku),
      isAvailable: readErrorCode(item.attr) === 0,
    });
  }
  return {
    status: AccountDataLoadStatus.success,
    items,
    page,
    hasMore: Boolean(data.has_more),
    totalCount: readInteger(readObject(data.info).media_count),
  };
}

function parseFollowedCreators(text: string, page: number): AccountDataPage<FollowedCreator> {
  const decoded = JSON.parse(text);
  if (typeof decoded !== "object" || decoded === null) {
    return { status: AccountDataLoadStatus.malformedData, items: [], page, hasMore: false };
  }
  const root = decoded as Record<string, unknown>;
  const code = readErrorCode(root.code);
  if (code === -101) return { status: AccountDataLoadStatus.expired, items: [], page, hasMore: false };
  if (code !== 0) return { status: AccountDataLoadStatus.unavailable, items: [], page, hasMore: false };
  const data = readObject(root.data);
  const list = Array.isArray(data.list) ? data.list as unknown[] : [];
  const items: FollowedCreator[] = [];
  for (const raw of list) {
    const item = readObject(raw);
    const mid = readInteger(item.mid);
    if (mid <= 0) continue;
    const official = readObject(item.official_verify);
    const officialLegacy = readObject(item.official);
    items.push({
      mid,
      name: readText(item.uname, "未知 UP 主"),
      avatarUrl: normalizeBiliImageUrl(readText(item.face)),
      sign: readText(item.sign, ""),
      officialDescription: readText(official.desc ?? officialLegacy.desc, ""),
      followedAt: parseUnixTime(readInteger(item.mtime))?.toISOString(),
    });
  }
  const totalCount = readInteger(data.total);
  return {
    status: AccountDataLoadStatus.success,
    items,
    page,
    hasMore: totalCount > 0 ? page * 50 < totalCount : items.length === 50,
    totalCount,
  };
}

function parseSubscribedCollections(text: string, page: number): AccountDataPage<SubscribedCollection> {
  const decoded = JSON.parse(text);
  if (typeof decoded !== "object" || decoded === null) {
    return { status: AccountDataLoadStatus.malformedData, items: [], page, hasMore: false };
  }
  const root = decoded as Record<string, unknown>;
  const code = readErrorCode(root.code);
  if (code === -101) return { status: AccountDataLoadStatus.expired, items: [], page, hasMore: false };
  if (code !== 0) return { status: AccountDataLoadStatus.unavailable, items: [], page, hasMore: false };
  const data = readObject(root.data);
  const list = Array.isArray(data.list) ? data.list as unknown[] : [];
  const items: SubscribedCollection[] = [];
  for (const raw of list) {
    const item = readObject(raw);
    const id = readInteger(item.id);
    // type=21 才是 UGC 合集；type=11 是普通收藏夹，明确排除。
    if (id <= 0 || readErrorCode(item.type) !== 21) continue;
    const upper = readObject(item.upper);
    items.push({
      id,
      title: readText(item.title, "未命名合集"),
      coverUrl: normalizeBiliThumbnailUrl(readText(item.cover)),
      description: readText(item.intro, ""),
      ownerMid: readInteger(upper.mid ?? item.mid),
      ownerName: readText(upper.name, "未知 UP 主"),
      ownerAvatarUrl: normalizeBiliImageUrl(readText(upper.face)),
      videoCount: readInteger(item.media_count),
      viewCount: readInteger(item.view_count),
    });
  }
  return {
    status: AccountDataLoadStatus.success,
    items,
    page,
    hasMore: Boolean(data.has_more),
    totalCount: readInteger(data.total),
  };
}

function parseUnixTime(value: unknown): Date | null {
  const seconds = readInteger(value);
  if (seconds <= 0) return null;
  return new Date(seconds * 1000);
}

/** 读取非负整数（计数、mid 等），上限放宽到安全整数——新注册账号的 mid 已超过 2^31。 */
function readInteger(value: unknown): number {
  if (typeof value === "number") return Math.max(0, Math.min(Math.trunc(value), Number.MAX_SAFE_INTEGER));
  const n = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(n, Number.MAX_SAFE_INTEGER));
}

/** 读取带符号的接口状态码（-101 登录过期、-400 请求错误等），不能被钳位成 0。 */
function readErrorCode(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(n) ? 0 : n;
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
