import { Pencil, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Modal } from "../../components/Modal";
import { relativeTime } from "../../lib/time";
import { RixiaWorkspacePage } from "../bilibili/RixiaWorkspacePage";
import { useAppStore } from "../../store/useAppStore";
import type { NoteItem } from "../../types";

function NoteCard({ note }: { note: NoteItem }) {
  const { removeNote, updateNote } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);

  return (
    <article className="card note-card">
      <p className="note-body">{note.body}</p>
      <div className="note-foot">
        <span className="muted" style={{ fontSize: 12.5 }}>{relativeTime(note.createdAt)}</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="icon-button" onClick={() => { setBody(note.body); setEditing(true); }} aria-label="编辑笔记" title="编辑笔记">
            <Pencil size={15} />
          </button>
          <button className="delete-icon" onClick={() => removeNote(note.id)} aria-label="删除笔记" title="删除笔记">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {editing && (
        <Modal
          title="编辑笔记"
          onClose={() => {
            // 关闭即丢弃草稿，下次打开从当前内容重新开始
            setBody(note.body);
            setEditing(false);
          }}
        >
          <form
            className="stack"
            style={{ gap: 10 }}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              // store 对空内容静默拒绝，先拦下以免弹窗关闭让用户以为已保存。
              if (!body.trim()) return;
              updateNote(note.id, body);
              setEditing(false);
            }}
          >
            <textarea className="field" value={body} onChange={(event) => setBody(event.target.value)} autoFocus />
            <div className="form-actions">
              <button className="primary compact" type="submit" disabled={!body.trim()}>保存</button>
            </div>
          </form>
        </Modal>
      )}
    </article>
  );
}

export function NotesView() {
  const { notes, addNote } = useAppStore();
  const [body, setBody] = useState("");

  const valid = body.trim().length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    addNote(body);
    setBody("");
  }

  return (
    <RixiaWorkspacePage title="笔记">
    <div className="stack">
      <section className="card">
        <form className="stack" onSubmit={handleSubmit}>
          <textarea className="field" value={body} onChange={(e) => setBody(e.target.value)} placeholder="写下此刻的想法" />
          <button className="primary compact" type="submit" disabled={!valid}>保存笔记</button>
        </form>
      </section>

      {notes.length === 0 ? (
        <section className="card">
          <p className="empty">还没有笔记，灵感来的时候随手记下</p>
        </section>
      ) : (
        <div className="note-grid">
          {notes.map((note) => <NoteCard key={note.id} note={note} />)}
        </div>
      )}
    </div>
    </RixiaWorkspacePage>
  );
}
