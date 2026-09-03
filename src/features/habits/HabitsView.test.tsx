import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { HabitsView } from "./HabitsView";
import { useAppStore } from "../../store/useAppStore";
import { todayKey } from "../../lib/time";

describe("HabitsView", () => {
  beforeEach(() => {
    useAppStore.setState({ view: "habits", habits: [] });
  });

  it("renders inside the FocuBili page chrome", () => {
    const { container } = render(<HabitsView />);
    expect(container.querySelector(".fb-page")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "习惯打卡" })).toBeInTheDocument();
  });

  it("adds a habit and checks it for today", () => {
    render(<HabitsView />);
    fireEvent.change(screen.getByPlaceholderText("添加一个每天想坚持的习惯"), { target: { value: "早起背单词" } });
    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(screen.getByText("早起背单词")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "今日打卡" }));
    expect(useAppStore.getState().habits[0]?.checkedDates).toContain(todayKey());
  });

  it("checks all due habits when the bulk action is clicked", () => {
    useAppStore.setState({
      habits: [
        {
          id: "habit-a",
          title: "喝水",
          createdAt: "2026-08-01T00:00:00.000Z",
          checkedDates: [],
        },
        {
          id: "habit-b",
          title: "阅读",
          createdAt: "2026-08-01T00:00:00.000Z",
          checkedDates: [],
        },
      ],
    });

    render(<HabitsView />);

    fireEvent.click(screen.getByRole("button", { name: "全部打卡" }));

    const habits = useAppStore.getState().habits;
    expect(habits[0]?.checkedDates).toContain(todayKey());
    expect(habits[1]?.checkedDates).toContain(todayKey());
  });
});
