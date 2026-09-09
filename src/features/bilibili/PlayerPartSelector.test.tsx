import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerPartSelector } from "./PlayerPartSelector";
import type { VideoPart } from "../../lib/bilibili/types";

const parts: VideoPart[] = [
  { cid: 10, pageNumber: 1, title: "开场", durationSeconds: 60 },
  { cid: 20, pageNumber: 2, title: "重点", durationSeconds: 120 },
  { cid: 30, pageNumber: 3, title: "结尾", durationSeconds: 180 },
];

describe("PlayerPartSelector", () => {
  it("reverses long-video parts and selects a non-current part", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<PlayerPartSelector parts={parts} currentCid={20} onClose={onClose} onSelect={onSelect} />);

    expect(screen.getByRole("dialog", { name: "选择分 P" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "选择分 P" })).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "正在播放 P2 重点" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "倒序排列分 P" }));
    expect(screen.getAllByRole("button", { name: /打开 P/ })[0]).toHaveAccessibleName("打开 P3 结尾");
    fireEvent.click(screen.getByRole("button", { name: "打开 P1 开场" }));

    expect(onSelect).toHaveBeenCalledWith(parts[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes via Escape because the selector registers on the overlay stack", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<PlayerPartSelector parts={parts} currentCid={20} onClose={onClose} onSelect={onSelect} />);

    // 系统返回在 Shell 里被转换成 Escape 分发给栈顶浮层。
    fireEvent(window, new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
