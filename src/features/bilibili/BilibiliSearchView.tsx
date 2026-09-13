/**
 * 搜索页 — 1:1 React 移植自 FocuBili 的 search_page.dart（2080 行）。
 *
 * 视频/用户双模式、候选词高亮、搜索历史、排序与筛选面板、BV 直达、
 * 分页加载、分集角标补查（并发 ≤2）、加入/取消学习清单。
 * 宽屏（≥900 且横向）左侧 320px 条件栏 + 右侧结果区；手机一体化顶栏。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBilibiliPublicContentService,
} from "../../lib/bilibili/publicContentService";
import { createLearningListService, createSearchHistoryService } from "../../lib/bilibili/services";
import { createDiagnosticsService } from "../../lib/bilibili/diagnosticsService";
import { createId } from "../../lib/id";
import {
  DEFAULT_USER_SEARCH_FILTER,
  DEFAULT_VIDEO_SEARCH_FILTER,
  VideoDurationRange,
  VideoPublishedRange,
  VideoSearchOrder,
  UserSearchOrder,
  UserSearchType,
  type UserSearchResult,
  type VideoPreview,
  type VideoSearchResult,
} from "../../lib/bilibili/types";
import type { LearningListEntry } from "../../lib/bilibili/types";
import { useAppStore } from "../../store/useAppStore";
import { M3Dialog, Mi, useM3Feedback } from "./m3";

const BV_PATTERN = /BV[0-9A-Za-z]{10}/i;

const CATEGORIES: Array<{ id: number | null; label: string }> = [
  { id: null, label: "全部" },
  { id: 1, label: "动画" },
  { id: 13, label: "番剧" },
  { id: 168, label: "国创" },
  { id: 3, label: "音乐" },
  { id: 129, label: "舞蹈" },
  { id: 4, label: "游戏" },
  { id: 36, label: "知识" },
  { id: 188, label: "科技" },
  { id: 234, label: "运动" },
  { id: 223, label: "汽车" },
  { id: 160, label: "生活" },
  { id: 211, label: "美食" },
  { id: 217, label: "动物" },
  { id: 119, label: "鬼畜" },
  { id: 155, label: "时尚" },
  { id: 202, label: "资讯" },
  { id: 5, label: "娱乐" },
  { id: 181, label: "影视" },
  { id: 177, label: "纪录" },
  { id: 23, label: "电影" },
  { id: 11, label: "电视" },
];

type Mode = "videos" | "users";

function orderLabel(order: VideoSearchOrder): string {
  switch (order) {
    case VideoSearchOrder.relevance: return "默认排序";
    case VideoSearchOrder.mostPlayed: return "播放多";
    case VideoSearchOrder.newest: return "新发布";
    case VideoSearchOrder.mostDanmaku: return "弹幕多";
    case VideoSearchOrder.mostFavorited: return "收藏多";
  }
}

function userOrderLabel(order: UserSearchOrder): string {
  switch (order) {
    case UserSearchOrder.defaultOrder: return "默认排序";
    case UserSearchOrder.fansDescending: return "粉丝多";
    case UserSearchOrder.fansAscending: return "粉丝少";
    case UserSearchOrder.levelDescending: return "等级高";
    case UserSearchOrder.levelAscending: return "等级低";
  }
}

function userTypeLabel(type: UserSearchType): string {
  switch (type) {
    case UserSearchType.all: return "全部用户";
    case UserSearchType.uploader: return "UP 主";
    case UserSearchType.normal: return "普通用户";
    case UserSearchType.certified: return "认证用户";
  }
}

function publishedRangeLabel(range: VideoPublishedRange): string {
  switch (range) {
    case VideoPublishedRange.any: return "全部日期";
    case VideoPublishedRange.lastDay: return "最近一天";
    case VideoPublishedRange.lastWeek: return "最近一周";
    case VideoPublishedRange.lastHalfYear: return "最近半年";
  }
}

function durationRangeLabel(range: VideoDurationRange): string {
  switch (range) {
    case VideoDurationRange.any: return "全部时长";
    case VideoDurationRange.underTenMinutes: return "0-10分钟";
    case VideoDurationRange.tenToThirtyMinutes: return "10-30分钟";
    case VideoDurationRange.thirtyToSixtyMinutes: return "30-60分钟";
    case VideoDurationRange.overSixtyMinutes: return "60分钟+";
  }
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function formatPublishedAt(iso: string | undefined): string {
  if (!iso) return "发布日期未知";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs >= 0 && diffMs < 3600_000) {
    const minutes = Math.min(59, Math.max(1, Math.floor(diffMs / 60_000)));
    return `${minutes}分钟前`;
  }
  if (diffMs >= 0 && diffMs < 86_400_000) return `${Math.floor(diffMs / 3600_000)}小时前`;
  if (diffMs >= 0 && diffMs < 7 * 86_400_000) return `${Math.floor(diffMs / 86_400_000)}天前`;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (date.getFullYear() === now.getFullYear()) return `${month}-${day}`;
  return `${String(date.getFullYear()).padStart(4, "0")}-${month}-${day}`;
}

function formatCount(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}万`;
  return String(value);
}

function activeFilterCount(filter: typeof DEFAULT_VIDEO_SEARCH_FILTER): number {
  let count = 0;
  if (filter.publishedRange !== VideoPublishedRange.any) count += 1;
  if (filter.durationRange !== VideoDurationRange.any) count += 1;
  if (filter.categoryId != null) count += 1;
  return count;
}

export function BilibiliSearchView() {
  const service = useMemo(() => createBilibiliPublicContentService(), []);
  const historyService = useMemo(() => createSearchHistoryService(), []);
  const learningListService = useMemo(() => createLearningListService(), []);
  const diagnostics = useMemo(() => createDiagnosticsService(), []);

  const setView = useAppStore((state) => state.setView);
  const openBilibiliVideoAt = useAppStore((state) => state.openBilibiliVideoAt);
  const openBilibiliVideo = useAppStore((state) => state.openBilibiliVideo);
  const openBilibiliCreator = useAppStore((state) => state.openBilibiliCreator);
  const pendingBilibiliSearch = useAppStore((state) => state.pendingBilibiliSearch);
  const consumePendingBilibiliSearch = useAppStore((state) => state.consumePendingBilibiliSearch);
  const showTransient = useM3Feedback().showMessage;

  const [mode, setMode] = useState<Mode>("videos");
  const [keyword, setKeyword] = useState("");
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [activeQuery, setActiveQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [directResult, setDirectResult] = useState<VideoPreview | null>(null);
  const [videoResults, setVideoResults] = useState<VideoSearchResult[]>([]);
  const [userResults, setUserResults] = useState<UserSearchResult[]>([]);
  const [filter, setFilter] = useState({ ...DEFAULT_VIDEO_SEARCH_FILTER });
  const [userFilter, setUserFilter] = useState({ ...DEFAULT_USER_SEARCH_FILTER });
  const [openingBvid, setOpeningBvid] = useState<string | null>(null);
  const [addingBvid, setAddingBvid] = useState<string | null>(null);
  const [learningTaskIds, setLearningTaskIds] = useState<Map<string, string>>(new Map());
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [userFilterSheetOpen, setUserFilterSheetOpen] = useState(false);
  const [clearHistoryConfirm, setClearHistoryConfirm] = useState(false);
  const [removeConfirmBvid, setRemoveConfirmBvid] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState(window.innerWidth >= 900 && window.innerWidth > window.innerHeight);

  const suggestionDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGeneration = useRef(0);
  const suggestionGeneration = useRef(0);
  const resultScrollRef = useRef<HTMLDivElement | null>(null);
  const knownInitialPartCids = useRef(new Map<string, number>());

  useEffect(() => () => {
    searchGeneration.current += 1;
    suggestionGeneration.current += 1;
  }, []);

  useEffect(() => {
    const onResize = () => setWorkspace(window.innerWidth >= 900 && window.innerWidth > window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const replaceLearningTaskIds = useCallback((entries: LearningListEntry[]) => {
    setLearningTaskIds(new Map(entries.map((entry) => [`${entry.bvid}:${entry.partCid ?? 0}`, entry.id])));
  }, []);

  useEffect(() => {
    void historyService.list().then(setHistory);
    void learningListService.list().then(replaceLearningTaskIds);
  }, [historyService, learningListService, replaceLearningTaskIds]);

  useEffect(() => {
    const generation = ++suggestionGeneration.current;
    if (suggestionDebounce.current) clearTimeout(suggestionDebounce.current);
    const input = keyword.trim();
    if (mode === "users" || input.length === 0 || BV_PATTERN.test(input)) {
      setSuggestions([]);
      return;
    }
    suggestionDebounce.current = setTimeout(() => {
      void service
        .suggestKeywords(input)
        .then((values) => {
          if (generation === suggestionGeneration.current) setSuggestions(values);
        })
        .catch(() => {
          if (generation === suggestionGeneration.current) setSuggestions([]);
        });
    }, 350);
    return () => {
      suggestionGeneration.current += 1;
      if (suggestionDebounce.current) clearTimeout(suggestionDebounce.current);
    };
  }, [keyword, mode, service]);

  const isBvidInput = (value: string) => BV_PATTERN.test(value);

  const submitSearch = useCallback(
    async (
      input?: string,
      filterOverride?: typeof DEFAULT_VIDEO_SEARCH_FILTER,
      userFilterOverride?: typeof DEFAULT_USER_SEARCH_FILTER,
      modeOverride?: Mode,
    ) => {
      const value = (input ?? keyword).trim();
      const effectiveFilter = filterOverride ?? filter;
      const effectiveUserFilter = userFilterOverride ?? userFilter;
      const searchMode = modeOverride ?? mode;
      const generation = ++searchGeneration.current;
      suggestionGeneration.current += 1;
      setFocused(false);
      if (suggestionDebounce.current) clearTimeout(suggestionDebounce.current);
      setLoading(true);
      setLoadingMore(false);
      setOpeningBvid(null);
      setHasSubmitted(true);
      setError(null);
      setDirectResult(null);
      setVideoResults([]);
      setUserResults([]);
      setSuggestions([]);
      setActiveQuery(value);
      setCurrentPage(0);
      setTotalPages(0);
      try {
        if (value.length === 0) {
          throw new Error(searchMode === "videos" ? "请输入关键词、BV 号或视频链接。" : "请输入要搜索的用户名。");
        }
        await historyService.record(value);
        const historyNow = await historyService.list();
        const opensDirectly = searchMode === "videos" && isBvidInput(value);
        const direct = opensDirectly ? await service.lookupVideo(value) : null;
        const videoPage = opensDirectly || searchMode === "users" ? null : await service.searchVideos(value, 1, effectiveFilter);
        const userPage = searchMode === "users" ? await service.searchUsers(value, 1, effectiveUserFilter) : null;
        if (generation !== searchGeneration.current) return;
        setHistory(historyNow);
        setDirectResult(direct);
        setVideoResults(videoPage?.results ?? []);
        setUserResults(userPage?.results ?? []);
        setCurrentPage(videoPage?.page ?? userPage?.page ?? 0);
        setTotalPages(videoPage?.totalPages ?? userPage?.totalPages ?? 0);
        setLoading(false);
        if (resultScrollRef.current) resultScrollRef.current.scrollTop = 0;
      } catch (err) {
        if (generation !== searchGeneration.current) return;
        if (value.length > 0) {
          void diagnostics.record(err instanceof Error ? err.message : "网络连接失败。", "search");
        }
        setLoading(false);
        setDirectResult(null);
        setVideoResults([]);
        setUserResults([]);
        setError(err instanceof Error && err.message ? err.message : "搜索失败，请检查网络或稍后再试。");
      }
    },
    [keyword, mode, filter, userFilter, service, historyService, diagnostics],
  );

  useEffect(() => {
    const query = pendingBilibiliSearch?.trim();
    if (!query) return;
    consumePendingBilibiliSearch();
    setKeyword(query);
    void submitSearch(query);
  }, [pendingBilibiliSearch, consumePendingBilibiliSearch, submitSearch]);

  // ---- 分页加载（extentAfter < 420 触发） ----
  const handleResultScroll = useCallback(() => {
    const el = resultScrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 420) return;
    void loadMoreResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadingMore, activeQuery, mode, currentPage, totalPages]);

  async function loadMoreResults() {
    if (loading || loadingMore || activeQuery.length === 0 || (mode === "videos" && isBvidInput(activeQuery)) || currentPage <= 0 || currentPage >= totalPages) return;
    const generation = searchGeneration.current;
    const query = activeQuery;
    const page = currentPage;
    setLoadingMore(true);
    try {
      if (mode === "users") {
        const next = await service.searchUsers(query, page + 1, userFilter);
        if (generation !== searchGeneration.current) return;
        setUserResults((current) => {
          const existing = new Set(current.map((r) => r.mid));
          return [...current, ...next.results.filter((r) => { const added = !existing.has(r.mid); existing.add(r.mid); return added; })];
        });
        setCurrentPage(next.page);
        setTotalPages(next.totalPages);
      } else {
        const next = await service.searchVideos(query, page + 1, filter);
        if (generation !== searchGeneration.current) return;
        setVideoResults((current) => {
          const existing = new Set(current.map((r) => r.bvid));
          return [...current, ...next.results.filter((r) => { const added = !existing.has(r.bvid); existing.add(r.bvid); return added; })];
        });
        setCurrentPage(next.page);
        setTotalPages(next.totalPages);
      }
    } catch {
      // 失败时保留已显示的搜索结果。
    } finally {
      if (generation === searchGeneration.current) setLoadingMore(false);
    }
  }

  // ---- 学习清单操作 ----
  const isPartInLearningList = (bvid: string, cid: number | null) => cid != null && learningTaskIds.has(`${bvid}:${cid}`);

  function addVideoToLearningList(video: VideoPreview) {
    if (addingBvid || openingBvid) return;
    setAddingBvid(video.bvid);
    const part = video.parts[0] ?? { cid: 0, pageNumber: 1, title: "", durationSeconds: video.durationSeconds };
    const entry: LearningListEntry = {
      id: createId(),
      bvid: video.bvid,
      partCid: part.cid,
      partPageNumber: part.pageNumber,
      partTitle: part.title,
      title: video.title,
      ownerName: video.ownerName,
      coverUrl: video.thumbnailUrl,
      durationSeconds: part.durationSeconds || video.durationSeconds,
      addedAt: new Date().toISOString(),
      positionSeconds: 0,
      status: "not-started",
    };
    void learningListService
      .add(entry)
      .then(async (saved) => {
        const entries = await learningListService.list();
        if (!saved && !entries.some((item) => item.bvid === entry.bvid && (item.partCid ?? 0) === entry.partCid)) {
          throw new Error("本机存储写入失败。");
        }
        replaceLearningTaskIds(entries);
      })
      .catch(() => showTransient("加入学习清单失败，请检查本机存储后重试。"))
      .finally(() => setAddingBvid(null));
  }

  function removeVideoFromLearningList(bvid: string, cid: number) {
    if (addingBvid || openingBvid) return;
    const entryId = learningTaskIds.get(`${bvid}:${cid}`);
    if (!entryId) return;
    setAddingBvid(bvid);
    void learningListService
      .remove(entryId)
      // 与 add 路径同步刷新 learningTaskIds，否则移除后卡片永远停留在
      // "已在学习清单"状态，无法从搜索结果重新加入。
      .then((removed) => {
        if (!removed) throw new Error("本机存储写入失败。");
        return learningListService.list();
      })
      .then((entries) => replaceLearningTaskIds(entries))
      .catch(() => showTransient("移出学习清单失败，请检查本机存储后重试。"))
      .finally(() => setAddingBvid(null));
  }

  // ---- 结果操作 ----
  function openVideo(video: VideoPreview) {
    openBilibiliVideoAt(video.bvid, video.title, video.parts[0]?.cid ?? 0, 0);
  }

  async function openSearchResult(result: VideoSearchResult) {
    if (openingBvid || addingBvid) return;
    const generation = searchGeneration.current;
    setOpeningBvid(result.bvid);
    try {
      const video = await service.lookupVideo(result.bvid);
      if (generation !== searchGeneration.current) return;
      knownInitialPartCids.current.set(result.bvid, video.parts[0]?.cid ?? 0);
      setOpeningBvid(null);
      openVideo(video);
    } catch (err) {
      if (generation !== searchGeneration.current) return;
      setOpeningBvid(null);
      openBilibiliVideo(result.bvid, result.title);
    }
  }

  async function addSearchResultToLearningList(result: VideoSearchResult) {
    if (addingBvid || openingBvid) return;
    setAddingBvid(result.bvid);
    try {
      const video = await service.lookupVideo(result.bvid);
      knownInitialPartCids.current.set(result.bvid, video.parts[0]?.cid ?? 0);
      addVideoToLearningList(video);
    } catch (err) {
      setAddingBvid(null);
      showTransient(`无法加入学习清单：${err instanceof Error ? err.message : "网络错误"}`);
    }
  }

  async function openUserResult(result: UserSearchResult) {
    openBilibiliCreator({
      mid: result.mid,
      name: result.name,
      avatarUrl: result.avatarUrl,
      sign: result.signature,
      officialDescription: result.certification,
    });
  }

  function selectQuery(value: string) {
    setKeyword(value);
    void submitSearch(value);
  }

  function changeMode(next: Mode) {
    if (next === mode) return;
    searchGeneration.current += 1;
    suggestionGeneration.current += 1;
    setLoading(false);
    setLoadingMore(false);
    setOpeningBvid(null);
    setMode(next);
    setDirectResult(null);
    setVideoResults([]);
    setUserResults([]);
    setSuggestions([]);
    setError(null);
    setHasSubmitted(false);
    setActiveQuery("");
    setCurrentPage(0);
    setTotalPages(0);
    const value = keyword.trim();
    if (value) void submitSearch(value, undefined, undefined, next);
  }

  function clearInput() {
    searchGeneration.current += 1;
    suggestionGeneration.current += 1;
    setLoading(false);
    setLoadingMore(false);
    setOpeningBvid(null);
    if (suggestionDebounce.current) clearTimeout(suggestionDebounce.current);
    setKeyword("");
    setDirectResult(null);
    setVideoResults([]);
    setUserResults([]);
    setSuggestions([]);
    setError(null);
    setHasSubmitted(false);
    setActiveQuery("");
    setCurrentPage(0);
    setTotalPages(0);
  }

  function changeOrder(order: VideoSearchOrder) {
    if (filter.order === order) return;
    const nextFilter = { ...filter, order };
    setFilter(nextFilter);
    if (keyword.trim().length > 0) void submitSearch(undefined, nextFilter);
  }

  function changeUserOrder(order: UserSearchOrder) {
    if (userFilter.order === order) return;
    const nextUserFilter = { ...userFilter, order };
    setUserFilter(nextUserFilter);
    if (keyword.trim().length > 0) void submitSearch(undefined, undefined, nextUserFilter);
  }

  // ---- 渲染 ----
  const showSuggestions = focused && suggestions.length > 0;
  const showHistory = history.length > 0;
  const keyboardVisible = false;

  const SearchHeader = (
    <div style={{ height: 58, display: "flex", alignItems: "center", gap: 4, padding: "0 4px" }}>
      {!workspace && (
        <button className="m3-icon-btn" onClick={() => setView("focus-dashboard")} aria-label="返回首页" title="返回首页">
          <Mi name="arrow_back" />
        </button>
      )}
      <div className="m3-field" style={{ flex: 1, minHeight: 46, background: "var(--m3-surface)" }}>
        <Mi name="search" size={20} />
        <input
          value={keyword}
          data-tour-target="search-input"
          onChange={(e) => {
            setKeyword(e.target.value);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submitSearch();
          }}
          placeholder={mode === "videos" ? "搜索关键词、BV 号或视频链接" : "搜索用户名"}
        />
      </div>
      {keyword.length > 0 && (
        <button className="m3-icon-btn" onClick={clearInput} aria-label="清空" title="清空">
          <Mi name="close" />
        </button>
      )}
      <button className="m3-icon-btn" onClick={() => void submitSearch()} aria-label="搜索" aria-busy={loading} title="搜索">
        {loading ? <span className="m3-circular-progress" /> : <Mi name="search" />}
      </button>
    </div>
  );

  const ModeSelector = (
    <div className="m3-segmented" style={{ width: "100%", maxWidth: 480, margin: "0 auto" }}>
      {(
        [
          ["videos", "视频", "ondemand_video"],
          ["users", "用户", "person_search"],
        ] as Array<[Mode, string, string]>
      ).map(([value, label, icon]) => (
        <button
          key={value}
          className={mode === value ? "m3-segmented-item selected" : "m3-segmented-item"}
          style={{ flex: 1, justifyContent: "center" }}
          onClick={() => changeMode(value)}
        >
          <Mi name={icon} size={18} /> {label}
        </button>
      ))}
    </div>
  );

  const SortAndFilterBar = (
    <div style={{ height: 46, display: "flex", alignItems: "center" }}>
      <div style={{ flex: 1, display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
        {(mode === "videos" ? Object.values(VideoSearchOrder) : Object.values(UserSearchOrder)).map((order) => {
          const isSelected = mode === "videos" ? filter.order === order : userFilter.order === order;
          return (
            <button
              key={order}
              className={isSelected ? "m3-chip selected" : "m3-chip"}
              style={{ flex: "0 0 auto" }}
              onClick={() => (mode === "videos" ? changeOrder(order as VideoSearchOrder) : changeUserOrder(order as UserSearchOrder))}
            >
              {mode === "videos" ? orderLabel(order as VideoSearchOrder) : userOrderLabel(order as UserSearchOrder)}
            </button>
          );
        })}
      </div>
      <span className="m3-vertical-divider" style={{ height: 30, margin: "0 8px" }} />
      <div style={{ position: "relative" }}>
        <button
          className="m3-icon-btn"
          onClick={() => (mode === "videos" ? setFilterSheetOpen(true) : setUserFilterSheetOpen(true))}
          aria-label={mode === "videos" ? "筛选" : "用户分类"}
          title={mode === "videos" ? "筛选" : "用户分类"}
        >
          <Mi name="filter_list" />
        </button>
        {(mode === "videos" ? activeFilterCount(filter) > 0 : userFilter.type !== UserSearchType.all) && (
          <span className="fb-filter-badge">
            {mode === "videos" ? activeFilterCount(filter) : ""}
          </span>
        )}
      </div>
    </div>
  );

  // ---- 结果卡片 ----
  function Thumbnail({ result, episodeCountText }: { result: VideoSearchResult; episodeCountText: string }) {
    return (
      <span style={{ width: 148, height: 96, flex: "0 0 148px", borderRadius: 12, overflow: "hidden", position: "relative", display: "block", background: "var(--m3-surface-container-highest)" }}>
        {result.thumbnailUrl ? (
          <img src={result.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
        ) : (
          <span style={{ display: "grid", placeItems: "center", height: "100%" }}><Mi name="image" style={{ color: "rgba(0,0,0,0.38)" }} /></span>
        )}
        <span style={{ position: "absolute", right: 5, bottom: 5, background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 11, padding: "2px 5px", borderRadius: 4 }}>
          {formatDuration(result.durationSeconds)}
        </span>
        {episodeCountText.length > 0 && (
          <span style={{ position: "absolute", left: 5, top: 5, background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 11, padding: "2px 5px", borderRadius: 4 }}>
            {episodeCountText}
          </span>
        )}
      </span>
    );
  }

  function VideoResultCard({ result, isDirect }: { result: VideoSearchResult; isDirect: boolean }) {
    const opening = openingBvid === result.bvid;
    const changing = addingBvid === result.bvid;
    const menuEnabled = openingBvid == null && addingBvid == null;
    const knownCid = isDirect ? (directResult?.parts[0]?.cid ?? null) : (knownInitialPartCids.current.get(result.bvid) ?? null);
    const inLearningList = isPartInLearningList(result.bvid, knownCid);
    const episodeText = result.episodeCountText;
    return (
      <section className="m3-card" style={{ background: "transparent", borderRadius: 12 }}>
        <div
          role="button"
          tabIndex={0}
          aria-label={result.title}
          style={{ display: "flex", alignItems: "center", padding: "8px 2px", cursor: opening || changing ? "default" : "pointer", borderRadius: 12 }}
          onClick={() => {
            if (opening || changing) return;
            if (isDirect && directResult) openVideo(directResult);
            else void openSearchResult(result);
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault();
            event.currentTarget.click();
          }}
        >
          <Thumbnail result={result} episodeCountText={episodeText} />
          <span style={{ width: 12 }} />
          <span style={{ flex: 1, minWidth: 0, height: 96, display: "flex", flexDirection: "column" }}>
            <span className="m3-title-sm" style={{ fontWeight: 600, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {result.title}
            </span>
            <span style={{ flex: 1 }} />
            <span className="m3-body-sm fb-on-surface-variant" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {formatPublishedAt(result.publishedAt)}  {result.ownerName}
            </span>
            <span style={{ height: 3 }} />
            <span className="m3-body-sm fb-on-surface-variant" style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <Mi name="play_circle" size={16} /> {formatCount(result.playCount)}
              <span style={{ width: 9 }} />
              <Mi name="subtitles" size={16} /> {formatCount(result.danmakuCount)}
              {opening && <span style={{ flex: 1, textAlign: "right" }}><span className="m3-circular-progress" style={{ width: 15, height: 15 }} /></span>}
            </span>
          </span>
          <span style={{ width: 38, height: 96, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {changing ? (
              <span className="m3-circular-progress" style={{ width: 17, height: 17 }} />
            ) : (
              <span className="m3-menu-anchor" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                <button className="m3-icon-btn" disabled={!menuEnabled} onClick={(e) => { e.stopPropagation();                     if (inLearningList) { setRemoveConfirmBvid(result.bvid); } else if (isDirect && directResult) { addVideoToLearningList(directResult); } else { void addSearchResultToLearningList(result); }; }} aria-label="更多选项" title="更多选项">
                  <Mi name="more_vert" size={20} />
                </button>
              </span>
            )}
          </span>
        </div>
      </section>
    );
  }

  function UserResultCard({ result }: { result: UserSearchResult }) {
    return (
      <section className="m3-card">
        <div className="m3-list-tile" role="button" tabIndex={0} aria-label={result.name} style={{ padding: "8px 12px", cursor: "pointer" }} onClick={() => void openUserResult(result)} onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.currentTarget.click();
        }}>
          <span className="m3-avatar" style={{ width: 56, height: 56 }}>
            {result.avatarUrl ? <img src={result.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <Mi name="person" />}
          </span>
          <span className="m3-tile-body">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.name}</span>
              <span className="fb-lv-badge">LV{result.level}</span>
              {result.certification.length > 0 && <Mi name="verified" size={17} className="fb-primary-color" />}
            </span>
            <span className="m3-body-md" style={{ marginTop: 3 }}>
              粉丝 {formatCount(result.followerCount)}  ·  视频 {result.videoCount}
            </span>
            {result.certification.length > 0 ? (
              <span className="m3-body-sm fb-primary-color" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.certification}</span>
            ) : (
              result.signature.length > 0 && <span className="m3-body-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{result.signature}</span>
            )}
          </span>
          <span className="m3-tile-trailing"><Mi name="chevron_right" /></span>
        </div>
      </section>
    );
  }

  function LoadMoreFooter() {
    if (loadingMore) {
      return <div style={{ padding: 18, display: "grid", placeItems: "center" }}><span className="m3-circular-progress" style={{ width: 22, height: 22 }} /></div>;
    }
    if (currentPage > 0 && currentPage >= totalPages) {
      return <div style={{ padding: 14, textAlign: "center" }} className="m3-body-md">已经到底了</div>;
    }
    return <div style={{ height: 24 }} />;
  }

  const ResultArea = (
    <div
      ref={resultScrollRef}
      onScroll={handleResultScroll}
      className="fb-scroll-page"
      style={{ flex: 1, minHeight: 0 }}
    >
      {loading ? (
        <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 32 }}>
          <span className="m3-circular-progress lg" />
        </div>
      ) : error != null ? (
        <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 24 }}>
          <span style={{ textAlign: "center" }} className="m3-body-md">
            <Mi name="error" size={64} style={{ display: "block", margin: "0 auto 16px" }} />
            {error}
          </span>
        </div>
      ) : directResult != null ? (
        <div style={{ padding: "0 2px" }}>
          <VideoResultCard
            result={{
              bvid: directResult.bvid,
              title: directResult.title,
              ownerName: directResult.ownerName,
              durationSeconds: directResult.durationSeconds,
              thumbnailUrl: directResult.thumbnailUrl,
              publishedAt: directResult.publishedAt,
              playCount: directResult.stats?.viewCount ?? 0,
              danmakuCount: directResult.stats?.danmakuCount ?? 0,
              episodeCountText: directResult.parts.length > 1 ? `共 ${directResult.parts.length} P` : "",
            }}
            isDirect
          />
          <LoadMoreFooter />
        </div>
      ) : userResults.length > 0 ? (
        <div style={{ display: "grid", gap: 6, padding: "0 2px" }}>
          {userResults.map((result) => <UserResultCard key={result.mid} result={result} />)}
          <LoadMoreFooter />
        </div>
      ) : videoResults.length > 0 ? (
        <div style={{ display: "grid", gap: 6, padding: "0 2px" }}>
          {videoResults.map((result) => <VideoResultCard key={result.bvid} result={result} isDirect={false} />)}
          <LoadMoreFooter />
        </div>
      ) : hasSubmitted ? (
        <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 24 }}>
          <span style={{ textAlign: "center" }} className="m3-body-md">
            <Mi name="search_off" size={64} style={{ display: "block", margin: "0 auto 16px" }} />
            {mode === "videos" ? "没有找到相关公开视频，可以调整筛选或更换关键词。" : "没有找到相关用户，可以调整分类或更换用户名。"}
          </span>
        </div>
      ) : (
        <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 16 }}>
          <span style={{ textAlign: "center" }}>
            <Mi name="manage_search" size={72} style={{ display: "block", margin: "0 auto 16px" }} />
            <span className="m3-body-lg">搜索你真正想看的内容</span>
            <span className="m3-body-sm" style={{ display: "block", marginTop: 6 }}>支持关键词候选、筛选、分页和 BV 直达</span>
          </span>
        </div>
      )}
    </div>
  );

  const SuggestionsSection = (
    <div style={{ display: "grid" }}>
      {suggestions.slice(0, 10).map((suggestion, index) => {
        const input = keyword.trim();
        const highlight = input.length > 0 && suggestion.toLowerCase().startsWith(input.toLowerCase()) ? input.length : 0;
        return (
          <button
            key={`${index}-${suggestion}`}
            role="option"
            className="fb-suggestion-row"
            onClick={() => selectQuery(suggestion)}
          >
            {highlight > 0 ? (
              <>
                <span className="m3-title-md fb-primary-color" style={{ fontWeight: 700 }}>{suggestion.slice(0, highlight)}</span>
                <span className="m3-title-md">{suggestion.slice(highlight)}</span>
              </>
            ) : (
              <span className="m3-title-md">{suggestion}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const SearchHistorySection = (
    <div style={{ padding: "0 4px" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span className="m3-title-md" style={{ fontWeight: 700, flex: 1 }}>搜索历史</span>
        <button className="m3-text-btn" onClick={() => setClearHistoryConfirm(true)} aria-label="清空搜索历史">
          <Mi name="delete_sweep" size={19} /> 清空
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
        {history.map((value) => (
          <button key={value} className="fb-history-chip" onClick={() => selectQuery(value)}>
            <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const SearchSupportOverlay = (
    <div style={{ position: "absolute", inset: 0, background: "var(--m3-surface)", overflowY: "auto", paddingTop: 14, paddingBottom: 24 }}>
      {showSuggestions && SuggestionsSection}
      {showSuggestions && showHistory && <div style={{ height: 18 }} />}
      {showHistory && SearchHistorySection}
    </div>
  );

  const showSearchSupport = (showSuggestions || showHistory) && (focused || !hasSubmitted);

  const mainContent = workspace ? (
    <div style={{ display: "flex", flex: 1, minHeight: 0, padding: "8px 16px 12px" }}>
      <div style={{ width: 320, flex: "0 0 320px", display: "flex", flexDirection: "column" }}>
        {SearchHeader}
        <hr className="m3-divider" style={{ margin: 0 }} />
        <div style={{ padding: "12px 4px 0" }}>{ModeSelector}</div>
        <div style={{ padding: "8px 4px 0" }}>{SortAndFilterBar}</div>
        <hr className="m3-divider" style={{ margin: "16px 0" }} />
        <div className="fb-scroll-page" style={{ flex: 1, minHeight: 0 }}>
          {!showSuggestions && !showHistory ? (
            <div style={{ padding: 20, textAlign: "center" }} className="m3-body-md fb-on-surface-variant">
              输入关键词、BV 号或用户名，结果会显示在右侧。
            </div>
          ) : (
            <>
              {showSuggestions && SuggestionsSection}
              {showSuggestions && showHistory && <div style={{ height: 18 }} />}
              {showHistory && SearchHistorySection}
            </>
          )}
        </div>
      </div>
      <span className="m3-vertical-divider" style={{ margin: "0 12px" }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", paddingTop: 8, position: "relative" }}>
        {ResultArea}
      </div>
    </div>
  ) : (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", maxWidth: 960, margin: "0 auto", width: "100%", padding: "0 4px 12px" }}>
      {SearchHeader}
      <hr className="m3-divider" style={{ margin: 0 }} />
      <div style={{ padding: "8px 8px 0" }}>{ModeSelector}</div>
      {!keyboardVisible && <div style={{ padding: "6px 8px 0" }}>{SortAndFilterBar}</div>}
      <div style={{ flex: 1, minHeight: 0, padding: "0 8px", position: "relative" }}>
        {ResultArea}
        {showSearchSupport && SearchSupportOverlay}
      </div>
    </div>
  );

  return (
    <div className="fb fb-page">
      {mainContent}

      {removeConfirmBvid != null && (
        <M3Dialog
          title="取消加入学习清单？"
          onClose={() => setRemoveConfirmBvid(null)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setRemoveConfirmBvid(null)}>保留</button>
              <button
                className="m3-filled-btn"
                onClick={() => {
                  const cid = directResult?.bvid === removeConfirmBvid
                    ? directResult.parts[0]?.cid ?? 0
                    : knownInitialPartCids.current.get(removeConfirmBvid) ?? 0;
                  removeVideoFromLearningList(removeConfirmBvid, cid);
                  setRemoveConfirmBvid(null);
                }}
              >
                取消加入
              </button>
            </>
          }
        >
          这只会移除默认分 P 的学习任务，不会删除同视频其他 P、观看记录和笔记。
        </M3Dialog>
      )}

      {clearHistoryConfirm && (
        <M3Dialog
          title="清除搜索记录？"
          onClose={() => setClearHistoryConfirm(false)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setClearHistoryConfirm(false)}>取消</button>
              <button
                className="m3-filled-btn"
                onClick={() => {
                  void historyService.clear().then((cleared) => {
                    if (!cleared) throw new Error("本机存储写入失败。");
                    return historyService.list();
                  }).then((values) => {
                    setHistory(values);
                    setClearHistoryConfirm(false);
                  }).catch(() => showTransient("清除搜索记录失败，请检查本机存储后重试。"));
                }}
              >
                清除
              </button>
            </>
          }
        >
          确定清除全部搜索记录吗？此操作无法撤销。
        </M3Dialog>
      )}

      {filterSheetOpen && (
        <div className="m3-dialog-scrim" style={{ alignItems: "flex-end" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setFilterSheetOpen(false); }}>
          <div className="m3-dialog" style={{ width: "min(100%, 480px)", borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: "82dvh" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--m3-outline-variant)", margin: "-8px auto 16px" }} />
            <h2 className="m3-title-lg">筛选</h2>
            <FilterSection
              title="发布日期"
              values={Object.values(VideoPublishedRange)}
              selected={filter.publishedRange}
              label={publishedRangeLabel}
              onSelect={(value) => setFilter({ ...filter, publishedRange: value })}
            />
            <div style={{ height: 20 }} />
            <FilterSection
              title="内容时长"
              values={Object.values(VideoDurationRange)}
              selected={filter.durationRange}
              label={durationRangeLabel}
              onSelect={(value) => setFilter({ ...filter, durationRange: value })}
            />
            <div style={{ height: 20 }} />
            <p className="m3-title-md">内容分区</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 4px", marginTop: 10 }}>
              {CATEGORIES.map((category) => (
                <button
                  key={category.label}
                  className={filter.categoryId === category.id ? "m3-chip selected" : "m3-chip"}
                  onClick={() => setFilter({ ...filter, categoryId: category.id ?? undefined })}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button className="m3-outlined-btn" style={{ flex: 1 }} onClick={() => setFilter({ order: filter.order, durationRange: VideoDurationRange.any, publishedRange: VideoPublishedRange.any })}>
                重置
              </button>
              <button className="m3-filled-btn" style={{ flex: 1 }} onClick={() => { setFilterSheetOpen(false); if (keyword.trim().length > 0) void submitSearch(); }}>
                应用筛选
              </button>
            </div>
          </div>
        </div>
      )}

      {userFilterSheetOpen && (
        <div className="m3-dialog-scrim" style={{ alignItems: "flex-end" }} onMouseDown={(e) => { if (e.target === e.currentTarget) setUserFilterSheetOpen(false); }}>
          <div className="m3-dialog" style={{ width: "min(100%, 480px)", borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--m3-outline-variant)", margin: "-8px auto 16px" }} />
            <h2 className="m3-title-lg">用户分类</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
              {Object.values(UserSearchType).map((type) => (
                <button
                  key={type}
                  className={userFilter.type === type ? "m3-chip selected" : "m3-chip"}
                  onClick={() => {
                    const nextUserFilter = { ...userFilter, type };
                    setUserFilter(nextUserFilter);
                    setUserFilterSheetOpen(false);
                    if (keyword.trim().length > 0) void submitSearch(undefined, undefined, nextUserFilter);
                  }}
                >
                  {userTypeLabel(type)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSection<T extends string | number>({
  title,
  values,
  selected,
  label,
  onSelect,
}: {
  title: string;
  values: readonly T[];
  selected: T;
  label: (value: T) => string;
  onSelect: (value: T) => void;
}) {
  return (
    <div>
      <p className="m3-title-md">{title}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 4px", marginTop: 10 }}>
        {values.map((value) => (
          <button key={String(value)} className={selected === value ? "m3-chip selected" : "m3-chip"} onClick={() => onSelect(value)}>
            {label(value)}
          </button>
        ))}
      </div>
    </div>
  );
}
