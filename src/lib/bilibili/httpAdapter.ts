/**
 * RIXIA HTTP 适配器 — 自动检测运行环境并选择正确的 HTTP 客户端：
 *
 * 1. Capacitor 原生环境（Android/iOS 应用）：用 @capacitor-community/http
 *    插件，绕过浏览器 CORS 限制，可以直接请求 B 站 API 与视频流 URL。
 *    这是 FocuBili 之所以能"无 CORS"的根本原因——原生 HTTP 不受同源策略约束。
 *
 * 2. 浏览器 / PWA 环境：用标准 fetch，受 CORS 限制。
 *    对于 B 站公开 API（不带 Cookie 的 GET），通常 CORS 头允许跨域；
 *    对于带 Cookie 的请求（收藏夹/历史等），需要用户在浏览器中
 *    允许跨域或部署反代。
 *
 * 3. Electron / Tauri 桌面环境：用各自的 IPC 桥接，等同于原生模式。
 *
 * 这是 FocuBili 能做但 RIXIA 在纯 Web 模式下不能做的核心差异：
 * 原生 HTTP 与浏览器 fetch 的 CORS 差异。Capacitor 打包后这个差异消失。
 */

import type { JsonRequest } from "./types";

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
    };
    CapacitorHttp?: {
      request: (options: {
        url: string;
        method: string;
        headers?: Record<string, string>;
        data?: unknown;
      }) => Promise<{ status: number; data: unknown; headers: Record<string, string> }>;
    };
    CapacitorWebFetch?: typeof fetch;
    __TAURI__?: {
      http?: {
        fetch: typeof fetch;
      };
    };
  }
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
 * 在 Tauri 桌面环境用 @tauri-apps/plugin-http（CORS-free），
 * 在 Capacitor 原生环境用 CapacitorHttp，
 * 在浏览器用 fetch（受 CORS 限制）。
 */
export function createJsonRequest(): JsonRequest {
  return async (url: string) => {
    // Tauri 环境：使用原生 HTTP 插件绕过 CORS
    if (typeof window !== "undefined" && "__TAURI__" in window && typeof window.__TAURI__?.http?.fetch === "function") {
      try {
        const response = await window.__TAURI__.http.fetch(url, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            Referer: "https://www.bilibili.com/",
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
    if (isNativeEnvironment() && window.CapacitorHttp) {
      const response = await window.CapacitorHttp.request({
        url,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
          Referer: "https://www.bilibili.com/",
          Accept: "application/json",
        },
      });
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }
      return typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);
    }
    // 浏览器/PWA 模式
    const fetchResponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        Referer: "https://www.bilibili.com/",
        Accept: "application/json",
      },
      credentials: "omit",
    });
    if (!fetchResponse.ok) {
      throw new Error(`HTTP ${fetchResponse.status}`);
    }
    return fetchResponse.text();
  };
}

/**
 * 创建一个跨环境的 fetch 函数，用于获取视频流 ArrayBuffer。
 * 在原生环境用 CapacitorHttp + base64 解码，在浏览器用 fetch。
 */
export async function fetchMediaArrayBuffer(url: string): Promise<ArrayBuffer> {
  if (isNativeEnvironment() && window.CapacitorHttp) {
    const response = await window.CapacitorHttp.request({
      url,
      method: "GET",
      headers: {
        Referer: "https://www.bilibili.com/",
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
    headers: { Referer: "https://www.bilibili.com/" },
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
