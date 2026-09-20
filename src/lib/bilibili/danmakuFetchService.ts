/**
 * RIXIA B 站弹幕客户端。
 *
 * 主通道：B 站当前播放器使用的分段接口 x/v2/dm/web/seg.so（protobuf，
 * 每段 6 分钟），旧版 comment.bilibili.com/<cid>.xml 只在分段接口整体不可用
 * （风控/断网）时兜底，且旧接口有 maxlimit 截断，长视频会缺弹幕。
 *
 * 错误语义：网络失败/解析失败/弹幕被关闭会抛出 DanmakuLoadError，让播放器
 * 展示"加载失败 + 重试"，绝不把失败吞成"没有弹幕"。真正拉到 0 条才返回 []。
 */

import type { DanmakuEntry } from "./types";
import { DanmakuMode } from "./types";
import { createBinaryRequest, createJsonRequest, isNativeEnvironment } from "./httpAdapter";

/** B 站分段弹幕每段时长（秒）。 */
export const DANMAKU_SEGMENT_SECONDS = 360;
/** 分段拉取上限（约 6 小时视频），防止超长/异常时长把请求拖成死循环。 */
const MAX_SEGMENTS = 60;
/** 已知时长时并行拉取的分段批量大小。 */
const SEGMENT_BATCH = 4;

export type DanmakuLoadErrorKind = "network" | "closed" | "parse";

export class DanmakuLoadError extends Error {
  readonly kind: DanmakuLoadErrorKind;

  constructor(kind: DanmakuLoadErrorKind, message: string) {
    super(message);
    this.name = "DanmakuLoadError";
    this.kind = kind;
  }
}

export interface DanmakuFetchOptions {
  /** 稿件 aid（seg.so 的 pid 参数），缺失时仅按 oid 请求。 */
  pid?: number;
  /** 当前分 P 时长（秒），用于确定分段数量；缺省时按"空段即止"探测。 */
  durationSeconds?: number;
}

export interface DanmakuFetchService {
  fetchDanmaku(cid: number, options?: DanmakuFetchOptions): Promise<DanmakuEntry[]>;
}

export function createDanmakuFetchService(): DanmakuFetchService {
  const requestText = createJsonRequest();
  const requestBinary = createBinaryRequest();

  async function fetchSegment(cid: number, pid: number | undefined, index: number): Promise<DanmakuEntry[]> {
    const url = `https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=${cid}` +
      `&pid=${pid && pid > 0 ? pid : 0}&segment_index=${index}`;
    return parseDanmakuSegProtobuf(await requestBinary(url));
  }

  return {
    async fetchDanmaku(cid, options = {}) {
      if (!cid || cid <= 0) return [];
      try {
        return await fetchSegmented(cid, options);
      } catch (error) {
        if (error instanceof DanmakuLoadError && error.kind === "closed") throw error;
        // 分段接口整体不可用（风控/断网/代理缺失）时退回旧 XML 接口；
        // XML 同样失败就把错误规范成 DanmakuLoadError 抛出去，由播放器给出重试入口。
        try {
          return await fetchLegacyXml(cid);
        } catch (fallbackError) {
          if (fallbackError instanceof DanmakuLoadError) throw fallbackError;
          throw new DanmakuLoadError(
            "network",
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          );
        }
      }
    },
  };

  async function fetchSegmented(cid: number, options: DanmakuFetchOptions): Promise<DanmakuEntry[]> {
    const plannedCount = options.durationSeconds && options.durationSeconds > 0
      ? Math.max(1, Math.min(MAX_SEGMENTS, Math.ceil(options.durationSeconds / DANMAKU_SEGMENT_SECONDS)))
      : null;
    const merged: DanmakuEntry[] = [];
    let index = 1;
    let firstBatch = true;
    while (index <= MAX_SEGMENTS) {
      if (plannedCount != null && index > plannedCount) break;
      const batchEnd = plannedCount != null
        ? Math.min(index + SEGMENT_BATCH - 1, plannedCount)
        : index;
      const indexes: number[] = [];
      for (let i = index; i <= batchEnd; i++) indexes.push(i);
      const settled = await Promise.all(indexes.map(async (segmentIndex) => {
        try {
          return { ok: true as const, entries: await fetchSegment(cid, options.pid, segmentIndex) };
        } catch (error) {
          return { ok: false as const, error };
        }
      }));
      if (firstBatch && settled[0] && !settled[0].ok) {
        throw settled[0].error;
      }
      firstBatch = false;
      const batchEntries = settled.filter((item): item is { ok: true; entries: DanmakuEntry[] } => item.ok);
      // 整批请求失败（风控中途生效/断网）：停止继续探测，保留已拉到的分段。
      if (batchEntries.length === 0) break;
      // 整批成功但全空 → 已经拉过最后一段（或该段确实无弹幕），停止探测。
      if (batchEntries.length === settled.length && batchEntries.every((item) => item.entries.length === 0)) break;
      for (const item of batchEntries) merged.push(...item.entries);
      index += indexes.length;
    }
    merged.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    return merged;
  }

  async function fetchLegacyXml(cid: number): Promise<DanmakuEntry[]> {
    return parseDanmakuXml(await requestText(commentUrl(cid)));
  }
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
  const raw = xml.trim();
  if (!raw) return [];
  if (raw.includes("已被关闭")) {
    throw new DanmakuLoadError("closed", "这个视频已关闭弹幕");
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new DanmakuLoadError("parse", "弹幕数据解析失败");
  }
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
  // 渲染器的 schedule 按"首条超前条目即 break"扫描，必须保证按时间有序，
  // 否则乱序条目之后的弹幕会被整段丢弃。
  out.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  return out;
}

/** DmSegMobileReply.elems（字段 1）里的弹幕元素字段号，见 bilibili-API-collect dm.proto。 */
const DANMAKU_ELEM_FIELD_PROGRESS_MS = 2;
const DANMAKU_ELEM_FIELD_MODE = 3;
const DANMAKU_ELEM_FIELD_FONTSIZE = 4;
const DANMAKU_ELEM_FIELD_COLOR = 5;
const DANMAKU_ELEM_FIELD_MIDHASH = 6;
const DANMAKU_ELEM_FIELD_CONTENT = 7;
const DANMAKU_ELEM_FIELD_POOL = 13;

/**
 * 解析 seg.so 返回的 protobuf（DmSegMobileReply）。响应体如果实际是 JSON
 * （错误码/风控），按 code 判断：code 0 视为空段，其余抛网络错误。
 */
export function parseDanmakuSegProtobuf(buffer: ArrayBuffer): DanmakuEntry[] {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return [];
  if (bytes[0] === 0x7b) { // '{' — JSON 响应体而不是 protobuf
    const text = decodeUtf8(bytes);
    let code = -1;
    try {
      code = Number((JSON.parse(text) as { code?: unknown }).code ?? -1);
    } catch {
      code = -1;
    }
    if (code === 0) return [];
    throw new DanmakuLoadError("network", `弹幕接口返回错误（code ${code}）`);
  }
  const out: DanmakuEntry[] = [];
  readProtoFields(bytes, (field, wireType, reader) => {
    if (field !== 1) {
      skipProtoValue(wireType, reader);
      return;
    }
    if (wireType !== 2) {
      skipProtoValue(wireType, reader);
      return;
    }
    const entry = readDanmakuElem(reader.readLengthDelimited());
    if (entry) out.push({ ...entry, id: out.length + 1 });
  });
  out.sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  return out;
}

function readDanmakuElem(bytes: Uint8Array): DanmakuEntry | null {
  let progressMs = 0;
  let mode = 0;
  let fontSize = 22;
  let color = 0xffffff;
  let pool = 0;
  let content = "";
  let midHash = "";
  let sawContent = false;
  try {
    readProtoFields(bytes, (field, wireType, reader) => {
      switch (field) {
        case DANMAKU_ELEM_FIELD_PROGRESS_MS:
          progressMs = reader.readVarint();
          return;
        case DANMAKU_ELEM_FIELD_MODE:
          mode = reader.readVarint();
          return;
        case DANMAKU_ELEM_FIELD_FONTSIZE:
          fontSize = reader.readVarint();
          return;
        case DANMAKU_ELEM_FIELD_COLOR:
          color = reader.readVarint();
          return;
        case DANMAKU_ELEM_FIELD_MIDHASH:
          if (wireType === 2) midHash = decodeUtf8(reader.readLengthDelimited());
          else skipProtoValue(wireType, reader);
          return;
        case DANMAKU_ELEM_FIELD_CONTENT:
          if (wireType === 2) {
            content = decodeUtf8(reader.readLengthDelimited());
            sawContent = true;
          } else skipProtoValue(wireType, reader);
          return;
        case DANMAKU_ELEM_FIELD_POOL:
          pool = reader.readVarint();
          return;
        default:
          skipProtoValue(wireType, reader);
          return;
      }
    });
  } catch {
    return null;
  }
  if (!sawContent || !content.trim()) return null;
  const startTimeSeconds = progressMs / 1000;
  if (!Number.isFinite(startTimeSeconds)) return null;
  return {
    id: 0,
    text: content,
    startTimeSeconds,
    durationSeconds: mode === DanmakuMode.top || mode === DanmakuMode.bottom ? 4 : 9,
    mode: mode as DanmakuMode,
    color: Number.isFinite(color) && color > 0 ? color : 0xffffff,
    fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 22,
    pool: Number.isFinite(pool) ? pool : 0,
    midHash,
  };
}

interface ProtoReader {
  readonly bytes: Uint8Array;
  offset: number;
  readVarint(): number;
  readLengthDelimited(): Uint8Array;
}

function readProtoFields(
  bytes: Uint8Array,
  visit: (fieldNumber: number, wireType: number, reader: ProtoReader) => void,
): void {
  const reader: ProtoReader = {
    bytes,
    offset: 0,
    readVarint() {
      let value = 0;
      let shift = 0;
      for (;;) {
        if (this.offset >= this.bytes.length) throw new RangeError("varint 越界");
        const byte = this.bytes[this.offset++]!;
        if (shift < 32) value += (byte & 0x7f) * 2 ** shift;
        shift += 7;
        if ((byte & 0x80) === 0) return value;
        if (shift > 63) throw new RangeError("varint 过长");
      }
    },
    readLengthDelimited() {
      const length = this.readVarint();
      if (this.offset + length > this.bytes.length) throw new RangeError("length-delimited 越界");
      const out = this.bytes.subarray(this.offset, this.offset + length);
      this.offset += length;
      return out;
    },
  };
  while (reader.offset < bytes.length) {
    const tag = reader.readVarint();
    visit(Math.floor(tag / 8), tag % 8, reader);
  }
}

function skipProtoValue(wireType: number, reader: ProtoReader): void {
  switch (wireType) {
    case 0:
      reader.readVarint();
      return;
    case 1:
      reader.offset += 8;
      return;
    case 2:
      reader.readLengthDelimited();
      return;
    case 5:
      reader.offset += 4;
      return;
    default:
      throw new RangeError(`无法跳过的 wire type：${wireType}`);
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}
