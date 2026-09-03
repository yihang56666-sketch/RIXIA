import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Heatmap } from "./Heatmap";
import { todayKey, weekdayLabel } from "../lib/time";

const titleEquals = (value: string) => (_: unknown, element?: Element | null) =>
  element?.getAttribute("title") === value;

describe("Heatmap", () => {
  it("renders a cell for every date in the requested range", () => {
    const today = todayKey();
    const { container } = render(<Heatmap checkedDates={[]} today={today} weeks={2} />);

    const cells = container.querySelectorAll(".heatmap-cell:not(.pad)");
    expect(cells).toHaveLength(14);
  });

  it("marks the checked dates and today", () => {
    const today = todayKey();
    const todayDate = new Date(`${today}T00:00:00`);
    const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayKey = todayKey(yesterdayDate);
    const uncheckedKey = todayKey(new Date(todayDate.getTime() - 2 * 24 * 60 * 60 * 1000));

    // 组件 title 使用原始日期键（cell.date）；today 在 checkedDates 中故带已打卡后缀
    const todayTitle = `${today} ${weekdayLabel(todayDate)} · 已打卡`;
    const yesterdayTitle = `${yesterdayKey} ${weekdayLabel(yesterdayDate)} · 已打卡`;
    const uncheckedTitle = `${uncheckedKey} ${weekdayLabel(new Date(`${uncheckedKey}T00:00:00`))}`;

    const { container } = render(
      <Heatmap checkedDates={[yesterdayKey, today]} today={today} weeks={3} />,
    );

    expect(screen.getByTitle(titleEquals(todayTitle))).toHaveClass("today", "on");
    expect(screen.getByTitle(titleEquals(yesterdayTitle))).toHaveClass("on");
    const uncheckedCell = screen.getByTitle(titleEquals(uncheckedTitle));
    expect(uncheckedCell).not.toHaveClass("on");
    expect(uncheckedCell).not.toHaveClass("future");
    expect(container.querySelectorAll(".heatmap-cell.on")).toHaveLength(2);
  });
});
