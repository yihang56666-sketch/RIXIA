import { useRef, useState, type ReactNode } from "react";
import { Share2, X } from "lucide-react";
import { shareFocusText, type FocusShareResult } from "../../lib/bilibili/focusShareService";
import { captureNodeAsPng, shareImageFile } from "../../lib/bilibili/shareCapture";

const RESULT_MESSAGES: Record<FocusShareResult, string> = {
  shared: "已打开系统分享面板",
  copied: "当前设备不支持系统分享，内容已复制",
  unavailable: "当前设备不支持分享或复制",
  failed: "分享失败，请稍后重试",
};

const IMAGE_RESULT_MESSAGES = {
  shared: "已分享图片卡片",
  unsupported: "当前设备不支持图片分享，已复制文字",
  failed: "图片生成失败，已回退到文字分享",
};

export function FocusSharePreview({
  title,
  summary,
  children,
  onClose,
  dialogLabel = "专注分享预览",
  previewTitle = "分享预览",
  fileName = "focubili_share",
}: {
  title: string;
  summary: string;
  children: ReactNode;
  onClose: () => void;
  dialogLabel?: string;
  previewTitle?: string;
  fileName?: string;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");

  async function handleShare() {
    if (sharing) return;
    setSharing(true);
    setMessage("");
    const node = cardRef.current;
    if (node) {
      try {
        const capture = await captureNodeAsPng(node, fileName);
        if (capture) {
          const ok = await shareImageFile({ title, text: summary, image: capture });
          if (ok) {
            setMessage(IMAGE_RESULT_MESSAGES.shared);
            setSharing(false);
            return;
          }
          await shareFocusText({ title, text: summary });
          setMessage(IMAGE_RESULT_MESSAGES.unsupported);
          setSharing(false);
          return;
        }
        await shareFocusText({ title, text: summary });
        setMessage(IMAGE_RESULT_MESSAGES.failed);
        setSharing(false);
        return;
      } catch (error) {
        console.warn("Focus image share failed", error);
        const result = await shareFocusText({ title, text: summary });
        setMessage(`${IMAGE_RESULT_MESSAGES.failed}（${RESULT_MESSAGES[result]}）`);
        setSharing(false);
        return;
      }
    }
    const result = await shareFocusText({ title, text: summary });
    setMessage(RESULT_MESSAGES[result]);
    setSharing(false);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-label={dialogLabel} aria-modal="true">
      <div className="modal-card focus-share-dialog">
        <div className="row">
          <h2>{previewTitle}</h2>
          <button className="icon-button" onClick={onClose} disabled={sharing} aria-label="关闭分享预览">
            <X size={18} />
          </button>
        </div>
        <div className="focus-share-scroll">
          <div ref={cardRef} className="focus-share-card">
            <p className="eyebrow">BEID · 专注备考</p>
            {children}
            <p className="focus-share-summary">{summary}</p>
          </div>
        </div>
        {message && <p className="muted" role="status">{message}</p>}
        <button className="m3-filled-btn" onClick={() => void handleShare()} disabled={sharing}>
          <Share2 size={16} /> {sharing ? "正在生成…" : "分享图片到其他 App"}
        </button>
      </div>
    </div>
  );
}
