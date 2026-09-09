import type { ComponentType } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CountdownsView } from "../countdowns/CountdownsView";
import { HabitsView } from "../habits/HabitsView";
import { InboxView } from "../inbox/InboxView";
import { LibraryView } from "../library/LibraryView";
import { NotesView } from "../notes/NotesView";
import { TasksView } from "../tasks/TasksView";
import { TodayView } from "../today/TodayView";
import { ToolsView } from "../tools/ToolsView";
import { CloudResourceView } from "../videos/CloudResourceView";
import { VideosView } from "../videos/VideosView";
import { PlanView } from "./PlanView";
import { lastNDates, todayKey } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";
import type { ViewKey } from "../../types";

const offlineViews: Array<{ view: ViewKey; View: ComponentType; empty: string }> = [
  { view: "countdowns", View: CountdownsView, empty: "还没有倒计时，记录一个重要的日子" },
  { view: "habits", View: HabitsView, empty: "还没有习惯记录" },
  { view: "inbox", View: InboxView, empty: "收集箱是空的，脑袋里想到什么就先丢进来" },
  { view: "library", View: LibraryView, empty: "没有进行中的课程" },
  { view: "notes", View: NotesView, empty: "还没有笔记，灵感来的时候随手记下" },
  { view: "plan", View: PlanView, empty: "今天没有任务，享受当下或安排一件小事" },
  { view: "tasks", View: TasksView, empty: "今天没有任务，享受当下或安排一件小事" },
  { view: "today", View: TodayView, empty: "今天还没有安排任务" },
  { view: "tools", View: ToolsView, empty: "按需使用工具，保持工作台简洁。可在「外观、密度与备份」里选择要显示的工具。" },
  { view: "videos", View: VideosView, empty: "还没有收藏视频，去哔哩哔哩找些好课吧" },
  { view: "cloud-player", View: CloudResourceView, empty: "资源不存在" },
];

const blockedFetch = vi.fn(() => Promise.reject(new TypeError("Network is disabled in this offline audit")));

describe("workspace views offline", () => {
  beforeEach(() => {
    localStorage.clear();
    blockedFetch.mockClear();
    vi.stubGlobal("fetch", blockedFetch);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(() => {
      throw new TypeError("Network is disabled in this offline audit");
    });
    useAppStore.setState({
      view: "plan",
      inbox: [],
      tasks: [],
      habits: [],
      notes: [],
      countdowns: [],
      subjects: [],
      studyUnits: [],
      focusSessions: [],
      focusMinutes: 25,
      focusGoalMinutes: 120,
      activeFocus: null,
      activeCloudResourceId: null,
      activeBilibiliBvid: null,
      resources: [],
      timestampNotes: [],
      journals: [],
      enabledTools: [],
    });
  });

  afterEach(() => {
    try {
      expect(blockedFetch).not.toHaveBeenCalled();
      expect(XMLHttpRequest.prototype.open).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it.each(offlineViews)("renders the $view empty state without a network request", ({ view, View, empty }) => {
    useAppStore.setState({ view });

    render(<View />);

    expect(navigator.onLine).toBe(false);
    expect(screen.getByText(empty)).toBeInTheDocument();
  });

  it("keeps edited notes after local rehydration while offline", async () => {
    const notesView = render(<NotesView />);
    fireEvent.change(screen.getByPlaceholderText("写下此刻的想法"), { target: { value: "  离线笔记  " } });
    fireEvent.click(screen.getByRole("button", { name: "保存笔记" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑笔记" }));
    fireEvent.change(screen.getByDisplayValue("离线笔记"), { target: { value: "离线修订" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(screen.getByText("离线修订")).toBeInTheDocument();
    const snapshot = localStorage.getItem("rixia-v1")!;
    notesView.unmount();

    useAppStore.setState({ notes: [] });
    localStorage.setItem("rixia-v1", snapshot);
    await act(async () => { await useAppStore.persist.rehydrate(); });
    render(<NotesView />);

    expect(screen.getByText("离线修订")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除笔记" }));
    expect(screen.getByText("还没有笔记，灵感来的时候随手记下")).toBeInTheDocument();
  });

  it("retains only the in-memory note when local storage rejects the write", () => {
    render(<NotesView />);
    const snapshot = localStorage.getItem("rixia-v1");
    const storageError = new DOMException("Storage is full", "QuotaExceededError");
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw storageError; });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    fireEvent.change(screen.getByPlaceholderText("写下此刻的想法"), { target: { value: "尚未落盘的笔记" } });
    fireEvent.click(screen.getByRole("button", { name: "保存笔记" }));

    expect(screen.getByText("尚未落盘的笔记")).toBeInTheDocument();
    expect(useAppStore.getState().notes[0]?.body).toBe("尚未落盘的笔记");
    expect(localStorage.getItem("rixia-v1")).toBe(snapshot);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("持久化写入失败"), storageError);
  });

  it("converts a captured inbox item into exactly one local task", () => {
    render(<InboxView />);
    fireEvent.change(screen.getByPlaceholderText("输入一个想法或待办"), { target: { value: "  离线待办  " } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    fireEvent.click(screen.getByRole("button", { name: /转为任务/ }));

    expect(useAppStore.getState().inbox).toEqual([]);
    expect(useAppStore.getState().tasks).toEqual([
      expect.objectContaining({ title: "离线待办", due: todayKey(), done: false }),
    ]);
    expect(useAppStore.getState().view).toBe("tasks");
  });

  it("discards a task draft and permits clearing its due date offline", () => {
    useAppStore.setState({
      tasks: [{ id: "task-edit", title: "原任务", done: false, due: todayKey(), createdAt: new Date().toISOString(), completedAt: null }],
    });
    render(<TasksView />);
    fireEvent.click(screen.getByTitle("点击编辑"));
    fireEvent.change(screen.getByPlaceholderText("任务标题"), { target: { value: "未保存草稿" } });
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(useAppStore.getState().tasks[0]?.title).toBe("原任务");

    fireEvent.click(screen.getByTitle("点击编辑"));
    expect(screen.getByPlaceholderText("任务标题")).toHaveValue("原任务");
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(useAppStore.getState().tasks[0]?.due).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /^全部/ }));
    expect(screen.getByText("原任务")).toBeInTheDocument();
    expect(screen.getByText("无日期")).toBeInTheDocument();
  });

  it("checks only due habits and preserves a canceled frequency edit", () => {
    const yesterday = lastNDates(2)[0];
    useAppStore.setState({
      habits: [
        { id: "daily", title: "每日阅读", createdAt: "2026-08-01T00:00:00.000Z", checkedDates: [], frequency: { type: "daily" } },
        { id: "interval", title: "间隔复习", createdAt: "2026-08-01T00:00:00.000Z", checkedDates: [yesterday], frequency: { type: "interval-days", interval: 5 } },
      ],
    });
    render(<HabitsView />);
    fireEvent.click(screen.getByRole("button", { name: "全部打卡" }));
    expect(useAppStore.getState().habits[0]?.checkedDates).toEqual([todayKey()]);
    expect(useAppStore.getState().habits[1]?.checkedDates).toEqual([yesterday]);

    fireEvent.click(screen.getAllByRole("button", { name: "编辑频率" })[0]);
    fireEvent.click(screen.getByRole("tab", { name: "每周 N 次" }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(useAppStore.getState().habits[0]?.frequency).toEqual({ type: "daily" });

    fireEvent.click(screen.getAllByRole("button", { name: "编辑频率" })[0]);
    fireEvent.click(screen.getByRole("tab", { name: "每周 N 次" }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(useAppStore.getState().habits[0]?.frequency).toEqual({ type: "weekly-count", target: 4 });
    fireEvent.click(screen.getAllByRole("button", { name: "删除习惯" })[0]);
    expect(screen.queryByText("每日阅读")).not.toBeInTheDocument();
  });

  it.each([
    { source: "bilibili", input: "BV1GJ411x7h7", url: undefined },
    { source: "quark", input: "pan.quark.cn/s/example", url: "https://pan.quark.cn/s/example" },
    { source: "baidu", input: "https://pan.baidu.com/s/example", url: "https://pan.baidu.com/s/example" },
    { source: "direct", input: "https://cdn.example.com/lecture.mp4", url: "https://cdn.example.com/lecture.mp4" },
  ])("saves $source metadata offline without opening the remote resource", ({ source, input, url }) => {
    render(<VideosView />);
    fireEvent.change(screen.getByRole("combobox", { name: "资源来源" }), { target: { value: source } });
    fireEvent.change(screen.getByPlaceholderText(source === "bilibili" ? /或 BV 号/ : "粘贴资源链接"), { target: { value: input } });
    fireEvent.change(screen.getByPlaceholderText(/给它起个名字/), { target: { value: "离线收藏" } });
    fireEvent.click(screen.getByRole("button", { name: "收藏到看课区" }));

    expect(screen.getByText("离线收藏")).toBeInTheDocument();
    expect(useAppStore.getState().resources).toHaveLength(1);
    expect(useAppStore.getState().resources[0]).toMatchObject({ source, title: "离线收藏" });
    expect(useAppStore.getState().resources[0]?.url).toBe(url);
    expect(useAppStore.getState().activeBilibiliBvid).toBeNull();
    expect(useAppStore.getState().activeCloudResourceId).toBeNull();
  });

  it("rejects an HTTP direct link while retaining the resource draft", () => {
    render(<VideosView />);
    fireEvent.change(screen.getByRole("combobox", { name: "资源来源" }), { target: { value: "direct" } });
    fireEvent.change(screen.getByPlaceholderText("粘贴资源链接"), { target: { value: "http://cdn.example.com/lecture.mp4" } });
    fireEvent.change(screen.getByPlaceholderText(/给它起个名字/), { target: { value: "待修正链接" } });
    fireEvent.click(screen.getByRole("button", { name: "收藏到看课区" }));

    expect(useAppStore.getState().resources).toEqual([]);
    expect(screen.getByPlaceholderText("粘贴资源链接")).toHaveValue("http://cdn.example.com/lecture.mp4");
    expect(screen.getByPlaceholderText(/给它起个名字/)).toHaveValue("待修正链接");
    expect(screen.getByText("请输入HTTPS 直链链接。")).toBeInTheDocument();
  });

  it("sorts local library records and removes a completed saved item", () => {
    useAppStore.setState({
      resources: [
        { id: "older", bvid: "BV1GJ411x7h7", title: "较早课程", status: "saved", addedAt: "2026-08-01T00:00:00.000Z" },
        { id: "recent", bvid: "BV1Q541167Qg", title: "最近课程", status: "in-progress", addedAt: "2026-08-02T00:00:00.000Z", lastOpenedAt: "2026-09-01T00:00:00.000Z" },
        { id: "done", bvid: "BV1xx411c7mD", title: "已完成课程", status: "completed", addedAt: "2026-08-03T00:00:00.000Z" },
      ],
    });
    render(<LibraryView />);

    expect(screen.getAllByRole("article")[0]).toHaveTextContent("最近课程");
    expect(screen.queryByText("已完成课程")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "已保存" }));
    const latestSaved = screen.getAllByRole("article")[0];
    expect(latestSaved).toHaveTextContent("已完成课程");
    fireEvent.click(within(latestSaved).getByRole("button", { name: "删除" }));

    expect(screen.queryByText("已完成课程")).not.toBeInTheDocument();
    expect(useAppStore.getState().resources.map((resource) => resource.id)).toEqual(["older", "recent"]);
  });
});
