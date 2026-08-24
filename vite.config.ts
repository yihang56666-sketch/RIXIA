import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { isAllowedBiliMediaHost } from "./src/lib/bilibili/mediaHostPolicy";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** 从 /bili-media?u=<encoded-url> 提取经过校验的目标地址；非法时返回 null。 */
function parseBiliMediaTarget(requestUrl: string | undefined): URL | null {
  try {
    const current = new URL(requestUrl ?? "/", "http://localhost");
    const target = new URL(current.searchParams.get("u") ?? "");
    if (target.protocol !== "https:" || !isAllowedBiliMediaHost(target.hostname)) return null;
    return target;
  } catch {
    return null;
  }
}

/** 流式转发 B 站 m4s 媒体流（浏览器直连有 Referer 防盗链，必须经服务端补齐）。 */
function bilimediaMiddleware(): import("vite").Plugin {
  const handler = async (req: import("http").IncomingMessage, res: import("http").ServerResponse) => {
    const target = parseBiliMediaTarget(req.url);
    if (!target) {
      res.statusCode = 403;
      res.end("blocked media host");
      return;
    }
    try {
      const range = req.headers.range;
      const upstream = await fetch(target, {
        headers: {
          ...(typeof range === "string" && range ? { Range: range } : {}),
          Referer: "https://www.bilibili.com/",
          "User-Agent": DESKTOP_UA,
          Accept: "*/*",
        },
        redirect: "follow",
      });
      res.statusCode = upstream.status;
      for (const name of ["content-type", "content-range", "accept-ranges", "cache-control", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) res.setHeader(name, value);
      }
      if (!upstream.body) {
        res.end();
        return;
      }
      const { Readable } = await import("node:stream");
      const nodeStream = Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream);
      // 上游 CDN 重置连接是常态（空闲超时/负载均衡），不处理会击穿整个 dev server。
      nodeStream.on("error", () => {
        nodeStream.destroy();
        if (!res.headersSent) res.statusCode = 502;
        res.end();
      });
      // 客户端中断（如切换清晰度/翻页）时同步终止上游请求，避免无谓占用。
      res.on("close", () => {
        if (!nodeStream.destroyed) nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch {
      if (!res.headersSent) res.statusCode = 502;
      res.end("media upstream error");
    }
  };
  return {
    name: "bilibili-media-proxy",
    configureServer(server) {
      server.middlewares.use("/bili-media", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/bili-media", handler);
    },
  };
}

/**
 * B 站 API 反向代理。dev（npm run dev）与 preview（npm run preview / 生产构建
 * 本地预览）共用同一份配置——proxyUrl() 在 127.0.0.1/localhost 下都会把请求
 * 改写到这些路径，preview 缺少代理会导致搜索/登录全部 404。
 */
const bilibiliProxy = {
  "/bili-api": {
    target: "https://api.bilibili.com",
    changeOrigin: true,
    headers: {
      Referer: "https://www.bilibili.com/",
      "User-Agent": DESKTOP_UA,
      Accept: "application/json",
    },
    rewrite: (path: string) => path.replace(/^\/bili-api/, ""),
    configure: (proxy: import("http-proxy").Server) => {
      proxy.on("proxyReq", (proxyRequest, request) => {
        const cookie = request.headers["x-beid-cookie"];
        if (typeof cookie === "string" && cookie) {
          proxyRequest.setHeader("Cookie", cookie);
        }
        proxyRequest.removeHeader("x-beid-cookie");
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        if (requestUrl.pathname.includes("/x/space/") || requestUrl.pathname.includes("/x/polymer/web-space/")) {
          const mid = requestUrl.searchParams.get("mid");
          proxyRequest.setHeader("Referer", mid ? `https://space.bilibili.com/${mid}` : "https://space.bilibili.com/");
          proxyRequest.setHeader("Origin", "https://space.bilibili.com");
        }
      });
    },
  },
  "/bili-search-api": {
    target: "https://api.bilibili.com",
    changeOrigin: true,
    headers: {
      Referer: "https://search.bilibili.com/",
      "User-Agent": DESKTOP_UA,
      Accept: "application/json",
    },
    rewrite: (path: string) => path.replace(/^\/bili-search-api/, ""),
  },
  "/bili-video-api": {
    target: "https://api.bilibili.com",
    changeOrigin: true,
    headers: {
      "User-Agent": DESKTOP_UA,
      Accept: "application/json",
    },
    configure: (proxy: import("http-proxy").Server) => {
      proxy.on("proxyReq", (proxyRequest, request) => {
        const requestUrl = new URL(request.url ?? "/", "http://localhost");
        const bvid = requestUrl.searchParams.get("bvid");
        proxyRequest.setHeader(
          "Referer",
          bvid ? `https://www.bilibili.com/video/${bvid}/` : "https://www.bilibili.com/",
        );
      });
    },
    rewrite: (path: string) => path.replace(/^\/bili-video-api/, ""),
  },
  "/bili-suggest": {
    target: "https://s.search.bilibili.com",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/bili-suggest/, ""),
  },
  "/bili-comment": {
    target: "https://comment.bilibili.com",
    changeOrigin: true,
    headers: {
      Referer: "https://www.bilibili.com/",
      "User-Agent": DESKTOP_UA,
      Accept: "application/xml, text/xml, */*",
    },
    rewrite: (path: string) => path.replace(/^\/bili-comment/, ""),
  },
  "/bili-subtitle": {
    target: "https://aisubtitle.hdslb.com",
    changeOrigin: true,
    headers: {
      Referer: "https://www.bilibili.com/",
      Accept: "application/json",
    },
    rewrite: (path: string) => path.replace(/^\/bili-subtitle/, ""),
  },
  "/bili-passport": {
    target: "https://passport.bilibili.com",
    changeOrigin: true,
    headers: {
      Referer: "https://www.bilibili.com/",
      "User-Agent": DESKTOP_UA,
      Accept: "application/json",
    },
    rewrite: (path: string) => path.replace(/^\/bili-passport/, ""),
    // 扫码登录确认时，passport 会在响应里下发 SESSDATA 等登录 Cookie。
    // 浏览器 fetch（credentials: omit）不会把它们写入 Cookie Jar，这里把
    // 具备登录效力的字段合入 x-bili-set-cookie 响应头，交给前端保存到本地。
    configure: (proxy: import("http-proxy").Server) => {
      proxy.on("proxyRes", (proxyRes, _request, response) => {
        const setCookies = proxyRes.headers["set-cookie"];
        if (!Array.isArray(setCookies) || setCookies.length === 0) return;
        const pairs = setCookies
          .map((cookie) => cookie.split(";")[0])
          .filter((pair) => /(?:SESSDATA|bili_jct|DedeUserID|DedeUserID__ckMd5|buvid3|buvid4)=/.test(pair));
        if (pairs.length > 0) {
          response.setHeader("x-bili-set-cookie", pairs.join("; "));
        }
      });
    },
  },
  // B 站 m4s 媒体流代理由上方 bilimediaMiddleware() 插件处理（http-proxy 的
  // router 动态目标在 Vite 下不生效，改用流式中间件并保留域名白名单校验）。
} as const;

export default defineConfig({
  base: "./",
  plugins: [react(), bilimediaMiddleware()],
  build: {
    rollupOptions: {
      output: {
        // 按依赖族分包：主包不再携带全部 vendor，浏览器可并行缓存
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom") || id.includes("/react/") || id.includes("scheduler")) {
            return "vendor-react";
          }
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("crypto-js") || id.includes("qrcode")) return "vendor-crypto";
          if (id.includes("zustand")) return "vendor-state";
          return "vendor-misc";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    watch: {
      // mimosa 安全扫描会在仓库里写临时基线文件，曾导致 EBUSY 崩溃
      ignored: [
        "**/.mimosa/**",
        "**/.playwright-cli/**",
        "**/.playwright-mcp/**",
        "**/.ms-playwright/**",
        "**/.npm-cache-local/**",
        "**/release/**",
      ],
    },
    proxy: { ...bilibiliProxy },
  },
  preview: {
    port: 4173,
    host: "127.0.0.1",
    proxy: { ...bilibiliProxy },
  },
  test: {
    environment: "node",
  },
});
