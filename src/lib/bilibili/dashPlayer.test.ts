import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashPlayer } from "./dashPlayer";
import { buildSyntheticIndexedInit, concatBytes, parseSegmentIndex } from "./mp4Boxes";
import type { DashStream } from "./playurlService";

class FakeSourceBuffer extends EventTarget {
  updating = false;
  buffered = {
    length: 1,
    start: () => 0.1,
    end: () => 12,
  };
  appendBuffer() {
    queueMicrotask(() => this.dispatchEvent(new Event("updateend")));
  }
  remove() {}
}

class FakeMediaSource extends EventTarget {
  readyState = "closed";
  duration = Number.NaN;
  sourceBuffers: FakeSourceBuffer[] = [];
  addSourceBuffer = vi.fn((_mime: string) => {
    const buffer = new FakeSourceBuffer();
    this.sourceBuffers.push(buffer);
    return buffer;
  });
  endOfStream() {}
}

const stream: DashStream = {
  video: [{ id: 64, baseUrl: "https://cdn.test/video.m4s", backupUrls: [], codecs: "avc1.64001E", bandwidth: 800000 }],
  audio: [{ id: 30216, baseUrl: "https://cdn.test/audio.m4s", backupUrls: [], codecs: "mp4a.40.2", bandwidth: 128000 }],
  durationMs: 60_000,
  quality: 64,
  acceptQuality: [64],
};

function createFakeVideo() {
  return {
    src: "",
    currentTime: 0,
    duration: Number.NaN,
    volume: 1,
    playbackRate: 1,
    error: null,
    buffered: { length: 0, start: () => 0, end: () => 0 },
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    disablePictureInPicture: false,
    controls: true,
  };
}

describe("DashPlayer source buffers", () => {
  let lastMediaSource: FakeMediaSource | undefined;
  const originalMediaSource = globalThis.MediaSource;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    lastMediaSource = undefined;
    vi.stubGlobal("MediaSource", class extends FakeMediaSource {
      constructor() {
        super();
        lastMediaSource = this;
        queueMicrotask(() => {
          this.readyState = "open";
          this.dispatchEvent(new Event("sourceopen"));
        });
      }
      static isTypeSupported() {
        return true;
      }
    });
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 206,
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-range" ? "bytes 0-15/16" : null),
      },
      body: {
        getReader() {
          let done = false;
          return {
            async read() {
              if (done) return { done: true, value: undefined };
              done = true;
              // 一个最小 moof box：首个分片就绪需要见到分段边界。
              return { done: false, value: mofBox() };
            },
          };
        },
      },
    }) as unknown as Response);
  });

  /** 16 字节的最小 moof box（size=16 + type + 8 字节负载）。 */
  function mofBox(): Uint8Array {
    const bytes = new Uint8Array(16);
    new DataView(bytes.buffer).setUint32(0, 16);
    bytes.set(Uint8Array.from("moof", (c) => c.charCodeAt(0)), 4);
    return bytes;
  }

  afterEach(() => {
    RangeSeekSourceBuffer.delayFirstAppendUpdate = false;
    vi.unstubAllGlobals();
    if (originalMediaSource) globalThis.MediaSource = originalMediaSource;
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("creates exactly one SourceBuffer per audio/video mime type", async () => {
    const video = createFakeVideo();
    const player = new DashPlayer({ video: video as unknown as HTMLVideoElement });
    await player.load(stream, 64);

    expect(lastMediaSource).toBeDefined();
    expect(lastMediaSource!.addSourceBuffer.mock.calls.map((call) => call[0])).toEqual([
      'video/mp4; codecs="avc1.64001E"',
      'audio/mp4; codecs="mp4a.40.2"',
    ]);
    player.destroy();
  });

  it("falls back to backup media URLs when the primary CDN returns 403", async () => {
    function moofResponse() {
      return {
        ok: true,
        status: 206,
        headers: {
          get: (name: string) => (name.toLowerCase() === "content-range" ? "bytes 0-15/16" : null),
        },
        body: {
          getReader() {
            let done = false;
            return {
              async read() {
                if (done) return { done: true, value: undefined };
                done = true;
                return { done: false, value: mofBox() };
              },
            };
          },
        },
      } as unknown as Response;
    }
    const requested: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("primary.m4s")) {
        return { ok: false, status: 403, headers: { get: () => null }, body: null } as unknown as Response;
      }
      return moofResponse();
    });
    const video = createFakeVideo();
    const player = new DashPlayer({ video: video as unknown as HTMLVideoElement });
    await player.load({
      ...stream,
      video: [{ ...stream.video[0], baseUrl: "https://cdn.test/primary.m4s", backupUrls: ["https://cdn.test/backup.m4s"] }],
      audio: [],
    }, 64);
    expect(requested.some((url) => url.includes("primary.m4s"))).toBe(true);
    expect(requested.some((url) => url.includes("backup.m4s"))).toBe(true);
    player.destroy();
  });
});

/**
 * 时间感知的 SourceBuffer 桩：真实 MSE 里 init 段不产生 buffered 范围，
 * 分段数据的 buffered 时间戳来自 moof 内部。fetch 桩写入的 hint 携带
 * initBytes（该批字节里 init 段的长度）——init 部分不建立时间轴，hint
 * 存活到首个媒体分片到达，避免追加顺序与下载顺序交错时吃错提示。
 */
class RangeSeekSourceBuffer extends EventTarget {
  static delayFirstAppendUpdate = false;
  static restartInitBytes = 0;
  static restartAppendLengths: number[] = [];
  updating = false;
  rangeStart: number | null = null;
  rangeEnd = 0;
  secondsPerByte: number;
  removed: Array<[number, number]> = [];
  appendedBytes = 0;
  private appendCount = 0;
  private pendingUpdate = false;
  private expectRestartInit = false;
  constructor(secondsPerByte: number, private readonly hint: { time: number | null; initBytes: number }) {
    super();
    this.secondsPerByte = secondsPerByte;
  }
  get buffered() {
    if (this.rangeStart == null) return { length: 0, start: () => 0, end: () => 0 };
    return { length: 1, start: () => this.rangeStart!, end: () => this.rangeEnd };
  }
  /** 测试专用：模拟背压下只下载到了 seconds 秒。 */
  shrinkTo(seconds: number) {
    if (this.rangeStart == null) return;
    this.rangeEnd = Math.max(this.rangeStart!, seconds);
  }
  appendBuffer(bytes: ArrayBuffer) {
    if (this.expectRestartInit) {
      RangeSeekSourceBuffer.restartAppendLengths.push(bytes.byteLength);
      this.expectRestartInit = false;
    }
    this.appendedBytes += bytes.byteLength;
    if (!RangeSeekSourceBuffer.delayFirstAppendUpdate) {
      this.appendNormally(bytes);
      return;
    }
    if (this.pendingUpdate) throw new Error("append while update pending");
    this.pendingUpdate = true;
    this.updating = true;
    this.appendNormally(bytes);
    const finish = () => {
      this.pendingUpdate = false;
      this.updating = false;
      this.dispatchEvent(new Event("updateend"));
    };
    if (this.appendCount === 0) setTimeout(finish, 25);
    else queueMicrotask(finish);
    this.appendCount += 1;
  }
  private appendNormally(bytes: ArrayBuffer) {
    if (this.hint.time != null && this.hint.initBytes >= bytes.byteLength) {
      // 整块都是 init 段：不产生 buffered 范围。
      this.hint.initBytes -= bytes.byteLength;
    } else {
      const mediaBytes = this.hint.time != null ? bytes.byteLength - this.hint.initBytes : bytes.byteLength;
      this.hint.initBytes = 0;
      const seconds = mediaBytes * this.secondsPerByte;
      if (this.rangeStart == null && this.hint.time != null) {
        this.rangeStart = this.hint.time;
        this.rangeEnd = this.hint.time + seconds;
        this.hint.time = null;
      } else if (this.rangeStart != null) {
        this.rangeEnd += seconds;
      }
    }
    queueMicrotask(() => this.dispatchEvent(new Event("updateend")));
  }
  abort() {
    this.expectRestartInit = true;
    if (!RangeSeekSourceBuffer.delayFirstAppendUpdate) return;
    // abort 后旧 init/媒体状态被丢弃；下一次 append 是全新的 init 段。
    this.hint.time = 0;
    this.hint.initBytes = RangeSeekSourceBuffer.restartInitBytes;
  }
  remove(start: number, end: number) {
    if (RangeSeekSourceBuffer.delayFirstAppendUpdate && this.pendingUpdate) throw new Error("remove while update pending");
    this.removed.push([start, end]);
    if (this.rangeStart != null && start <= this.rangeStart) {
      this.rangeStart = null;
      this.rangeEnd = 0;
    }
    queueMicrotask(() => this.dispatchEvent(new Event("updateend")));
  }
}

describe("DashPlayer range seeking", () => {
  const originalMediaSource = globalThis.MediaSource;
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  // sidx: 10 段 × 1000 字节 × 10 秒（timescale 1000 → 10000 ticks/段），anchor=200。
  const init = buildSyntheticIndexedInit(10, 1000, 10_000, 1000);
  const anchor = init.length - 56; // sidx 结束位置 = 首段起点（first_offset=0）
  const segment = (() => {
    const bytes = new Uint8Array(1000);
    new DataView(bytes.buffer).setUint32(0, bytes.length);
    bytes.set(Uint8Array.from("moof", (c) => c.charCodeAt(0)), 4);
    return bytes;
  })();
  // init 自带首段开头的 moof；再补 9 段凑齐 sidx 声明的分段布局。
  const file = concatBytes([init, ...Array.from({ length: 9 }, () => segment)]);
  const entries = parseSegmentIndex(init)!;
  const timeForByte = (offset: number): number => {
    for (const entry of entries) {
      if (offset >= entry.byteStart && offset < entry.byteEnd) {
        return entry.timeStart + ((offset - entry.byteStart) / (entry.byteEnd - entry.byteStart)) * (entry.timeEnd - entry.timeStart);
      }
    }
    return 0;
  };

  let fetchCalls: Array<{ url: string; range: string }>;
  let buffers: RangeSeekSourceBuffer[];
  const videoHint = { time: null as number | null, initBytes: 0 };
  const audioHint = { time: null as number | null, initBytes: 0 };

  function createFakeVideo() {
    return {
      src: "",
      currentTime: 0,
      duration: Number.NaN,
      volume: 1,
      playbackRate: 1,
      paused: true,
      error: null,
      buffered: { length: 0, start: () => 0, end: () => 0 },
      addEventListener: vi.fn(),
      setAttribute: vi.fn(),
      load: vi.fn(),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      disablePictureInPicture: false,
      controls: true,
    };
  }

  beforeEach(() => {
    fetchCalls = [];
    buffers = [];
    RangeSeekSourceBuffer.restartInitBytes = anchor;
    videoHint.time = null;
    videoHint.initBytes = 0;
    audioHint.time = null;
    audioHint.initBytes = 0;
    let bufferIndex = 0;
    vi.stubGlobal("MediaSource", class extends EventTarget {
      readyState = "open";
      duration = Number.NaN;
      sourceBuffers: RangeSeekSourceBuffer[] = [];
      constructor() {
        super();
        queueMicrotask(() => this.dispatchEvent(new Event("sourceopen")));
      }
      addSourceBuffer = () => {
        // loadTracks 固定先建视频轨再建音频轨。
        const buffer = new RangeSeekSourceBuffer(100 / file.length, bufferIndex === 0 ? videoHint : audioHint);
        bufferIndex += 1;
        this.sourceBuffers.push(buffer);
        buffers.push(buffer);
        return buffer;
      };
      endOfStream() {}
      static isTypeSupported() {
        return true;
      }
    });
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const range = String((init?.headers as Record<string, string>).Range ?? "");
      const isAudioTrack = String(_input).includes("audio.m4s");
      fetchCalls.push({ url: isAudioTrack ? "audio-track" : "video-track", range });
      const match = range.match(/bytes=(\d+)-(\d+)/);
      const start = match ? Number(match[1]) : 0;
      const slice = file.slice(start);
      const hint = isAudioTrack ? audioHint : videoHint;
      hint.time = timeForByte(start);
      hint.initBytes = start === 0 ? anchor : 0;
      return {
        ok: true,
        status: 206,
        headers: { get: (name: string) => (name.toLowerCase() === "content-range" ? `bytes ${start}-${slice.length - 1}/${file.length}` : null) },
        body: {
          getReader() {
            let served = false;
            return {
              async read() {
                if (served) return { done: true, value: undefined };
                served = true;
                return { done: false, value: slice };
              },
            };
          },
        },
      } as unknown as Response;
    });
  });

  afterEach(() => {
    RangeSeekSourceBuffer.delayFirstAppendUpdate = false;
    RangeSeekSourceBuffer.restartAppendLengths = [];
    vi.unstubAllGlobals();
    if (originalMediaSource) globalThis.MediaSource = originalMediaSource;
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("seeks inside the buffered range without issuing new fetches", async () => {
    const video = createFakeVideo();
    const player = new DashPlayer({ video: video as unknown as HTMLVideoElement });
    await player.load(stream, 64);
    const fetchCountAfterLoad = fetchCalls.length;
    expect(buffers.length).toBe(2);
    expect(buffers[0]!.buffered.end()).toBeGreaterThan(40);

    player.seek(5);
    expect(video.currentTime).toBe(5);
    expect(fetchCalls.length).toBe(fetchCountAfterLoad);
    player.destroy();
  });

  it("restarts the stream at the sidx-mapped byte offset when seeking outside the buffer", async () => {
    const video = createFakeVideo();
    const player = new DashPlayer({ video: video as unknown as HTMLVideoElement });
    await player.load(stream, 64);
    // 模拟背压下只下载到了 45 秒。
    for (const buffer of buffers) buffer.shrinkTo(45);

    player.seek(50);
    await vi.waitFor(() => {
      // t=50 落在第 5 段（timeStart=50），sidx anchor=200 → 字节 200+5000。
      const last = fetchCalls[fetchCalls.length - 1]!;
      expect(last.range.startsWith(`bytes=${anchor + 5000}-`)).toBe(true);
    });
    await vi.waitFor(() => {
      expect(video.currentTime).toBe(50);
    });
    // 跳出已缓冲范围时，两个 SourceBuffer 的旧数据都会被清空。
    expect(buffers.every((buffer) => buffer.removed.length > 0)).toBe(true);
    player.destroy();
  });

  it("preserves the original init segment when a range response is split across reads", async () => {
    const video = createFakeVideo();
    // The first network read contains the init segment and part of the first
    // media segment; later reads cross a segment boundary.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const range = String((init?.headers as Record<string, string>).Range ?? "");
      const match = range.match(/bytes=(\d+)-(\d+)/);
      const start = match ? Number(match[1]) : 0;
      const slice = file.slice(start);
      let cursor = 0;
      return {
        ok: true,
        status: 206,
        headers: { get: (name: string) => name.toLowerCase() === "content-range" ? `bytes ${start}-${start + slice.length - 1}/${file.length}` : null },
        body: {
          getReader() {
            return {
              async read() {
                if (cursor >= slice.length) return { done: true, value: undefined };
                // Split the first moof header after its size field so the
                // scanner must handle a negative cross-read offset.
                const chunkSize = cursor === 0 ? 202 : 400;
                const part = slice.slice(cursor, cursor + chunkSize);
                cursor += part.length;
                return { done: false, value: part };
              },
            };
          },
        },
      } as unknown as Response;
    });

    const splitPlayer = new DashPlayer({ video: video as unknown as HTMLVideoElement });
    await splitPlayer.load({ ...stream, audio: [] }, 64);
    const splitPipeline = (splitPlayer as unknown as { videoPipeline: { initSegment: ArrayBuffer | null } }).videoPipeline;
    expect(splitPipeline.initSegment?.byteLength).toBe(anchor);
    buffers.at(-1)!.shrinkTo(45);
    splitPlayer.seek(50);

    await vi.waitFor(() => expect(RangeSeekSourceBuffer.restartAppendLengths.length).toBeGreaterThan(0));
    expect(RangeSeekSourceBuffer.restartAppendLengths[0]).toBe(anchor);
    splitPlayer.destroy();
    globalThis.fetch = originalFetch;
  });

  it("waits for an in-flight append before restarting the MSE pipeline", async () => {
    RangeSeekSourceBuffer.delayFirstAppendUpdate = true;
    const errors: string[] = [];
    const video = createFakeVideo();
    const player = new DashPlayer({
      video: video as unknown as HTMLVideoElement,
      onError: (message) => errors.push(message),
    });

    // 单轨测试只隔离 SourceBuffer 重启时序，避免音视频并发请求顺序干扰这个回归。
    await player.load({ ...stream, audio: [] }, 64);
    player.seek(50);

    await vi.waitFor(() => {
      const restarted = fetchCalls.some((call) => call.range.startsWith(`bytes=${anchor + 5000}-`));
      expect(restarted).toBe(true);
    });
    expect(errors).toEqual([]);
    player.destroy();
  });

  it("does not drain a multi-megabyte read past the MSE byte budget", async () => {
    const video = createFakeVideo();
    const chunkSize = 256 * 1024;
    const fileSize = 5 * 1024 * 1024;
    globalThis.fetch = vi.fn(async () => {
      let offset = 0;
      return {
        ok: true,
        status: 206,
        headers: {
          get: (name: string) => name.toLowerCase() === "content-range" ? `bytes 0-${fileSize - 1}/${fileSize}` : null,
        },
        body: {
          getReader() {
            return {
              async read() {
                if (offset >= fileSize) return { done: true, value: undefined };
                const length = Math.min(chunkSize, fileSize - offset);
                const chunk = new Uint8Array(length);
                if (offset === 0) {
                  new DataView(chunk.buffer).setUint32(0, 16);
                  chunk.set(Uint8Array.from("moof", (c) => c.charCodeAt(0)), 4);
                }
                offset += length;
                return { done: false, value: chunk };
              },
            };
          },
        },
      } as unknown as Response;
    });

    const player = new DashPlayer({ video: video as unknown as HTMLVideoElement });
    await player.load({ ...stream, audio: [] }, 64);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(buffers[0]!.appendedBytes).toBeLessThanOrEqual(4 * 1024 * 1024 + chunkSize);
    player.destroy();
  });

  it("snaps the playhead into the buffered range on waiting when it overshoots", async () => {
    const video = createFakeVideo();
    const player = new DashPlayer({ video: video as unknown as HTMLVideoElement });
    await player.load(stream, 64);
    for (const buffer of buffers) buffer.shrinkTo(45);
    const waiting = video.addEventListener.mock.calls.find((call) => call[0] === "waiting")?.[1] as (() => void) | undefined;
    expect(waiting).toBeTypeOf("function");
    video.currentTime = 47.3;
    waiting!();
    expect(video.currentTime).toBeLessThanOrEqual(45);
    expect(video.currentTime).toBeGreaterThanOrEqual(0);
    player.destroy();
  });

  it("keeps fetching after a far seek when the playhead sits past a full MSE budget", async () => {
    const chunkSize = 256 * 1024;
    const fileSize = 12 * 1024 * 1024;
    let fetches = 0;
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      fetches += 1;
      const range = String((init?.headers as Record<string, string> | undefined)?.Range ?? "");
      const match = range.match(/bytes=(\d+)-(\d+)/);
      const start = match ? Number(match[1]) : 0;
      const requestedEnd = match ? Number(match[2]) : start + 3 * 1024 * 1024 - 1;
      const length = Math.max(0, Math.min(requestedEnd - start + 1, fileSize - start, 3 * 1024 * 1024));
      videoHint.time = start === 0 ? 0 : 80;
      videoHint.initBytes = 0;
      let offset = 0;
      return {
        ok: true,
        status: 206,
        headers: {
          get: (name: string) => name.toLowerCase() === "content-range" ? `bytes ${start}-${start + Math.max(length, 1) - 1}/${fileSize}` : null,
        },
        body: {
          getReader() {
            return {
              async read() {
                if (offset >= length) return { done: true, value: undefined };
                const size = Math.min(chunkSize, length - offset);
                const chunk = new Uint8Array(size);
                if (offset === 0) {
                  new DataView(chunk.buffer).setUint32(0, 16);
                  chunk.set(Uint8Array.from("moof", (c) => c.charCodeAt(0)), 4);
                }
                offset += size;
                return { done: false, value: chunk };
              },
            };
          },
        },
      } as unknown as Response;
    });

    const video = createFakeVideo();
    const player = new DashPlayer({ video: video as unknown as HTMLVideoElement });
    await player.load({ ...stream, audio: [], durationMs: 200_000 }, 64);
    const fetchesAfterLoad = fetches;
    for (const buffer of buffers) buffer.shrinkTo(20);
    player.seek(80);
    await vi.waitFor(() => expect(fetches).toBeGreaterThan(fetchesAfterLoad));
    await vi.waitFor(() => expect(buffers.at(-1)!.buffered.length).toBeGreaterThan(0));
    const fetchesAfterSeekStart = fetches;
    const end = buffers.at(-1)!.buffered.end();
    const start = buffers.at(-1)!.buffered.start();
    video.currentTime = end + 2.3;
    const waiting = video.addEventListener.mock.calls.find((call) => call[0] === "waiting")?.[1] as (() => void) | undefined;
    waiting?.();
    expect(video.currentTime).toBeLessThanOrEqual(end);
    expect(video.currentTime).toBeGreaterThanOrEqual(start);
    const pipeline = (player as unknown as { videoPipeline: { appendedBytes: number } }).videoPipeline;
    pipeline.appendedBytes = 5 * 1024 * 1024;
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(fetches).toBeGreaterThan(fetchesAfterSeekStart);
    player.destroy();
  });
});
