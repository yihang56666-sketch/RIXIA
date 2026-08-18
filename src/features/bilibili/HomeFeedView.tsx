import { useEffect, useMemo, useState } from "react";
import { Flame, Loader2, TrendingUp } from "lucide-react";
import { createBilibiliPublicContentService } from "../../lib/bilibili/publicContentService";
import { createSearchHistoryService } from "../../lib/bilibili/services";
import type { VideoSearchFilter, VideoSearchResult } from "../../lib/bilibili/types";
import { VideoSearchOrder, VideoDurationRange, VideoPublishedRange } from "../../lib/bilibili/types";
import { useAppStore } from "../../store/useAppStore";

/**
 * RIXIA B 站首页 — 复刻 FocuBili 的 home_page.dart。
 *
 * 由于 RIXIA 是纯客户端、无登录态，没有"推荐流"——这里通过搜索"热门"或
 * "考研"等关键词，返回最近一周播放量最高的视频作为类似首页的发现流。
 */
export function HomeFeedView() {
  const service = useMemo(() => createBilibiliPublicContentService(), []);
  const historyService = useMemo(() => createSearchHistoryService(), []);
  const setView = useAppStore((state) => state.setView);
  const addResource = useAppStore((state) => state.addResource);
  const [results, setResults] = useState<VideoSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  const DEFAULT_KEYWORDS = ["考研", "考研数学", "考研英语", "考研政治", "学习", "网课"];

  useEffect(() => {
    historyService.list().then(setHistory);
    void load("考研");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(keyword: string) {
    setLoading(true);
    setError("");
    try {
      const filter: VideoSearchFilter = {
        order: VideoSearchOrder.mostPlayed,
        durationRange: VideoDurationRange.any,
        publishedRange: VideoPublishedRange.lastWeek,
      };
      const page = await service.searchVideos(keyword, 1, filter);
      setResults(page.results);
      await historyService.record(keyword);
      historyService.list().then(setHistory);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <h2>B 站发现</h2>
        <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
          按关键词查找本周播放量最高的 B 站公开视频，点击添加到资料库。
        </p>
        <div className="chip-row" style={{ marginTop: 10 }}>
          {DEFAULT_KEYWORDS.map((k) => (
            <button key={k} className="chip" onClick={() => load(k)}>
              <TrendingUp size={11} /> {k}
            </button>
          ))}
        </div>
      </section>

      {history.length > 0 && (
        <section className="card">
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>最近搜索</p>
          <div className="chip-row">
            {history.slice(0, 8).map((k) => (
              <button key={k} className="chip" onClick={() => load(k)}>{k}</button>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <section className="card">
          <p className="muted"><Loader2 size={14} className="spin" /> 加载中…</p>
        </section>
      )}

      {error && <section className="card"><p className="background-error">{error}</p></section>}

      {results.length > 0 && (
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
                  onClick={() => { addResource(r.bvid, r.title); setView("bilibili-player"); }}
                  dangerouslySetInnerHTML={{ __html: r.title }}
                />
                <p className="muted bilibili-result-meta">
                  {r.ownerName} · <Flame size={11} /> {r.playCount >= 10000 ? `${(r.playCount / 10000).toFixed(1)}万` : r.playCount} 播放
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
