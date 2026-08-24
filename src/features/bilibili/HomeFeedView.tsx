import { useEffect, useMemo, useState } from "react";
import { Flame, RefreshCw } from "lucide-react";
import { createBilibiliPublicContentService } from "../../lib/bilibili/publicContentService";
import { createSearchHistoryService } from "../../lib/bilibili/services";
import type { VideoSearchFilter, VideoSearchResult } from "../../lib/bilibili/types";
import { VideoSearchOrder, VideoDurationRange, VideoPublishedRange } from "../../lib/bilibili/types";
import { useAppStore } from "../../store/useAppStore";
import { Mi } from "./m3";

/**
 * RIXIA B 站首页 — 复刻 FocuBili 的 home_page.dart。
 *
 * FocuBili 首页没有推荐流：只有搜索按钮 + 右上角个人图标。
 * RIXIA 无后端、无登录态，这里通过搜索"热门"关键词返回最近一周播放量最高的视频，
 * 模拟 FocuBili 主动搜索为主的入口形态，同时保留搜索历史快速重搜。
 */

/** 去掉搜索接口标题里的 <em class="keyword"> 高亮标签并还原常见实体。 */
function stripHighlightTags(title: string): string {
  return title
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

export function HomeFeedView() {
  const service = useMemo(() => createBilibiliPublicContentService(), []);
  const historyService = useMemo(() => createSearchHistoryService(), []);
  const openBilibiliVideo = useAppStore((state) => state.openBilibiliVideo);
  const setView = useAppStore((state) => state.setView);
  const [results, setResults] = useState<VideoSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [activeKeyword, setActiveKeyword] = useState<string>("");

  const DEFAULT_KEYWORDS = ["考研", "考研数学", "考研英语", "考研政治", "学习", "网课"];

  useEffect(() => {
    void historyService.list().then(setHistory);
    void load("考研");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(keyword: string) {
    setLoading(true);
    setError("");
    setActiveKeyword(keyword);
    try {
      const filter: VideoSearchFilter = {
        order: VideoSearchOrder.mostPlayed,
        durationRange: VideoDurationRange.any,
        publishedRange: VideoPublishedRange.lastWeek,
      };
      const page = await service.searchVideos(keyword, 1, filter);
      setResults(page.results);
      await historyService.record(keyword);
      const historyNow = await historyService.list();
      setHistory(historyNow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  function formatPlay(count: number): string {
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
    return String(count);
  }

  return (
    <div className="fb fb-page">
      <header className="fb-appbar">
        <button className="m3-icon-btn" onClick={() => setView("focus-dashboard")} aria-label="返回首页" title="返回首页">
          <Mi name="arrow_back" />
        </button>
        <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>B 站发现</h1>
        <button
          className="m3-icon-btn"
          onClick={() => activeKeyword && void load(activeKeyword)}
          disabled={loading || !activeKeyword}
          aria-label="刷新"
          title="刷新"
        >
          {loading ? <span className="m3-circular-progress" style={{ width: 18, height: 18 }} /> : <Mi name="refresh" />}
        </button>
        <button className="m3-icon-btn" onClick={() => setView("search")} aria-label="主动搜索" title="主动搜索">
          <Mi name="search" />
        </button>
      </header>

      <div className="fb-scroll-page" style={{ maxWidth: 1180, margin: "0 auto", width: "100%" }}>
        <section className="m3-card" style={{ padding: 16 }}>
          <div className="m3-list-tile" style={{ minHeight: 56, padding: 0 }}>
            <span className="m3-tile-leading"><Mi name="trending_up" /></span>
            <span className="m3-tile-body">
              <span className="m3-title-md" style={{ fontWeight: 800 }}>热门关键词</span>
              <span className="m3-body-sm">按关键词查找本周播放量最高的 B 站公开视频，点击即可添加到资料库。</span>
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {DEFAULT_KEYWORDS.map((keyword) => (
              <button
                key={keyword}
                className={activeKeyword === keyword ? "m3-chip selected" : "m3-chip"}
                onClick={() => void load(keyword)}
                disabled={loading}
              >
                {activeKeyword === keyword && <Mi name="check" size={18} />}
                {keyword}
              </button>
            ))}
          </div>
        </section>

        {history.length > 0 && (
          <section className="m3-card" style={{ padding: 16, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Mi name="history" />
              <span className="m3-title-md" style={{ fontWeight: 800 }}>最近搜索</span>
              <span style={{ flex: 1 }} />
              <button
                className="m3-text-btn"
                onClick={async () => {
                  await historyService.clear();
                  const list = await historyService.list();
                  setHistory(list);
                }}
                aria-label="清空搜索历史"
                title="清空搜索历史"
              >
                <Mi name="delete_sweep" size={18} /> 清空
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {history.slice(0, 10).map((keyword) => (
                <button
                  key={keyword}
                  className={activeKeyword === keyword ? "m3-chip selected" : "m3-chip"}
                  onClick={() => void load(keyword)}
                  disabled={loading}
                >
                  {keyword}
                </button>
              ))}
            </div>
          </section>
        )}

        {loading && results.length === 0 && (
          <div style={{ display: "grid", placeItems: "center", padding: 60, marginTop: 12 }}>
            <span className="m3-circular-progress lg" />
            <p className="m3-body-md" style={{ marginTop: 12 }}>正在加载 {activeKeyword} 的热门视频…</p>
          </div>
        )}

        {error && (
          <section className="m3-card" style={{ padding: 24, marginTop: 12, textAlign: "center" }}>
            <Mi name="error_outline" size={36} style={{ display: "block", margin: "0 auto 8px" }} />
            <p className="m3-body-md fb-error-color">{error}</p>
            <button className="m3-outlined-btn" style={{ marginTop: 12 }} onClick={() => activeKeyword && void load(activeKeyword)}>
              <RefreshCw size={16} /> 重试
            </button>
          </section>
        )}

        {!loading && !error && results.length === 0 && (
          <section className="m3-card" style={{ padding: 40, marginTop: 12, textAlign: "center" }}>
            <Mi name="search_off" size={52} style={{ display: "block", margin: "0 auto 12px" }} />
            <p className="m3-body-lg">没有找到相关视频</p>
            <p className="m3-body-sm" style={{ marginTop: 6 }}>换一个关键词再试试吧。</p>
          </section>
        )}

        {results.length > 0 && (
          <>
            <p className="m3-body-sm" style={{ padding: "12px 4px 8px" }}>
              {loading ? "加载中…" : `"${activeKeyword}" · 共 ${results.length} 条结果`}
            </p>
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
                      onClick={() => openBilibiliVideo(r.bvid, stripHighlightTags(r.title))}
                    >
                      {stripHighlightTags(r.title)}
                    </button>
                    <p className="muted bilibili-result-meta">
                      {r.ownerName} · <Flame size={11} /> {formatPlay(r.playCount)} 播放
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
