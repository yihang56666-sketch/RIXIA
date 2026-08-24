import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
});
