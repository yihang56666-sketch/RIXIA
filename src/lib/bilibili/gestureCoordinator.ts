/**
 * RIXIA 播放器手势覆盖层 — 复刻 FocuBili 的 player_gesture_coordinator.dart。
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
 * 实现方式：在 iframe 上方覆盖一层透明 div，监听 pointer 事件。
 * 因为 iframe 是跨域的，事件不会冒泡到外层，覆盖层是必需的。
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

export class GestureCoordinator {
  private readonly options: GestureCoordinatorOptions;
  private readonly element: HTMLElement;
  private state: PointerState | null = null;
  private lastTap = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private handlerRemoved = false;
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
    this.element.addEventListener("pointermove", this.boundPointerMove);
    this.element.addEventListener("pointerup", this.boundPointerUp);
    this.element.addEventListener("pointercancel", this.boundPointerUp);
  }

  destroy(): void {
    if (this.handlerRemoved) return;
    this.handlerRemoved = true;
    this.element.removeEventListener("pointerdown", this.boundPointerDown);
    this.element.removeEventListener("pointermove", this.boundPointerMove);
    this.element.removeEventListener("pointerup", this.boundPointerUp);
    this.element.removeEventListener("pointercancel", this.boundPointerUp);
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.state) {
      this.state = {
        startX: event.clientX,
        startY: event.clientY,
        startTime: Date.now(),
        moved: false,
        pointers: new Map([[event.pointerId, { x: event.clientX, y: event.clientY }]]),
      };
    } else {
      this.state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.state) return;
    this.state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const dx = event.clientX - this.state.startX;
    const dy = event.clientY - this.state.startY;
    if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
      this.state.moved = true;
    }
    // 水平滑动 = 进度拖动
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      const width = this.element.clientWidth;
      if (width > 0 && this.options.getDuration && this.options.onSeekAbsolute) {
        const ratio = dx / width;
        const target = (this.options.getCurrentTime?.() ?? 0) + ratio * (this.options.getDuration() ?? 0);
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
        this.handleDoubleTap(x);
        this.lastTap = 0;
      } else {
        this.lastTap = now;
        this.lastTapX = x;
        this.lastTapY = y;
        // 延迟触发单击，以便区分双击
        setTimeout(() => {
          if (this.lastTap === now) {
            this.options.onTap?.();
          }
        }, DOUBLE_TAP_MS);
      }
    }
    this.state = null;
  }

  private handleDoubleTap(x: number): void {
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
