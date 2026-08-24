/**
 * 学习清单页 — 1:1 React 移植自 FocuBili 的
 * learning_list_page.dart（624 行）+ learning_video_launcher.dart（85 行）。
 *
 * 结构：可搜索的 AppBar → 待学习（可拖拽排序）→ 已完成分区。
 * 每条卡片带封面、分 P 信息、进度条、状态菜单、继续学习和移除入口。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLearningListService } from "../../lib/bilibili/services";
import type { LearningListEntry, LearningListStatus } from "../../lib/bilibili/types";
import { useAppStore } from "../../store/useAppStore";
import { M3Dialog, Mi } from "./m3";

const STATUS_ITEMS: Array<{ value: LearningListStatus; label: string }> = [
  { value: "not-started", label: "未开始" },
  { value: "learning", label: "学习中" },
  { value: "completed", label: "已完成" },
];

function statusColor(status: LearningListStatus): string {
  if (status === "not-started") return "var(--m3-outline)";
  if (status === "learning") return "var(--m3-primary)";
  return "var(--m3-success)";
}

function formatPosition(seconds: number): string {
  const total = Math.min(24 * 3600, Math.max(0, Math.floor(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function entryStatus(entry: LearningListEntry): LearningListStatus {
  if (entry.status) return entry.status;
  if (entry.completedAt) return "completed";
  if (entry.lastOpenedAt) return "learning";
  return "not-started";
}

export function LearningListView() {
  const service = useMemo(() => createLearningListService(), []);
  const openBilibiliVideoAt = useAppStore((state) => state.openBilibiliVideoAt);
  const setView = useAppStore((state) => state.setView);

  const [entries, setEntries] = useState<LearningListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [reordering, setReordering] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<LearningListEntry | null>(null);
  const [statusMenuId, setStatusMenuId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const next = await service.list();
    setEntries(next);
    setLoading(false);
  }, [service]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = useCallback(
    (entry: LearningListEntry) => {
      if (normalizedQuery.length === 0) return true;
      const haystack = [entry.title, entry.ownerName, entry.partTitle ?? "", `p${entry.partPageNumber ?? 1}`]
        .join("\n")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    },
    [normalizedQuery],
  );

  const activeEntries = entries.filter((entry) => entryStatus(entry) !== "completed" && matches(entry));
  const completedEntries = entries.filter((entry) => entryStatus(entry) === "completed" && matches(entry));

  async function openEntry(entry: LearningListEntry) {
    if (openingId || updatingId || reordering) return;
    const stableId = `${entry.bvid}:${entry.partCid ?? 0}`;
    setOpeningId(stableId);
    try {
      await service.markOpened(entry.id);
      openBilibiliVideoAt(
        entry.bvid,
        entry.title,
        entry.partCid ?? 0,
        entry.positionSeconds ?? 0,
      );
    } finally {
      setOpeningId(null);
    }
  }

  async function changeStatus(entry: LearningListEntry, status: LearningListStatus) {
    if (updatingId || entryStatus(entry) === status || reordering) return;
    setUpdatingId(`${entry.bvid}:${entry.partCid ?? 0}`);
    setStatusMenuId(null);
    try {
      await service.setStatus(entry.id, status);
      await reload();
    } finally {
      setUpdatingId(null);
    }
  }

  async function removeEntry(entry: LearningListEntry) {
    if (updatingId || reordering) return;
    setUpdatingId(`${entry.bvid}:${entry.partCid ?? 0}`);
    setPendingRemove(null);
    try {
      await service.remove(entry.id);
      await reload();
    } finally {
      setUpdatingId(null);
    }
  }

  // ---- 指针拖拽排序（对应 ReorderableListView + drag handle） ----
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef(0);
  const dragHysteresis = useRef(0);

  const commitOrder = useCallback(
    async (ordered: LearningListEntry[]) => {
      if (normalizedQuery.length > 0 || reordering) return;
      setReordering(true);
      try {
        await service.reorderIncomplete(ordered.map((entry) => entry.id));
      } catch {
        // 写入失败也要重新拉取，避免界面顺序与存储不一致
      } finally {
        await reload();
        setReordering(false);
      }
    },
    [service, reload, normalizedQuery.length, reordering],
  );

  function onDragStart(event: React.PointerEvent, entry: LearningListEntry) {
    if (normalizedQuery.length > 0 || updatingId || reordering) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    dragStartY.current = event.clientY;
    dragHysteresis.current = 0;
    setDragId(entry.id);
  }

  function onDragMove(event: React.PointerEvent) {
    if (!dragId) return;
    const dy = event.clientY - dragStartY.current;
    setDragOffset(dy);
    const draggedIndex = activeEntries.findIndex((entry) => entry.id === dragId);
    if (draggedIndex < 0) return;
    const draggedNode = itemRefs.current.get(dragId);
    if (!draggedNode) return;
    const draggedMid = draggedNode.getBoundingClientRect().top + draggedNode.offsetHeight / 2 + dy - dragHysteresis.current;
    for (let index = 0; index < activeEntries.length; index += 1) {
      if (index === draggedIndex) continue;
      const node = itemRefs.current.get(activeEntries[index]!.id);
      if (!node) continue;
      const mid = node.getBoundingClientRect().top + node.offsetHeight / 2;
      const crossed = draggedIndex < index ? draggedMid >= mid : draggedMid <= mid;
      if (!crossed) continue;
      const next = [...activeEntries];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(index, 0, moved!);
      dragHysteresis.current += dy;
      dragStartY.current = event.clientY;
      setDragOffset(0);
      setEntries((prev) => {
        const completed = prev.filter((item) => entryStatus(item) === "completed");
        return [...next, ...completed];
      });
      break;
    }
  }

  function onDragEnd() {
    if (!dragId) return;
    setDragId(null);
    setDragOffset(0);
    void commitOrder(activeEntries);
  }

  // ---- 卡片 ----
  function EntryCard({ entry, reorderable }: { entry: LearningListEntry; reorderable: boolean }) {
    const stableId = `${entry.bvid}:${entry.partCid ?? 0}`;
    const opening = openingId === stableId;
    const updating = updatingId === stableId;
    const completed = entryStatus(entry) === "completed";
    const durationMs = entry.durationSeconds * 1000;
    const positionMs = (entry.positionSeconds ?? 0) * 1000;
    const progress = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;
    const busy = opening || updating || reordering;
    return (
      <section className="m3-card" style={{ display: "grid" }}>
        <div
          className="m3-list-tile"
          style={{ padding: "10px 8px 4px 12px", alignItems: "flex-start", cursor: busy ? "default" : "pointer" }}
          onClick={() => {
            if (!busy) void openEntry(entry);
          }}
        >
          <span style={{ width: 88, height: 54, borderRadius: 8, overflow: "hidden", flex: "0 0 88px", background: "color-mix(in srgb, #000 7%, transparent)", display: "grid", placeItems: "center" }}>
            {entry.coverUrl ? (
              <img src={entry.coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
            ) : (
              <Mi name="menu_book" size={22} />
            )}
          </span>
          <span className="m3-tile-body">
            <span style={{ fontWeight: 700, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{entry.title}</span>
            <span className="m3-body-sm" style={{ marginTop: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              P{entry.partPageNumber ?? 1} {entry.partTitle ?? ""}
              <br />
              {entry.ownerName}
            </span>
          </span>
          <span className="m3-tile-trailing">
            {updating ? (
              <span className="m3-circular-progress" />
            ) : (
              <span className="m3-menu-anchor" onClick={(event) => event.stopPropagation()}>
                <button
                  className="m3-icon-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    setStatusMenuId(statusMenuId === stableId ? null : stableId);
                  }}
                  aria-label="修改学习状态"
                  title="修改学习状态"
                >
                  <Mi name="more_vert" />
                </button>
                {statusMenuId === stableId && (
                  <div className="m3-menu">
                    {STATUS_ITEMS.map((item) => (
                      <button
                        key={item.value}
                        className="m3-menu-item"
                        onClick={(event) => {
                          event.stopPropagation();
                          void changeStatus(entry, item.value);
                        }}
                      >
                        <Mi
                          name={entryStatus(entry) === item.value ? "check_circle" : "circle"}
                          size={18}
                          style={{ color: statusColor(item.value) }}
                        />
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </span>
            )}
            {reorderable && (
              <button
                className="m3-icon-btn"
                style={{ cursor: "grab", touchAction: "none" }}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => onDragStart(event, entry)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                aria-label="拖动排序"
                title="拖动排序"
              >
                <Mi name="drag_indicator" />
              </button>
            )}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 16px 0" }}>
          <div className="m3-linear-progress" style={{ minHeight: 5 }}>
            <div style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="m3-label-sm" style={{ flex: "0 0 auto" }}>
            {formatPosition(positionMs / 1000)} / {formatPosition(durationMs / 1000)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px 6px" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: statusColor(entryStatus(entry)) }} />
          <span className="m3-label-md">{STATUS_ITEMS.find((item) => item.value === entryStatus(entry))?.label}</span>
          <span style={{ flex: 1 }} />
          <button
            className="m3-text-btn"
            disabled={opening || updating || reordering || completed}
            onClick={() => void openEntry(entry)}
          >
            {opening ? (
              <span className="m3-circular-progress" />
            ) : (
              <Mi name={completed ? "task_alt" : "play_arrow"} size={18} />
            )}
            {completed ? "已完成" : "继续学习"}
          </button>
          <button
            className="m3-icon-btn"
            disabled={opening || updating || reordering}
            onClick={() => setPendingRemove(entry)}
            aria-label="移出学习清单"
            title="移出学习清单"
          >
            <Mi name="delete" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="fb fb-page">
      <header className="fb-appbar">
        {searching ? (
          <div className="m3-field" style={{ flex: 1, margin: "0 8px", minHeight: 48 }}>
            <Mi name="search" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索视频、UP 主或分 P"
            />
          </div>
        ) : (
          <button className="m3-icon-btn" onClick={() => setView("focus-dashboard")} aria-label="返回首页">
            <Mi name="arrow_back" />
          </button>
        )}
        {!searching && <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>学习清单</h1>}
        <button
          className="m3-icon-btn"
          onClick={() => {
            if (searching) {
              setQuery("");
              setSearching(false);
            } else {
              setSearching(true);
            }
          }}
          aria-label={searching ? "关闭搜索" : "搜索学习清单"}
          title={searching ? "关闭搜索" : "搜索学习清单"}
        >
          <Mi name={searching ? "close" : "search"} />
        </button>
        <button
          className="m3-icon-btn"
          disabled={loading || reordering}
          onClick={() => void reload()}
          aria-label="刷新学习清单"
          title="刷新学习清单"
        >
          <Mi name="refresh" />
        </button>
      </header>

      <div className="fb-scroll-page" style={{ maxWidth: 1180, margin: "0 auto", width: "100%" }}>
        {loading && entries.length === 0 ? (
          <div style={{ display: "grid", placeItems: "center", padding: 80 }}>
            <span className="m3-circular-progress lg" />
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 16px 8px" }}>
              <p className="m3-title-sm" style={{ fontWeight: 800 }}>
                {query.trim().length === 0 ? "待学习" : "搜索结果"}
              </p>
              <p className="m3-body-sm" style={{ marginTop: 4 }}>
                {query.trim().length === 0
                  ? "拖动右侧图标调整学习顺序；完成后会自动移到列表末尾。"
                  : "搜索时不能调整顺序，清空搜索后可继续拖动排序。"}
              </p>
              {reordering && (
                <div className="m3-linear-progress" style={{ marginTop: 8 }}>
                  <div style={{ width: "40%" }} />
                </div>
              )}
            </div>

            {activeEntries.length === 0 && completedEntries.length === 0 ? (
              <div style={{ padding: "64px 24px 32px", textAlign: "center" }}>
                <Mi name="search_off" size={52} />
                <p className="m3-body-lg" style={{ marginTop: 12 }}>
                  {query.trim().length === 0 ? "还没有学习任务" : "没有匹配的学习任务"}
                </p>
                <p className="m3-body-md" style={{ marginTop: 6 }}>
                  {query.trim().length === 0
                    ? "在搜索、视频详情或合集条目中加入某个分 P 吧。"
                    : "试试视频标题、UP 主、分 P 标题或 P 序号。"}
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10, padding: "0 16px" }}>
                {activeEntries.map((entry) => (
                  <div
                    key={entry.id}
                    ref={(node) => {
                      if (node) itemRefs.current.set(entry.id, node);
                      else itemRefs.current.delete(entry.id);
                    }}
                    style={{
                      transform: dragId === entry.id ? `translateY(${dragOffset}px)` : undefined,
                      transition: dragId === entry.id ? "none" : "transform 180ms ease",
                      zIndex: dragId === entry.id ? 10 : undefined,
                      position: dragId === entry.id ? "relative" : undefined,
                      boxShadow: dragId === entry.id ? "0 4px 16px rgba(0,0,0,0.18)" : undefined,
                      borderRadius: 20,
                    }}
                  >
                    <EntryCard entry={entry} reorderable={query.trim().length === 0} />
                  </div>
                ))}
              </div>
            )}

            {completedEntries.length > 0 && (
              <div style={{ padding: "18px 16px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, height: 1, background: "var(--m3-outline-variant)" }} />
                  <span className="m3-label-lg" style={{ fontWeight: 800 }}>已完成（{completedEntries.length}）</span>
                  <span style={{ flex: 1, height: 1, background: "var(--m3-outline-variant)" }} />
                </div>
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  {completedEntries.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} reorderable={false} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {pendingRemove && (
        <M3Dialog
          title="移出学习清单"
          onClose={() => setPendingRemove(null)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setPendingRemove(null)}>取消</button>
              <button className="m3-filled-btn" onClick={() => void removeEntry(pendingRemove)}>移除</button>
            </>
          }
        >
          确定“{pendingRemove.title}”的 P{pendingRemove.partPageNumber ?? 1} 吗？观看记录和笔记不会被删除。
        </M3Dialog>
      )}
    </div>
  );
}
