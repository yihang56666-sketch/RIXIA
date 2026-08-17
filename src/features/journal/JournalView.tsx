import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { BookOpen, Tag } from "lucide-react";
import { extractTags, extractWikiLinks } from "../../lib/journal";
import { todayKey } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

/**
 * 每日日记页（借鉴自 usememos/memos 与 AFFiNE 的 daily-doc）：
 * - 头部固定展示日期 + 当日完成任务 / 习惯打卡 / 专注分钟
 * - 主体是 markdown 自由文本
 * - 自动解析 #tag 和 [[wiki 链接]]
 */
export function JournalView({ date }: { date?: string }) {
  const targetDate = date ?? todayKey();
  const journals = useAppStore((state) => state.journals);
  const saveJournal = useAppStore((state) => state.saveJournal);
  const tasks = useAppStore((state) => state.tasks);
  const habits = useAppStore((state) => state.habits);
  const focusSessions = useAppStore((state) => state.focusSessions);

  const existing = journals.find((entry) => entry.date === targetDate);
  const [body, setBody] = useState(existing?.body ?? "");
  const [editing, setEditing] = useState(!existing);

  const tags = useMemo(() => extractTags(body), [body]);
  const wikiLinks = useMemo(() => extractWikiLinks(body), [body]);

  const dayTasks = tasks.filter((t) => t.due === targetDate);
  const doneTasks = dayTasks.filter((t) => t.done);
  const checkedHabits = habits.filter((h) => h.checkedDates.includes(targetDate)).length;
  const focusMinutes = focusSessions
    .filter((s) => s.date === targetDate)
    .reduce((sum, s) => sum + s.minutes, 0);

  function handleSave() {
    saveJournal(targetDate, body);
    setEditing(false);
  }

  return (
    <section className="card journal">
      <header className="journal-head">
        <div>
          <p className="eyebrow">{targetDate}</p>
          <h2>今日日记</h2>
        </div>
        <div className="journal-stats">
          <span className="muted">{doneTasks.length}/{dayTasks.length} 任务</span>
          <span className="muted">{checkedHabits} 习惯</span>
          <span className="muted">{focusMinutes} 分钟</span>
        </div>
      </header>

      {editing ? (
        <div className="journal-editor">
          <textarea
            className="field journal-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"写点什么吧...\n\n- 支持 #tag 自动归类\n- 支持 [[任务标题]] 关联其他内容"}
            rows={8}
          />
          <div className="journal-editor-actions">
            <button className="ghost-btn compact" type="button" onClick={() => setEditing(false)} disabled={!existing}>
              取消
            </button>
            <button className="primary compact" type="button" onClick={handleSave} disabled={!body.trim()}>
              保存
            </button>
          </div>
        </div>
      ) : (
        <div className="journal-body">
          <ReactMarkdown
            components={{
              a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
            }}
          >
            {body}
          </ReactMarkdown>
          <button className="ghost-btn compact" type="button" onClick={() => setEditing(true)}>
            编辑
          </button>
        </div>
      )}

      {(tags.length > 0 || wikiLinks.length > 0) && (
        <footer className="journal-tags">
          {tags.map((tag) => (
            <span key={tag} className="chip">
              <Tag size={12} /> {tag}
            </span>
          ))}
          {wikiLinks.map((link) => (
            <span key={link} className="chip">
              <BookOpen size={12} /> {link}
            </span>
          ))}
        </footer>
      )}
    </section>
  );
}
