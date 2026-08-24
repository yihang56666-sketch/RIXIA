import { Plus } from "lucide-react";
import { useState } from "react";
import { QuickAdd } from "./QuickAdd";
import { useOverlayInteraction } from "../lib/overlayStack";
import { useAppStore } from "../store/useAppStore";
import type { ViewKey } from "../types";

const HIDE_CAPTURE = new Set<ViewKey>([
  "bilibili-player",
  "focus-dashboard",
  "search",
  "settings",
  "login",
  "favorites",
  "favorite-videos",
  "followed",
  "local-watch-history",
  "subscribed-collections",
  "creator-profile",
  "collection-detail",
  "about",
  "home-feed",
  "learning-list",
  "video-notes",
  "focus-statistics",
  "personalization",
  "cache-management",
  "problem-diagnostics",
  "android-permissions",
  "windows-system-capabilities",
  "kaoyan",
]);

/**
 * Floating capture button shown on mobile / tablet (not on desktop where
 * Ctrl/Cmd+K suffices). Tapping opens a small popover with the QuickAdd form;
 * the captured entry goes into the inbox. Tap-away and Escape dismiss it.
 */
export function CaptureButton() {
  const [open, setOpen] = useState(false);
  const addInbox = useAppStore((state) => state.addInbox);
  const view = useAppStore((state) => state.view);
  useOverlayInteraction(open, () => setOpen(false));
  if (HIDE_CAPTURE.has(view)) return null;

  if (open) {
    return (
      <>
        <div
          className="capture-popover-backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        />
        <div className="capture-popover" role="dialog" aria-label="快速收集">
          <div className="capture-popover-arrow" />
          <QuickAdd
            placeholder="输入想法或待办，回车保存"
            onSubmit={(value) => {
              addInbox(value);
              setOpen(false);
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
      </>
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
