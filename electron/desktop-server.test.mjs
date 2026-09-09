import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBeidDesktopServer } from "./desktop-server.mjs";

const fixtureRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), ".test-artifacts");

async function fixture(context) {
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(fixtureRoot, "server-"));
  const distDir = path.join(root, "dist");
  fs.mkdirSync(distDir);
  fs.writeFileSync(path.join(distDir, "index.html"), "<html>BEID fixture</html>");
  const desktop = await startBeidDesktopServer({ distDir });
  context.after(async () => {
    desktop.server.closeAllConnections();
    await desktop.close();
    assert.ok(path.resolve(root).startsWith(path.resolve(fixtureRoot) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, distDir, desktop };
}

function request(desktop, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      hostname: "127.0.0.1",
      port: desktop.port,
      path: requestPath,
      method: options.method ?? "GET",
      headers: options.headers ?? {},
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    outgoing.on("error", reject);
    outgoing.end(options.body);
  });
}

function upstream(context, handler = () => new Response("ok")) {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (target, options) => {
    requests.push({ target: String(target), options });
    return handler(new URL(target), options);
  });
  return requests;
}

test("API path cannot replace the fixed upstream origin or leak the supplied cookie", async (context) => {
  const { desktop } = await fixture(context);
  const requests = upstream(context);
  for (const suffix of ["//127.0.0.1:9/private", "/\\127.0.0.1:9/private", "https://attacker.invalid/private"]) {
    const response = await request(desktop, `/bili-api${suffix}`, { headers: { "x-beid-cookie": "SESSDATA=test-only" } });
    assert.ok(response.status >= 400, `unsafe path accepted: ${suffix}`);
  }
  assert.equal(requests.length, 0);
});

test("API proxy preserves the allowed path, query, cookie, and POST content type", async (context) => {
  const { desktop } = await fixture(context);
  const requests = upstream(context);
  const response = await request(desktop, "/bili-api/x/example?mid=42", {
    method: "POST",
    headers: { Origin: desktop.url.slice(0, -1), "content-type": "application/x-www-form-urlencoded", "x-beid-cookie": "SESSDATA=test-only" },
    body: "csrf=fixture",
  });
  assert.equal(response.status, 200);
  assert.equal(requests[0].target, "https://api.bilibili.com/x/example?mid=42");
  const headers = new Headers(requests[0].options.headers);
  assert.equal(headers.get("cookie"), "SESSDATA=test-only");
  assert.equal(headers.get("content-type"), "application/x-www-form-urlencoded");
  assert.equal(requests[0].options.body.toString(), "csrf=fixture");
});

test("foreign origins, DNS-rebinding hosts, null origins and cross-site fetches are refused", async (context) => {
  const { desktop } = await fixture(context);
  const requests = upstream(context);
  for (const headers of [
    { Origin: "https://attacker.invalid" },
    { Origin: "null" },
    { Host: `attacker.invalid:${desktop.port}` },
    { "Sec-Fetch-Site": "cross-site" },
  ]) {
    const response = await request(desktop, "/bili-api/x/example", { headers });
    assert.equal(response.status, 403, JSON.stringify(headers));
  }
  assert.equal(requests.length, 0);
});

test("API redirects cannot forward credentials to another origin", async (context) => {
  const { desktop } = await fixture(context);
  const requests = upstream(context, () => new Response(null, { status: 302, headers: { location: "https://attacker.invalid/collect" } }));
  const response = await request(desktop, "/bili-api/x/example", { headers: { "x-beid-cookie": "SESSDATA=test-only" } });
  assert.equal(response.status, 403);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.redirect, "manual");
});

test("media redirects are revalidated instead of following into loopback", async (context) => {
  const { desktop } = await fixture(context);
  const requests = upstream(context, () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1:9/private" } }));
  const response = await request(desktop, `/bili-media?u=${encodeURIComponent("https://video.bilivideo.com/test.m4s")}`);
  assert.equal(response.status, 403);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.redirect, "manual");
});

test("media rejects userinfo, custom ports, lookalike hosts and non-HTTPS URLs", async (context) => {
  const { desktop } = await fixture(context);
  const requests = upstream(context);
  for (const target of ["https://user:pass@video.bilivideo.com/a", "https://video.bilivideo.com:9443/a", "https://bilivideo.com.attacker.invalid/a", "http://video.bilivideo.com/a", "file:///private"]) {
    const response = await request(desktop, `/bili-media?u=${encodeURIComponent(target)}`);
    assert.equal(response.status, 403, target);
  }
  assert.equal(requests.length, 0);
});

test("allowed CDN redirects retain Range and partial-response metadata", async (context) => {
  const { desktop } = await fixture(context);
  const requests = upstream(context, (target) => target.hostname.startsWith("first.")
    ? new Response(null, { status: 302, headers: { location: "https://second.bilivideo.com/test.m4s" } })
    : new Response("part", { status: 206, headers: { "content-range": "bytes 0-3/10", "content-type": "video/mp4" } }));
  const response = await request(desktop, `/bili-media?u=${encodeURIComponent("https://first.bilivideo.com/test.m4s")}`, { headers: { Range: "bytes=0-3" } });
  assert.equal(response.status, 206);
  assert.equal(response.body, "part");
  assert.equal(response.headers["content-range"], "bytes 0-3/10");
  assert.equal(new Headers(requests[1].options.headers).get("range"), "bytes=0-3");
});

test("static files cannot escape dist through a junction", async (context) => {
  const { root, distDir, desktop } = await fixture(context);
  const privateDir = path.join(root, "private");
  fs.mkdirSync(privateDir);
  fs.writeFileSync(path.join(privateDir, "secret.txt"), "fixture-private-data");
  fs.symlinkSync(privateDir, path.join(distDir, "linked"), process.platform === "win32" ? "junction" : "dir");
  const response = await request(desktop, "/linked/secret.txt");
  assert.equal(response.status, 403);
  assert.ok(!response.body.includes("fixture-private-data"));
});

test("accidentally retained hidden files in dist are never served", async (context) => {
  const { distDir, desktop } = await fixture(context);
  fs.writeFileSync(path.join(distDir, ".env"), "fixture-private-data");
  const response = await request(desktop, "/.env");
  assert.equal(response.status, 403);
  assert.ok(!response.body.includes("fixture-private-data"));
});

test("oversized API request bodies are rejected before forwarding", async (context) => {
  const { desktop } = await fixture(context);
  const requests = upstream(context);
  const response = await request(desktop, "/bili-api/x/example", { method: "POST", body: Buffer.alloc(1024 * 1024 + 1) });
  assert.equal(response.status, 413);
  assert.equal(requests.length, 0);
});

test("malformed paths are client errors and the SPA remains available", async (context) => {
  const { desktop } = await fixture(context);
  assert.equal((await request(desktop, "/%zz")).status, 400);
  const response = await request(desktop, "/study/session");
  assert.equal(response.status, 200);
  assert.match(response.body, /BEID fixture/);
});

test("upstream HTML cannot become an unsandboxed document on the application origin", async (context) => {
  const { desktop } = await fixture(context);
  upstream(context, () => new Response("<html>untrusted fixture</html>", { headers: { "content-type": "text/html" } }));
  for (const requestPath of ["/bili-api/x/example", `/bili-media?u=${encodeURIComponent("https://video.bilivideo.com/fixture.html")}`]) {
    const response = await request(desktop, requestPath);
    assert.equal(response.headers["content-security-policy"], "default-src 'none'; sandbox");
  }
});

test("passport forwards only exact approved cookie names", async (context) => {
  const { desktop } = await fixture(context);
  upstream(context, () => new Response("{}", { headers: [
    ["set-cookie", "SESSDATA=fixture; Secure; HttpOnly"],
    ["set-cookie", "prefixSESSDATA=private-fixture; Secure"],
  ] }));
  const response = await request(desktop, "/bili-passport/x/example");
  assert.equal(response.headers["x-bili-set-cookie"], "SESSDATA=fixture");
});
