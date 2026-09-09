import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudResourceView } from "./CloudResourceView";
import { useAppStore } from "../../store/useAppStore";

describe("CloudResourceView", () => {
  beforeEach(() => {
    useAppStore.setState({
      view: "cloud-player",
      activeCloudResourceId: "cloud-1",
      resources: [{ id: "cloud-1", bvid: "", source: "direct", url: "https://cdn.example.com/lesson.mp4", title: "课程视频", status: "saved", addedAt: "2026-08-31T00:00:00.000Z" }],
    } as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a direct video inside the app", () => {
    render(<CloudResourceView />);
    expect(document.querySelector("video")).toHaveAttribute("src", "https://cdn.example.com/lesson.mp4");
    expect(screen.queryByTitle(/资源：课程视频/)).not.toBeInTheDocument();
  });

  it("returns to the library from the in-app viewer", () => {
    render(<CloudResourceView />);
    fireEvent.click(screen.getByRole("button", { name: "返回资料库" }));
    expect(useAppStore.getState().view).toBe("library");
  });

  it("shows a recoverable error when a direct video cannot load", () => {
    const { container } = render(<CloudResourceView />);
    const failedVideo = container.querySelector("video")!;

    fireEvent.error(failedVideo);

    expect(screen.getByRole("alert")).toHaveTextContent("资源加载失败");
    expect(screen.getByRole("button", { name: "在浏览器打开" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelector("video")).not.toBe(failedVideo);
    expect(container.querySelector("video")).toHaveAttribute("src", "https://cdn.example.com/lesson.mp4");
  });

  it("stops indefinite iframe loading and permits retry after a timeout", () => {
    vi.useFakeTimers();
    useAppStore.setState({
      resources: [{ id: "cloud-1", bvid: "", source: "quark", url: "https://pan.quark.cn/s/example", title: "网盘课程", status: "saved", addedAt: "2026-08-31T00:00:00.000Z" }],
    });
    render(<CloudResourceView />);
    const failedFrame = screen.getByTitle("夸克网盘资源：网盘课程");

    act(() => vi.advanceTimersByTime(15_000));

    expect(screen.queryByRole("alert")).toHaveTextContent("资源加载超时");
    expect(screen.queryByText("正在应用内加载夸克网盘…")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("正在应用内加载夸克网盘…")).toBeInTheDocument();
    expect(screen.getByTitle("夸克网盘资源：网盘课程")).not.toBe(failedFrame);

    fireEvent.load(screen.getByTitle("夸克网盘资源：网盘课程"));

    expect(screen.queryByText("正在应用内加载夸克网盘…")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("restarts the loading indicator when the selected cloud resource changes", () => {
    useAppStore.setState({
      resources: [
        { id: "cloud-1", bvid: "", source: "quark", url: "https://pan.quark.cn/s/first", title: "第一课", status: "saved", addedAt: "2026-08-31T00:00:00.000Z" },
        { id: "cloud-2", bvid: "", source: "quark", url: "https://pan.quark.cn/s/second", title: "第二课", status: "saved", addedAt: "2026-08-31T00:00:00.000Z" },
      ],
    });
    render(<CloudResourceView />);
    const previousFrame = screen.getByTitle("夸克网盘资源：第一课");
    fireEvent.load(previousFrame);
    expect(screen.queryByText("正在应用内加载夸克网盘…")).not.toBeInTheDocument();

    act(() => useAppStore.setState({ activeCloudResourceId: "cloud-2" }));

    expect(screen.queryByText("正在应用内加载夸克网盘…")).toBeInTheDocument();
    expect(screen.getByTitle("夸克网盘资源：第二课")).not.toBe(previousFrame);
  });

  it("clears a previous media error when an existing resource gets a new URL", () => {
    const { container } = render(<CloudResourceView />);
    const previousVideo = container.querySelector("video")!;
    fireEvent.error(previousVideo);
    expect(screen.getByRole("alert")).toHaveTextContent("资源加载失败");

    act(() => useAppStore.setState({
      resources: [{ ...useAppStore.getState().resources[0]!, url: "https://cdn.example.com/replacement.webm" }],
    }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelector("video")).not.toBe(previousVideo);
    expect(container.querySelector("video")).toHaveAttribute("src", "https://cdn.example.com/replacement.webm");
  });

  it("explains the online and embedding limits instead of promising in-app playback", () => {
    render(<CloudResourceView />);

    expect(screen.queryByText(/在线资源需要网络连接/)).toBeInTheDocument();
    expect(screen.queryByText(/网盘页面可能限制应用内嵌入/)).toBeInTheDocument();
  });
});
