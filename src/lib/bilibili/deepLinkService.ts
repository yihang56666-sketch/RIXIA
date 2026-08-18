/**
 * RIXIA 深链接服务 — TS 移植自 FocuBili 的 bilibili_deep_link_service.dart。
 *
 * 处理 bilibili:// 和 https://www.bilibili.com/video/<bvid> 形式的链接，
 * 把它们转换为 RIXIA 内部导航动作（打开播放器、跳转搜索等）。
 *
 * 浏览器侧通过 window.location.hash + window.popstate 模拟深链接；
 * PWA 安装后由 manifest 处理协议注册（移动端 Capacitor 在 AndroidManifest
 * 中处理 intent 过滤）。
 */

export type DeepLinkTarget =
  | { kind: "video"; bvid: string; cid?: number; page?: number }
  | { kind: "search"; keyword: string }
  | { kind: "user"; mid: number }
  | { kind: "unknown"; raw: string };

const BVID_PATTERN = /BV[0-9A-Za-z]{10}/;

export interface BilibiliDeepLinkService {
  parse(input: string): DeepLinkTarget;
  apply(target: DeepLinkTarget, callbacks: {
    openVideo?: (bvid: string, cid?: number, page?: number) => void;
    openSearch?: (keyword: string) => void;
    openUser?: (mid: number) => void;
  }): boolean;
}

export function createBilibiliDeepLinkService(): BilibiliDeepLinkService {
  return {
    parse(input) {
      const trimmed = input.trim();
      const bvidMatch = trimmed.match(BVID_PATTERN);
      if (bvidMatch) {
        const bvid = bvidMatch[0]!;
        const cidMatch = trimmed.match(/[?&]cid=(\d+)/);
        const pageMatch = trimmed.match(/[?&]page=(\d+)/);
        const pMatch = trimmed.match(/[?&]p=(\d+)/);
        const cid = cidMatch ? Number.parseInt(cidMatch[1]!, 10) : undefined;
        const page = pageMatch
          ? Number.parseInt(pageMatch[1]!, 10)
          : pMatch
            ? Number.parseInt(pMatch[1]!, 10)
            : undefined;
        return { kind: "video", bvid, cid, page };
      }
      const searchMatch = trimmed.match(/[?&]keyword=([^&]+)/) ?? trimmed.match(/search\/all\?keyword=([^&]+)/);
      if (searchMatch) {
        return { kind: "search", keyword: decodeURIComponent(searchMatch[1]!) };
      }
      const userMatch = trimmed.match(/space\.bilibili\.com\/(\d+)/) ?? trimmed.match(/[?&]mid=(\d+)/);
      if (userMatch) {
        return { kind: "user", mid: Number.parseInt(userMatch[1]!, 10) };
      }
      return { kind: "unknown", raw: trimmed };
    },
    apply(target, callbacks) {
      switch (target.kind) {
        case "video":
          if (callbacks.openVideo) {
            callbacks.openVideo(target.bvid, target.cid, target.page);
            return true;
          }
          return false;
        case "search":
          if (callbacks.openSearch) {
            callbacks.openSearch(target.keyword);
            return true;
          }
          return false;
        case "user":
          if (callbacks.openUser) {
            callbacks.openUser(target.mid);
            return true;
          }
          return false;
        case "unknown":
          return false;
      }
    },
  };
}

/**
 * 把 B 站链接规范化为 RIXIA 内部 hash 路由。
 * 例如 https://www.bilibili.com/video/BV1GJ411x7h7 → #/video/BV1GJ411x7h7
 */
export function toInternalHash(input: string): string | null {
  const service = createBilibiliDeepLinkService();
  const target = service.parse(input);
  if (target.kind === "video") {
    let hash = `#/video/${target.bvid}`;
    const params = new URLSearchParams();
    if (target.cid != null) params.set("cid", String(target.cid));
    if (target.page != null) params.set("p", String(target.page));
    if (params.toString()) hash += `?${params.toString()}`;
    return hash;
  }
  if (target.kind === "search") return `#/search/${encodeURIComponent(target.keyword)}`;
  return null;
}

/** 真正执行一次深链接解析。 */
export function parseDeepLink(input: string): DeepLinkTarget {
  return createBilibiliDeepLinkService().parse(input);
}

/** 监听 hash 变化，把 B 站链接路由到 RIXIA 内部。 */
export function attachDeepLinkHandler(handlers: {
  openVideo?: (bvid: string, cid?: number, page?: number) => void;
  openSearch?: (keyword: string) => void;
}): () => void {
  function onHashChange() {
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith("/")) return;
    const [path, query] = hash.slice(1).split("?");
    const parts = path!.split("/");
    const params = new URLSearchParams(query ?? "");
    if (parts[0] === "video" && parts[1]) {
      handlers.openVideo?.(parts[1]!, params.get("cid") ? Number.parseInt(params.get("cid")!, 10) : undefined, params.get("p") ? Number.parseInt(params.get("p")!, 10) : undefined);
    } else if (parts[0] === "search" && parts[1]) {
      handlers.openSearch?.(decodeURIComponent(parts[1]!));
    }
  }
  window.addEventListener("hashchange", onHashChange);
  onHashChange();
  return () => window.removeEventListener("hashchange", onHashChange);
}

/** 注册 bilibili:// 协议处理（仅 PWA + Chrome 支持）。 */
export function registerProtocolHandler(): boolean {
  if (typeof navigator === "undefined" || !("registerProtocolHandler" in navigator)) {
    return false;
  }
  try {
    (navigator as Navigator & { registerProtocolHandler: (scheme: string, url: string, title: string) => void }).registerProtocolHandler(
      "web+bilibili",
      `${window.location.origin}/#/redirect?u=%s`,
      "RIXIA B 站跳转",
    );
    return true;
  } catch {
    return false;
  }
}
