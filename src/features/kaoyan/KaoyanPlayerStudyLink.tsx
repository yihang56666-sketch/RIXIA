import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

export function KaoyanPlayerStudyLink({ title }: { title: string }) {
  const subjects = useAppStore((state) => state.subjects);
  const addReviewItem = useAppStore((state) => state.addReviewItem);
  const addWrongQuestion = useAppStore((state) => state.addWrongQuestion);
  const setView = useAppStore((state) => state.setView);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [saved, setSaved] = useState<"review" | "wrong" | null>(null);

  if (subjects.length === 0) {
    return (
      <div className="kaoyan-player-link">
        <span className="kaoyan-player-link-hint">
          <GraduationCap size={16} /> 还没有考研科目，先去考研计划里创建科目，再回来把视频挂到复习计划。
        </span>
        <button type="button" className="m3-tonal-btn" onClick={() => setView("kaoyan")}>
          打开考研计划
        </button>
      </div>
    );
  }

  const attach = (mode: "review" | "wrong") => {
    const target = subjectId || subjects[0].id;
    if (mode === "review") {
      addReviewItem(title, target);
    } else {
      addWrongQuestion({ title, subjectId: target, tags: ["视频课"] });
    }
    setSaved(mode);
    window.setTimeout(() => setSaved(null), 2400);
  };

  return (
    <div className="kaoyan-player-link">
      <label className="kaoyan-player-link-label" htmlFor="kaoyan-subject-select">
        <GraduationCap size={16} /> 挂到考研科目
      </label>
      <select
        id="kaoyan-subject-select"
        aria-label="挂到考研科目"
        value={subjectId || subjects[0].id}
        onChange={(event) => setSubjectId(event.target.value)}
      >
        {subjects.map((subject) => (
          <option key={subject.id} value={subject.id}>
            {subject.title}
          </option>
        ))}
      </select>
      <button type="button" className="m3-tonal-btn" onClick={() => attach("review")}>
        加入今日复习
      </button>
      <button type="button" className="m3-outlined-btn" onClick={() => attach("wrong")}>
        记为错题
      </button>
      {saved && (
        <span className="kaoyan-player-link-saved" role="status">
          {saved === "review" ? "已加入今日复习" : "已记为错题"}
        </span>
      )}
    </div>
  );
}
