/**
 * 本机观看记录页 — 1:1 React 移植自 FocuBili 的
 * watch_history_page.dart（589 行）。
 *
 * 结构：本机专属说明卡 → 搜索框（仅有记录时显示）→ 加载/错误/空/列表四态 →
 * 缺失缩略图批量补齐（每批最多两个并发请求）→ 卡片点击先查询最新详情再播放 →
 * 删除/清空均需二次确认对话框。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, Search } from "lucide-react";
import { createBilibiliPublicContentService } from "../../lib/bilibili/publicContentService";
import { createWatchHistoryService, type LocalWatchHistoryEntry } from "../../lib/bilibili/watchHistoryService";
import { useAppStore } from "../../store/useAppStore";
import { M3Dialog, Mi } from "./m3";

function formatPosition(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe <= 0) return "";
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return h > 0 ? h + ":" + String(m).padStart(2, "0") + ":" + String(rest).padStart(2, "0") : m + ":" + String(rest).padStart(2, "0");
}

function formatWatchedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (v: number) => String(v).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

export function LocalWatchHistoryView() {
  const service = useMemo(() => createWatchHistoryService(), []);
  const bilibiliService = useMemo(() => createBilibiliPublicContentService(), []);
  const openBilibiliVideoAt = useAppStore((state) => state.openBilibiliVideoAt);

  const [entries, setEntries] = useState<LocalWatchHistoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openingBvid, setOpeningBvid] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<LocalWatchHistoryEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const backfillInFlight = useRef<Set<string>>(new Set());

  const backfillMissingThumbnails = useCallback(async (sourceEntries: LocalWatchHistoryEntry[]) => {
    const missing = [...new Set(sourceEntries.filter((entry) => !entry.thumbnailUrl).map((entry) => entry.bvid))]
      .filter((bvid) => !backfillInFlight.current.has(bvid));
    if (missing.length === 0) return;
    missing.forEach((bvid) => backfillInFlight.current.add(bvid));
    const thumbnailUrls: Record<string, string> = {};
    for (let offset = 0; offset < missing.length; offset += 2) {
      const batch = missing.slice(offset, offset + 2);
      const results = await Promise.all(batch.map(async (bvid) => {
        try {
          const video = await bilibiliService.lookupVideo(bvid);
          return video.thumbnailUrl ? [bvid, video.thumbnailUrl] as const : null;
        } catch {
          return null;
        }
      }));
      for (const result of results) {
        if (result) thumbnailUrls[result[0]] = result[1];
      }
    }
    missing.forEach((bvid) => backfillInFlight.current.delete(bvid));
    if (Object.keys(thumbnailUrls).length === 0) return;
    const updated = await service.backfillThumbnails(thumbnailUrls);
    setEntries(updated);
  }, [bilibiliService, service]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const items = await service.list();
      setEntries(items);
      setLoading(false);
      void backfillMissingThumbnails(items);
    } catch {
      setEntries([]);
      setLoading(false);
      setLoadError("读取本机观看记录失败，请稍后重试。");
    }
  }, [backfillMissingThumbnails, service]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return entries;
    return entries.filter((entry) =>
      [entry.title, entry.ownerName, entry.bvid].join("\n").toLowerCase().includes(keyword),
    );
  }, [entries, query]);

  async function openEntry(entry: LocalWatchHistoryEntry) {
    if (openingBvid) return;
    setOpeningBvid(entry.bvid);
    try {
      const video = await bilibiliService.lookupVideo(entry.bvid);
      setOpeningBvid(null);
      openBilibiliVideoAt(video.bvid, video.title, entry.cid, entry.positionSeconds);
    } catch (error) {
      setOpeningBvid(null);
      setMessage(error instanceof Error ? error.message : "无法打开该视频，请稍后重试。");
    }
  }

  async function removeEntry(entry: LocalWatchHistoryEntry) {
    setConfirmRemove(null);
    try {
      setEntries(await service.remove(entry.bvid));
    } catch {
      setMessage("移除本机观看记录失败，请稍后重试。");
    }
  }

  async function clearAll() {
    setConfirmClear(false);
    try {
      setEntries(await service.clear());
    } catch {
      setMessage("清空本机观看记录失败，请稍后重试。");
    }
  }

  return (
    <div className="fb fb-page">
      <header className="fb-appbar">
        <button className="m3-icon-btn" onClick={() => useAppStore.getState().setView("settings")} aria-label="返回我的" title="返回我的">
          <Mi name="arrow_back" />
        </button>
        <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>本机观看记录</h1>
        {entries.length > 0 && (
          <button className="m3-icon-btn" onClick={() => setConfirmClear(true)} aria-label="清空本机观看记录" title="清空本机观看记录">
            <Mi name="delete_sweep" />
          </button>
        )}
      </header>

      <div className="fb-scroll-page" style={{ maxWidth: 1180, margin: "0 auto", width: "100%" }}>
        <section className="m3-card watch-history-notice" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <Mi name="devices" size={20} />
          <span className="m3-body-sm">仅保存在本机，不与 B 站账号或云端观看历史同步。</span>
        </section>

        {!loading && !loadError && entries.length > 0 && (
          <section className="m3-card" style={{ marginTop: 12, padding: 16 }}>
            <div className="m3-list-tile" style={{ padding: 0, minHeight: 56 }}>
              <span className="m3-tile-leading"><Mi name="history" /></span>
              <span className="m3-tile-body">
                <span className="m3-title-md" style={{ fontWeight: 800 }}>本机观看记录</span>
                <span className="m3-body-sm">仅保存在当前设备，可从上次播放位置继续</span>
              </span>
            </div>
            <div className="m3-field" style={{ marginTop: 10 }}>
              <Search size={18} aria-hidden="true" />
              <input aria-label="搜索本机观看记录" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、UP 主、分P或 BV 号" />
            </div>
          </section>
        )}

        {message && (
          <section className="m3-card" style={{ marginTop: 12, padding: 16, textAlign: "center" }}>
            <p className="m3-body-md" role="status">{message}</p>
          </section>
        )}

        {loading && (
          <section className="m3-card watch-history-state" style={{ marginTop: 12, padding: 40, display: "grid", placeItems: "center", gap: 10 }}>
            <span className="m3-circular-progress lg" />
            <p className="m3-body-md">正在读取本机观看记录…</p>
          </section>
        )}

        {!loading && loadError && (
          <section className="m3-card watch-history-state" style={{ marginTop: 12, padding: 40, display: "grid", placeItems: "center", gap: 10 }}>
            <Mi name="error_outline" size={40} />
            <p className="m3-body-md">{loadError}</p>
            <button className="m3-outlined-btn" onClick={() => void loadHistory()}>重试</button>
          </section>
        )}

        {!loading && !loadError && entries.length === 0 && (
          <section className="m3-card watch-history-state" style={{ marginTop: 12, padding: 48, display: "grid", placeItems: "center", gap: 10, textAlign: "center" }}>
            <Mi name="history_toggle_off" size={52} />
            <p className="m3-body-lg">还没有本机观看记录</p>
            <p className="m3-body-sm">播放视频后会自动记录最近观看的位置。</p>
          </section>
        )}

        {!loading && !loadError && entries.length > 0 && filtered.length === 0 && (
          <section className="m3-card watch-history-state" style={{ marginTop: 12, padding: 48, display: "grid", placeItems: "center" }}>
            <Mi name="search_off" size={52} />
            <p className="m3-body-lg" style={{ marginTop: 12 }}>没有匹配的观看记录</p>
          </section>
        )}

        {!loading && !loadError && filtered.length > 0 && (
          <ul className="bilibili-result-list" style={{ marginTop: 12 }}>
            {filtered.map((entry) => {
              const opening = openingBvid === entry.bvid;
              return (
                <li key={entry.bvid} className="bilibili-result-item">
                  <button
                    type="button"
                    className="watch-history-thumbnail"
                    onClick={() => void openEntry(entry)}
                    disabled={opening}
                    title="继续播放"
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    {entry.thumbnailUrl ? (
                      <img src={entry.thumbnailUrl} alt="" className="bilibili-result-cover" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="bilibili-result-cover watch-history-cover-placeholder"><Play size={18} /></div>
                    )}
                    {formatPosition(entry.positionSeconds) && (
                      <span className="watch-history-position-badge">已看 {formatPosition(entry.positionSeconds)}</span>
                    )}
                    {opening && (
                      <span className="watch-history-cover-loading"><Loader2 size={18} className="spin" /></span>
                    )}
                  </button>
                  <div className="bilibili-result-info">
                    <button className="bilibili-result-title" aria-label={"继续播放 " + entry.title} onClick={() => void openEntry(entry)} disabled={opening}>{entry.title}</button>
                    <p className="muted bilibili-result-meta">{entry.ownerName}</p>
                    <p className="muted bilibili-result-meta">上次看至 {formatWatchedAt(entry.watchedAt)}</p>
                  </div>
                  <button className="m3-icon-btn" aria-label={"移除 " + entry.title} title="移除记录" onClick={() => setConfirmRemove(entry)}><Mi name="delete" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmRemove && (
        <M3Dialog
          title="移除观看记录"
          onClose={() => setConfirmRemove(null)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setConfirmRemove(null)}>取消</button>
              <button className="m3-filled-btn" onClick={() => void removeEntry(confirmRemove)}>移除</button>
            </>
          }
        >
          确定移除"{confirmRemove.title}"吗？此操作只影响本机。
        </M3Dialog>
      )}

      {confirmClear && (
        <M3Dialog
          title="清空本机观看记录"
          onClose={() => setConfirmClear(false)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setConfirmClear(false)}>取消</button>
              <button className="m3-filled-btn" onClick={() => void clearAll()}>确认清空</button>
            </>
          }
        >
          确定清空全部本机观看记录吗？此操作不能撤销，也不会影响 B 站账号。
        </M3Dialog>
      )}
    </div>
  );
}
