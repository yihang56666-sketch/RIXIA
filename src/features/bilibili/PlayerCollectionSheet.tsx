import { ListPlus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOverlayInteraction } from "../../lib/overlayStack";
import type { VideoCollection, VideoCollectionEntry } from "../../lib/bilibili/types";

type CollectionOrder = "original" | "newest" | "oldest" | "mostPlayed";

export function PlayerCollectionSheet({
  collection,
  currentBvid,
  onClose,
  onOpenVideo,
  onAddToLearningList,
}: {
  collection: VideoCollection;
  currentBvid: string;
  onClose: () => void;
  onOpenVideo: (bvid: string, title: string) => void;
  onAddToLearningList?: (entry: VideoCollectionEntry) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [order, setOrder] = useState<CollectionOrder>("original");
  // 登记浮层栈：系统返回/Escape 先关合集，而不是退回资料库。
  useOverlayInteraction(true, onClose);
  const entries = useMemo(() => filterAndSortEntries(collection.entries, keyword, order), [collection.entries, keyword, order]);
  const currentEntryRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    currentEntryRef.current?.scrollIntoView?.({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card player-collection-sheet" role="dialog" aria-modal="true" aria-label={`合集 · ${collection.title}`}>
        <header className="player-collection-header">
          <div>
            <h2>合集 · {collection.title}</h2>
            <p className="muted">{entries.length}/{collection.entries.length} 个视频</p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭合集" title="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="player-collection-tools">
          <label className="player-collection-search">
            <Search size={16} aria-hidden="true" />
            <input aria-label="搜索合集视频" type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索标题或 BV 号" />
          </label>
          <select aria-label="合集排序" value={order} onChange={(event) => setOrder(event.target.value as CollectionOrder)}>
            <option value="original">合集顺序</option>
            <option value="newest">最新发布</option>
            <option value="oldest">最早发布</option>
            <option value="mostPlayed">最多播放</option>
          </select>
        </div>
        <div className="player-collection-list">
          {entries.length === 0 ? <p className="muted">没有找到匹配的视频</p> : entries.map((entry) => {
            const isCurrent = entry.bvid === currentBvid;
            return (
              <div key={entry.bvid} className={`player-collection-row${isCurrent ? " active" : ""}`}>
                <button
                  ref={isCurrent ? currentEntryRef : undefined}
                  type="button"
                  className="player-collection-entry"
                  disabled={isCurrent}
                  aria-label={isCurrent ? `正在播放 ${entry.title}` : `打开 ${entry.title}`}
                  onClick={() => { onOpenVideo(entry.bvid, entry.title); onClose(); }}
                >
                  {entry.thumbnailUrl ? <img src={entry.thumbnailUrl} alt="" referrerPolicy="no-referrer" /> : <span className="player-collection-cover" aria-hidden="true" />}
                  <span className="player-collection-entry-body"><strong>{entry.title}</strong><small>{isCurrent ? "正在播放" : `${formatCount(entry.stats.viewCount)} 播放`} · {formatDuration(entry.durationSeconds)}</small></span>
                  {isCurrent && <span className="player-collection-playing">播放中</span>}
                </button>
                {onAddToLearningList && (
                  <button
                    type="button"
                    className="icon-button player-collection-add"
                    aria-label={`加入学习清单 ${entry.title}`}
                    title="加入学习清单"
                    onClick={() => onAddToLearningList(entry)}
                  >
                    <ListPlus size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function filterAndSortEntries(entries: VideoCollectionEntry[], keyword: string, order: CollectionOrder): VideoCollectionEntry[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const visible = entries.filter((entry) => !normalizedKeyword || entry.title.toLowerCase().includes(normalizedKeyword) || entry.bvid.toLowerCase().includes(normalizedKeyword));
  if (order === "newest") return [...visible].sort((left, right) => compareDates(right.publishedAt, left.publishedAt));
  if (order === "oldest") return [...visible].sort((left, right) => compareDates(left.publishedAt, right.publishedAt));
  if (order === "mostPlayed") return [...visible].sort((left, right) => right.stats.viewCount - left.stats.viewCount);
  return visible;
}

function compareDates(left?: string, right?: string): number {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return new Date(left).getTime() - new Date(right).getTime();
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatCount(value: number): string {
  return value >= 10_000 ? `${(value / 10_000).toFixed(1)}万` : String(Math.max(0, value));
}
