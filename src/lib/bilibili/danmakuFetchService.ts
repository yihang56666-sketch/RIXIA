/**
 * RIXIA B 站弹幕 XML API 客户端 — 对应 FocuBili 的 player_danmaku_rendering.dart
 * 调用的弹幕源。从 https://comment.bilibili.com/<cid>.xml 取弹幕，解析为
 * DanmakuEntry[]。响应使用 DOMParser 解析（浏览器原生）。
 */

import type { DanmakuEntry } from "./types";
import { DanmakuMode } from "./types";
import { createJsonRequest, isNativeEnvironment } from "./httpAdapter";

export interface DanmakuFetchService {
  fetchDanmaku(cid: number): Promise<DanmakuEntry[]>;
}

export function createDanmakuFetchService(): DanmakuFetchService {
  const requestText = createJsonRequest();
  return {
    async fetchDanmaku(cid) {
      if (!cid || cid <= 0) return [];
      const url = commentUrl(cid);
      try {
        return parseDanmakuXml(await requestText(url));
      } catch {
        return [];
      }
    },
  };
}

function commentUrl(cid: number): string {
  const localBrowser = typeof window !== "undefined" &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost");
  return localBrowser && !isNativeEnvironment()
    ? `/bili-comment/${cid}.xml`
    : `https://comment.bilibili.com/${cid}.xml`;
}

export function parseDanmakuXml(xml: string): DanmakuEntry[] {
  if (typeof DOMParser === "undefined") return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const elements = doc.querySelectorAll("d");
  const out: DanmakuEntry[] = [];
  let id = 0;
  elements.forEach((el) => {
    const p = el.getAttribute("p");
    if (!p) return;
    const parts = p.split(",");
    if (parts.length < 4) return;
    const startTimeSeconds = Number.parseFloat(parts[0]!);
    const mode = Number.parseInt(parts[1]!, 10) as DanmakuMode;
    const fontSize = Number.parseInt(parts[2]!, 10);
    const color = Number.parseInt(parts[3]!, 10);
    if (!Number.isFinite(startTimeSeconds) || !Number.isFinite(mode) || !Number.isFinite(color)) return;
    const midHash = parts[7] ?? "";
    const text = el.textContent ?? "";
    if (!text.trim()) return;
    out.push({
      id: ++id,
      text,
      startTimeSeconds,
      durationSeconds: mode === DanmakuMode.top || mode === DanmakuMode.bottom ? 4 : 9,
      mode,
      color,
      fontSize: Number.isFinite(fontSize) ? fontSize : 22,
      pool: Number.parseInt(parts[5] ?? "0", 10),
      midHash,
    });
  });
  return out;
}
