import { afterEach, describe, expect, it, vi } from "vitest";
import { GestureCoordinator } from "./gestureCoordinator";

function makeElement() {
  const element = document.createElement("div");
  element.style.width = "800px";
  element.style.height = "450px";
  document.body.appendChild(element);
  return element;
}

function dispatchPointer(element: HTMLElement, type: string, clientX: number, clientY: number, pointerId = 1) {
  element.dispatchEvent(new PointerEvent(type, { clientX, clientY, pointerId, bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("GestureCoordinator", () => {
  it("fires onLongPress after holding without moving, then restores on release", () => {
    vi.useFakeTimers();
    const element = makeElement();
    const onLongPress = vi.fn();
    const onLongPressEnd = vi.fn();

    const coord = new GestureCoordinator({ element, onLongPress, onLongPressEnd });
    dispatchPointer(element, "pointerdown", 100, 100);
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    dispatchPointer(element, "pointerup", 100, 100);
    expect(onLongPressEnd).toHaveBeenCalledTimes(1);
    coord.destroy();
  });

  it("does not fire onLongPress when the pointer moves before the threshold", () => {
    vi.useFakeTimers();
    const element = makeElement();
    const onLongPress = vi.fn();

    const coord = new GestureCoordinator({ element, onLongPress });
    dispatchPointer(element, "pointerdown", 100, 100);
    dispatchPointer(element, "pointermove", 130, 100);
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
    coord.destroy();
  });

  it("treats a long-press release as non-tap (no onTap fired)", () => {
    vi.useFakeTimers();
    const element = makeElement();
    const onTap = vi.fn();

    const coord = new GestureCoordinator({ element, onTap });
    dispatchPointer(element, "pointerdown", 100, 100);
    vi.advanceTimersByTime(500);
    dispatchPointer(element, "pointerup", 100, 100);
    vi.advanceTimersByTime(300);
    expect(onTap).not.toHaveBeenCalled();
    coord.destroy();
  });

  it("fires onScrubEnd after a horizontal drag and skips the tap", () => {
    const element = makeElement();
    Object.defineProperty(element, "clientWidth", { value: 800, configurable: true });
    const onScrubEnd = vi.fn();
    const onTap = vi.fn();
    const onSeekAbsolute = vi.fn();

    const coord = new GestureCoordinator({ element, onScrubEnd, onTap, onSeekAbsolute, getDuration: () => 100 });
    dispatchPointer(element, "pointerdown", 100, 100);
    dispatchPointer(element, "pointermove", 180, 100);
    dispatchPointer(element, "pointerup", 180, 100);
    expect(onSeekAbsolute).toHaveBeenCalled();
    expect(onScrubEnd).toHaveBeenCalledTimes(1);
    expect(onTap).not.toHaveBeenCalled();
    coord.destroy();
  });

  it("anchors the scrub target at the playback time when the drag started", () => {
    const element = makeElement();
    Object.defineProperty(element, "clientWidth", { value: 800, configurable: true });
    const onSeekAbsolute = vi.fn();
    let playingAt = 10;
    const coord = new GestureCoordinator({
      element,
      onSeekAbsolute,
      getDuration: () => 100,
      getCurrentTime: () => playingAt,
    });
    dispatchPointer(element, "pointerdown", 100, 100);
    dispatchPointer(element, "pointermove", 180, 100); // dx=80 → 锚点10 + 80/800*100 = 20
    expect(onSeekAbsolute).toHaveBeenLastCalledWith(20);
    playingAt = 11.5; // 播放继续推进，锚点不能跟着漂移
    dispatchPointer(element, "pointermove", 260, 100); // dx=160 → 10 + 20 = 30
    expect(onSeekAbsolute).toHaveBeenLastCalledWith(30);
    coord.destroy();
  });

  it("toggles play/pause on a double-tap anywhere by default", () => {
    vi.useFakeTimers();
    const element = makeElement();
    Object.defineProperty(element, "clientWidth", { value: 800, configurable: true });
    const onTogglePlay = vi.fn();
    const onSeek = vi.fn();
    const onTap = vi.fn();

    const coord = new GestureCoordinator({ element, onTogglePlay, onSeek, onTap });
    dispatchPointer(element, "pointerdown", 60, 100); // 左侧区域也切换播放/暂停
    dispatchPointer(element, "pointerup", 60, 100);
    vi.advanceTimersByTime(100);
    dispatchPointer(element, "pointerdown", 60, 100);
    dispatchPointer(element, "pointerup", 60, 100);

    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    expect(onSeek).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
    coord.destroy();
  });

  it("keeps left/right double-tap seek when doubleTapAction is seek", () => {
    vi.useFakeTimers();
    const element = makeElement();
    Object.defineProperty(element, "clientWidth", { value: 800, configurable: true });
    const onTogglePlay = vi.fn();
    const onSeek = vi.fn();

    const coord = new GestureCoordinator({ element, onTogglePlay, onSeek, doubleTapAction: "seek" });
    dispatchPointer(element, "pointerdown", 60, 100);
    dispatchPointer(element, "pointerup", 60, 100);
    vi.advanceTimersByTime(100);
    dispatchPointer(element, "pointerdown", 60, 100);
    dispatchPointer(element, "pointerup", 60, 100);
    expect(onSeek).toHaveBeenLastCalledWith(-10);
    expect(onTogglePlay).not.toHaveBeenCalled();
    coord.destroy();
  });
});
