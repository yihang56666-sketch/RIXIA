/**
 * RIXIA B 站 iframe 通信桥 — 通过 postMessage 与官方 embed 播放器
 * (player.bilibili.com/player.html) 双向通信，实现精确弹幕同步。
 *
 * B 站 embed 播放器支持的 postMessage 协议（基于社区逆向 + 实测）：
 *
 * 出站（RIXIA → iframe）：
 *   { command: "play" }
 *   { command: "pause" }
 *   { command: "seek", time: 30 }
 *   { command: "getTime" }      // 查询当前时间
 *   { command: "getDuration" } // 查询总时长
 *   { command: "setVolume", volume: 0.5 }
 *
 * 入站（iframe → RIXIA，event.data）：
 *   { command: "currentTime", time: 12.3 }
 *   { command: "duration", time: 600 }
 *   { command: "playbackState", state: "playing" | "paused" }
 *
 * 注意：B 站官方未公开文档化此协议，社区实测可能随版本变化。
 * 当协议不可用时，回退到估算时间（performance.now() 推算）。
 */

export interface IframeBridgeOptions {
  iframe: HTMLIFrameElement;
  targetOrigin?: string;
  onTime?: (seconds: number) => void;
  onDuration?: (seconds: number) => void;
  onStateChange?: (state: "playing" | "paused") => void;
  pollIntervalMs?: number;
}

export class BilibiliIframeBridge {
  private readonly iframe: HTMLIFrameElement;
  private readonly targetOrigin: string;
  private readonly onTime?: (seconds: number) => void;
  private readonly onDuration?: (seconds: number) => void;
  private readonly onStateChange?: (state: "playing" | "paused") => void;
  private readonly pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private lastKnownTime = 0;
  private lastKnownDuration = 0;
  private lastKnownState: "playing" | "paused" = "paused";
  private lastUpdateTime = 0;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: IframeBridgeOptions) {
    this.iframe = options.iframe;
    this.targetOrigin = options.targetOrigin ?? "https://player.bilibili.com";
    this.onTime = options.onTime;
    this.onDuration = options.onDuration;
    this.onStateChange = options.onStateChange;
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
  }

  /** 启动桥接：注册消息监听 + 定时查询。 */
  start(): void {
    if (this.messageHandler) return;
    this.messageHandler = (event: MessageEvent) => this.handleMessage(event);
    window.addEventListener("message", this.messageHandler);
    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
    this.lastUpdateTime = performance.now();
    // 估算回退：postMessage 无响应时按 state 估算时间推进
    this.fallbackTimer = setInterval(() => this.tickFallback(), 200);
  }

  /** 停止桥接：清理监听与定时器。 */
  stop(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  /** 发送命令到 iframe。 */
  send(command: string, payload: Record<string, unknown> = {}): void {
    try {
      this.iframe.contentWindow?.postMessage(
        { command, ...payload },
        this.targetOrigin,
      );
    } catch {
      // 跨域或 iframe 未就绪时静默失败
    }
  }

  /** 请求当前播放时间。 */
  queryTime(): void {
    this.send("getTime");
  }

  /** 请求总时长。 */
  queryDuration(): void {
    this.send("getDuration");
  }

  /** 控制播放。 */
  play(): void { this.send("play"); }
  pause(): void { this.send("pause"); }
  seek(time: number): void { this.send("seek", { time }); }
  setVolume(volume: number): void { this.send("setVolume", { volume }); }

  /** 获取最近已知时间（用于无 postMessage 响应时的回退）。 */
  getCurrentTime(): number {
    return this.lastKnownTime;
  }

  getDuration(): number {
    return this.lastKnownDuration;
  }

  getState(): "playing" | "paused" {
    return this.lastKnownState;
  }

  private poll(): void {
    this.queryTime();
    if (this.lastKnownDuration === 0) {
      this.queryDuration();
    }
  }

  private handleMessage(event: MessageEvent): void {
    if (event.source !== this.iframe.contentWindow) return;
    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const command = (data as { command?: string }).command;
    if (!command) return;
    if (command === "currentTime" && typeof data.time === "number") {
      this.lastKnownTime = data.time;
      this.lastUpdateTime = performance.now();
      this.onTime?.(data.time);
    } else if (command === "duration" && typeof data.time === "number") {
      this.lastKnownDuration = data.time;
      this.onDuration?.(data.time);
    } else if (command === "playbackState") {
      const state = (data.state === "playing" ? "playing" : "paused") as "playing" | "paused";
      this.lastKnownState = state;
      this.onStateChange?.(state);
    }
  }

  private tickFallback(): void {
    if (this.lastKnownState !== "playing") return;
    const now = performance.now();
    const delta = (now - this.lastUpdateTime) / 1000;
    if (delta > 0.5) {
      // 超过 500ms 没收到 postMessage 响应，使用估算
      this.lastKnownTime += delta;
      this.lastUpdateTime = now;
      this.onTime?.(this.lastKnownTime);
    }
  }
}
