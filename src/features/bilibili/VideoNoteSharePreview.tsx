import type { VideoNote } from "../../lib/bilibili/types";
import { buildVideoNoteShareText } from "../../lib/bilibili/focusShareService";
import { formatVideoNotePosition } from "./VideoNotesView";
import { FocusSharePreview } from "./FocusSharePreview";

export function VideoNoteSharePreview({ note, onClose }: { note: VideoNote; onClose: () => void }) {
  const summary = buildVideoNoteShareText({
    title: note.title,
    videoTitle: note.videoTitle,
    positionSeconds: note.positionSeconds,
  });

  return (
    <FocusSharePreview
      title="时间点笔记"
      summary={summary}
      fileName={`focubili_note_${note.id}`}
      onClose={onClose}
      dialogLabel="笔记分享预览"
      previewTitle="笔记分享预览"
    >
      <h3>{note.title.trim() || "未命名笔记"}</h3>
      <div className="focus-share-metrics video-note-share-meta">
        <span>时间点 <strong>{formatVideoNotePosition(note.positionSeconds)}</strong></span>
        <span>分 P <strong>P{note.partPageNumber}</strong></span>
        <span>笔记 <strong>{note.body.trim().length} 字</strong></span>
      </div>
      <section className="video-note-share-source">
        <span>来自视频</span>
        <strong>{note.videoTitle}</strong>
        {note.partTitle && <small>P{note.partPageNumber} · {note.partTitle}</small>}
      </section>
      <p className="video-note-share-body">{note.body.trim() || "这条笔记还没有正文。"}</p>
      {note.framePath && <img className="video-note-share-frame" src={note.framePath} alt="时间点画面" />}
    </FocusSharePreview>
  );
}
