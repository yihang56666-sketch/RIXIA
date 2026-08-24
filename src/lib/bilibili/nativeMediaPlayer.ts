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
  message?: string;
}

export interface NativeDanmakuEntry {
  text: string;
  startTimeSeconds: number;
  mode: number;
  color: number;
  durationSeconds?: number;
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
  setDanmaku(args: { entries: NativeDanmakuEntry[] }): Promise<unknown>;
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
  setDanmaku(entries: NativeDanmakuEntry[]): Promise<void>;
  enterPictureInPicture(aspectRatio: number): Promise<boolean>;
  onStateChange(listener: (state: NativePlayerState) => void): Promise<() => Promise<void>>;
  dispose(): Promise<void>;
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
    async setDanmaku(entries) {
      ensureActive();
      const bounded = entries
        .filter((entry) => typeof entry.text === "string" && entry.text.trim() && Number.isFinite(entry.startTimeSeconds))
        .slice(0, 5000)
        .map((entry) => ({
          ...entry,
          text: entry.text.trim().slice(0, 120),
          startTimeSeconds: Math.max(0, entry.startTimeSeconds),
          mode: Number.isFinite(entry.mode) ? entry.mode : 1,
          color: Number.isFinite(entry.color) ? entry.color : 0xffffff,
        }));
      await bridge.call("setDanmaku", { entries: bounded });
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
      stateSubscription = await bridge.addListener("stateChange", listener);
      return async () => {
        await stateSubscription?.remove();
        stateSubscription = null;
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
