/**
 * BEID DASH MSE 播放器 — 用 MediaSource Extensions 把 B 站 DASH 视频/音频流
 * 拼接给 HTML5 <video> 元素，实现完全原生的播放控制（对齐 FocuBili 的
 * "自建播放管线 + 自绘控制层"，绝不嵌官方 iframe，保证只有一套控制界面）。
 *
 * 浏览器里 B 站 CDN 对 m4s 有 Referer 防盗链（直连 403），本地开发/预览时把
 * 媒体请求改写到 /bili-media 代理（由 Vite 插件转发并补齐 Referer/UA）。
 *
 * 加载策略：
 * - 视频/音频各自独立 SourceBuffer，fetch 流式读取、分块追加，首个分片到达
 *   即可起播（load() resolve），后续数据在后台继续下载。
 * - 背压 + 淘汰：下载远超播放进度时暂停拉流；已播放很久的旧数据定期
 *   remove() 释放 SourceBuffer 配额，避免 QuotaExceededError。
 * - 跳转未缓冲区域：seek() 检测目标时间不在已缓冲区间时，解析 m4s 里的
 *   sidx 分段索引（缺失时按码率线性估算），掐断在途下载、清空 SourceBuffer、
 *   重新追加 init 段后从目标分段的字节偏移重启拉流——顺序下载永远到不了
 *   远处时间点的问题由此根治。
 */

import type { DashStream, DashTrack } from "./playurlService";
import { trackSourceCandidates } from "./playbackSourcePolicy";
import {
  chunkTail,
  concatBytes,
  findFirstMoofOffset,
  mapTimeToSegmentByte,
  parseSegmentIndex,
  type SegmentIndexEntry,
} from "./mp4Boxes";

export interface DashPlayerOptions {
  video: HTMLVideoElement;
  onTimeUpdate?: (seconds: number) => void;
  onDurationChange?: (seconds: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onError?: (message: string) => void;
}

/** 环境是否具备 MSE + 本地媒体代理（决定浏览器模式能否直连播放）。 */
export function isMsePlaybackSupported(): boolean {
  return typeof window !== "undefined" &&
    typeof MediaSource !== "undefined" &&
    MediaSource.isTypeSupported('video/mp4; codecs="avc1.64001E"') &&
    MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"');
}

/** 本地开发/预览走 /bili-media 代理绕过防盗链；其他环境直连。 */
export function proxiedMediaUrl(url: string): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return `/bili-media?u=${encodeURIComponent(url)}`;
    }
  }
  return url;
}

/** 缓冲超前播放多少秒后暂停拉流（背压阈值）。 */
const BUFFER_AHEAD_LIMIT_SECONDS = 30;
/** 起播前至少预缓冲的秒数（低于该值不启用时间维背压）。 */
const BUFFER_MIN_PREROLL_SECONDS = 45;
/** 已播放多久后开始淘汰旧数据。 */
const EVICT_BEHIND_SECONDS = 90;
/** 单次 appendBuffer 的最大块：超大块在配额紧张的 MSE 里会直接被拒。 */
const MAX_APPEND_CHUNK_BYTES = 256 * 1024;
/** 字节维兜底上限：Chromium 的 MSE 配额动态变化（内存紧张时可低至几 MB），
 *  4MB 配合 45 秒预缓冲在任何配额下都能存活，播放中靠淘汰腾挪空间。 */
const APPEND_BYTE_CAP = 4 * 1024 * 1024;
/** MSE 模式的轨道码率护栏：登录态 playurl 会返回 4K 蓝光轨（5Mbps+），
 *  高码流在浏览器里既费流量又会在几秒内塞爆 MSE 配额，这里只允许 ≤1.2Mbps。 */
const MAX_TRACK_BANDWIDTH = 1_200_000;

interface BufferPipeline {
  buffer: SourceBuffer;
  /** 本轨的全部候选 URL（主 + 备用），跳转重启时复用。 */
  sources: string[];
  queue: ArrayBuffer[];
  pumping: boolean;
  finished: boolean;
  firstChunkSettled: boolean;
  firstChunk: Promise<void>;
  resolveFirstChunk: () => void;
  rejectFirstChunk: (error: Error) => void;
  appendedBytes: number;
  /** 从文件头到首个 moof 为止的 init 段（ftyp+moov+sidx），跳转重启时先重新追加。 */
  initSegment: ArrayBuffer | null;
  /** sidx 解析出的分段索引；缺失时跳转回退到码率线性估算。 */
  segmentIndex: SegmentIndexEntry[] | null;
  /** 整个文件的大小（从 Content-Range 获得），线性估算用。 */
  totalBytes: number | null;
  /** 已对齐到 moof 分段边界（可以安全向 SourceBuffer 追加）。 */
  alignedToSegment: boolean;
  /** 本次拉流从文件头开始（正在顺带捕获 init 段）。 */
  startedFromZero: boolean;
  /** 捕获 init 段过程中尚未见到 moof 的前缀块。 */
  prefixChunks: Uint8Array[];
  /** 上一块的最后 7 字节，兜住 box 头跨块的情况。 */
  scanTail: Uint8Array;
  /** 在途分块下载的取消器。 */
  fetchController: AbortController | null;
  /** 连续配额失败次数：成功 append 后清零，超过上限按致命错误处理。 */
  quotaRetries: number;
}

export class DashPlayer {
  private readonly video: HTMLVideoElement;
  private readonly options: DashPlayerOptions;
  private mediaSource: MediaSource | null = null;
  private objectUrl: string | null = null;
  private videoPipeline: BufferPipeline | null = null;
  private audioPipeline: BufferPipeline | null = null;
  private loadAborted = false;
  /** 每次跳转重启 +1；旧拉流循环在 await 点发现代际落后即退出。 */
  private generation = 0;
  private pumpWakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: DashPlayerOptions) {
    this.options = options;
    this.video = options.video;
    this.video.controls = false;
    this.video.disablePictureInPicture = true;
    this.video.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback noplaybackrate');
    this.attachVideoEvents();
  }

  /** 绑定好的事件处理器：destroy 时逐一移除，避免复用的 <video> 上监听器越积越多。 */
  private readonly handleTimeUpdate = () => {
    this.options.onTimeUpdate?.(this.video.currentTime);
  };
  private readonly handleDurationChange = () => {
    const duration = this.video.duration;
    if (Number.isFinite(duration) && duration > 0) {
      this.options.onDurationChange?.(duration);
    }
  };
  private readonly handlePlay = () => this.options.onPlay?.();
  private readonly handlePause = () => this.options.onPause?.();
  private readonly handleError = () => {
    if (this.loadAborted) return;
    this.options.onError?.(this.video.error?.message ?? "未知播放错误");
  };
  private readonly handleWaiting = () => {
    this.snapPlayheadToBuffer();
    this.schedulePumpWake();
  };
  private readonly handleStalled = () => {
    this.snapPlayheadToBuffer();
    this.schedulePumpWake();
  };

  private attachVideoEvents(): void {
    const on = (type: string, handler: EventListener) => {
      // 测试桩可能只提供 addEventListener；可选调用保证兼容。
      (this.video.addEventListener as typeof this.video.addEventListener | undefined)?.call(this.video, type, handler);
    };
    on("timeupdate", this.handleTimeUpdate);
    on("durationchange", this.handleDurationChange);
    on("play", this.handlePlay);
    on("pause", this.handlePause);
    on("error", this.handleError);
    on("waiting", this.handleWaiting);
    on("stalled", this.handleStalled);
  }

  /**
   * 加载 DASH 流。视频轨道优先选择浏览器兼容性最好的 avc1（H.264）编码，
   * 并在清晰度上取不超过期望值的最高档。首个分片成功追加后即返回，
   * 剩余数据在后台按背压继续下载。
   */
  async load(stream: DashStream, preferredQuality?: number): Promise<{ videoTrack: DashTrack; audioTrack: DashTrack | null }> {
    const videoTrack = pickVideoTrack(stream, preferredQuality);
    const audioTrack = stream.audio[0] ?? null;
    await this.loadTracks(videoTrack, audioTrack, stream.durationMs);
    return { videoTrack, audioTrack };
  }

  async loadTracks(videoTrack: DashTrack, audioTrack: DashTrack | null, durationMs: number): Promise<void> {
    this.loadAborted = false;
    this.mediaSource = new MediaSource();
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    this.video.src = this.objectUrl;
    this.video.load();
    await new Promise<void>((resolve) => {
      if (!this.mediaSource) {
        resolve();
        return;
      }
      this.mediaSource.addEventListener("sourceopen", () => resolve(), { once: true });
    });
    if (this.loadAborted || !this.mediaSource) return;

    if (durationMs > 0 && Number.isFinite(durationMs)) {
      try {
        this.mediaSource.duration = durationMs / 1000;
        this.options.onDurationChange?.(durationMs / 1000);
      } catch {
        // duration 设置失败交给媒体段自动推导。
      }
    }

    const videoCodecs = videoTrack.codecs || "avc1.64001E";
    const audioCodecs = audioTrack?.codecs || "mp4a.40.2";
    this.videoPipeline = this.createPipeline(`video/mp4; codecs="${videoCodecs}"`, trackSourceCandidates(videoTrack));
    this.audioPipeline = audioTrack ? this.createPipeline(`audio/mp4; codecs="${audioCodecs}"`, trackSourceCandidates(audioTrack)) : null;
    // 后台流式下载（带背压与淘汰），失败经 onError 上报；这里只等首个分片就绪。
    this.startStream(this.videoPipeline, 0, ++this.generation);
    if (this.audioPipeline) this.startStream(this.audioPipeline, 0, this.generation);
    await Promise.all([
      this.videoPipeline.firstChunk,
      this.audioPipeline ? this.audioPipeline.firstChunk : Promise.resolve(),
    ]);
    this.snapPlayheadToBuffer();
  }

  private createPipeline(mimeType: string, sources: string[]): BufferPipeline {
    if (!this.mediaSource) throw new Error("MediaSource 尚未就绪");
    if (!MediaSource.isTypeSupported(mimeType)) {
      throw new Error(`MIME 不支持：${mimeType}`);
    }
    const buffer = this.mediaSource.addSourceBuffer(mimeType);
    buffer.addEventListener("error", () => {
      if (!this.loadAborted) {
        this.options.onError?.(`媒体段解析失败（${mimeType}），可能是编码不受支持`);
      }
    });
    let resolveFirstChunk: () => void = () => undefined;
    let rejectFirstChunk: (error: Error) => void = () => undefined;
    const firstChunk = new Promise<void>((resolve, reject) => {
      resolveFirstChunk = resolve;
      rejectFirstChunk = reject;
    });
    return {
      buffer,
      sources,
      queue: [],
      pumping: false,
      finished: false,
      firstChunkSettled: false,
      firstChunk,
      resolveFirstChunk,
      rejectFirstChunk,
      appendedBytes: 0,
      initSegment: null,
      segmentIndex: null,
      totalBytes: null,
      alignedToSegment: false,
      startedFromZero: false,
      prefixChunks: [],
      scanTail: new Uint8Array(0),
      fetchController: null,
      quotaRetries: 0,
    };
  }

  private startStream(pipeline: BufferPipeline, startOffset: number, generation: number): void {
    pipeline.startedFromZero = startOffset <= 0;
    // 一律先扫描定位首个 moof：从文件头开始时顺带捕获 init 段 + sidx 分段索引
    // （前缀字节本身就是合法流，扫描期间照常追加）；中途起播的字节在边界前不可追加。
    pipeline.alignedToSegment = false;
    void this.runStream(pipeline, startOffset, generation);
  }

  /**
   * 分块 Range 下载并追加。每块读完即结束连接，避免长时间挂起的流被 CDN 掐断；
   * 块间检查背压，缓冲超前播放太多时等播放追赶。fMP4 的 SourceBuffer 按
   * 连续字节流解析，跨块切在 box 中间没有问题。
   */
  private async runStream(pipeline: BufferPipeline, startOffset: number, generation: number): Promise<void> {
    const stale = () => this.loadAborted || generation !== this.generation;
    const chunkSize = 3 * 1024 * 1024;
    for (let index = 0; index < pipeline.sources.length; index += 1) {
      try {
        let offset = startOffset;
        let total: number | null = pipeline.totalBytes;
        for (;;) {
          if (stale()) return;
          await this.waitForPlaybackRoom(generation);
          if (stale()) return;
          const controller = new AbortController();
          pipeline.fetchController = controller;
          const response = await fetch(proxiedMediaUrl(pipeline.sources[index]!), {
            headers: { Range: `bytes=${offset}-${offset + chunkSize - 1}`, Accept: "*/*" },
            credentials: "omit",
            signal: controller.signal,
          });
          if (response.status === 416) break; // 越界即已完成
          if (!response.ok || !response.body) {
            throw new Error(`媒体流请求失败：HTTP ${response.status}`);
          }
          const contentRange = response.headers.get("content-range");
          if (contentRange) {
            // Content-Range 形如 "bytes 0-1023/123456"，取斜杠后的总长度。
            const slashIndex = contentRange.lastIndexOf("/");
            if (slashIndex >= 0) {
              const parsedTotal = Number.parseInt(contentRange.slice(slashIndex + 1).trim(), 10);
              if (Number.isFinite(parsedTotal) && parsedTotal > 0) {
                total = parsedTotal;
                pipeline.totalBytes = parsedTotal;
              }
            }
          }
          if (response.status === 200 && offset > 0) {
            throw new Error("CDN 不支持断点续传，无法继续分块下载");
          }
          const reader = response.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (stale()) {
              void reader.cancel().catch(() => undefined);
              return;
            }
            if (value && value.byteLength > 0) {
              offset += value.byteLength;
              this.ingestChunk(pipeline, value);
            }
          }
          if (total != null && offset >= total) break;
          if (total == null && response.status === 200) break; // 无法获知总长时按整段处理
        }
        pipeline.finished = true;
        // EOF without a media segment (e.g. linear offset landed past the last
        // moof) would leave firstChunk hanging forever and freeze restartAt.
        if (!pipeline.firstChunkSettled) {
          pipeline.firstChunkSettled = true;
          pipeline.rejectFirstChunk(new Error("目标位置没有可播放的媒体分片"));
        }
        return;
      } catch (error) {
        if (stale()) return;
        const isLastSource = index === pipeline.sources.length - 1;
        if (isLastSource) {
          if (!pipeline.firstChunkSettled) {
            pipeline.firstChunkSettled = true;
            pipeline.rejectFirstChunk(error instanceof Error ? error : new Error("媒体流加载失败"));
          }
          this.options.onError?.(error instanceof Error ? error.message : "媒体流加载失败");
          return;
        }
        pipeline.queue = [];
        pipeline.prefixChunks = [];
        pipeline.scanTail = new Uint8Array(0);
        pipeline.alignedToSegment = false;
        pipeline.startedFromZero = startOffset <= 0;
      }
    }
  }

  /**
   * 消费一块下载字节：未对齐到 moof 边界时先扫描定位（顺带在从文件头开始的
   * 拉流里捕获 init 段 + sidx 分段索引），对齐后才允许进入追加队列。
   */
  private ingestChunk(pipeline: BufferPipeline, chunk: Uint8Array): void {
    if (!pipeline.alignedToSegment) {
      const hit = findFirstMoofOffset(chunk, pipeline.scanTail);
      pipeline.scanTail = chunkTail(chunk);
      if (hit == null) {
        // 从文件头开始时，init 段之前的字节本身就是合法流，照常追加并留存前缀。
        // 前缀超过 2MB 仍未见 moof 视为异常流，放弃捕获（重启时退回整段顺序拉流）。
        if (pipeline.startedFromZero) {
          const stashed = pipeline.prefixChunks.reduce((total, part) => total + part.length, 0);
          if (stashed < 2 * 1024 * 1024) pipeline.prefixChunks.push(chunk);
          this.enqueueChunk(pipeline, copyForAppend(chunk));
        }
        return;
      }
      if (pipeline.startedFromZero) {
        if (hit < 0) {
          // moof 的头跨过了两个 reader chunk：此前的 prefixChunks 已经
          // 按连续字节排队，当前 chunk 也必须完整接上，不能用负偏移
          // 直接 subarray(0, hit) 把当前块尾部误裁掉。
          const prefix = concatBytes(pipeline.prefixChunks);
          const moofOffset = Math.max(0, prefix.length + hit);
          const init = prefix.subarray(0, moofOffset).slice();
          pipeline.initSegment = init.buffer;
          pipeline.segmentIndex = parseSegmentIndex(init);
          pipeline.prefixChunks = [];
          if (chunk.byteLength > 0) this.enqueueChunk(pipeline, copyForAppend(chunk));
          pipeline.alignedToSegment = true;
          this.settleFirstChunk(pipeline);
          return;
        }
        const head = hit > 0 ? chunk.subarray(0, hit) : new Uint8Array(0);
        pipeline.prefixChunks.push(head);
        const init = concatBytes(pipeline.prefixChunks);
        pipeline.initSegment = trimInitSegment(init, hit < 0 ? -hit : 0);
        pipeline.segmentIndex = parseSegmentIndex(new Uint8Array(pipeline.initSegment));
        pipeline.prefixChunks = [];
        // init 段字节同样是流的开头，必须照常进入 SourceBuffer（缺了它
        // 首个 moof 分片会触发 CHUNK_DEMUXER_ERROR_APPEND_FAILED）。
        if (head.byteLength > 0) this.enqueueChunk(pipeline, copyForAppend(head));
        const rest = hit > 0 ? chunk.subarray(hit) : chunk;
        if (rest.byteLength > 0) this.enqueueChunk(pipeline, copyForAppend(rest));
        // 首个 moof 之后的网络读块已经属于连续媒体流；继续扫描会把
        // 后续分段之前的 mdat 尾部误当成 initSegment，远跳重启时就会
        // 追加非法 BMFF 字节并触发 CHUNK_DEMUXER_ERROR_APPEND_FAILED。
        pipeline.alignedToSegment = true;
        this.settleFirstChunk(pipeline);
        return;
      }
      // 中途起播：hit < 0 说明 moof 头横跨在上一块（已丢弃）里，放弃这块等下一个 moof。
      if (hit < 0) return;
      pipeline.alignedToSegment = true;
      const rest = chunk.subarray(hit);
      if (rest.byteLength > 0) this.enqueueChunk(pipeline, copyForAppend(rest));
      this.settleFirstChunk(pipeline);
      return;
    }
    this.enqueueChunk(pipeline, copyForAppend(chunk));
    this.settleFirstChunk(pipeline);
  }

  private settleFirstChunk(pipeline: BufferPipeline): void {
    if (!pipeline.firstChunkSettled) {
      pipeline.firstChunkSettled = true;
      pipeline.resolveFirstChunk();
    }
  }

  /**
   * 缓冲超前播放过多时挂起，直到播放推进腾出空间。
   * 双重上限：时间维（buffered.end - currentTime）与字节维（累计追加量），
   * 任一超限即暂停 —— 时间维依赖 SourceBuffer 解析出的 buffered 范围，
   * 若解析异常则由字节维兜底，确保不会无节制地往 MSE 里塞数据。
   */
  private async waitForPlaybackRoom(generation: number): Promise<void> {
    for (;;) {
      if (this.loadAborted || generation !== this.generation) return;
      if (this.isPlayheadOutsideBuffer()) {
        this.snapPlayheadToBuffer();
        this.evictPlayedData(true);
        return;
      }
      if (this.totalAppendedBytes() > APPEND_BYTE_CAP && !this.evictPlayedData(true)) {
        // 字节超限且无可淘汰数据（还没怎么播放），等待播放推进。
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      const bufferedEnd = this.minimumBufferedEnd();
      if (bufferedEnd == null) return;
      const neededAhead = this.video.currentTime < 1 ? BUFFER_MIN_PREROLL_SECONDS : BUFFER_AHEAD_LIMIT_SECONDS;
      if (bufferedEnd - this.video.currentTime < neededAhead) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private totalAppendedBytes(): number {
    return (this.videoPipeline?.appendedBytes ?? 0) + (this.audioPipeline?.appendedBytes ?? 0);
  }

  /** 淘汰已播放过很久的旧缓冲，返回是否执行了淘汰。 */
  private evictPlayedData(aggressive = false): boolean {
    const currentTime = this.video.currentTime;
    if (!aggressive && currentTime < EVICT_BEHIND_SECONDS) return false;
    let evicted = false;
    for (const pipeline of [this.videoPipeline, this.audioPipeline]) {
      if (!pipeline || pipeline.buffer.updating) continue;
      const buffered = pipeline.buffer.buffered;
      if (buffered.length === 0) continue;
      const start = buffered.start(0);
      const end = buffered.end(buffered.length - 1);
      const keepFrom = currentTime - (aggressive ? 8 : 30);
      if (start < keepFrom - 1) {
        try {
          pipeline.buffer.remove(start, keepFrom);
          // 按淘汰掉的时间占比折减字节记账，保持字节上限判断的准确性。
          const totalSpan = end - start;
          const removedSpan = Math.min(keepFrom, end) - start;
          if (totalSpan > 0) {
            pipeline.appendedBytes = Math.max(0, pipeline.appendedBytes - Math.round(pipeline.appendedBytes * (removedSpan / totalSpan)));
          }
          evicted = true;
        } catch {
          // 淘汰失败不影响播放，下一轮再试。
        }
      }
    }
    return evicted;
  }

  /** 音视频两条轨里进度最靠前可用于播放的位置；尚未缓冲时返回 null。 */
  /** B 站 fMP4 常从非 0 时间戳起播；播放头停在 0 会一直黑屏。 */
  private snapPlayheadToBuffer(): void {
    const starts: number[] = [];
    const ends: number[] = [];
    for (const pipeline of [this.videoPipeline, this.audioPipeline]) {
      if (!pipeline) continue;
      const buffered = pipeline.buffer.buffered;
      if (buffered.length === 0) return;
      starts.push(buffered.start(0));
      ends.push(buffered.end(buffered.length - 1));
    }
    if (starts.length === 0 || ends.length === 0) return;
    const start = Math.max(...starts);
    const end = Math.min(...ends);
    if (!(end > start)) return;
    const time = this.video.currentTime;
    if (time < start - 0.05) {
      this.video.currentTime = start;
      return;
    }
    // 只在媒体中段做 0.1s 的回拨顺滑；片尾（缓冲末端已贴近媒体时长）绝不回拨：
    // 音频轨末端通常比视频短几十毫秒，回拨会在"到达末端→waiting→回拨"里
    // 死循环，ended 永不触发，完成判定/连播/专注打卡全部失效。
    const mediaDuration = this.video.duration;
    const nearMediaEnd = Number.isFinite(mediaDuration) && mediaDuration > 0 && end >= mediaDuration - 0.5;
    if (time > end - 0.05 && !nearMediaEnd) {
      this.video.currentTime = Math.max(start, end - 0.1);
    }
  }

  /** 缓冲已建立但播放头落在范围外：这是跳转后卡死的典型形态，必须继续拉流。 */
  private isPlayheadOutsideBuffer(): boolean {
    const pipelines = [this.videoPipeline, this.audioPipeline].filter((p): p is BufferPipeline => p != null);
    if (pipelines.length === 0) return false;
    if (pipelines.some((pipeline) => pipeline.buffer.buffered.length === 0)) return false;
    return !this.isTimeBuffered(this.video.currentTime);
  }

  private minimumBufferedEnd(): number | null {
    const pipelines = [this.videoPipeline, this.audioPipeline].filter((p): p is BufferPipeline => p != null);
    if (pipelines.some((pipeline) => pipeline.buffer.buffered.length === 0)) return null;
    const ends: number[] = [];
    for (const pipeline of pipelines) {
      const buffered = pipeline.buffer.buffered;
      ends.push(buffered.end(buffered.length - 1));
    }
    return ends.length > 0 ? Math.min(...ends) : null;
  }

  private enqueueChunk(pipeline: BufferPipeline, chunk: ArrayBuffer): void {
    // 超大块切成 ≤256KB 的小块追加，降低单次 append 被配额拒绝的风险。
    if (chunk.byteLength <= MAX_APPEND_CHUNK_BYTES) {
      pipeline.queue.push(chunk);
    } else {
      for (let offset = 0; offset < chunk.byteLength; offset += MAX_APPEND_CHUNK_BYTES) {
        pipeline.queue.push(chunk.slice(offset, Math.min(offset + MAX_APPEND_CHUNK_BYTES, chunk.byteLength)));
      }
    }
    this.pumpPipeline(pipeline);
  }

  private pumpPipeline(pipeline: BufferPipeline): void {
    if (pipeline.pumping || pipeline.queue.length === 0) return;
    if (pipeline.buffer.updating) return;
    if (!this.hasAppendRoom(pipeline)) {
      this.schedulePumpWake();
      return;
    }
    const chunk = pipeline.queue.shift();
    if (!chunk) return;
    pipeline.pumping = true;
    const onDone = () => {
      pipeline.pumping = false;
      this.pumpPipeline(pipeline);
      this.finishStream();
    };
    pipeline.buffer.addEventListener("updateend", onDone, { once: true });
    try {
      pipeline.buffer.appendBuffer(chunk);
      pipeline.appendedBytes += chunk.byteLength;
      pipeline.quotaRetries = 0;
    } catch (error) {
      pipeline.buffer.removeEventListener("updateend", onDone);
      pipeline.pumping = false;
      const isQuota = error instanceof DOMException && error.name === "QuotaExceededError";
      if (isQuota && pipeline.quotaRetries < 3) {
        // 配额类失败先淘汰已播放数据再重试当前块，而不是整管报废：
        // 低内存设备/后台标签页背压变慢时最容易触发，且通常一清就够。
        pipeline.quotaRetries += 1;
        pipeline.queue.unshift(chunk);
        this.evictPlayedData(true);
        this.schedulePumpWake();
        return;
      }
      if (!pipeline.firstChunkSettled) {
        pipeline.firstChunkSettled = true;
        pipeline.rejectFirstChunk(new Error(`媒体数据追加失败：${String(error)}`));
      }
      if (!this.loadAborted) {
        this.options.onError?.(`媒体数据追加失败：${String(error)}`);
      }
    }
  }

  /**
   * appendBuffer 的 updateend 回调会连续排空队列，不能只在下一次网络请求前
   * 做背压；否则一个 3MB Range 响应会绕过配额检查一次性灌满 MSE。
   */
  private hasAppendRoom(pipeline: BufferPipeline): boolean {
    if (this.isPlayheadOutsideBuffer()) {
      this.evictPlayedData(true);
      return true;
    }
    const buffered = pipeline.buffer.buffered;
    const ahead = buffered.length > 0 ? buffered.end(buffered.length - 1) : null;
    const tooManyBytes = this.totalAppendedBytes() > APPEND_BYTE_CAP;
    const tooFarAhead = ahead != null && ahead - this.video.currentTime >= BUFFER_AHEAD_LIMIT_SECONDS;
    if (!tooManyBytes && !tooFarAhead) return true;
    this.evictPlayedData(true);
    return this.isPlayheadOutsideBuffer();
  }

  private schedulePumpWake(): void {
    if (this.pumpWakeTimer !== null) return;
    this.pumpWakeTimer = setTimeout(() => {
      this.pumpWakeTimer = null;
      for (const pipeline of [this.videoPipeline, this.audioPipeline]) {
        if (pipeline) this.pumpPipeline(pipeline);
      }
    }, 250);
  }

  private finishStream(): void {
    if (!this.mediaSource || this.mediaSource.readyState !== "open") return;
    const videoDone = this.videoPipeline?.finished && this.videoPipeline.queue.length === 0 && !this.videoPipeline.pumping;
    const audioDone = !this.audioPipeline || (this.audioPipeline.finished && this.audioPipeline.queue.length === 0 && !this.audioPipeline.pumping);
    if (videoDone && audioDone) {
      try {
        this.mediaSource.endOfStream();
      } catch {
        // 缓冲未对齐时忽略，视频仍可播放。
      }
    }
  }

  play(): Promise<void> {
    return this.video.play();
  }

  pause(): void {
    this.video.pause();
  }

  /** 目标时间两轨都已缓冲时直接挪播放头，否则重启拉流到目标分段。 */
  seek(time: number): void {
    const target = Math.max(0, time);
    if (this.isTimeBuffered(target)) {
      try {
        this.video.currentTime = target;
      } catch {
        // 播放头设置失败（罕见竞态）时走重启路径兜底。
      }
      return;
    }
    void this.restartAt(target);
  }

  private isTimeBuffered(target: number): boolean {
    const pipelines = [this.videoPipeline, this.audioPipeline].filter((p): p is BufferPipeline => p != null);
    if (pipelines.length === 0) return false;
    return pipelines.every((pipeline) => {
      const buffered = pipeline.buffer.buffered;
      for (let i = 0; i < buffered.length; i += 1) {
        if (target >= buffered.start(i) - 0.5 && target <= buffered.end(i) + 0.5) return true;
      }
      return false;
    });
  }

  /** 把两轨的拉流切换到覆盖 target 时间的分段：清空缓冲、重放 init 段、从映射字节偏移重启下载。 */
  private async restartAt(target: number): Promise<void> {
    const generation = ++this.generation;
    const pipelines = [this.videoPipeline, this.audioPipeline].filter((p): p is BufferPipeline => p != null);
    if (pipelines.length === 0) return;
    const stale = () => this.loadAborted || generation !== this.generation;
    const wasPlaying = !this.video.paused && !this.video.ended;
    this.video.pause();
    for (const pipeline of pipelines) pipeline.fetchController?.abort();
    try {
      for (const pipeline of pipelines) {
        // 丢弃尚未追加的数据，但保留 pumping 状态直到旧 append 发出
        // updateend；否则新一代 init 段可能与旧 SourceBuffer 更新交错。
        pipeline.queue = [];
        await this.suspendBuffer(pipeline);
        if (stale()) return;
        this.resetPipelineForRestart(pipeline);
      }
      for (const pipeline of pipelines) {
        if (!pipeline.initSegment) continue;
        await this.appendAndWait(pipeline, pipeline.initSegment);
        if (stale()) return;
      }
      for (const pipeline of pipelines) {
        this.startStream(pipeline, this.resolveByteOffset(pipeline, target), generation);
      }
      const firstChunkTimeout = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error("跳转超时：未收到媒体分片")), 15000);
        void Promise.all(pipelines.map((pipeline) => pipeline.firstChunk)).finally(() => clearTimeout(timer));
      });
      await Promise.race([Promise.all(pipelines.map((pipeline) => pipeline.firstChunk)), firstChunkTimeout]);
      if (stale()) return;
      const start = Math.max(...pipelines.map((pipeline) => pipeline.buffer.buffered.length > 0 ? pipeline.buffer.buffered.start(0) : target));
      const end = Math.min(...pipelines.map((pipeline) => pipeline.buffer.buffered.length > 0 ? pipeline.buffer.buffered.end(pipeline.buffer.buffered.length - 1) : target));
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        this.video.currentTime = Math.min(Math.max(target, start), Math.max(start, end - 0.1));
      } else {
        this.video.currentTime = target;
      }
      if (wasPlaying) void this.video.play().catch(() => undefined);
    } catch (error) {
      if (stale()) return;
      this.options.onError?.(`跳转失败：${error instanceof Error ? error.message : "媒体流切换异常"}`);
    }
  }

  /** 跳转重启前的管线状态复位：旧 firstChunk 兑现掉避免 load() 永远悬挂，字节记账归零。 */
  private resetPipelineForRestart(pipeline: BufferPipeline): void {
    pipeline.resolveFirstChunk();
    let resolveFirstChunk: () => void = () => undefined;
    let rejectFirstChunk: (error: Error) => void = () => undefined;
    const firstChunk = new Promise<void>((resolve, reject) => {
      resolveFirstChunk = resolve;
      rejectFirstChunk = reject;
    });
    pipeline.queue = [];
    pipeline.pumping = false;
    pipeline.finished = false;
    pipeline.firstChunkSettled = false;
    pipeline.firstChunk = firstChunk;
    pipeline.resolveFirstChunk = resolveFirstChunk;
    pipeline.rejectFirstChunk = rejectFirstChunk;
    pipeline.appendedBytes = 0;
    pipeline.prefixChunks = [];
    pipeline.scanTail = new Uint8Array(0);
    pipeline.fetchController = null;
  }

  /** 掐断在途追加并清空 SourceBuffer 已缓冲数据，等 updateend 后才允许新追加。 */
  private async suspendBuffer(pipeline: BufferPipeline): Promise<void> {
    const { buffer } = pipeline;
    const wasUpdating = buffer.updating;
    let abortUpdate: Promise<void> | null = null;
    if (wasUpdating) {
      abortUpdate = new Promise<void>((resolve) => {
        buffer.addEventListener("updateend", () => resolve(), { once: true });
      });
    }
    try {
      buffer.abort();
    } catch {
      // 非 open 态或无在途更新时 abort 可能抛错，忽略。
    }
    if (abortUpdate) await abortUpdate;
    const buffered = buffer.buffered;
    const end = buffered.length > 0 ? buffered.end(buffered.length - 1) + 1 : 0;
    if (end > 0) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        buffer.addEventListener("updateend", done, { once: true });
        try {
          buffer.remove(0, end);
        } catch {
          buffer.removeEventListener("updateend", done);
          resolve();
        }
      });
    }
    pipeline.queue = [];
    pipeline.pumping = false;
  }

  private async appendAndWait(pipeline: BufferPipeline, bytes: ArrayBuffer): Promise<void> {
    await new Promise<void>((resolve) => {
      const { buffer } = pipeline;
      const done = () => resolve();
      buffer.addEventListener("updateend", done, { once: true });
      try {
        buffer.appendBuffer(bytes);
        pipeline.appendedBytes += bytes.byteLength;
      } catch (error) {
        buffer.removeEventListener("updateend", done);
        throw error;
      }
    });
  }

  /** 时间 → 字节偏移：优先 sidx 分段索引，缺失时按总大小/总时长线性估算。 */
  private resolveByteOffset(pipeline: BufferPipeline, target: number): number {
    if (pipeline.segmentIndex) {
      const byte = mapTimeToSegmentByte(pipeline.segmentIndex, target);
      if (byte != null) return byte;
    }
    const duration = this.getDuration();
    if (pipeline.totalBytes && duration > 0) {
      return Math.min(Math.max(0, Math.floor(pipeline.totalBytes * (target / duration))), Math.max(0, pipeline.totalBytes - 1));
    }
    return 0;
  }

  setVolume(volume: number): void {
    this.video.volume = Math.max(0, Math.min(1, volume));
  }

  setPlaybackRate(rate: number): void {
    this.video.playbackRate = Math.max(0.25, Math.min(4, rate));
  }

  getCurrentTime(): number {
    return this.video.currentTime;
  }

  getDuration(): number {
    const duration = this.video.duration;
    return Number.isFinite(duration) ? duration : 0;
  }

  destroy(): void {
    this.loadAborted = true;
    this.generation += 1;
    if (this.pumpWakeTimer !== null) {
      clearTimeout(this.pumpWakeTimer);
      this.pumpWakeTimer = null;
    }
    const off = (type: string, handler: EventListener) => {
      const removable = this.video.removeEventListener as typeof this.video.removeEventListener | undefined;
      if (typeof removable === "function") {
        removable.call(this.video, type, handler);
      }
    };
    off("timeupdate", this.handleTimeUpdate);
    off("durationchange", this.handleDurationChange);
    off("play", this.handlePlay);
    off("pause", this.handlePause);
    off("error", this.handleError);
    off("waiting", this.handleWaiting);
    off("stalled", this.handleStalled);
    this.videoPipeline?.fetchController?.abort();
    this.audioPipeline?.fetchController?.abort();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.mediaSource = null;
    this.videoPipeline = null;
    this.audioPipeline = null;
    // 注意：不清除 video.src —— 元素被多个 player 实例复用（如清晰度切换），
    // removeAttribute+load() 会把元素打回 NETWORK_EMPTY 残留态，导致后续
    // 实例设置新 src 后永远无法进入就绪。新一次 loadTracks 会直接覆盖 src。
  }
}

/** moof 头起始于上一块尾巴时，init 段需要剪掉尾巴里多带的字节。 */
function trimInitSegment(init: Uint8Array, trailingBytes: number): ArrayBuffer {
  const length = trailingBytes > 0 ? Math.max(0, init.length - trailingBytes) : init.length;
  const trimmed = length === init.length ? init : init.subarray(0, length);
  return trimmed.slice().buffer;
}

/** 独立拷贝：reader 给的视图在下一轮读取后会被复用/转移。 */
function copyForAppend(chunk: Uint8Array): ArrayBuffer {
  return chunk.slice().buffer;
}

/**
 * 选择浏览器可解码的最佳视频轨：优先 avc1（H.264），清晰度取不超过期望值的
 * 最高档，并限制码率不超过 MAX_TRACK_BANDWIDTH —— 登录态下 B 站会返回 4K
 * 蓝光轨，高码流会在浏览器里迅速耗尽 MSE 配额。
 */
function pickVideoTrack(stream: DashStream, preferredQuality?: number): DashTrack {
  const browserSafe = stream.video.filter((track) => track.codecs.startsWith("avc1"));
  const pool = browserSafe.length > 0 ? browserSafe : stream.video;
  if (pool.length === 0) {
    throw new Error("DASH 流没有视频轨道");
  }
  const wanted = preferredQuality && preferredQuality > 0 ? preferredQuality : Number.POSITIVE_INFINITY;
  const affordable = pool.filter((track) => !track.bandwidth || track.bandwidth <= MAX_TRACK_BANDWIDTH);
  const withinBudget = affordable.length > 0 ? affordable : [pool.reduce((lightest, track) => (track.bandwidth < lightest.bandwidth ? track : lightest), pool[0])];
  const notAbove = withinBudget.filter((track) => track.id <= wanted);
  const candidates = notAbove.length > 0 ? notAbove : withinBudget;
  return candidates.reduce((best, track) => (track.id > best.id ? track : best), candidates[0]) as DashTrack;
}
