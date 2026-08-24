import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";
import { HomeFeedView } from "./HomeFeedView";

vi.mock("../../lib/bilibili/publicContentService", () => ({
  createBilibiliPublicContentService: () => ({
    searchVideos: vi.fn().mockResolvedValue({
      results: [{
        bvid: "BV1xx411c7mD",
        title: "考研数学公开课",
        ownerName: "数学老师",
        thumbnailUrl: "https://example.test/cover.jpg",
        playCount: 12000,
      }],
    }),
  }),
}));

vi.mock("../../lib/bilibili/services", () => ({
  createSearchHistoryService: () => ({
    list: vi.fn().mockResolvedValue([]),
    record: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(true),
  }),
}));

describe("HomeFeedView", () => {
  beforeEach(() => {
    useAppStore.setState({ view: "home-feed", activeBilibiliBvid: null });
  });

  it("opens a discovered video in the player with its BVID", async () => {
    render(<HomeFeedView />);

    fireEvent.click(await screen.findByRole("button", { name: "考研数学公开课" }));
    await waitFor(() => {
      expect(useAppStore.getState().view).toBe("bilibili-player");
      expect(useAppStore.getState().activeBilibiliBvid).toBe("BV1xx411c7mD");
    });
  });

  it("renders the M3 appbar with back navigation and active search entry", async () => {
    render(<HomeFeedView />);
    expect(await screen.findByRole("button", { name: "返回首页" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "主动搜索" })).toBeInTheDocument();
  });
});
