import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
});
