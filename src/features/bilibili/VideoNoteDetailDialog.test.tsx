import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoNoteDetailDialog } from "./VideoNoteDetailDialog";
import type { VideoNote } from "../../lib/bilibili/types";

const lookupVideo = vi.fn().mockResolvedValue({ bvid: "BV1xx411c7mD", title: "线性代数第一讲", thumbnailUrl: "" });

vi.mock("../../lib/bilibili/publicContentService", () => ({
  createBilibiliPublicContentService: () => ({ lookupVideo }),
}));

const NOTE: VideoNote = {
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
  framePath: "data:image/png;base64,AAA",
};

describe("VideoNoteDetailDialog", () => {
  it("opens the source video after looking up the latest part", async () => {
    const onOpenVideo = vi.fn();
    render(
      <VideoNoteDetailDialog
        note={NOTE}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
        onOpenVideo={onOpenVideo}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /线性代数第一讲/ }));
    await waitFor(() => expect(lookupVideo).toHaveBeenCalledWith("BV1xx411c7mD"));
    await waitFor(() => expect(onOpenVideo).toHaveBeenCalled());
  });

  it("blocks closing with unsaved changes until the user confirms discarding them", async () => {
    const onClose = vi.fn();
    render(
      <VideoNoteDetailDialog
        note={NOTE}
        onClose={onClose}
        onSave={vi.fn().mockResolvedValue(true)}
        onOpenVideo={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "笔记标题" }), { target: { value: "矩阵的秩（更新）" } });
    fireEvent.click(screen.getByRole("button", { name: "关闭笔记详情" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText(/退出后，本次修改会丢失/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "不保存并退出" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes immediately when there are no unsaved changes", () => {
    const onClose = vi.fn();
    render(
      <VideoNoteDetailDialog
        note={NOTE}
        onClose={onClose}
        onSave={vi.fn().mockResolvedValue(true)}
        onOpenVideo={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭笔记详情" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("requires a delete confirmation before invoking onDelete", async () => {
    const onDelete = vi.fn();
    render(
      <VideoNoteDetailDialog
        note={NOTE}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
        onOpenVideo={vi.fn()}
        onShare={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "删除笔记" }));
    fireEvent.click(await screen.findByRole("button", { name: "取消" }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "删除笔记" }));
    fireEvent.click(await screen.findByRole("button", { name: "删除" }));
    expect(onDelete).toHaveBeenCalled();
  });

  it("opens the frame in a fullscreen viewer and closes it on request", async () => {
    render(
      <VideoNoteDetailDialog
        note={NOTE}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
        onOpenVideo={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("img", { name: "时间点画面" }));
    expect(await screen.findByRole("dialog", { name: "视频截图全屏浏览" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭全屏截图" }));
    expect(screen.queryByRole("dialog", { name: "视频截图全屏浏览" })).not.toBeInTheDocument();
  });

  it("resets the zoom level when the reset button is clicked", async () => {
    render(
      <VideoNoteDetailDialog
        note={NOTE}
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
        onOpenVideo={vi.fn()}
        onShare={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("img", { name: "时间点画面" }));
    const viewer = await screen.findByRole("dialog", { name: "视频截图全屏浏览" });
    const image = viewer.querySelector("img") as HTMLImageElement;
    // Zoom in via double-click (scale → 2.5).
    fireEvent.dblClick(image);
    expect(image.getAttribute("style")).toContain("scale(2.5)");
    // Reset button should restore scale to 1.
    fireEvent.click(within(viewer).getByRole("button", { name: "重置缩放" }));
    expect(image.getAttribute("style")).toContain("scale(1)");
  });

  it("recovers the editor after saving rejects", async () => {
    render(<VideoNoteDetailDialog note={NOTE} onClose={vi.fn()} onSave={vi.fn().mockRejectedValue(new Error("存储失败"))} onOpenVideo={vi.fn()} onShare={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "笔记正文" }), { target: { value: "保留未保存的正文" } });
    fireEvent.click(screen.getByRole("button", { name: "保存笔记修改" }));
    expect(await screen.findByRole("status")).toHaveTextContent("保存失败");
    expect(screen.getByRole("textbox", { name: "笔记正文" })).toHaveValue("保留未保存的正文");
    expect(screen.getByRole("button", { name: "保存笔记修改" })).toBeEnabled();
  });

  it("does not navigate after the source lookup outlives the dialog", async () => {
    let resolve!: (value: { bvid: string; title: string; thumbnailUrl: string }) => void;
    const pending = new Promise<{ bvid: string; title: string; thumbnailUrl: string }>((onResolve) => { resolve = onResolve; });
    lookupVideo.mockReturnValueOnce(pending);
    const onOpenVideo = vi.fn();
    const { unmount } = render(<VideoNoteDetailDialog note={NOTE} onClose={vi.fn()} onSave={vi.fn()} onOpenVideo={onOpenVideo} onShare={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /线性代数第一讲/ }));
    unmount();
    await act(async () => resolve({ bvid: NOTE.bvid, title: NOTE.videoTitle, thumbnailUrl: "" }));
    expect(onOpenVideo).not.toHaveBeenCalled();
  });
});
