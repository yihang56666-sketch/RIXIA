import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CountdownsView } from "./CountdownsView";
import { todayKey } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

describe("CountdownsView", () => {
  beforeEach(() => {
    useAppStore.setState({ view: "countdowns", countdowns: [] });
  });

  it("renders the empty state when no countdowns exist", () => {
    render(<CountdownsView />);
    expect(screen.getByText("倒计时")).toBeInTheDocument();
    expect(screen.getByText("还没有倒计时，记录一个重要的日子")).toBeInTheDocument();
  });

  it("adds a countdown and shows it sorted by days until", () => {
    render(<CountdownsView />);
    const titleInput = screen.getByRole("textbox");
    const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]')!;
    fireEvent.change(titleInput, { target: { value: "考研" } });
    fireEvent.change(dateInput, { target: { value: "2030-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "添加倒计时" }));
    expect(screen.getByText("考研")).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("1月1日"))).toBeInTheDocument();

    fireEvent.change(titleInput, { target: { value: "今天" } });
    fireEvent.change(dateInput, { target: { value: todayKey() } });
    fireEvent.click(screen.getByRole("button", { name: "添加倒计时" }));

    const todayCard = screen.getByText("今天").closest("article")!;
    expect(todayCard).toHaveTextContent("0");
    expect(todayCard).toHaveTextContent("就是今天");
  });

  it("removes a countdown from the list", () => {
    useAppStore.setState({
      countdowns: [
        {
          id: "c1",
          title: "生日",
          date: "2030-02-01",
          createdAt: "2026-08-23T00:00:00.000Z",
        },
      ],
    });
    render(<CountdownsView />);
    expect(screen.getByText("生日")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "删除倒计时" }));
    expect(screen.queryByText("生日")).not.toBeInTheDocument();
  });

  it("keeps past countdowns but marks them as already passed", () => {
    useAppStore.setState({
      countdowns: [
        {
          id: "c-past",
          title: "已过",
          date: "2000-01-01",
          createdAt: "2000-01-01T00:00:00.000Z",
        },
        {
          id: "c-future",
          title: "未来",
          date: "2030-01-01",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    render(<CountdownsView />);

    const [pastCard, futureCard] = screen.getAllByRole("article");
    expect(pastCard).toHaveTextContent("已过");
    expect(pastCard).toHaveTextContent("已过去");
    expect(futureCard).toHaveTextContent("未来");
    expect(futureCard).toHaveTextContent("倒计时中");
  });

  it("ignores empty or whitespace-only titles", () => {
    render(<CountdownsView />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "添加倒计时" }));

    expect(screen.queryByRole("article")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "考研" } });
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: "2030-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "添加倒计时" }));

    expect(screen.getByText("考研")).toBeInTheDocument();
  });

  it("keeps submit disabled until both title and date are filled", () => {
    render(<CountdownsView />);
    const submit = screen.getByRole("button", { name: "添加倒计时" });

    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "复试" } });
    // 只填名称不选日期时仍不可提交，避免 store 静默拒绝后表单被清空的假成功。
    expect(submit).toBeDisabled();

    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="date"]')!, { target: { value: "2030-03-01" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(screen.getByText("复试")).toBeInTheDocument();
  });
});
