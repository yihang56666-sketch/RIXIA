import { registerPlugin } from "@capacitor/core";

export interface NativePlayerBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NativePlayerOpenRequest {
  bvid: string;
  cid: number;
  videoUrl: string;
  audioUrl?: string;
  positionSeconds?: number;
  title?: string;
  headers?: Record<string, string>;
}

export interface NativePlayerState {
  phase: "idle" | "loading" | "ready" | "playing" | "paused" | "ended" | "error";
  positionSeconds: number;
  durationSeconds: number;
  isPlaying: boolean;
  /** 当前视频帧尺寸（像素）；音频流或未知时可能缺失/为 0。 */
  videoWidth?: number;
  videoHeight?: number;
  message?: string;
}

export interface NativeMediaPlayerBridge {
  call(method: string, args?: object): Promise<unknown>;
  addListener(
    eventName: "stateChange",
    listener: (state: NativePlayerState) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

interface NativeMediaPlayerPlugin {
  initialize(): Promise<unknown>;
  setBounds(args: NativePlayerBounds): Promise<unknown>;
  open(args: NativePlayerOpenRequest): Promise<unknown>;
  play(): Promise<unknown>;
  pause(): Promise<unknown>;
  seek(args: { positionSeconds: number }): Promise<unknown>;
  setVolume(args: { volume: number }): Promise<unknown>;
  setPlaybackSpeed(args: { speed: number }): Promise<unknown>;
  setEmbeddedBackground(args: { color: string }): Promise<unknown>;
  enterPictureInPicture(args: { aspectRatio: number }): Promise<unknown>;
  dispose(): Promise<unknown>;
  addListener(
    eventName: "stateChange",
    listener: (state: NativePlayerState) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const nativePlugin = registerPlugin<NativeMediaPlayerPlugin>("BeidNativePlayer");

const defaultBridge: NativeMediaPlayerBridge = {
  call: async (method, args) => {
    const operation = nativePlugin[method as keyof NativeMediaPlayerPlugin];
    if (typeof operation !== "function") throw new Error(`原生播放器不支持操作：${method}`);
    return (operation as (value?: object) => Promise<unknown>).call(nativePlugin, args);
  },
  addListener: (eventName, listener) => nativePlugin.addListener(eventName, listener),
};

export interface NativeMediaPlayer {
  initialize(): Promise<void>;
  setBounds(bounds: NativePlayerBounds): Promise<void>;
  open(request: NativePlayerOpenRequest): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionSeconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setPlaybackSpeed(speed: number): Promise<void>;
  /**
   * 把 WebView 底色镂空，并把窗口底色换成传入的页面色，
   * 让位于 WebView 之下的原生视频从播放区域透出来。
   */
  setEmbeddedBackground(color: string): Promise<void>;
  enterPictureInPicture(aspectRatio: number): Promise<boolean>;
  onStateChange(listener: (state: NativePlayerState) => void): Promise<() => Promise<void>>;
  dispose(): Promise<void>;
}

/** 窗口底色兜底值：CSS 变量读不到时使用（等价于播放器的黑色遮罩）。 */
const FALLBACK_EMBEDDED_COLOR = "#000000";

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex(value: number): string {
  return clampByte(value).toString(16).padStart(2, "0");
}

/**
 * 把 getComputedStyle 可能给出的任意写法（#rgb/#rrggbb/#rrggbbaa/rgb()/rgba()）
 * 归一成 Android Color.parseColor 能接受的十六进制字符串。
 */
export function normalizeNativePageColor(raw: string | null | undefined): string {
  const value = (raw ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value) || /^#[0-9a-f]{8}$/.test(value)) return value;
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  const components = value.match(/^rgba?\(([^)]*)\)$/);
  if (components) {
    const parts = components[1].split(/[,/\s]+/).filter(Boolean);
    if (parts.length >= 3) {
      const parse = (token: string, index: number): number => {
        if (token.endsWith("%")) return (Number(token.slice(0, -1)) / 100) * (index === 3 ? 1 : 255);
        return Number(token);
      };
      const red = parse(parts[0], 0);
      const green = parse(parts[1], 1);
      const blue = parse(parts[2], 2);
      if (![red, green, blue].every(Number.isFinite)) return FALLBACK_EMBEDDED_COLOR;
      const alpha = parts.length > 3 ? Number(parse(parts[3], 3)) : 1;
      if (!Number.isFinite(alpha) || alpha >= 1) {
        return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
      }
      return `#${toHex(red)}${toHex(green)}${toHex(blue)}${toHex(alpha * 255)}`;
    }
  }
  return FALLBACK_EMBEDDED_COLOR;
}

export function createNativeMediaPlayer(
  bridge: NativeMediaPlayerBridge = defaultBridge,
): NativeMediaPlayer {
  let disposed = false;
  let stateSubscription: { remove: () => Promise<void> } | null = null;

  function ensureActive() {
    if (disposed) throw new Error("原生播放器已经释放");
  }

  return {
    async initialize() {
      ensureActive();
      await bridge.call("initialize");
    },
    async setBounds(bounds) {
      ensureActive();
      if (![bounds.left, bounds.top, bounds.width, bounds.height].every(Number.isFinite)) {
        throw new Error("播放器区域坐标必须是有限数字");
      }
      if (bounds.width <= 0 || bounds.height <= 0) {
        throw new Error("播放器区域尺寸必须大于零");
      }
      await bridge.call("setBounds", bounds);
    },
    async open(request) {
      ensureActive();
      if (!/^BV[0-9A-Za-z]{10}$/i.test(request.bvid.trim())) throw new Error("视频 BV 号无效");
      if (!Number.isInteger(request.cid) || request.cid <= 0) throw new Error("视频 CID 无效");
      for (const url of [request.videoUrl, request.audioUrl].filter(Boolean)) {
        if (!/^https:\/\//i.test(url!)) throw new Error("媒体地址必须使用 HTTPS");
      }
      await bridge.call("open", { ...request, bvid: request.bvid.trim() });
    },
    async play() {
      ensureActive();
      await bridge.call("play");
    },
    async pause() {
      ensureActive();
      await bridge.call("pause");
    },
    async seek(positionSeconds) {
      ensureActive();
      if (!Number.isFinite(positionSeconds) || positionSeconds < 0) throw new Error("播放位置无效");
      await bridge.call("seek", { positionSeconds });
    },
    async setVolume(volume) {
      ensureActive();
      await bridge.call("setVolume", { volume: Math.max(0, Math.min(1, Number(volume) || 0)) });
    },
    async setPlaybackSpeed(speed) {
      ensureActive();
      const value = Number(speed);
      if (!Number.isFinite(value) || value < 0.5 || value > 3) throw new Error("播放倍速必须在 0.5 到 3 倍之间");
      await bridge.call("setPlaybackSpeed", { speed: value });
    },
    async setEmbeddedBackground(color) {
      ensureActive();
      await bridge.call("setEmbeddedBackground", {
        color: normalizeNativePageColor(color),
      });
    },
    async enterPictureInPicture(aspectRatio) {
      ensureActive();
      if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) throw new Error("画中画宽高比无效");
      const result = await bridge.call("enterPictureInPicture", { aspectRatio });
      return result === true || (typeof result === "object" && result !== null && (result as { entered?: unknown }).entered === true);
    },
    async onStateChange(listener) {
      ensureActive();
      await stateSubscription?.remove();
      const subscription = await bridge.addListener("stateChange", listener);
      stateSubscription = subscription;
      // 捕获本次订阅再返回 remover：共享变量会让第二个监听者的
      // remover 摘掉别人的订阅。
      return async () => {
        await subscription.remove();
        if (stateSubscription === subscription) stateSubscription = null;
      };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await stateSubscription?.remove();
      stateSubscription = null;
      await bridge.call("dispose");
    },
  };
}

export function isAndroidNativeMediaPlayerAvailable(): boolean {
  return typeof window !== "undefined" &&
    (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === "android";
}
