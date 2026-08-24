import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocalWatchHistoryView } from "./LocalWatchHistoryView";

const baseEntry = {
  bvid: "BV1history",
  cid: 201,
  title: "高等数学第一讲",
  ownerName: "王老师",
  thumbnailUrl: "",
  durationSeconds: 600,
  watchedAt: "2026-08-19T10:00:00.000Z",
  positionSeconds: 120,
  completed: false,
};

const list = vi.fn().mockResolvedValue([baseEntry]);
const remove = vi.fn().mockResolvedValue([]);
const clear = vi.fn().mockResolvedValue([]);
const backfillThumbnails = vi.fn().mockResolvedValue([{ ...baseEntry, thumbnailUrl: "https://example.test/cover.jpg" }]);
const lookupVideo = vi.fn().mockResolvedValue({ bvid: "BV1history", title: "高等数学第一讲", thumbnailUrl: "https://example.test/cover.jpg" });

vi.mock("../../lib/bilibili/watchHistoryService", () => ({
  createWatchHistoryService: () => ({ list, remove, clear, record: vi.fn(), backfillThumbnails }),
}));

vi.mock("../../lib/bilibili/publicContentService", () => ({
  createBilibiliPublicContentService: () => ({ lookupVideo }),
}));

describe("LocalWatchHistoryView", () => {
  it("filters a local record and resumes the exact saved part", async () => {
    render(<LocalWatchHistoryView />);

    expect(await screen.findByText("高等数学第一讲")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索本机观看记录" }), { target: { value: "王老师" } });
    fireEvent.click(screen.getByRole("button", { name: "继续播放 高等数学第一讲" }));

    expect(screen.getByText("高等数学第一讲")).toBeInTheDocument();
    await waitFor(() => expect(backfillThumbnails).toHaveBeenCalled());
  });

  it("removes a record only after confirming the dialog", async () => {
    render(<LocalWatchHistoryView />);
    await screen.findByText("高等数学第一讲");

    fireEvent.click(screen.getByRole("button", { name: "移除 高等数学第一讲" }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "移除 高等数学第一讲" }));
    fireEvent.click(await screen.findByRole("button", { name: "移除" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("BV1history"));
  });

  it("clears all records only after confirming the dialog", async () => {
    render(<LocalWatchHistoryView />);
    await screen.findByText("高等数学第一讲");

    fireEvent.click(screen.getByRole("button", { name: "清空本机观看记录" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认清空" }));
    await waitFor(() => expect(clear).toHaveBeenCalled());
  });
});