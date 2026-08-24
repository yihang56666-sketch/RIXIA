import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const OFFICIAL_MEDIA_HOST_SUFFIXES = [".bilivideo.com", ".bilivideo.cn", ".hdslb.com", ".akamaized.net"];
const PARTNER_MEDIA_HOST_SUFFIXES = [".mountaintoys.cn", ".szbdyd.com"];

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

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
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

async function proxyApi(req, res, targetOrigin, prefix, extraHeaders = {}) {
  const incoming = new URL(req.url ?? "/", "http://127.0.0.1");
  const rest = incoming.pathname.slice(prefix.length) || "/";
  const target = new URL(rest + incoming.search, targetOrigin);
  const headers = {
    "User-Agent": DESKTOP_UA,
    Accept: extraHeaders.Accept ?? "application/json",
    Referer: extraHeaders.Referer ?? "https://www.bilibili.com/",
    ...extraHeaders,
  };
  const cookie = req.headers["x-beid-cookie"];
  if (typeof cookie === "string" && cookie) headers.Cookie = cookie;

  if (prefix === "/bili-api" && (incoming.pathname.includes("/x/space/") || incoming.pathname.includes("/x/polymer/web-space/"))) {
    const mid = incoming.searchParams.get("mid");
    headers.Referer = mid ? `https://space.bilibili.com/${mid}` : "https://space.bilibili.com/";
    headers.Origin = "https://space.bilibili.com";
  }
  if (prefix === "/bili-video-api") {
    const bvid = incoming.searchParams.get("bvid");
    headers.Referer = bvid ? `https://www.bilibili.com/video/${bvid}/` : "https://www.bilibili.com/";
  }

  const method = req.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req);
  const upstream = await fetch(target, {
    method,
    headers,
    body,
    redirect: "follow",
  });

  const outHeaders = {
    "content-type": upstream.headers.get("content-type") ?? "application/json",
    "cache-control": "no-store",
  };
  if (prefix === "/bili-passport") {
    const setCookies = typeof upstream.headers.getSetCookie === "function" ? upstream.headers.getSetCookie() : [];
    const pairs = setCookies
      .map((cookieValue) => cookieValue.split(";")[0])
      .filter((pair) => /(?:SESSDATA|bili_jct|DedeUserID|DedeUserID__ckMd5|buvid3|buvid4)=/.test(pair));
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
  if (target.protocol !== "https:" || !isAllowedBiliMediaHost(target.hostname)) {
    send(res, 403, "blocked media host");
    return;
  }
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
  const outHeaders = {};
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
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const relative = decoded.replace(/^\/+/, "");
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function serveStatic(distDir, req, res) {
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
  const distDir = path.resolve(options.distDir);
  if (!distDir || !fs.existsSync(path.join(distDir, "index.html"))) {
    throw new Error(`BEID dist not found at ${distDir}`);
  }
  const host = "127.0.0.1";
  const port = options.port ?? 0;
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    void (async () => {
      try {
        if (url.startsWith("/bili-media")) return await proxyMedia(req, res);
        if (url.startsWith("/bili-search-api")) {
          return await proxyApi(req, res, "https://api.bilibili.com", "/bili-search-api", {
            Referer: "https://search.bilibili.com/",
          });
        }
        if (url.startsWith("/bili-video-api")) return await proxyApi(req, res, "https://api.bilibili.com", "/bili-video-api");
        if (url.startsWith("/bili-api")) return await proxyApi(req, res, "https://api.bilibili.com", "/bili-api");
        if (url.startsWith("/bili-suggest")) return await proxyApi(req, res, "https://s.search.bilibili.com", "/bili-suggest");
        if (url.startsWith("/bili-comment")) {
          return await proxyApi(req, res, "https://comment.bilibili.com", "/bili-comment", {
            Accept: "application/xml, text/xml, */*",
          });
        }
        if (url.startsWith("/bili-subtitle")) return await proxyApi(req, res, "https://aisubtitle.hdslb.com", "/bili-subtitle");
        if (url.startsWith("/bili-passport")) return await proxyApi(req, res, "https://passport.bilibili.com", "/bili-passport");
        serveStatic(distDir, req, res);
      } catch {
        if (!res.headersSent) send(res, 502, "upstream error");
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
