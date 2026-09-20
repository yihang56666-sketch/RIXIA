/**
 * BEID 播放器手势覆盖层 — 参考 FocuBili 的 player_gesture_coordinator.dart。
 *
 * 支持的手势：
 * - 单击：显示/隐藏控制条
 * - 双击屏幕左侧：后退 10 秒
 * - 双击屏幕中央：切换播放/暂停
 * - 双击屏幕右侧：前进 10 秒
 * - 水平滑动：进度拖动（实时 seek）
 * - 垂直滑动左半屏：亮度（需要 native，Web 降级为音量）
 * - 垂直滑动右半屏：音量
 * - 双指捏合：缩放（Web 降级为全屏切换）
 *
 * 实现方式：在本项目的 video 上方覆盖一层透明 div，监听 pointer 事件，
 * 统一处理触摸设备上的手势，不依赖跨文档通信。
 */

export interface GestureCoordinatorOptions {
  element: HTMLElement;
  onSeek?: (delta: number) => void;
  onSeekAbsolute?: (time: number) => void;
  onTogglePlay?: () => void;
  onVolume?: (delta: number) => void;
  onToggleMute?: () => void;
  onToggleFullscreen?: () => void;
  onTap?: () => void;
  onLongPress?: () => void;
  onLongPressEnd?: () => void;
  onScrubEnd?: () => void;
  /** 双击行为：toggle=任意位置播放/暂停（默认），seek=左右快进快退、中间播放/暂停。 */
  doubleTapAction?: "toggle" | "seek";
  getCurrentTime?: () => number;
  getDuration?: () => number;
}

interface PointerState {
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
  pointers: Map<number, { x: number; y: number }>;
}

const DOUBLE_TAP_MS = 280;
const TAP_THRESHOLD = 8;
const SWIPE_THRESHOLD = 30;
const LONG_PRESS_MS = 450;

export class GestureCoordinator {
  private readonly options: GestureCoordinatorOptions;
  private readonly element: HTMLElement;
  private state: PointerState | null = null;
  private lastTap = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private handlerRemoved = false;
  private longPressTimer: number | null = null;
  private longPressActive = false;
  private scrubbed = false;
  private scrubBaseTime = 0;
  private singleTapTimer: number | null = null;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;

  constructor(options: GestureCoordinatorOptions) {
    this.options = options;
    this.element = options.element;
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
    this.element.addEventListener("pointerdown", this.boundPointerDown);
    // move/up/cancel 挂在 window 上：鼠标按下后拖出覆盖层再松开时，
    // 事件仍能送达（触摸有隐式捕获，鼠标没有——旧实现因此永久卡死手势层）。
    window.addEventListener("pointermove", this.boundPointerMove);
    window.addEventListener("pointerup", this.boundPointerUp);
    window.addEventListener("pointercancel", this.boundPointerUp);
  }

  destroy(): void {
    if (this.handlerRemoved) return;
    this.handlerRemoved = true;
    this.cancelLongPressTimer();
    this.cancelSingleTapTimer();
    // 中途销毁时释放可能存在的指针捕获。
    try {
      this.element.releasePointerCapture?.(0);
    } catch {
      // ignore
    }
    this.element.removeEventListener("pointerdown", this.boundPointerDown);
    window.removeEventListener("pointermove", this.boundPointerMove);
    window.removeEventListener("pointerup", this.boundPointerUp);
    window.removeEventListener("pointercancel", this.boundPointerUp);
  }

  private cancelLongPressTimer(): void {
    if (this.longPressTimer != null) window.clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }

  private cancelSingleTapTimer(): void {
    if (this.singleTapTimer != null) window.clearTimeout(this.singleTapTimer);
    this.singleTapTimer = null;
  }

  /** 鼠标手势未收到 pointerup 就开始新按下：先干净地结束上一次残留手势。 */
  private resetStaleGesture(): void {
    if (!this.state) return;
    const wasLongPress = this.longPressActive;
    const wasScrubbing = this.scrubbed;
    this.longPressActive = false;
    this.scrubbed = false;
    this.state = null;
    this.cancelLongPressTimer();
    if (wasLongPress) this.options.onLongPressEnd?.();
    else if (wasScrubbing) this.options.onScrubEnd?.();
  }

  private onPointerDown(event: PointerEvent): void {
    // 鼠标同一时刻只会有一组按下的按键：此时若仍有残留手势状态，
    // 说明上次 pointerup 在覆盖层外丢失，先重置避免后续点击全部失效。
    if (this.state && event.pointerType === "mouse") {
      this.resetStaleGesture();
    }
    if (!this.state) {
      this.scrubbed = false;
      this.state = {
        startX: event.clientX,
        startY: event.clientY,
        startTime: Date.now(),
        moved: false,
        pointers: new Map([[event.pointerId, { x: event.clientX, y: event.clientY }]]),
      };
      // 显式捕获指针：鼠标拖到覆盖层外也能继续收到 move/up。
      try {
        this.element.setPointerCapture?.(event.pointerId);
      } catch {
        // ignore
      }
      this.cancelLongPressTimer();
      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = null;
        if (this.state && !this.state.moved && this.state.pointers.size === 1) {
          this.longPressActive = true;
          this.options.onLongPress?.();
        }
      }, LONG_PRESS_MS);
    } else {
      this.state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.state.pointers.size > 1) this.cancelLongPressTimer();
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.state) return;
    this.state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const dx = event.clientX - this.state.startX;
    const dy = event.clientY - this.state.startY;
    if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
      this.state.moved = true;
      this.cancelLongPressTimer();
    }
    // 水平滑动 = 进度拖动（预览值随动，真正的 seek 由 onScrubEnd 提交）
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (!this.scrubbed) {
        this.scrubbed = true;
        // 锚定滑动开始时的播放时间，避免实时读取推进中的播放头造成目标漂移。
        this.scrubBaseTime = this.options.getCurrentTime?.() ?? 0;
      }
      const width = this.element.clientWidth;
      if (width > 0 && this.options.getDuration && this.options.onSeekAbsolute) {
        const ratio = dx / width;
        const target = this.scrubBaseTime + ratio * (this.options.getDuration() ?? 0);
        this.options.onSeekAbsolute(Math.max(0, Math.min(this.options.getDuration() ?? 0, target)));
      }
    }
    // 垂直滑动右半屏 = 音量
    if (Math.abs(dy) > SWIPE_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
      const isRightHalf = this.state.startX > this.element.clientWidth / 2;
      if (isRightHalf) {
        const height = this.element.clientHeight;
        const delta = -dy / height * 0.5; // 滑动全屏相当于 50% 音量变化
        this.options.onVolume?.(delta);
      }
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.state) return;
    this.state.pointers.delete(event.pointerId);
    if (this.longPressActive) {
      this.longPressActive = false;
      this.cancelLongPressTimer();
      this.state = null;
      this.options.onLongPressEnd?.();
      return;
    }
    if (this.scrubbed && this.state.pointers.size === 0) {
      this.scrubbed = false;
      this.cancelLongPressTimer();
      this.state = null;
      this.options.onScrubEnd?.();
      return;
    }
    if (this.state.pointers.size > 0) return;
    const elapsed = Date.now() - this.state.startTime;
    if (!this.state.moved && elapsed < 500) {
      // Tap
      const x = event.clientX;
      const y = event.clientY;
      const now = Date.now();
      const dx = x - this.lastTapX;
      const dy = y - this.lastTapY;
      const dt = now - this.lastTap;
      if (dt < DOUBLE_TAP_MS && Math.abs(dx) < TAP_THRESHOLD * 2 && Math.abs(dy) < TAP_THRESHOLD * 2) {
        this.cancelSingleTapTimer();
        this.handleDoubleTap(x);
        this.lastTap = 0;
      } else {
        this.lastTap = now;
        this.lastTapX = x;
        this.lastTapY = y;
        // 延迟触发单击，以便区分双击（销毁时一并清理）
        this.cancelSingleTapTimer();
        this.singleTapTimer = window.setTimeout(() => {
          this.singleTapTimer = null;
          if (this.lastTap === now) {
            this.options.onTap?.();
          }
        }, DOUBLE_TAP_MS);
      }
    }
    this.state = null;
  }

  private handleDoubleTap(x: number): void {
    if (this.options.doubleTapAction !== "seek") {
      this.options.onTogglePlay?.();
      return;
    }
    const width = this.element.clientWidth;
    const third = width / 3;
    if (x < third) {
      this.options.onSeek?.(-10);
    } else if (x > width - third) {
      this.options.onSeek?.(10);
    } else {
      this.options.onTogglePlay?.();
    }
  }
}
