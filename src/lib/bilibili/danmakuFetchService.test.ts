import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDanmakuFetchService,
  DanmakuLoadError,
  parseDanmakuSegProtobuf,
  parseDanmakuXml,
} from "./danmakuFetchService";

function encodeVarint(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  for (;;) {
    let byte = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) byte += 128;
    out.push(byte);
    if (rest === 0) return out;
  }
}

function encodeTag(fieldNumber: number, wireType: number): number[] {
  return encodeVarint(fieldNumber * 8 + wireType);
}

function encodeLengthDelimited(fieldNumber: number, payload: number[]): number[] {
  return [...encodeTag(fieldNumber, 2), ...encodeVarint(payload.length), ...payload];
}

/** 组一个 DmSegMobileReply protobuf：外层字段 1 = DanmakuElem 列表。 */
function encodeSeg(elems: Array<{ progressMs?: number; mode?: number; fontSize?: number; color?: number; content?: string; pool?: number }>): ArrayBuffer {
  const fieldBytes = (field: number, value: number) => [...encodeTag(field, 0), ...encodeVarint(value)];
  const elemBytes = elems.map((elem) => {
    const bytes: number[] = [];
    if (elem.progressMs != null) bytes.push(...fieldBytes(2, elem.progressMs));
    if (elem.mode != null) bytes.push(...fieldBytes(3, elem.mode));
    if (elem.fontSize != null) bytes.push(...fieldBytes(4, elem.fontSize));
    if (elem.color != null) bytes.push(...fieldBytes(5, elem.color));
    if (elem.content != null) bytes.push(...encodeLengthDelimited(7, [...new TextEncoder().encode(elem.content)]));
    if (elem.pool != null) bytes.push(...fieldBytes(13, elem.pool));
    return bytes;
  });
  const reply: number[] = [];
  for (const elem of elemBytes) reply.push(...encodeLengthDelimited(1, elem));
  return new Uint8Array(reply).buffer;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

const SEG_URL_PREFIX = "/bili-api/x/v2/dm/web/seg.so?type=1&oid=40429357187";

describe("danmaku segmented protobuf pipeline", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads segmented danmaku through the local API proxy in a browser development session", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.startsWith(SEG_URL_PREFIX)) {
        const index = Number(new URL(url, "http://localhost").searchParams.get("segment_index"));
        return new Response(
          index === 1 ? encodeSeg([{ progressMs: 1500, mode: 1, color: 0xffffff, content: "哈哈" }]) : encodeSeg([]),
          { status: 200 },
        );
      }
      return new Response("unexpected", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const entries = await createDanmakuFetchService().fetchDanmaku(40429357187);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`${SEG_URL_PREFIX}&pid=0&segment_index=1`),
      expect.any(Object),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ text: "哈哈", startTimeSeconds: 1.5, mode: 1, color: 0xffffff });
  });

  it("keeps probing segments until an empty one when duration is unknown", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const index = Number(new URL(url, "http://localhost").searchParams.get("segment_index"));
      if (index <= 2) {
        return new Response(encodeSeg([{ progressMs: index * 1000, mode: 1, content: `第${index}段` }]), { status: 200 });
      }
      return new Response(encodeSeg([]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const entries = await createDanmakuFetchService().fetchDanmaku(40429357187);

    expect(entries).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("segment_index=3"), expect.any(Object));
  });

  it("fetches every planned segment in parallel when the part duration is known", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const index = Number(new URL(url, "http://localhost").searchParams.get("segment_index"));
      return new Response(encodeSeg([{ progressMs: index * 1000, mode: 1, content: `第${index}段` }]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const entries = await createDanmakuFetchService().fetchDanmaku(40429357187, { durationSeconds: 1500 });

    // 1500s / 360s → 5 段，全部请求。
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(entries).toHaveLength(5);
  });

  it("falls back to the legacy XML endpoint when the segmented endpoint fails", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/x/v2/dm/web/seg.so")) {
        return new Response("", { status: 412 });
      }
      return new Response(
        '<?xml version="1.0"?><i><chatserver>chat.bilibili.com</chatserver><d p="12.5,1,25,16777215,0,0,abc,0">旧接口弹幕</d></i>',
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const entries = await createDanmakuFetchService().fetchDanmaku(40429357187);

    expect(fetchMock).toHaveBeenCalledWith(
      "/bili-comment/40429357187.xml",
      expect.any(Object),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe("旧接口弹幕");
  });

  it("surfaces network failures instead of swallowing them into an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("断网")));
    await expect(createDanmakuFetchService().fetchDanmaku(40429357187)).rejects.toMatchObject({
      name: "DanmakuLoadError",
      kind: "network",
    });
  });

  it("reports videos whose danmaku Bilibili closed instead of claiming empty", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/x/v2/dm/web/seg.so")) {
        return new Response("", { status: 412 });
      }
      return new Response('<?xml version="1.0"?><i>本视频弹幕功能已被关闭</i>', { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(createDanmakuFetchService().fetchDanmaku(40429357187)).rejects.toMatchObject({
      name: "DanmakuLoadError",
      kind: "closed",
    });
  });

  it("uses CapacitorHttp binary transport for segmented danmaku in the native app", async () => {
    const nativeRequest = vi.fn().mockImplementation(async (options: { url: string }) => {
      if (options.url.includes("/x/v2/dm/web/seg.so")) {
        const index = Number(new URL(options.url).searchParams.get("segment_index"));
        return {
          status: 200,
          data: toBase64(encodeSeg(index === 1 ? [{ progressMs: 900, mode: 5, content: "顶部弹幕" }] : [])),
          headers: {},
        };
      }
      return { status: 200, data: "<i />", headers: {} };
    });
    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      Capacitor: { isNativePlatform: () => true },
      CapacitorHttp: { request: nativeRequest },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("WebView fetch must not be used")));
    vi.stubGlobal("atob", (value: string) => Buffer.from(value, "base64").toString("binary"));

    const entries = await createDanmakuFetchService().fetchDanmaku(40429357187);

    expect(nativeRequest).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://api.bilibili.com/x/v2/dm/web/seg.so?type=1&oid=40429357187&pid=0&segment_index=1",
      method: "GET",
      responseType: "arraybuffer",
    }));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ text: "顶部弹幕", mode: 5 });
  });
});

describe("parseDanmakuSegProtobuf", () => {
  it("sorts merged elements by start time and keeps proto fields", () => {
    const entries = parseDanmakuSegProtobuf(encodeSeg([
      { progressMs: 4200, mode: 1, fontSize: 25, color: 0x00aeee, content: "后", pool: 0 },
      { progressMs: 1200, mode: 4, fontSize: 25, color: 0xffffff, content: "先", pool: 0 },
    ]));

    expect(entries.map((entry) => entry.text)).toEqual(["先", "后"]);
    expect(entries[0]).toMatchObject({ startTimeSeconds: 1.2, mode: 4, durationSeconds: 4, fontSize: 25 });
  });

  it("treats a code-0 JSON body as an empty segment and a non-zero code as a network error", () => {
    expect(parseDanmakuSegProtobuf(new TextEncoder().encode('{"code":0,"data":[]}').buffer as ArrayBuffer)).toEqual([]);
    expect(() =>
      parseDanmakuSegProtobuf(new TextEncoder().encode('{"code":-404,"message":"啥都木有"}').buffer as ArrayBuffer),
    ).toThrow(DanmakuLoadError);
  });
});

describe("parseDanmakuXml", () => {
  it("throws a closed error for videos with danmaku disabled", () => {
    expect(() => parseDanmakuXml("<i>本视频弹幕功能已被关闭</i>")).toThrow(DanmakuLoadError);
  });

  it("throws a parse error for malformed xml", () => {
    expect(() => parseDanmakuXml("<i><d p=broken</i>")).toThrow(DanmakuLoadError);
  });
});
