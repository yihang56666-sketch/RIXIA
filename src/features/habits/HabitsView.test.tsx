import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { HabitsView } from "./HabitsView";
import { useAppStore } from "../../store/useAppStore";
import { lastNDates, todayKey } from "../../lib/time";

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

  it("labels interval habit streaks as rounds rather than consecutive days", () => {
    const dates = lastNDates(5);
    useAppStore.setState({
      habits: [{
        id: "interval-habit",
        title: "隔日复习",
        createdAt: "2026-08-01T00:00:00.000Z",
        checkedDates: [dates[0], dates[2], dates[4]],
        frequency: { type: "interval-days", interval: 2 },
      }],
    });
    render(<HabitsView />);

    expect(screen.queryByText("3 轮", { selector: ".due-chip" })).toBeInTheDocument();
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
