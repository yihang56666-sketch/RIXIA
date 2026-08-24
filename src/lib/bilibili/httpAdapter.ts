/**
 * RIXIA HTTP 适配器 — 自动检测运行环境并选择正确的 HTTP 客户端：
 *
 * 1. Capacitor 原生环境（Android/iOS 应用）：用 Capacitor 原生 HTTP API
 *    绕过浏览器 CORS 限制，可以直接请求 B 站 API 与视频流 URL。
 *    这是 FocuBili 之所以能"无 CORS"的根本原因——原生 HTTP 不受同源策略约束。
 *
 * 2. 浏览器 / PWA 环境：用标准 fetch，受 CORS 限制。
 *    对于 B 站公开 API（不带 Cookie 的 GET），通常 CORS 头允许跨域；
 *    对于带 Cookie 的请求（收藏夹/历史等），需要用户在浏览器中
 *    允许跨域或部署反代。
 *
 * 3. Electron / Tauri 桌面环境：用各自的原生网络 API，等同于原生模式。
 *
 * 这是 FocuBili 能做但 RIXIA 在纯 Web 模式下不能做的核心差异：
 * 原生 HTTP 与浏览器 fetch 的 CORS 差异。Capacitor 打包后这个差异消失。
 */

import type { JsonRequest } from "./types";

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        CapacitorHttp?: CapacitorHttpPlugin;
      };
    };
    CapacitorHttp?: CapacitorHttpPlugin;
    CapacitorWebFetch?: typeof fetch;
    __TAURI__?: {
      http?: {
        fetch: typeof fetch;
      };
    };
  }
}

interface CapacitorHttpPlugin {
  request: (options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    data?: unknown;
  }) => Promise<{ status: number; data: unknown; headers: Record<string, string> }>;
}

/** Capacitor 8 registers plugins under Capacitor.Plugins; keep the top-level
 * lookup for older runtimes and lightweight test hosts. */
export function getCapacitorHttp(): CapacitorHttpPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  return window.CapacitorHttp ?? window.Capacitor?.Plugins?.CapacitorHttp;
}

export function isNativeEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.Capacitor?.isNativePlatform === "function") {
    return window.Capacitor.isNativePlatform();
  }
  return false;
}

/**
 * 创建一个跨环境的 JSON 请求函数。
 * 在 Tauri 桌面环境用原生 HTTP 插件（CORS-free），
 * 在 Capacitor 原生环境用 CapacitorHttp，
 * 在浏览器开发模式用 Vite 代理（/bili-api → https://api.bilibili.com），
 * 在浏览器生产模式用 fetch（受 CORS 限制，需要用户自行部署反代）。
 */

export function refererForBiliUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://api.bilibili.com");
    const bvid = parsed.searchParams.get("bvid");
    const path = parsed.pathname;
    if (
      path.includes("/x/player") ||
      path.includes("/x/web-interface/view") ||
      path.includes("/wbi/view") ||
      path.includes("/tag/archive")
    ) {
      return bvid ? `https://www.bilibili.com/video/${bvid}/` : "https://www.bilibili.com/";
    }
    if (path.includes("search")) return "https://search.bilibili.com/";
    if (path.includes("/x/space") || path.includes("web-space") || path.includes("/x/v3/fav") || path.includes("/x/relation")) {
      const mid = parsed.searchParams.get("mid") ?? parsed.searchParams.get("up_mid") ?? parsed.searchParams.get("vmid");
      return mid ? `https://space.bilibili.com/${mid}` : "https://space.bilibili.com/";
    }
  } catch {
    // ignore malformed URLs and keep the generic video site referer
  }
  return "https://www.bilibili.com/";
}

export function createJsonRequest(): JsonRequest {
  return async (url: string) => {
    // Tauri 环境：使用原生 HTTP 插件绕过 CORS
    if (typeof window !== "undefined" && "__TAURI__" in window && typeof window.__TAURI__?.http?.fetch === "function") {
      try {
        const response = await window.__TAURI__.http.fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            Referer: refererForBiliUrl(url),
            Accept: "application/json",
          },
        } as RequestInit);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.text();
      } catch {
        // 如果 Tauri 插件加载失败，降级到 fetch
      }
    }
    // Capacitor 原生环境
    const capacitorHttp = getCapacitorHttp();
    if (isNativeEnvironment() && capacitorHttp) {
      const cookie = readStoredBilibiliCookie();
      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Referer: refererForBiliUrl(url),
        Origin: "https://www.bilibili.com",
        Accept: "application/json",
      };
      if (cookie) headers.Cookie = cookie;
      const response = await capacitorHttp.request({
        url,
        method: "GET",
        headers,
      });
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }
      return typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);
    }
    // 浏览器开发模式：用 Vite 代理绕过 CORS
    const proxiedUrl = proxyUrl(url);
    const headers: Record<string, string> = {
      Referer: refererForBiliUrl(url),
      Accept: "application/json",
    };
    // 已登录时把 Cookie 交给代理转发（playurl 等接口可返回登录态清晰度）。
    // 只在请求确实走了本地代理时附加，避免直连 B 站时触发不必要的预检。
    if (proxiedUrl !== url) {
      const cookie = readStoredBilibiliCookie();
      if (cookie) headers["X-Beid-Cookie"] = cookie;
    }
    const fetchResponse = await fetch(proxiedUrl, {
      headers,
      credentials: "omit",
    });
    if (!fetchResponse.ok) {
      throw new Error(`HTTP ${fetchResponse.status}`);
    }
    return fetchResponse.text();
  };
}

/** 带响应头访问能力的 JSON 响应，用于读取代理回传的登录 Cookie。 */
export interface HeaderedJsonResponse {
  body: string;
  header(name: string): string | null;
}

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * 与 createJsonRequest 相同的路由逻辑，但保留响应头访问能力。
 * 扫码登录的 poll 需要读取 passport 响应里的 Set-Cookie（本地代理会把
 * 它合入 x-bili-set-cookie 响应头），原生环境则直接读 CapacitorHttp headers。
 */
export async function requestJsonWithHeaders(url: string): Promise<HeaderedJsonResponse> {
  const capacitorHttp = getCapacitorHttp();
  if (isNativeEnvironment() && capacitorHttp) {
    const response = await capacitorHttp.request({
      url,
      method: "GET",
      headers: {
        "User-Agent": DESKTOP_UA,
        Referer: refererForBiliUrl(url),
        Origin: "https://www.bilibili.com",
        Accept: "application/json",
      },
    });
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }
    const headers = response.headers ?? {};
    return {
      body: typeof response.data === "string" ? response.data : JSON.stringify(response.data),
      header(name: string) {
        const value = headers[name] ?? headers[name.toLowerCase()];
        return typeof value === "string" && value.length > 0 ? value : null;
      },
    };
  }
  const fetchResponse = await fetch(proxyUrl(url), {
    headers: {
      Referer: refererForBiliUrl(url),
      Accept: "application/json",
    },
    credentials: "omit",
  });
  if (!fetchResponse.ok) {
    throw new Error(`HTTP ${fetchResponse.status}`);
  }
  return {
    body: await fetchResponse.text(),
    header: (name: string) => fetchResponse.headers.get(name),
  };
}

/** 读取本地保存的 B 站登录 Cookie（与 accountService 的存储键保持一致）。 */
export function readStoredBilibiliCookie(): string | null {
  try {
    const value = localStorage.getItem("rixia_bilibili_cookie_v1") ?? "";
    return /SESSDATA=/.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * 在开发模式下把 B 站 API URL 转换为 Vite 代理路径。
 * 生产模式下直接返回原始 URL（用户需要自行部署反代或使用 Tauri/Capacitor）。
 */
function proxyUrl(url: string): string {  // 只在 localhost 开发环境下代理
  const isDev = typeof window !== "undefined" &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
  if (!isDev) return url;

  if (url.startsWith("https://api.bilibili.com")) {
    if (url.includes("/x/web-interface/wbi/search/type")) {
      return url.replace("https://api.bilibili.com", "/bili-search-api");
    }
    if (
      url.includes("/x/web-interface/wbi/view") ||
      url.includes("/x/web-interface/view") ||
      url.includes("/x/tag/archive/tags") ||
      url.includes("/x/player/wbi/playurl") ||
      url.includes("/x/player/playurl")
    ) {
      return url.replace("https://api.bilibili.com", "/bili-video-api");
    }
    return url.replace("https://api.bilibili.com", "/bili-api");
  }
  if (url.startsWith("https://s.search.bilibili.com")) {
    return url.replace("https://s.search.bilibili.com", "/bili-suggest");
  }
  if (url.startsWith("https://comment.bilibili.com")) {
    return url.replace("https://comment.bilibili.com", "/bili-comment");
  }
  if (url.startsWith("https://aisubtitle.hdslb.com")) {
    return url.replace("https://aisubtitle.hdslb.com", "/bili-subtitle");
  }
  if (url.startsWith("https://passport.bilibili.com")) {
    return url.replace("https://passport.bilibili.com", "/bili-passport");
  }
  return url;
}

/**
 * 创建一个跨环境的 fetch 函数，用于获取视频流 ArrayBuffer。
 * 在原生环境用 CapacitorHttp + base64 解码，在浏览器用 fetch。
 */
export async function fetchMediaArrayBuffer(url: string): Promise<ArrayBuffer> {
  const capacitorHttp = getCapacitorHttp();
  if (isNativeEnvironment() && capacitorHttp) {
    const response = await capacitorHttp.request({
      url,
      method: "GET",
      headers: {
        Referer: refererForBiliUrl(url),
        responseType: "arraybuffer",
      },
    });
    if (response.status !== 200) {
      throw new Error(`获取媒体流失败：HTTP ${response.status}`);
    }
    // CapacitorHttp 返回的 data 可能是 base64 字符串或对象
    if (typeof response.data === "string") {
      const binary = atob(response.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }
    throw new Error("原生 HTTP 返回了无法处理的响应类型");
  }
  const fetchResponse = await fetch(url, {
    headers: { Referer: refererForBiliUrl(url) },
    credentials: "omit",
  });
  if (!fetchResponse.ok) {
    throw new Error(`获取媒体流失败：HTTP ${fetchResponse.status}`);
  }
  return fetchResponse.arrayBuffer();
}

/**
 * 返回运行环境描述，用于 UI 显示。
 */
export function getEnvironmentInfo(): {
  platform: "capacitor-native" | "browser-pwa" | "electron" | "tauri" | "unknown";
  canBypassCORS: boolean;
  canPlayDASH: boolean;
  description: string;
} {
  if (isNativeEnvironment()) {
    return {
      platform: "capacitor-native",
      canBypassCORS: true,
      canPlayDASH: true,
      description: "原生应用环境（Capacitor），无 CORS 限制，支持 DASH 流播放",
    };
  }
  if (typeof window !== "undefined" && "electronAPI" in window) {
    return {
      platform: "electron",
      canBypassCORS: true,
      canPlayDASH: true,
      description: "Electron 桌面应用，无 CORS 限制",
    };
  }
  if (typeof window !== "undefined" && "__TAURI__" in window) {
    return {
      platform: "tauri",
      canBypassCORS: true,
      canPlayDASH: true,
      description: "Tauri 桌面应用，无 CORS 限制",
    };
  }
  const supportsMSE = typeof MediaSource !== "undefined";
  return {
    platform: "browser-pwa",
    canBypassCORS: false,
    canPlayDASH: supportsMSE,
    description: supportsMSE
      ? "浏览器/PWA 环境，受 CORS 限制，但支持 MSE DASH 播放"
      : "浏览器/PWA 环境，受 CORS 限制，B 站 DASH 流可能无法直接播放",
  };
}
