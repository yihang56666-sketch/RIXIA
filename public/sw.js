/* BEID Service Worker：应用外壳缓存，离线可安装（Windows / Android / 桌面 PWA） */
const CACHE = "beid-shell-v3";
const PRECACHE = ["/", "/index.html", "/manifest.webmanifest", "/favicon.png", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;
  const url = new URL(request.url);
  if (request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html") {
    // 导航请求网络优先：新版本发布立即生效，离线才回退缓存外壳。
    // 缓存优先会让旧 index 引用已被新构建删除的 hash bundle，升级即白屏。
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }
  // 带 hash 的静态资源内容不变：缓存优先，命中即离线可用。
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
