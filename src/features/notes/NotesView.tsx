import { FormEvent, useState } from "react";
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
          <button className="primary" type="submit">保存笔记</button>
        </form>
      </section>
      <section className="card">
        {notes.length === 0 ? (
          <p className="empty">还没有笔记</p>
        ) : (
          notes.map((item) => (
            <div className="item" key={item.id}>
              <span />
              <div>
                <p>{item.body}</p>
                <p className="muted">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
              </div>
              <button className="danger" onClick={() => removeNote(item.id)}>删除</button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
