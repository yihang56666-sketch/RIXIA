import { ArrowDown, ArrowUp, Crosshair, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { VideoPart } from "../../lib/bilibili/types";

export function PlayerPartSelector({
  parts,
  currentCid,
  onClose,
  onSelect,
}: {
  parts: VideoPart[];
  currentCid: number;
  onClose: () => void;
  onSelect: (part: VideoPart) => void;
}) {
  const [descending, setDescending] = useState(false);
  const currentPartRef = useRef<HTMLButtonElement | null>(null);
  const visibleParts = useMemo(() => descending ? [...parts].reverse() : parts, [descending, parts]);

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card player-part-selector" role="dialog" aria-modal="true" aria-label="选择分 P">
        <header className="player-part-selector-header">
          <div><h2>选择分 P</h2><p className="muted">共 {parts.length} 集</p></div>
          <div className="player-part-selector-actions">
            <button className="icon-button" type="button" aria-label="定位当前分 P" title="定位当前分 P" onClick={() => currentPartRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })}><Crosshair size={17} /></button>
            <button className="icon-button" type="button" aria-label={descending ? "正序排列分 P" : "倒序排列分 P"} title={descending ? "正序排列" : "倒序排列"} onClick={() => setDescending((value) => !value)}>{descending ? <ArrowUp size={17} /> : <ArrowDown size={17} />}</button>
            <button className="icon-button" type="button" aria-label="关闭选集" title="关闭" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        <div className="player-part-selector-grid">
          {visibleParts.map((part) => {
            const isCurrent = part.cid === currentCid;
            const label = `${isCurrent ? "正在播放" : "打开"} P${part.pageNumber} ${part.title}`;
            return <button
              key={part.cid}
              ref={isCurrent ? currentPartRef : undefined}
              type="button"
              className={`player-part-selector-item${isCurrent ? " active" : ""}`}
              disabled={isCurrent}
              aria-label={label}
              onClick={() => { onSelect(part); onClose(); }}
            >
              <strong>P{part.pageNumber}</strong>
              <span>{part.title}</span>
              <small>{formatDuration(part.durationSeconds)}</small>
            </button>;
          })}
        </div>
      </section>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}
