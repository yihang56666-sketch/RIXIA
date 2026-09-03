import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { KaoyanView } from "./KaoyanView";
import { useAppStore } from "../../store/useAppStore";

describe("KaoyanView", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      view: "kaoyan",
      pendingBilibiliSearch: null,
      subjects: [],
      studyUnits: [],
      wrongQuestions: [],
      reviewItems: [],
      mockExams: [],
      kaoyanWords: [],
      kaoyanExamDate: "2026-12-19",
    } as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it("renders inside the FocuBili page chrome", () => {
    const { container } = render(<KaoyanView />);
    expect(container.querySelector(".fb-page")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "考研计划" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回我的" })).toBeInTheDocument();
    expect(screen.getByText("2027 考研初试")).toBeInTheDocument();
    expect(screen.queryByText("第 2027 考研初试")).not.toBeInTheDocument();
  });

  it("shows the daily focus goal card backed by the focus timer history", () => {
    render(<KaoyanView />);

    expect(screen.getByRole("heading", { name: "每日专注目标" })).toBeInTheDocument();
    // 默认目标 240 分钟，还没有专注记录 → 显示还差 240 分钟。
    expect(screen.getByText("还差 240 分钟")).toBeInTheDocument();
    expect(screen.getByText(/连续专注 0 天 · 7 天日均 0 分钟/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "增加目标 30 分钟" }));
    expect(screen.getByText("还差 270 分钟")).toBeInTheDocument();
    expect(Number(localStorage.getItem("beid.kaoyan.focus-goal-v1"))).toBe(270);

    fireEvent.click(screen.getByRole("button", { name: "去专注" }));
    expect(useAppStore.getState().view).toBe("focus-dashboard");
  });

  it("opens a focused Bilibili course search from the kaoyan workspace", () => {
    render(<KaoyanView />);
    fireEvent.click(screen.getByRole("button", { name: "搜英语阅读课" }));
    expect(useAppStore.getState().view).toBe("search");
    expect(useAppStore.getState().pendingBilibiliSearch).toBe("考研英语阅读");
  });

  it("searches and starts focus from a subject and unit", () => {
    useAppStore.setState({
      subjects: [{ id: "s1", title: "高数", color: "#5B8DEF", createdAt: "2026-08-01T00:00:00.000Z" }],
      studyUnits: [{
        id: "u1",
        subjectId: "s1",
        title: "函数极限",
        startDate: "2026-08-01",
        endDate: "2026-08-31",
        completedDates: [],
        createdAt: "2026-08-01T00:00:00.000Z",
      }],
    } as Partial<ReturnType<typeof useAppStore.getState>>);

    render(<KaoyanView />);
    fireEvent.click(screen.getByRole("button", { name: /高数/ }));
    fireEvent.click(screen.getByRole("button", { name: "搜高数课" }));
    expect(useAppStore.getState().view).toBe("search");
    expect(useAppStore.getState().pendingBilibiliSearch).toBe("考研高数");

    useAppStore.setState({ view: "kaoyan", pendingBilibiliSearch: null });
    fireEvent.click(screen.getByRole("button", { name: "开始专注高数" }));
    expect(useAppStore.getState().view).toBe("focus-dashboard");

    useAppStore.setState({ view: "kaoyan" });
    fireEvent.click(screen.getByRole("button", { name: /函数极限/ }));
    fireEvent.click(screen.getByRole("button", { name: "搜函数极限课" }));
    expect(useAppStore.getState().view).toBe("search");
    expect(useAppStore.getState().pendingBilibiliSearch).toBe("考研函数极限");
  });

  it("disables subject submit while the title is empty", () => {
    render(<KaoyanView />);
    fireEvent.click(screen.getByRole("button", { name: "添加科目" }));
    const form = screen.getByPlaceholderText("例如：高数、英语、政治").closest("form")!;
    const save = form.querySelector("button[type='submit']") as HTMLButtonElement;
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("例如：高数、英语、政治"), { target: { value: "英语" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(useAppStore.getState().subjects).toHaveLength(1);
    expect(useAppStore.getState().subjects[0].title).toBe("英语");
  });

  it("auto-bumps the unit end date when the start date moves past it and then saves", () => {
    useAppStore.setState({
      subjects: [{ id: "s1", title: "高数", color: "#5B8DEF", createdAt: "2026-08-01T00:00:00.000Z" }],
    } as Partial<ReturnType<typeof useAppStore.getState>>);
    render(<KaoyanView />);
    fireEvent.click(screen.getByRole("button", { name: /高数/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加小类" }));

    const form = screen.getByPlaceholderText("例如：函数极限、阅读理解").closest("form")!;
    fireEvent.change(screen.getByPlaceholderText("例如：函数极限、阅读理解"), { target: { value: "函数极限" } });
    const dateInputs = form.querySelectorAll<HTMLInputElement>("input[type='date']");
    const [start, end] = dateInputs;
    const save = form.querySelector("button[type='submit']") as HTMLButtonElement;

    fireEvent.change(end, { target: { value: "2026-09-10" } });
    expect(save).toBeEnabled();
    // 把开始改到结束之后：结束自动顶高，提交不会被 store 静默拒绝。
    fireEvent.change(start, { target: { value: "2026-10-01" } });
    expect(end.value).toBe("2026-10-01");

    fireEvent.click(save);
    const units = useAppStore.getState().studyUnits;
    expect(units).toHaveLength(1);
    expect(units[0].startDate).toBe("2026-10-01");
    expect(units[0].endDate).toBe("2026-10-01");
  });
});
