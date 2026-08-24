import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { KaoyanPlayerStudyLink } from "./KaoyanPlayerStudyLink";
import { useAppStore } from "../../store/useAppStore";

describe("KaoyanPlayerStudyLink", () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      subjects: [{ id: "s1", title: "英语", color: "#5B8DEF", createdAt: "2026-08-01T00:00:00.000Z" }],
      wrongQuestions: [],
      reviewItems: [],
    } as Partial<ReturnType<typeof useAppStore.getState>>);
  });

  it("attaches the current video to a kaoyan subject as a review item or wrong question", () => {
    render(<KaoyanPlayerStudyLink title="阅读理解精讲" />);
    fireEvent.change(screen.getByLabelText("挂到考研科目"), { target: { value: "s1" } });
    fireEvent.click(screen.getByRole("button", { name: "加入今日复习" }));
    expect(useAppStore.getState().reviewItems[0]).toMatchObject({
      title: "阅读理解精讲",
      subjectId: "s1",
    });

    fireEvent.click(screen.getByRole("button", { name: "记为错题" }));
    expect(useAppStore.getState().wrongQuestions[0]).toMatchObject({
      title: "阅读理解精讲",
      subjectId: "s1",
    });
  });
});
