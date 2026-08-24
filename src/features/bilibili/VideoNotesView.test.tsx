import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoNotesView } from "./VideoNotesView";
import { useAppStore } from "../../store/useAppStore";

const remove = vi.fn().mockResolvedValue(true);
const save = vi.fn().mockResolvedValue(true);
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
  createVideoNoteService: () => ({ list, remove, save }),
}));

vi.mock("../../lib/bilibili/publicContentService", () => ({
  createBilibiliPublicContentService: () => ({
    lookupVideo: vi.fn().mockResolvedValue({ bvid: "BV1xx411c7mD", title: "线性代数第一讲", thumbnailUrl: "" }),
  }),
}));

const NOTE = {
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
};

describe("VideoNotesView", () => {
  beforeEach(() => {
    save.mockReset();
    save.mockResolvedValue(true);
    useAppStore.setState({ view: "video-notes", activeBilibiliBvid: null });
    list.mockResolvedValue([NOTE]);
  });

  it("lists, filters, deletes, and opens a timestamp note source video", async () => {
    render(<VideoNotesView />);
    expect(await screen.findByText("矩阵秩")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "搜索时间点笔记" }), { target: { value: "不存在" } });
    expect(screen.getByText("没有匹配的笔记")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索时间点笔记" }), { target: { value: "矩阵" } });

    fireEvent.click(screen.getByText("矩阵秩"));
    fireEvent.click(screen.getByRole("button", { name: /线性代数第一讲/ }));
    await waitFor(() => {
      const state = useAppStore.getState();
      expect(state.view).toBe("bilibili-player");
      expect(state.activeBilibiliPlaybackTarget).toEqual({ cid: 101, seconds: 90 });
    });

    fireEvent.click(screen.getByText("矩阵秩"));
    fireEvent.click(screen.getByRole("button", { name: "删除笔记" }));
    fireEvent.click(await screen.findByRole("button", { name: "删除" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("note-1"));
  });

  it("shares a note from the detail dialog", async () => {
    render(<VideoNotesView />);
    expect(await screen.findByText("矩阵秩")).toBeInTheDocument();
    fireEvent.click(screen.getByText("矩阵秩"));
    fireEvent.click(screen.getByRole("button", { name: /分享/ }));
    expect(screen.getByRole("dialog", { name: "笔记分享预览" })).toBeInTheDocument();
    expect(screen.getByText("来自 BEID 的时间点笔记：矩阵秩（线性代数第一讲 · 1:30）"))
      .toBeInTheDocument();
  });

  it("opens a saved note for editing and persists the updated content", async () => {
    render(<VideoNotesView />);
    expect(await screen.findByText("矩阵秩")).toBeInTheDocument();

    fireEvent.click(screen.getByText("矩阵秩"));
    expect(screen.getByRole("dialog", { name: "笔记详情" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "笔记标题" }), { target: { value: "矩阵的秩" } });
    fireEvent.click(screen.getByRole("button", { name: "保存笔记修改" }));

    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({
      id: "note-1",
      title: "矩阵的秩",
      body: "注意秩的定义",
    })));
    expect(screen.getByText("矩阵的秩")).toBeInTheDocument();
  });

  it("selects visible notes and enables batch export actions", async () => {
    render(<VideoNotesView />);
    expect(await screen.findByText("矩阵秩")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "导出" }));
    expect(screen.getByRole("button", { name: /导出文件/ })).toBeDisabled();
    fireEvent.click(screen.getByText("矩阵秩"));
    expect(screen.getByText(/已选择 1 条/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /导出文件/ })).toBeEnabled();
  });
});
