import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "./useAppStore";
import { nextReviewDue } from "../lib/kaoyan";
import { todayKey } from "../lib/time";

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

describe("Kaoyan wrong questions and review queue", () => {
  beforeEach(() => {
    useAppStore.setState({ wrongQuestions: [], reviewItems: [], mockExams: [], kaoyanExamDate: null });
  });

  it("records a wrong question and enqueues it for tomorrow's review", () => {
    useAppStore.getState().addWrongQuestion({ title: "2018 数一 第 12 题", tags: ["计算错误"] });

    const state = useAppStore.getState();
    expect(state.wrongQuestions).toHaveLength(1);
    expect(state.reviewItems).toHaveLength(1);
    expect(state.reviewItems[0]).toMatchObject({
      sourceType: "wrong-question",
      sourceId: state.wrongQuestions[0].id,
      title: "2018 数一 第 12 题",
      stage: 0,
    });
    expect(state.reviewItems[0].dueDate).toBe(nextReviewDue(todayKey(), 0));
  });

  it("does not enqueue the same custom review title twice before it is reviewed", () => {
    useAppStore.getState().addReviewItem("线性代数课", "s1");
    useAppStore.getState().addReviewItem("线性代数课", "s1");
    expect(useAppStore.getState().reviewItems).toHaveLength(1);
  });

  it("advances the interval on remember and resets on forget", () => {
    useAppStore.getState().addReviewItem("马原大题模板");
    const item = () => useAppStore.getState().reviewItems[0];

    useAppStore.getState().reviewReviewItem(item().id, true);
    expect(item().stage).toBe(1);
    expect(item().history).toHaveLength(1);

    useAppStore.getState().reviewReviewItem(item().id, false);
    expect(item().stage).toBe(0);
    expect(item().history).toHaveLength(2);
    expect(item().history[1]).toMatchObject({ remembered: false });
  });

  it("removing a wrong question also clears its review entry", () => {
    useAppStore.getState().addWrongQuestion({ title: "错题", tags: [] });
    const id = useAppStore.getState().wrongQuestions[0].id;
    expect(useAppStore.getState().reviewItems).toHaveLength(1);

    useAppStore.getState().removeWrongQuestion(id);

    expect(useAppStore.getState().wrongQuestions).toHaveLength(0);
    expect(useAppStore.getState().reviewItems).toHaveLength(0);
  });
});

describe("Kaoyan vocabulary", () => {
  beforeEach(() => {
    useAppStore.setState({ kaoyanWords: [], reviewItems: [] });
  });

  it("adds a word and enqueues it as a word review item", () => {
    useAppStore.getState().addWord("abandon", "v. 放弃");
    const state = useAppStore.getState();
    expect(state.kaoyanWords).toHaveLength(1);
    expect(state.kaoyanWords[0]).toMatchObject({ word: "abandon", meaning: "v. 放弃" });
    expect(state.reviewItems).toHaveLength(1);
    expect(state.reviewItems[0]).toMatchObject({
      sourceType: "word",
      sourceId: state.kaoyanWords[0].id,
      title: "abandon",
      stage: 0,
    });
  });

  it("ignores a blank word and trims whitespace", () => {
    useAppStore.getState().addWord("   ", "meaning");
    useAppStore.getState().addWord("  meticulous  ", "adj. 一丝不苟的");
    const state = useAppStore.getState();
    expect(state.kaoyanWords).toHaveLength(1);
    expect(state.kaoyanWords[0].word).toBe("meticulous");
  });

  it("removing a word also clears its review entry", () => {
    useAppStore.getState().addWord("hypothesis", "n. 假设");
    const id = useAppStore.getState().kaoyanWords[0].id;
    expect(useAppStore.getState().reviewItems).toHaveLength(1);

    useAppStore.getState().removeWord(id);

    expect(useAppStore.getState().kaoyanWords).toHaveLength(0);
    expect(useAppStore.getState().reviewItems).toHaveLength(0);
  });
});

describe("Kaoyan mock exams", () => {
  beforeEach(() => {
    useAppStore.setState({ mockExams: [] });
  });

  it("records a mock exam and clamps the score into range", () => {
    useAppStore.getState().addMockExam({ date: "2026-10-08", subject: "数学", paperName: "李林六套卷一", score: 110, total: 150 });
    useAppStore.getState().addMockExam({ date: "2026-10-15", subject: "数学", paperName: "卷二", score: 200, total: 150 });

    const exams = useAppStore.getState().mockExams;
    expect(exams).toHaveLength(2);
    expect(exams[0]).toMatchObject({ subject: "数学", score: 110, total: 150 });
    expect(exams[1].score).toBe(150);
  });

  it("ignores entries without a subject or with an invalid total", () => {
    useAppStore.getState().addMockExam({ date: "2026-10-08", subject: "  ", paperName: "卷", score: 1, total: 100 });
    useAppStore.getState().addMockExam({ date: "2026-10-08", subject: "数学", paperName: "卷", score: 1, total: 0 });

    expect(useAppStore.getState().mockExams).toHaveLength(0);
  });
});
