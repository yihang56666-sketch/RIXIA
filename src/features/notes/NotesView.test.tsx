import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { NotesView } from "./NotesView";
import { useAppStore } from "../../store/useAppStore";

describe("NotesView", () => {
  beforeEach(() => {
    useAppStore.setState({ view: "notes", notes: [] });
  });

  it("renders the empty state when no notes exist", () => {
    render(<NotesView />);

    expect(screen.getByText("笔记")).toBeInTheDocument();
    expect(screen.getByText("还没有笔记，灵感来的时候随手记下")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("写下此刻的想法")).toBeInTheDocument();
  });

  it("adds a note and keeps it in the list", () => {
    render(<NotesView />);

    fireEvent.change(screen.getByPlaceholderText("写下此刻的想法"), {
      target: { value: "随手记一条灵感" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存笔记" }));

    expect(screen.getByText("随手记一条灵感")).toBeInTheDocument();
  });

  it("edits a note and saves the updated content", () => {
    useAppStore.setState({
      notes: [
        {
          id: "note-1",
          body: "原始内容",
          createdAt: "2026-08-29T08:00:00.000Z",
        },
      ],
    });

    render(<NotesView />);

    fireEvent.click(screen.getByRole("button", { name: "编辑笔记" }));
    fireEvent.change(screen.getByDisplayValue("原始内容"), {
      target: { value: "修改后的内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("修改后的内容")).toBeInTheDocument();
    expect(useAppStore.getState().notes[0]?.body).toBe("修改后的内容");
  });

  it("closing the editor discards unsaved edits", () => {
    useAppStore.setState({
      notes: [
        {
          id: "note-3",
          body: "保留内容",
          createdAt: "2026-08-29T09:00:00.000Z",
        },
      ],
    });

    render(<NotesView />);

    fireEvent.click(screen.getByRole("button", { name: "编辑笔记" }));
    fireEvent.change(screen.getByDisplayValue("保留内容"), {
      target: { value: "丢弃草稿" },
    });
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    expect(screen.getByText("保留内容")).toBeInTheDocument();
    expect(useAppStore.getState().notes[0]?.body).toBe("保留内容");
  });

  it("deletes a note from the list", () => {
    useAppStore.setState({
      notes: [
        {
          id: "note-2",
          body: "需要删除",
          createdAt: "2026-08-29T08:30:00.000Z",
        },
      ],
    });

    render(<NotesView />);

    expect(screen.getByText("需要删除")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除笔记" }));
    expect(screen.queryByText("需要删除")).not.toBeInTheDocument();
  });

  it("does not update the note when the editor is saved without changing the trimmed body", () => {
    useAppStore.setState({
      notes: [
        {
          id: "note-unchanged",
          body: "保留内容",
          createdAt: "2026-08-29T10:00:00.000Z",
        },
      ],
    });

    render(<NotesView />);

    fireEvent.click(screen.getByRole("button", { name: "编辑笔记" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("保留内容")).toBeInTheDocument();
    expect(useAppStore.getState().notes[0]?.body).toBe("保留内容");
  });

  it("keeps the create save button disabled while the content is empty", () => {
    render(<NotesView />);

    // 空内容时提交禁用，避免 store 静默拒绝后输入框被清空的假成功。
    expect(screen.getByRole("button", { name: "保存笔记" })).toBeDisabled();
  });

  it("disables the edit save button when the body is cleared", () => {
    useAppStore.setState({
      notes: [{ id: "note-5", body: "原始内容", createdAt: "2026-08-29T11:00:00.000Z" }],
    });

    render(<NotesView />);
    fireEvent.click(screen.getByRole("button", { name: "编辑笔记" }));
    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toBeEnabled();

    fireEvent.change(screen.getByDisplayValue("原始内容"), { target: { value: "   " } });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(useAppStore.getState().notes[0]?.body).toBe("原始内容");
  });
});




