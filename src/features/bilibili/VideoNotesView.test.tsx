import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoNotesView } from "./VideoNotesView";
import { useAppStore } from "../../store/useAppStore";

const remove = vi.fn().mockResolvedValue(true);
const list = vi.fn().mockResolvedValue([
  {
    id: "note-1",
    bvid: "BV1xx411c7mD",
    videoTitle: "线性代数第一讲",
    ownerName: "老师",
    partCid: 101,
    partPageNumber: 1,
    partTitle: "第一讲",
    title: "矩阵秩",
    body: "注意秩的定义",
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-19T10:00:00.000Z",
    positionSeconds: 90,
    videoCoverUrl: "",
  },
]);

vi.mock("../../lib/bilibili/services", () => ({
  createVideoNoteService: () => ({ list, remove }),
}));

describe("VideoNotesView", () => {
  beforeEach(() => {
    useAppStore.setState({ view: "video-notes", activeBilibiliBvid: null });
    list.mockResolvedValue([{
      id: "note-1",
      bvid: "BV1xx411c7mD",
      videoTitle: "线性代数第一讲",
      ownerName: "老师",
      partCid: 101,
      partPageNumber: 1,
      partTitle: "第一讲",
      title: "矩阵秩",
      body: "注意秩的定义",
      createdAt: "2026-08-19T10:00:00.000Z",
      updatedAt: "2026-08-19T10:00:00.000Z",
      positionSeconds: 90,
      videoCoverUrl: "",
    }]);
  });

  it("lists, filters, deletes, and opens a timestamp note source video", async () => {
    render(<VideoNotesView />);
    expect(await screen.findByText("矩阵秩")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "搜索时间点笔记" }), { target: { value: "不存在" } });
    expect(screen.getByText("没有匹配的时间点笔记")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索时间点笔记" }), { target: { value: "矩阵" } });
    fireEvent.click(screen.getByRole("button", { name: "打开视频" }));
    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.view).toBe("bilibili-player");
      expect(state.activeBilibiliPlaybackTarget).toEqual({ cid: 101, seconds: 90 });
    });

    fireEvent.click(screen.getByRole("button", { name: "删除时间点笔记" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("note-1"));
  });
});
