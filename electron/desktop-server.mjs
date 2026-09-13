import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const OFFICIAL_MEDIA_HOST_SUFFIXES = [".bilivideo.com", ".bilivideo.cn", ".hdslb.com", ".akamaized.net"];
const PARTNER_MEDIA_HOST_SUFFIXES = [".mountaintoys.cn", ".szbdyd.com"];
const MAX_REQUEST_BYTES = 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isHttpsTarget(target) {
  return target.protocol === "https:" && !target.username && !target.password && !target.port;
}

function isAllowedBiliMediaHost(hostname) {
  const host = String(hostname ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  return [...OFFICIAL_MEDIA_HOST_SUFFIXES, ...PARTNER_MEDIA_HOST_SUFFIXES].some((suffix) => {
    const apex = suffix.startsWith(".") ? suffix.slice(1) : suffix;
    return host === apex || host.endsWith(suffix.startsWith(".") ? suffix : `.${suffix}`);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

/**
 * 未登录游客的 B 站设备 Cookie（buvid3/buvid4）。B 站风控会对不带任何
 * buvid 的 playurl 等接口直接回 412，见 docs 内「HTTP 412」排查记录；
 * 浏览器侧 www.bilibili.com 总是带着这组指纹，代理必须在未登录时补齐同一形态。
 */

async function fetchBilibiliGuestCookie() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response;
  try {
    response = await fetch("https://api.bilibili.com/x/frontend/finger/spi", {
      headers: {
        "User-Agent": DESKTOP_UA,
        Referer: "https://www.bilibili.com/",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
  try {
    if (!response.ok) return null;
    const payload = JSON.parse(await response.text());
    const buvid3 = payload?.data?.b_3;
    const buvid4 = payload?.data?.b_4;
    if (typeof buvid3 !== "string" || !buvid3 || typeof buvid4 !== "string" || !buvid4) return null;
    return `buvid3=${buvid3}; buvid4=${buvid4}`;
  } catch {
    return null;
  }
}

/** spi 不可达时的本地兜底：与 B 站网页端一样在客户端生成同形 buvid，接口侧照常接受。 */
function locallyGeneratedBilibiliGuestCookie() {
  const buvid3 = `${crypto.randomUUID().replace(/-/g, "")}infoc`;
  return `buvid3=${buvid3}; buvid4=${crypto.randomUUID()}`;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        chunks.length = 0;
        reject(new RequestError(413, "request body too large"));
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
    req.on("aborted", () => reject(new RequestError(400, "request aborted")));
  });
}

async function fetchUpstream(target, options, isAllowed, res) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  res.once("close", abort);
  let current = target;
  let requestOptions = options;
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!isAllowed(current)) throw new RequestError(403, "blocked upstream target");
      const timeout = setTimeout(abort, 15_000);
      let response;
      try {
        response = await fetch(current, { ...requestOptions, redirect: "manual", signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!REDIRECT_STATUSES.has(response.status)) return response;
      const location = response.headers.get("location");
      if (response.body) await response.body.cancel();
      if (!location) throw new RequestError(502, "invalid upstream redirect");
      current = new URL(location, current);
      if (response.status === 303 && requestOptions.method !== "HEAD"
        || [301, 302].includes(response.status) && requestOptions.method === "POST") {
        const headers = new Headers(requestOptions.headers);
        headers.delete("content-type");
        requestOptions = { ...requestOptions, method: "GET", body: undefined, headers };
      }
    }
    throw new RequestError(502, "too many upstream redirects");
  } catch (error) {
    res.off("close", abort);
    controller.abort();
    throw error;
  }
}

async function pipeWebStream(webStream, res) {
  const nodeStream = Readable.fromWeb(webStream);
  nodeStream.on("error", () => {
    nodeStream.destroy();
    if (!res.headersSent) res.statusCode = 502;
    res.end();
  });
  res.on("close", () => {
    if (!nodeStream.destroyed) nodeStream.destroy();
  });
  nodeStream.pipe(res);
}

async function proxyApi(req, res, targetOrigin, prefix, extraHeaders = {}, getGuestCookie = null) {
  const incoming = new URL(req.url ?? "/", "http://127.0.0.1");
  const rest = incoming.pathname.slice(prefix.length) || "/";
  if (!rest.startsWith("/") || rest.startsWith("//") || rest.includes("\\")) {
    throw new RequestError(403, "blocked upstream path");
  }
  const target = new URL(targetOrigin);
  target.pathname = rest;
  target.search = incoming.search;
  const headers = {
    "User-Agent": DESKTOP_UA,
    Accept: extraHeaders.Accept ?? "application/json",
    Referer: extraHeaders.Referer ?? "https://www.bilibili.com/",
    ...extraHeaders,
  };
  const method = req.method ?? "GET";
  // 先完成本地校验（含 413 请求体上限），再决定是否为游客引导 buvid。
  const body = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);
  const cookie = req.headers["x-beid-cookie"];
  if (typeof cookie === "string" && cookie) {
    headers.Cookie = cookie;
  } else if (targetOrigin === "https://api.bilibili.com" && getGuestCookie) {
    // 未登录也要带游客 buvid：风控对裸请求直接回 412（登录 Cookie 优先，绝不覆盖）。
    const guestCookie = await getGuestCookie();
    if (guestCookie) headers.Cookie = guestCookie;
  }
  const contentType = req.headers["content-type"];
  if (typeof contentType === "string") headers["Content-Type"] = contentType;

  if (prefix === "/bili-api" && (incoming.pathname.includes("/x/space/") || incoming.pathname.includes("/x/polymer/web-space/"))) {
    const mid = incoming.searchParams.get("mid");
    headers.Referer = mid ? `https://space.bilibili.com/${mid}` : "https://space.bilibili.com/";
    headers.Origin = "https://space.bilibili.com";
  }
  if (prefix === "/bili-video-api") {
    const bvid = incoming.searchParams.get("bvid");
    headers.Referer = bvid ? `https://www.bilibili.com/video/${bvid}/` : "https://www.bilibili.com/";
  }

  const upstream = await fetchUpstream(target, {
    method,
    headers,
    body,
  }, (candidate) => isHttpsTarget(candidate) && candidate.origin === targetOrigin, res);

  const outHeaders = {
    "content-type": upstream.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; sandbox",
  };
  if (prefix === "/bili-passport") {
    const setCookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
    const pairs = setCookies
      .map((cookieValue) => cookieValue.split(";")[0])
      .filter((pair) => /^(?:SESSDATA|bili_jct|DedeUserID|DedeUserID__ckMd5|buvid3|buvid4)=/.test(pair));
    if (pairs.length > 0) outHeaders["x-bili-set-cookie"] = pairs.join("; ");
  }

  res.writeHead(upstream.status, outHeaders);
  if (!upstream.body) {
    res.end();
    return;
  }
  await pipeWebStream(upstream.body, res);
}

async function proxyMedia(req, res) {
  let target;
  try {
    const incoming = new URL(req.url ?? "/", "http://127.0.0.1");
    target = new URL(incoming.searchParams.get("u") ?? "");
  } catch {
    send(res, 403, "blocked media host");
    return;
  }
  if (!isHttpsTarget(target) || !isAllowedBiliMediaHost(target.hostname)) {
    send(res, 403, "blocked media host");
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") throw new RequestError(405, "method not allowed");
  const range = req.headers.range;
  const upstream = await fetchUpstream(target, {
    method: req.method,
    headers: {
      ...(typeof range === "string" && range ? { Range: range } : {}),
      Referer: "https://www.bilibili.com/",
      "User-Agent": DESKTOP_UA,
      Accept: "*/*",
    },
  }, (candidate) => isHttpsTarget(candidate) && isAllowedBiliMediaHost(candidate.hostname), res);
  const outHeaders = { "content-security-policy": "default-src 'none'; sandbox" };
  for (const name of ["content-type", "content-range", "accept-ranges", "cache-control", "etag", "last-modified", "content-length"]) {
    const value = upstream.headers.get(name);
    if (value) outHeaders[name] = value;
  }
  res.writeHead(upstream.status, outHeaders);
  if (!upstream.body) {
    res.end();
    return;
  }
  await pipeWebStream(upstream.body, res);
}

function safeJoin(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split("?")[0]);
  } catch {
    throw new RequestError(400, "invalid request path");
  }
  if (/[\\\0:]/.test(decoded)) throw new RequestError(400, "invalid request path");
  if (decoded.split("/").some((segment) => segment.startsWith("."))) throw new RequestError(403, "forbidden");
  const relative = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function serveStatic(distDir, req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") throw new RequestError(405, "method not allowed");
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  let filePath = safeJoin(distDir, url.pathname);
  if (!filePath) {
    send(res, 403, "forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    filePath = path.join(distDir, "index.html");
  }
  filePath = fs.realpathSync(filePath);
  const relative = path.relative(distDir, filePath);
  if (relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative)) {
    throw new RequestError(403, "forbidden");
  }
  const ext = path.extname(filePath).toLowerCase();
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) send(res, 404, "not found");
    else res.end();
  });
  res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "cache-control": ext === ".html" ? "no-store" : "public, max-age=31536000, immutable",
  });
  stream.pipe(res);
}

export function startBeidDesktopServer(options = {}) {
  const requestedDistDir = path.resolve(options.distDir ?? defaultDistDir());
  if (!fs.existsSync(path.join(requestedDistDir, "index.html"))) {
    throw new Error(`BEID dist not found at ${requestedDistDir}`);
  }
  const distDir = fs.realpathSync(requestedDistDir);
  const host = "127.0.0.1";
  const port = options.port ?? 0;
  // 游客 buvid 缓存按服务器实例隔离（便于测试），TTL 24h，进程内并发只发一次 spi。
  const GUEST_COOKIE_TTL_MS = 24 * 60 * 60 * 1000;
  const guestCookieState = { value: null, expiresAt: 0 };
  let guestCookieInflight = null;
  const getBilibiliGuestCookie = () => {
    if (guestCookieState.value && guestCookieState.expiresAt > Date.now()) {
      return Promise.resolve(guestCookieState.value);
    }
    if (!guestCookieInflight) {
      guestCookieInflight = fetchBilibiliGuestCookie()
        .then((fetched) => fetched ?? locallyGeneratedBilibiliGuestCookie())
        .then((value) => {
          guestCookieState.value = value;
          guestCookieState.expiresAt = Date.now() + GUEST_COOKIE_TTL_MS;
          return value;
        })
        .finally(() => {
          guestCookieInflight = null;
        });
    }
    return guestCookieInflight;
  };
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    void (async () => {
      try {
        const address = server.address();
        const authority = `${host}:${address.port}`;
        const origin = `http://${authority}`;
        if (req.headers.host !== authority
          || req.headers.origin && req.headers.origin !== origin
          || req.headers["sec-fetch-site"] === "cross-site"
          || req.headers.referer && new URL(req.headers.referer).origin !== origin) {
          throw new RequestError(403, "forbidden request origin");
        }
        if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\")) {
          throw new RequestError(400, "invalid request path");
        }
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        const pathname = new URL(url, origin).pathname;
        const matches = (prefix) => pathname === prefix || pathname.startsWith(prefix + "/");
        if (pathname === "/bili-media") return await proxyMedia(req, res);
        if (matches("/bili-search-api")) {
          return await proxyApi(req, res, "https://api.bilibili.com", "/bili-search-api", {
            Referer: "https://search.bilibili.com/",
          }, getBilibiliGuestCookie);
        }
        if (matches("/bili-video-api")) return await proxyApi(req, res, "https://api.bilibili.com", "/bili-video-api", {}, getBilibiliGuestCookie);
        if (matches("/bili-api")) return await proxyApi(req, res, "https://api.bilibili.com", "/bili-api", {}, getBilibiliGuestCookie);
        if (matches("/bili-suggest")) return await proxyApi(req, res, "https://s.search.bilibili.com", "/bili-suggest");
        if (matches("/bili-comment")) {
          return await proxyApi(req, res, "https://comment.bilibili.com", "/bili-comment", {
            Accept: "application/xml, text/xml, */*",
          });
        }
        if (matches("/bili-subtitle")) return await proxyApi(req, res, "https://aisubtitle.hdslb.com", "/bili-subtitle");
        if (matches("/bili-passport")) return await proxyApi(req, res, "https://passport.bilibili.com", "/bili-passport");
        if (pathname.startsWith("/bili-")) throw new RequestError(404, "unknown proxy route");
        serveStatic(distDir, req, res);
      } catch (error) {
        if (!(error instanceof RequestError)) console.error("BEID desktop request failed:", error.code ?? error.name);
        if (!res.headersSent) send(res, error instanceof RequestError ? error.status : 502, error instanceof RequestError ? error.message : "upstream error");
        else res.end();
      }
    })();
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        server,
        port: actualPort,
        url: `http://${host}:${actualPort}/`,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}

function defaultDistDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const started = await startBeidDesktopServer({
    distDir: defaultDistDir(),
    port: Number(process.env.BEID_DESKTOP_PORT || 4173),
  });
  console.log(`BEID desktop server ${started.url}`);
}
