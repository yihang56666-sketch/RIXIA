import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryView } from "./LibraryView";
import { useAppStore } from "../../store/useAppStore";

describe("LibraryView", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      view: "library",
      resources: [{
        id: "res-1",
        title: "高数强化",
        bvid: "BV1GJ411x7h7",
        addedAt: "2026-08-22T00:00:00.000Z",
        lastOpenedAt: "2026-08-22T00:00:00.000Z",
        status: "in-progress",
      }],
      notes: [],
      inbox: [],
      activeBilibiliBvid: null,
    } as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it("opens saved videos in the single FocuBili player instead of an iframe", () => {
    render(<LibraryView />);
    fireEvent.click(screen.getByRole("button", { name: "打开 高数强化" }));
    expect(useAppStore.getState().view).toBe("bilibili-player");
    expect(useAppStore.getState().activeBilibiliBvid).toBe("BV1GJ411x7h7");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("renders inside the FocuBili page chrome", () => {
    const { container } = render(<LibraryView />);
    expect(container.querySelector(".fb-page")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "资料库" })).toBeInTheDocument();
  });

  it("provides a visible action to save a video from the saved tab", () => {
    render(<LibraryView />);
    fireEvent.click(screen.getByRole("tab", { name: "已保存" }));

    expect(screen.getByRole("button", { name: "保存视频" })).toBeInTheDocument();
  });

  it("opens a saved cloud resource inside the app without launching the browser", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    useAppStore.setState({
      resources: [{ id: "q1", title: "网盘课", bvid: "", source: "quark", url: "https://pan.quark.cn/s/example", addedAt: "2026-08-22T00:00:00.000Z", status: "saved" }],
    } as Partial<ReturnType<typeof useAppStore.getState>>);
    render(<LibraryView />);
    fireEvent.click(screen.getByRole("button", { name: "打开 网盘课" }));
    expect(open).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("cloud-player");
    open.mockRestore();
  });
});
