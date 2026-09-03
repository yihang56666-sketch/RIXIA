
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PlanView } from "./PlanView";
import { useAppStore } from "../../store/useAppStore";

describe("PlanView", () => {
  beforeEach(() => {
    useAppStore.setState({
      tasks: [],
      habits: [],
      countdowns: [],
      subjects: [],
      studyUnits: [],
      focusSessions: [],
      focusMinutes: 25,
      kaoyanWords: [],
      reviewItems: [],
      mockExams: [],
    } as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it("renders the default tasks tab with the embedded TasksView", () => {
    render(<PlanView />);

    expect(screen.getByRole("heading", { name: "计划" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("添加今天要做的事")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "任务" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches to the habits tab and shows the empty state", () => {
    render(<PlanView />);

    fireEvent.click(screen.getByRole("tab", { name: "习惯" }));
    expect(screen.getByRole("tab", { name: "习惯" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("还没有习惯记录")).toBeInTheDocument();
  });

  it("switches to the countdowns tab and shows the empty state", () => {
    render(<PlanView />);

    fireEvent.click(screen.getByRole("tab", { name: "倒计时" }));
    expect(screen.getByRole("tab", { name: "倒计时" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("还没有倒计时，记录一个重要的日子")).toBeInTheDocument();
  });

  it("switches to the kaoyan tab", () => {
    render(<PlanView />);

    fireEvent.click(screen.getByRole("tab", { name: "考研" }));
    expect(screen.getByRole("tab", { name: "考研" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("专注搜课")).toBeInTheDocument();
  });
});
