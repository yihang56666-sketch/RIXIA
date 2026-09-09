import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Modal } from "../components/Modal";
import { CommandPalette } from "../components/CommandPalette";
import { HabitFrequencyEditor } from "../components/HabitFrequencyEditor";
import { M3Dialog } from "../features/bilibili/m3";
import { resetOverlayStackForTesting } from "./overlayStack";

function renderOpener() {
  render(<button>打开窗口</button>);
  const opener = screen.getByRole("button", { name: "打开窗口" });
  opener.focus();
  return opener;
}

afterEach(() => {
  cleanup();
  resetOverlayStackForTesting();
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

describe("shared overlay keyboard ownership", () => {
  it("keeps the full-screen habit editor in the same focus boundary", () => {
    const opener = renderOpener();
    const editor = render(<HabitFrequencyEditor habit={{ id: "habit", title: "阅读", createdAt: "2026-09-01", checkedDates: [] }} onClose={vi.fn()} />);
    const first = screen.getByRole("tab", { name: "每日" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "保存" })).toHaveFocus();
    editor.unmount();
    expect(opener).toHaveFocus();
  });

  it("focuses the modal and restores its opener even when a child has autofocus", () => {
    const opener = renderOpener();
    const modal = render(<Modal title="编辑" onClose={vi.fn()}><input aria-label="内容" autoFocus /></Modal>);
    expect(screen.getByRole("textbox", { name: "内容" })).toHaveFocus();
    modal.unmount();
    expect(opener).toHaveFocus();
  });

  it("wraps Tab within visible enabled controls in both directions", () => {
    renderOpener();
    render(<Modal title="编辑" onClose={vi.fn()}>
      <button disabled>不可用</button>
      <button hidden>隐藏</button>
      <button>保存</button>
    </Modal>);
    const first = screen.getByRole("button", { name: "关闭" });
    const last = screen.getByRole("button", { name: "保存" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
  });

  it("only traps focus in the topmost named Material dialog", () => {
    const opener = renderOpener();
    const parent = render(<Modal title="父窗口" onClose={vi.fn()}><button>父操作</button></Modal>);
    const parentAction = screen.getByRole("button", { name: "父操作" });
    parentAction.focus();
    const child = render(<M3Dialog title="确认操作" actions={<button>确认</button>} />);
    expect(screen.getByRole("alertdialog", { name: "确认操作" })).toHaveAttribute("aria-modal", "true");
    const confirm = screen.getByRole("button", { name: "确认" });
    expect(confirm).toHaveFocus();
    opener.focus();
    expect(confirm).toHaveFocus();
    child.unmount();
    expect(parentAction).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    parent.unmount();
    expect(opener).toHaveFocus();
  });

  it("keeps backward Tab inside the command palette and restores its trigger", () => {
    const opener = renderOpener();
    const palette = render(<CommandPalette open onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText("搜索任务、习惯、笔记… 或直接创建");
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    const options = screen.getAllByRole("option");
    expect(options[options.length - 1]).toHaveFocus();
    palette.unmount();
    expect(opener).toHaveFocus();
  });

  it("restores preexisting inline body scroll styles after the final overlay closes", () => {
    document.body.style.overflow = "scroll";
    document.body.style.paddingRight = "7px";
    const first = render(<Modal title="第一个" onClose={vi.fn()}>{null}</Modal>);
    const second = render(<M3Dialog title="第二个" />);
    first.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    second.unmount();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.body.style.paddingRight).toBe("7px");
  });
});
