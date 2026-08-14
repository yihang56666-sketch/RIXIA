import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./useAppStore";

describe("Kaoyan store", () => {
  beforeEach(() => {
    useAppStore.setState({ subjects: [], studyUnits: [] });
  });

  it("creates a subject and study unit, then records a daily completion", () => {
    const store = useAppStore.getState();
    store.addSubject("高数", "#5B8DEF");
    const subject = useAppStore.getState().subjects[0];
    store.addStudyUnit(subject.id, "函数极限", "2026-08-01", "2026-08-03");
    const unit = useAppStore.getState().studyUnits[0];
    store.toggleStudyDate(unit.id, "2026-08-02");

    expect(useAppStore.getState().subjects).toHaveLength(1);
    expect(useAppStore.getState().studyUnits[0].completedDates).toEqual(["2026-08-02"]);
  });

  it("keeps check-in history while editing the current date range", () => {
    const store = useAppStore.getState();
    store.addSubject("英语", "#A476E8");
    const subject = useAppStore.getState().subjects[0];
    store.addStudyUnit(subject.id, "阅读", "2026-08-01", "2026-08-03");
    const unit = useAppStore.getState().studyUnits[0];
    store.toggleStudyDate(unit.id, "2026-08-01");
    store.updateStudyUnit(unit.id, "阅读理解", "2026-08-02", "2026-08-04");

    expect(useAppStore.getState().studyUnits[0]).toMatchObject({
      title: "阅读理解",
      startDate: "2026-08-02",
      endDate: "2026-08-04",
      completedDates: ["2026-08-01"],
    });
  });
});
