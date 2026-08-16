import { FormEvent, useState } from "react";
import { Trash2 } from "lucide-react";
import { relativeTime } from "../../lib/time";
import { useAppStore } from "../../store/useAppStore";

export function NotesView() {
  const { notes, addNote, removeNote } = useAppStore();
  const [body, setBody] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    addNote(body);
    setBody("");
  }

  return (
    <div className="stack">
      <section className="card">
        <form className="stack" onSubmit={handleSubmit}>
          <textarea className="field" value={body} onChange={(e) => setBody(e.target.value)} placeholder="写下此刻的想法" />
          <button className="primary compact" type="submit">保存笔记</button>
        </form>
      </section>

      {notes.length === 0 ? (
        <section className="card">
          <p className="empty">还没有笔记，灵感来的时候随手记下</p>
        </section>
      ) : (
        <div className="note-grid">
          {notes.map((item) => (
            <article key={item.id} className="card note-card">
              <p className="note-body">{item.body}</p>
              <div className="note-foot">
                <span className="muted" style={{ fontSize: 12.5 }}>{relativeTime(item.createdAt)}</span>
                <button className="delete-icon" onClick={() => removeNote(item.id)} aria-label="删除笔记" title="删除笔记">
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
