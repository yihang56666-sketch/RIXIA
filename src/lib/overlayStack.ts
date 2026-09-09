import { useEffect, useRef } from "react";

/**
 * 全局浮层栈：解决多层弹窗（Modal / 命令面板 / M3Dialog…）叠加时
 * 一按 Escape 全部关闭、Ctrl+K 穿透到底层、背景滚动穿透等问题。
 * 只有栈顶浮层响应 Escape；任意浮层打开期间锁定 body 滚动。
 */
const stack: symbol[] = [];
const escapeHandlers = new Map<symbol, (event: KeyboardEvent) => void>();

let lockCount = 0;
let savedBodyStyles: { overflow: string; paddingRight: string } | undefined;

function lockBodyScroll() {
  lockCount += 1;
  if (lockCount !== 1 || typeof document === "undefined") return;
  const body = document.body;
  savedBodyStyles = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
  // 桌面端滚动条消失会造成布局跳动，用等宽 padding 补偿。
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  body.dataset.overlayScrollLock = "true";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${(Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0) + scrollbarWidth}px`;
  }
  body.style.overflow = "hidden";
}

function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0 || typeof document === "undefined") return;
  const body = document.body;
  delete body.dataset.overlayScrollLock;
  body.style.paddingRight = savedBodyStyles?.paddingRight ?? "";
  body.style.overflow = savedBodyStyles?.overflow ?? "";
  savedBodyStyles = undefined;
}

export function hasOpenOverlays(): boolean {
  return stack.length > 0;
}

export function isTopmostOverlay(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}

/** 仅测试用：清空模块级浮层栈，避免用例间状态串扰。 */
export function resetOverlayStackForTesting() {
  stack.length = 0;
  escapeHandlers.clear();
  lockCount = 0;
  savedBodyStyles = undefined;
  if (typeof document === "undefined") return;
  const body = document.body;
  delete body.dataset.overlayScrollLock;
  body.style.paddingRight = "";
  body.style.overflow = "";
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
export function useOverlayInteraction<Element extends HTMLElement = HTMLElement>(enabled: boolean, onClose?: () => void) {
  const slotRef = useRef<symbol | null>(null);
  const dialogRef = useRef<Element | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const enabledRef = useRef(false);
  if (enabled && !enabledRef.current && typeof document !== "undefined") {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  enabledRef.current = enabled;
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
    const dialog = dialogRef.current;
    const focusableControls = () => dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex], [contenteditable='true']",
    )).filter((element) => {
      if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      let ancestor: HTMLElement | null = element;
      while (ancestor) {
        const style = window.getComputedStyle(ancestor);
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (ancestor === dialog) break;
        ancestor = ancestor.parentElement;
      }
      return true;
    }) : [];
    const focusFirst = () => (focusableControls()[0] ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog || !isTopmostOverlay(id)) return;
      const controls = focusableControls();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement) || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (dialog && isTopmostOverlay(id) && event.target instanceof Node && !dialog.contains(event.target)) focusFirst();
    };
    if (dialog && !dialog.contains(document.activeElement)) focusFirst();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocus);
    return () => {
      const wasTopmost = isTopmostOverlay(id);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocus);
      escapeHandlers.delete(id);
      const index = stack.lastIndexOf(id);
      if (index >= 0) stack.splice(index, 1);
      unlockBodyScroll();
      if (wasTopmost && openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [enabled, id]);
  return dialogRef;
}
