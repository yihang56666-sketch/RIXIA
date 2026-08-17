import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import {
  createBilibiliPublicContentService,
  extractBvid,
} from "../../lib/bilibili/publicContentService";
import {
  createSearchHistoryService,
} from "../../lib/bilibili/services";
import {
  DEFAULT_VIDEO_SEARCH_FILTER,
  VideoDurationRange,
  VideoPublishedRange,
  VideoSearchOrder,
  type VideoSearchResult,
} from "../../lib/bilibili/types";
import { useAppStore } from "../../store/useAppStore";

const ORDERS: Array<{ key: VideoSearchOrder; label: string }> = [
  { key: VideoSearchOrder.relevance, label: "综合" },
  { key: VideoSearchOrder.mostPlayed, label: "最多播放" },
  { key: VideoSearchOrder.newest, label: "最新发布" },
  { key: VideoSearchOrder.mostDanmaku, label: "最多弹幕" },
  { key: VideoSearchOrder.mostFavorited, label: "最多收藏" },
];

const DURATIONS: Array<{ key: VideoDurationRange; label: string }> = [
  { key: VideoDurationRange.any, label: "不限时长" },
  { key: VideoDurationRange.underTenMinutes, label: "<10 分钟" },
  { key: VideoDurationRange.tenToThirtyMinutes, label: "10-30 分钟" },
  { key: VideoDurationRange.thirtyToSixtyMinutes, label: "30-60 分钟" },
  { key: VideoDurationRange.overSixtyMinutes, label: ">60 分钟" },
];

const RANGES: Array<{ key: VideoPublishedRange; label: string }> = [
  { key: VideoPublishedRange.any, label: "不限时间" },
  { key: VideoPublishedRange.lastDay, label: "近一天" },
  { key: VideoPublishedRange.lastWeek, label: "近一周" },
  { key: VideoPublishedRange.lastHalfYear, label: "近半年" },
];

function formatDuration(seconds: number): string {
  if (!seconds) return "--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

export function BilibiliSearchPanel({
  onPick,
}: {
  onPick: (bvid: string, title: string) => void;
}) {
  const service = useMemo(() => createBilibiliPublicContentService(), []);
  const historyService = useMemo(() => createSearchHistoryService(), []);
  const [keyword, setKeyword] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState(DEFAULT_VIDEO_SEARCH_FILTER);
  const [results, setResults] = useState<VideoSearchResult[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    historyService.list().then(setHistory);
  }, [historyService]);

  async function runSearch(kw: string, p: number, f = filter) {
    if (!kw.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await service.searchVideos(kw, p, f);
      setResults(result.results);
      setTotalPages(result.totalPages);
      setPage(result.page);
      setSubmitted(kw);
      await historyService.record(kw);
      historyService.list().then(setHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    runSearch(keyword, 1);
  }

  function removeHistory(kw: string) {
    historyService.remove(kw).then(() => historyService.list().then(setHistory));
  }

  return (
    <div className="stack">
      <form className="bilibili-search-form" onSubmit={submit}>
        <input
          className="field"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索 B 站视频（如：考研数学）"
        />
        <button className="primary compact" type="submit" disabled={loading}>
          {loading ? <Loader2 size={15} className="spin" /> : <Search size={15} />}
          搜索
        </button>
      </form>

      <div className="bilibili-filter-row">
        <div className="segmented">
          {ORDERS.map((o) => (
            <button
              key={o.key}
              className={filter.order === o.key ? "segmented-item active" : "segmented-item"}
              onClick={() => {
                const next = { ...filter, order: o.key };
                setFilter(next);
                if (submitted) runSearch(submitted, 1, next);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <select
          className="field compact"
          value={filter.durationRange}
          onChange={(e) => {
            const next = { ...filter, durationRange: e.target.value as VideoDurationRange };
            setFilter(next);
            if (submitted) runSearch(submitted, 1, next);
          }}
        >
          {DURATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <select
          className="field compact"
          value={filter.publishedRange}
          onChange={(e) => {
            const next = { ...filter, publishedRange: e.target.value as VideoPublishedRange };
            setFilter(next);
            if (submitted) runSearch(submitted, 1, next);
          }}
        >
          {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </div>

      {history.length > 0 && !submitted && (
        <div className="bilibili-history">
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>最近搜索</p>
          <div className="chip-row">
            {history.map((kw) => (
              <span key={kw} className="chip-row-item">
                <button className="chip" onClick={() => { setKeyword(kw); runSearch(kw, 1); }}>
                  {kw}
                </button>
                <button className="chip-remove" onClick={() => removeHistory(kw)} aria-label={`删除 ${kw}`}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {error && <p className="background-error">{error}</p>}

      {results.length > 0 ? (
        <ul className="bilibili-result-list">
          {results.map((r) => (
            <li key={r.bvid} className="bilibili-result-item">
              <img
                src={r.thumbnailUrl}
                alt={r.title}
                className="bilibili-result-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
              />
              <div className="bilibili-result-info">
                <button
                  className="bilibili-result-title"
                  onClick={() => onPick(r.bvid, r.title)}
                  dangerouslySetInnerHTML={{ __html: r.title }}
                />
                <p className="muted bilibili-result-meta">
                  {r.ownerName} · {formatCount(r.playCount)} 播放 · {formatCount(r.danmakuCount)} 弹幕
                </p>
                <p className="muted bilibili-result-duration">{formatDuration(r.durationSeconds)}</p>
              </div>
              <button
                className="ghost-btn compact"
                onClick={() => onPick(r.bvid, r.title)}
                aria-label={`打开 ${r.title}`}
                title="打开"
              >
                <ArrowRight size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        submitted && !loading && <p className="muted">没有找到相关视频</p>
      )}

      {totalPages > 1 && (
        <div className="bilibili-pager">
          <button className="ghost-btn compact" disabled={page <= 1} onClick={() => runSearch(submitted, page - 1)}>
            上一页
          </button>
          <span className="muted">{page} / {totalPages}</span>
          <button className="ghost-btn compact" disabled={page >= totalPages} onClick={() => runSearch(submitted, page + 1)}>
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

export function BilibiliSearchView() {
  const addResource = useAppStore((state) => state.addResource);
  const setView = useAppStore((state) => state.setView);

  function handlePick(bvid: string, title: string) {
    const resource = addResource(bvid, title);
    if (!resource) {
      // 已存在，仍然跳到 library
      setView("library");
      return;
    }
    setView("library");
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>B 站视频搜索</h2>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
          搜索 B 站公开视频，点击结果直接添加到资料库。无需登录，仅使用公开 API。
        </p>
        <BilibiliSearchPanel onPick={handlePick} />
      </section>
    </div>
  );
}

export { extractBvid };
