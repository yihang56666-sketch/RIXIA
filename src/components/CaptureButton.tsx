import { Plus } from "lucide-react";
import { useState } from "react";
import { QuickAdd } from "./QuickAdd";
import { useAppStore } from "../store/useAppStore";

/**
 * Floating capture button shown on mobile / tablet (not on desktop where
 * Ctrl/Cmd+K and the sidebar capture entry suffice). Tapping opens a small
 * popover with the QuickAdd form; the captured entry goes into the inbox.
 */
export function CaptureButton() {
  const [open, setOpen] = useState(false);
  const addInbox = useAppStore((state) => state.addInbox);

  if (open) {
    return (
      <div className="capture-popover" role="dialog" aria-label="快速收集">
        <div className="capture-popover-arrow" />
        <QuickAdd
          placeholder="输入想法或待办，回车保存"
          onSubmit={(value) => {
            addInbox(value);
          }}
        />
        <div className="capture-popover-foot">
          <button className="ghost-btn compact" type="button" onClick={() => setOpen(false)}>
            关闭
          </button>
          <span className="muted" style={{ fontSize: 12.5 }}>
            收集后可在「今天」整理为今日任务
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="capture-fab"
      onClick={() => setOpen(true)}
      aria-label="快速收集"
      title="快速收集"
    >
      <Plus size={22} strokeWidth={2.4} />
    </button>
  );
}
