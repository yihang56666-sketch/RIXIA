import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideosView } from "./VideosView";
import { useAppStore } from "../../store/useAppStore";

describe("VideosView", () => {
  beforeEach(() => {
    useAppStore.setState({
      view: "videos",
      resources: [{
        id: "resource-1",
        bvid: "BV1GJ411x7h7",
        title: "已有课程",
        status: "saved",
        addedAt: "2026-08-23T00:00:00.000Z",
      }],
    } as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it("explains when a video is already saved", () => {
    render(<VideosView />);

    fireEvent.change(screen.getByPlaceholderText(/或 BV 号/), {
      target: { value: "BV1GJ411x7h7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "收藏到看课区" }));

    expect(screen.getByText("这个视频已经在看课区了。")).toBeInTheDocument();
  });

  it("saves a cloud resource and exposes an official open action", async () => {
    render(<VideosView />);
    fireEvent.change(screen.getByRole("combobox", { name: "资源来源" }), { target: { value: "quark" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴资源链接"), { target: { value: "https://pan.quark.cn/s/example" } });
    fireEvent.change(screen.getByPlaceholderText(/给它起个名字/), { target: { value: "高数课程" } });
    fireEvent.click(screen.getByRole("button", { name: "收藏到看课区" }));
    expect(await screen.findByText("高数课程")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /打开夸克网盘资源/ })).toBeInTheDocument();
  });

  it("opens a cloud resource in the in-app viewer", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    useAppStore.setState({
      resources: [{ id: "cloud-1", bvid: "", source: "baidu", url: "https://pan.baidu.com/s/example", title: "线代课", status: "saved", addedAt: "2026-08-23T00:00:00.000Z" }],
    } as Partial<ReturnType<typeof useAppStore.getState>>);

    render(<VideosView />);
    fireEvent.click(screen.getByRole("button", { name: /打开百度网盘资源/ }));

    expect(open).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toBe("cloud-player");
    open.mockRestore();
  });
});
