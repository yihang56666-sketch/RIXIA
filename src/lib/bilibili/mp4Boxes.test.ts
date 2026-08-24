import { describe, expect, it } from "vitest";
import {
  buildSyntheticIndexedInit,
  chunkTail,
  findFirstMoofOffset,
  mapTimeToSegmentByte,
  parseSegmentIndex,
} from "./mp4Boxes";

describe("parseSegmentIndex", () => {
  it("parses segment byte ranges and time ranges from a synthetic sidx", () => {
    // timescale=1000，每段 subsegment_duration=10000 ticks = 10 秒。
    const init = buildSyntheticIndexedInit(4, 1000, 10_000, 1000);
    const entries = parseSegmentIndex(init);
    expect(entries).not.toBeNull();
    expect(entries!).toHaveLength(4);
    expect(entries![0]!.timeStart).toBe(0);
    expect(entries![0]!.timeEnd).toBe(10);
    expect(entries![1]!.timeStart).toBe(10);
    expect(entries![2]!.timeEnd).toBe(30);
    // sidx 后面紧跟首个 moof，first_offset=0 → 第一段从文件当前偏移开始。
    const moofAt = findFirstMoofOffset(init) ?? -1;
    expect(moofAt).toBeGreaterThan(0);
    expect(entries![0]!.byteStart).toBe(moofAt);
    expect(entries![1]!.byteStart).toBe(moofAt + 1000);
    expect(entries![3]!.byteEnd).toBe(moofAt + 4000);
  });

  it("returns null when there is no sidx before the first moof", () => {
    const noSidx = new Uint8Array(64);
    noSidx.set([0, 0, 0, 16], 0);
    noSidx.set(Uint8Array.from("ftyp", (c) => c.charCodeAt(0)), 4);
    noSidx.set([0, 0, 0, 16], 16);
    noSidx.set(Uint8Array.from("moof", (c) => c.charCodeAt(0)), 20);
    expect(parseSegmentIndex(noSidx)).toBeNull();
  });
});

describe("findFirstMoofOffset", () => {
  it("finds a moof at the chunk start", () => {
    const chunk = moofChunk(40, 0);
    expect(findFirstMoofOffset(chunk)).toBe(0);
  });

  it("finds a moof after leading bytes and reports its offset", () => {
    const chunk = new Uint8Array(48);
    chunk.set(moofChunk(32, 0), 8);
    expect(findFirstMoofOffset(chunk)).toBe(8);
  });

  it("returns null when no moof exists", () => {
    const chunk = new Uint8Array(64).fill(0xab);
    expect(findFirstMoofOffset(chunk)).toBeNull();
  });

  it("ignores literal moof bytes without a plausible box size", () => {
    const chunk = new Uint8Array(32);
    chunk.set(Uint8Array.from("moof", (c) => c.charCodeAt(0)), 0); // size 全 0 → 非法
    expect(findFirstMoofOffset(chunk)).toBeNull();
  });

  it("recovers a box header split across chunks via the carried tail", () => {
    // 上一块的最后 7 字节里带上了 moof 的 4 字节 size，本块直接以 "moof" 类型开头。
    const size = new Uint8Array([0, 0, 0, 64]);
    const tail = new Uint8Array([0xfe, 0xfe, 0xfe, ...size]);
    const chunk = new Uint8Array(64);
    chunk.set(Uint8Array.from("moof", (c) => c.charCodeAt(0)), 0);
    chunk.fill(0x11, 4);
    const hit = findFirstMoofOffset(chunk, tail);
    // moof 头起始于上一块尾巴里 → 负偏移表示"提前了 4 字节"。
    expect(hit).toBe(-4);
  });

  it("keeps scanning when the tail contains no header", () => {
    const tail = chunkTail(new Uint8Array(32).fill(0x11));
    const chunk = moofChunk(48, 0);
    expect(findFirstMoofOffset(chunk, tail)).toBe(0);
  });
});

describe("mapTimeToSegmentByte", () => {
  const entries = [
    { byteStart: 100, byteEnd: 200, timeStart: 0, timeEnd: 10 },
    { byteStart: 200, byteEnd: 300, timeStart: 10, timeEnd: 20 },
    { byteStart: 300, byteEnd: 400, timeStart: 20, timeEnd: 30 },
  ];

  it("maps a time inside a segment to that segment's start byte", () => {
    expect(mapTimeToSegmentByte(entries, 15)).toBe(200);
    expect(mapTimeToSegmentByte(entries, 25)).toBe(300);
  });

  it("clamps to the first segment below the timeline and the last segment beyond it", () => {
    expect(mapTimeToSegmentByte(entries, -1)).toBe(100);
    expect(mapTimeToSegmentByte(entries, 0)).toBe(100);
    expect(mapTimeToSegmentByte(entries, 99)).toBe(300);
  });

  it("returns null for an empty index", () => {
    expect(mapTimeToSegmentByte([], 5)).toBeNull();
  });
});

function moofChunk(payloadSize: number, fill: number): Uint8Array {
  const chunk = new Uint8Array(8 + payloadSize);
  new DataView(chunk.buffer).setUint32(0, chunk.length);
  chunk.set(Uint8Array.from("moof", (c) => c.charCodeAt(0)), 4);
  chunk.fill(fill, 8);
  return chunk;
}
