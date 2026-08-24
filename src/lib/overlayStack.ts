import { useEffect, useRef } from "react";

/**
 * 全局浮层栈：解决多层弹窗（Modal / 命令面板 / M3Dialog…）叠加时
 * 一按 Escape 全部关闭、Ctrl+K 穿透到底层、背景滚动穿透等问题。
 * 只有栈顶浮层响应 Escape；任意浮层打开期间锁定 body 滚动。
 */
const stack: symbol[] = [];
const escapeHandlers = new Map<symbol, (event: KeyboardEvent) => void>();

let lockCount = 0;

function lockBodyScroll() {
  lockCount += 1;
  if (lockCount !== 1 || typeof document === "undefined") return;
  const body = document.body;
  // 桌面端滚动条消失会造成布局跳动，用等宽 padding 补偿。
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  body.dataset.overlayScrollLock = "true";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }
  body.style.overflow = "hidden";
}

function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0 || typeof document === "undefined") return;
  const body = document.body;
  delete body.dataset.overlayScrollLock;
  body.style.paddingRight = "";
  body.style.overflow = "";
}

export function hasOpenOverlays(): boolean {
  return stack.length > 0;
}

export function isTopmostOverlay(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || stack.length === 0) return;
    const top = stack[stack.length - 1];
    const handler = top ? escapeHandlers.get(top) : undefined;
    if (handler) handler(event);
  });
}

/**
 * 浮层交互挂载：登记到浮层栈（enabled 时），锁定背景滚动，
 * 并把 Escape 路由给栈顶浮层。
 */
export function useOverlayInteraction(enabled: boolean, onClose?: () => void) {
  const slotRef = useRef<symbol | null>(null);
  if (slotRef.current === null) {
    slotRef.current = Symbol("overlay");
  }
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const id = slotRef.current;

  useEffect(() => {
    if (!enabled) return;
    stack.push(id);
    escapeHandlers.set(id, () => {
      closeRef.current?.();
    });
    lockBodyScroll();
    return () => {
      escapeHandlers.delete(id);
      const index = stack.lastIndexOf(id);
      if (index >= 0) stack.splice(index, 1);
      unlockBodyScroll();
    };
  }, [enabled, id]);
}
