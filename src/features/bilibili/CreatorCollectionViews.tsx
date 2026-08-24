/**
 * UP 主主页 / 合集详情 — 1:1 React 移植自 FocuBili 的
 * user_profile_page.dart（1453 行）+ collection_detail_page.dart（502 行）。
 *
 * 结构：可折叠资料头（宽屏横向 / 手机纵向）+ 视频/专栏/合集三段 Tab +
 * 投稿工具栏（总数 + 排序菜单 + 可展开搜索框）+ 滚动到底自动翻页 +
 * 缺失分P数量的补查队列（最多两个并发）+ 本机观看记录角标。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Loader2, RefreshCw, Search, X } from "lucide-react";
import { createBilibiliPublicContentService } from "../../lib/bilibili/publicContentService";
import { createWatchHistoryService, type LocalWatchHistoryEntry } from "../../lib/bilibili/watchHistoryService";
import { createLearningListService } from "../../lib/bilibili/services";
import type { LearningListEntry, SubscribedCollection } from "../../lib/bilibili/types";
import { CreatorVideoOrder, type CreatorArticle, type CreatorCollection, type CreatorProfile, type CreatorVideo } from "../../lib/bilibili/extendedModels";
import { createId } from "../../lib/id";
import { useAppStore } from "../../store/useAppStore";
import { Mi, useM3Feedback } from "./m3";

interface ViewActions {
  onBack: () => void;
  onOpenVideo: (bvid: string, title: string) => void;
}

const VIDEO_ORDER_LABELS: Record<CreatorVideoOrder, string> = {
  [CreatorVideoOrder.latest]: "最新发布",
  [CreatorVideoOrder.mostPlayed]: "最多播放",
  [CreatorVideoOrder.mostFavorited]: "最多收藏",
};

const MAX_PART_COUNT_LOOKUP_CONCURRENCY = 2;
const SCROLL_LOAD_THRESHOLD = 420;

function formatCount(n: number): string {
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + "亿";
  if (n >= 10_000) return (n / 10_000).toFixed(1) + "万";
  return String(n);
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
  return m + ":" + String(rest).padStart(2, "0");
}

function formatPublishDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function formatWatchedPosition(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  if (safe <= 0) return "";
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const rest = safe % 60;
  return h > 0 ? h + ":" + String(m).padStart(2, "0") + ":" + String(rest).padStart(2, "0") : m + ":" + String(rest).padStart(2, "0");
}

function WatchHistoryBadgeTag({ entry }: { entry: LocalWatchHistoryEntry }) {
  const position = formatWatchedPosition(entry.positionSeconds);
  return (
    <span className="creator-video-watched">
      {position ? "上次看过 " + position : "上次看过"}
    </span>
  );
}

function VideoRow({
  item,
  watchHistory,
  partCount,
  opening,
  adding,
  onOpen,
  onAddToLearningList,
  onVisible,
}: {
  item: CreatorVideo;
  watchHistory?: LocalWatchHistoryEntry;
  partCount: number;
  opening: boolean;
  adding: boolean;
  onOpen: () => void;
  onAddToLearningList: () => void;
  onVisible: () => void;
}) {
  useEffect(() => {
    onVisible();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.bvid]);

  return (
    <li key={item.bvid}>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={opening}
        className="bilibili-account-row creator-video-row"
        onClick={() => { if (!opening) onOpen(); }}
        onKeyDown={(event) => {
          if (opening) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
      >
        <span className="creator-video-cover">
          {item.coverUrl ? <img src={item.coverUrl} alt="" referrerPolicy="no-referrer" /> : <span className="bilibili-account-placeholder" />}
          {watchHistory && <WatchHistoryBadgeTag entry={watchHistory} />}
          {partCount > 1 && <span className="creator-video-parts">{partCount}集</span>}
          <span className="creator-video-duration">{formatDuration(item.durationSeconds)}</span>
          {opening && (
            <span className="creator-video-cover-loading">
              <Loader2 size={18} className="spin" />
            </span>
          )}
        </span>
        <span className="creator-video-info">
          <strong>{item.title}</strong>
          <span className="creator-video-meta-row">
            <span className="creator-video-meta-stats">
              <Mi name="play_circle" size={14} /> {formatCount(item.stats.viewCount)}
              <Mi name="subtitles" size={14} /> {formatCount(item.stats.danmakuCount)}
            </span>
            <span className="creator-video-date">{formatPublishDate(item.publishedAt)}</span>
          </span>
        </span>
        <button
          type="button"
          className="m3-text-btn compact creator-video-add"
          disabled={opening || adding}
          onClick={(event) => {
            event.stopPropagation();
            onAddToLearningList();
          }}
        >
          {adding ? <Loader2 size={14} className="spin" /> : <Mi name="playlist_add" size={16} />} 加入学习清单
        </button>
      </div>
    </li>
  );
}

function VideoList({
  items,
  hasMore,
  loadingMore,
  onOpenVideo,
  watchedByBvid,
  resolvedPartCounts,
  openingBvid,
  addingBvid,
  onAddToLearningList,
  onSchedulePartCountLookup,
}: {
  items: CreatorVideo[];
  hasMore: boolean;
  loadingMore: boolean;
  onOpenVideo: (item: CreatorVideo) => void;
  watchedByBvid: Map<string, LocalWatchHistoryEntry>;
  resolvedPartCounts: Map<string, number>;
  openingBvid: string | null;
  addingBvid: string | null;
  onAddToLearningList: (item: CreatorVideo) => void;
  onSchedulePartCountLookup: (item: CreatorVideo) => void;
}) {
  return (
    <>
      {items.length > 0 && (
        <ul className="bilibili-account-list creator-video-list">
          {items.map((item) => (
            <VideoRow
              key={item.bvid}
              item={item}
              watchHistory={watchedByBvid.get(item.bvid)}
              partCount={resolvedPartCounts.get(item.bvid) ?? item.partCount}
              opening={openingBvid === item.bvid}
              adding={addingBvid === item.bvid}
              onOpen={() => onOpenVideo(item)}
              onAddToLearningList={() => onAddToLearningList(item)}
              onVisible={() => onSchedulePartCountLookup(item)}
            />
          ))}
        </ul>
      )}
      {loadingMore && (
        <div className="creator-loading-footer">
          <Loader2 size={18} className="spin" />
        </div>
      )}
      {!hasMore && items.length > 0 && !loadingMore && <div style={{ height: 12 }} />}
    </>
  );
}

export function CreatorProfileView({ mid, initialName, initialAvatarUrl, initialSign, initialOfficialDescription, onBack, onOpenVideo, onOpenCollection }: {
  mid: number;
  initialName?: string;
  initialAvatarUrl?: string;
  initialSign?: string;
  initialOfficialDescription?: string;
  onOpenCollection?: (collection: SubscribedCollection) => void;
} & ViewActions) {
  const service = useMemo(() => createBilibiliPublicContentService(), []);
  const watchHistoryService = useMemo(() => createWatchHistoryService(), []);
  const learningListService = useMemo(() => createLearningListService(), []);
  const showMessage = useM3Feedback().showMessage;

  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [activeTab, setActiveTab] = useState<"videos" | "articles" | "collections">("videos");
  const [videos, setVideos] = useState<CreatorVideo[]>([]);
  const [articles, setArticles] = useState<CreatorArticle[]>([]);
  const [collections, setCollections] = useState<CreatorCollection[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingContent, setLoadingContent] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const [videoKeyword, setVideoKeyword] = useState("");
  const [submittedKeyword, setSubmittedKeyword] = useState("");
  const [videoOrder, setVideoOrder] = useState<CreatorVideoOrder>(CreatorVideoOrder.latest);
  const [videoSearchExpanded, setVideoSearchExpanded] = useState(false);
  const [orderMenuOpen, setOrderMenuOpen] = useState(false);

  const [watchedByBvid, setWatchedByBvid] = useState<Map<string, LocalWatchHistoryEntry>>(new Map());
  const [openingBvid, setOpeningBvid] = useState<string | null>(null);
  const [addingBvid, setAddingBvid] = useState<string | null>(null);
  const [resolvedPartCounts, setResolvedPartCounts] = useState<Map<string, number>>(new Map());

  const partCountAttempted = useRef<Set<string>>(new Set());
  const partCountQueue = useRef<CreatorVideo[]>([]);
  const activePartCountLookups = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const requestGeneration = useRef(0);
  const videosRef = useRef<CreatorVideo[]>([]);
  videosRef.current = videos;

  useEffect(() => {
    let cancelled = false;
    void watchHistoryService.list().then((entries) => {
      if (cancelled) return;
      setWatchedByBvid(new Map(entries.map((entry) => [entry.bvid, entry])));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [watchHistoryService]);

  const loadProfile = useCallback(() => {
    setLoadingProfile(true);
    setProfileError(null);
    service.loadCreatorProfile(mid).then((result) => {
      setProfile(result);
      setLoadingProfile(false);
    }).catch((error) => {
      setProfileError(error instanceof Error ? error.message : String(error));
      setLoadingProfile(false);
    });
  }, [mid, service]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const loadFirstContentPage = useCallback(() => {
    const generation = ++requestGeneration.current;
    setLoadingContent(true);
    setContentError(null);
    setPage(0);
    setHasMore(true);
    const tab = activeTab;
    const request = tab === "videos"
      ? service.listCreatorVideos(mid, 1, { keyword: submittedKeyword, order: videoOrder })
      : tab === "articles"
        ? service.listCreatorArticles(mid, 1)
        : service.listCreatorCollections(mid, 1);
    request.then((result) => {
      if (generation !== requestGeneration.current) return;
      if (tab === "videos") setVideos(result.items as CreatorVideo[]);
      else if (tab === "articles") setArticles(result.items as CreatorArticle[]);
      else setCollections(result.items as CreatorCollection[]);
      setTotalCount(result.totalCount ?? result.items.length);
      setPage(result.page);
      setHasMore(result.hasMore);
      setLoadingContent(false);
    }).catch((error) => {
      if (generation !== requestGeneration.current) return;
      setContentError(error instanceof Error ? error.message : String(error));
      setLoadingContent(false);
    });
  }, [activeTab, mid, service, submittedKeyword, videoOrder]);

  useEffect(() => { loadFirstContentPage(); }, [loadFirstContentPage]);

  const loadMore = useCallback(() => {
    if (loadingContent || loadingMore || !hasMore) return;
    const tab = activeTab;
    const generation = requestGeneration.current;
    setLoadingMore(true);
    const request = tab === "videos"
      ? service.listCreatorVideos(mid, page + 1, { keyword: submittedKeyword, order: videoOrder })
      : tab === "articles"
        ? service.listCreatorArticles(mid, page + 1)
        : service.listCreatorCollections(mid, page + 1);
    request.then((result) => {
      if (generation !== requestGeneration.current) return;
      if (tab === "videos") {
        setVideos((current) => {
          const keys = new Set(current.map((item) => item.bvid));
          return [...current, ...(result.items as CreatorVideo[]).filter((item) => !keys.has(item.bvid) && keys.add(item.bvid))];
        });
      } else if (tab === "articles") {
        setArticles((current) => {
          const keys = new Set(current.map((item) => item.id));
          return [...current, ...(result.items as CreatorArticle[]).filter((item) => !keys.has(item.id) && keys.add(item.id))];
        });
      } else {
        setCollections((current) => {
          const keys = new Set(current.map((item) => item.id));
          return [...current, ...(result.items as CreatorCollection[]).filter((item) => !keys.has(item.id) && keys.add(item.id))];
        });
      }
      setPage(result.page);
      setHasMore(result.hasMore);
      setLoadingMore(false);
    }).catch((error) => {
      if (generation !== requestGeneration.current) return;
      setLoadingMore(false);
      showMessage("加载更多失败：" + (error instanceof Error ? error.message : String(error)));
    });
  }, [activeTab, hasMore, loadingContent, loadingMore, mid, page, service, showMessage, submittedKeyword, videoOrder]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > SCROLL_LOAD_THRESHOLD) return;
    loadMore();
  }, [loadMore]);

  const pumpPartCountLookups = useCallback(() => {
    while (activePartCountLookups.current < MAX_PART_COUNT_LOOKUP_CONCURRENCY && partCountQueue.current.length > 0) {
      const item = partCountQueue.current.shift();
      if (!item) break;
      if (!videosRef.current.some((v) => v.bvid === item.bvid)) continue;
      activePartCountLookups.current += 1;
      void service.lookupVideo(item.bvid).then((video) => {
        if (video.parts.length > 1) {
          setResolvedPartCounts((current) => new Map(current).set(item.bvid, video.parts.length));
        }
      }).catch(() => {}).finally(() => {
        activePartCountLookups.current -= 1;
        pumpPartCountLookups();
      });
    }
  }, [service]);

  const schedulePartCountLookup = useCallback((item: CreatorVideo) => {
    if (item.partCount > 1 || resolvedPartCounts.has(item.bvid)) return;
    if (partCountAttempted.current.has(item.bvid)) return;
    partCountAttempted.current.add(item.bvid);
    partCountQueue.current.push(item);
    pumpPartCountLookups();
  }, [pumpPartCountLookups, resolvedPartCounts]);

  function openVideo(item: CreatorVideo) {
    if (openingBvid || addingBvid) return;
    setOpeningBvid(item.bvid);
    service.lookupVideo(item.bvid).then((video) => {
      setOpeningBvid(null);
      onOpenVideo(video.bvid, video.title);
    }).catch((error) => {
      setOpeningBvid(null);
      showMessage("无法打开视频：" + (error instanceof Error ? error.message : String(error)));
    });
  }

  function addVideoToLearningList(item: CreatorVideo) {
    if (openingBvid || addingBvid) return;
    setAddingBvid(item.bvid);
    service.lookupVideo(item.bvid).then((video) => {
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
      return learningListService.add(entry);
    }).then(() => {
      setAddingBvid(null);
      showMessage("已加入学习清单，可在首页继续学习。");
    }).catch(() => {
      setAddingBvid(null);
      showMessage("加入学习清单失败，请检查网络后重试。");
    });
  }

  function submitVideoSearch() {
    const keyword = videoKeyword.trim();
    setSubmittedKeyword(keyword);
  }

  function selectVideoOrder(order: CreatorVideoOrder) {
    setOrderMenuOpen(false);
    if (order === videoOrder) return;
    setVideoOrder(order);
  }

  function refreshAll() {
    loadProfile();
    loadFirstContentPage();
  }

  const name = (profile?.name?.length ?? 0) > 0 ? profile!.name : ((initialName?.length ?? 0) > 0 ? initialName : "UP 主主页");
  const avatarUrl = (profile?.avatarUrl?.length ?? 0) > 0 ? profile!.avatarUrl : (initialAvatarUrl ?? "");
  const officialDescription = (profile?.officialDescription?.length ?? 0) > 0 ? profile!.officialDescription : (initialOfficialDescription ?? "");
  const sign = (profile?.sign?.length ?? 0) > 0 ? profile!.sign : (initialSign ?? "");

  return (
    <div className="stack creator-profile-page">
      <section className="card">
        <div className="row" style={{ marginBottom: 6 }}>
          <button className="m3-outlined-btn compact" onClick={onBack}><ArrowLeft size={15} /> 返回</button>
          <button className="m3-icon-btn" onClick={refreshAll} aria-label="刷新主页" title="刷新主页"><RefreshCw size={16} /></button>
        </div>

        <div className="creator-profile-header" key="creator-profile-header">
          {avatarUrl ? <img className="creator-profile-avatar" src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="creator-profile-avatar placeholder"><Mi name="person" size={40} /></span>}
          <div className="creator-profile-description">
            <div className="row" style={{ alignItems: "baseline" }}>
              <h2 style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</h2>
              <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>UID：{mid}</span>
            </div>
            {officialDescription && (
              <p className="creator-certification" key="creator-certification">
                <Mi name="verified" size={16} /> 认证：{officialDescription}
              </p>
            )}
            {sign && <ExpandableSign sign={sign} />}
            {profileError && (
              <p className="muted" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                {profileError}
                <button className="m3-text-btn compact" onClick={loadProfile}>重试</button>
              </p>
            )}
          </div>
          <div className="creator-profile-stats-panel">
            {loadingProfile && !profile && <Loader2 size={20} className="spin" style={{ position: "absolute" }} />}
            <div className="creator-stats" aria-label="UP 主数据">
              <span><strong>{formatCount(profile?.followerCount ?? 0)}</strong><small>粉丝</small></span>
              <span><strong>{formatCount(profile?.followingCount ?? 0)}</strong><small>关注</small></span>
              <span><strong>{formatCount(profile?.likeCount ?? 0)}</strong><small>获赞</small></span>
            </div>
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="UP 主公开内容" style={{ marginTop: 16 }}>
          <button role="tab" aria-selected={activeTab === "videos"} className={activeTab === "videos" ? "segmented-item active" : "segmented-item"} onClick={() => setActiveTab("videos")}>投稿</button>
          <button role="tab" aria-selected={activeTab === "articles"} className={activeTab === "articles" ? "segmented-item active" : "segmented-item"} onClick={() => setActiveTab("articles")}>专栏</button>
          <button role="tab" aria-selected={activeTab === "collections"} className={activeTab === "collections" ? "segmented-item active" : "segmented-item"} onClick={() => setActiveTab("collections")}>合集</button>
        </div>

        {activeTab === "videos" && (
          <div className="creator-video-toolbar">
            <div className="row" style={{ marginTop: 10 }}>
              <span className="m3-title-sm" style={{ fontWeight: 700 }}>共{totalCount > 0 ? totalCount : videos.length}投稿</span>
              <span style={{ flex: 1 }} />
              <button className="m3-icon-btn" onClick={() => setVideoSearchExpanded((v) => !v)} aria-label={videoSearchExpanded ? "收起投稿搜索" : "搜索投稿"} title={videoSearchExpanded ? "收起投稿搜索" : "搜索投稿"}>
                {videoSearchExpanded ? <X size={16} /> : <Search size={16} />}
              </button>
              <div className="creator-order-menu">
                <button className="m3-text-btn compact" onClick={() => setOrderMenuOpen((v) => !v)} aria-haspopup="menu" aria-expanded={orderMenuOpen}>
                  <Mi name="sort" size={16} /> {VIDEO_ORDER_LABELS[videoOrder]} <ChevronDown size={14} />
                </button>
                {orderMenuOpen && (
                  <div className="creator-order-menu-popup" role="menu">
                    {Object.values(CreatorVideoOrder).map((order) => (
                      <button key={order} role="menuitem" className={order === videoOrder ? "m3-list-tile active" : "m3-list-tile"} onClick={() => selectVideoOrder(order)}>
                        {VIDEO_ORDER_LABELS[order]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {videoSearchExpanded && (
              <form className="creator-video-search" onSubmit={(event) => { event.preventDefault(); submitVideoSearch(); }}>
                <input aria-label="搜索该 UP 主的投稿" value={videoKeyword} onChange={(event) => setVideoKeyword(event.target.value)} placeholder="搜索该 UP 主的投稿" />
                <button type="submit" className="m3-icon-btn" aria-label="搜索投稿" title="搜索投稿"><Mi name="arrow_forward" size={16} /></button>
              </form>
            )}
          </div>
        )}
      </section>

      <section className="card creator-content-scroll" ref={scrollRef} onScroll={handleScroll} style={{ maxHeight: "70vh", overflowY: "auto" }}>
        {loadingContent && (activeTab === "videos" ? videos.length : activeTab === "articles" ? articles.length : collections.length) === 0 ? (
          <p className="muted">加载中…</p>
        ) : contentError && (activeTab === "videos" ? videos.length : activeTab === "articles" ? articles.length : collections.length) === 0 ? (
          <div className="stack" style={{ alignItems: "center", padding: 24 }}>
            <p className="muted">{contentError}</p>
            <button className="m3-outlined-btn" onClick={loadFirstContentPage}>重试</button>
          </div>
        ) : (
          <>
            {activeTab === "videos" && (
              videos.length === 0 ? <p className="empty">暂无公开投稿</p> : (
                <VideoList
                  items={videos}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  onOpenVideo={openVideo}
                  watchedByBvid={watchedByBvid}
                  resolvedPartCounts={resolvedPartCounts}
                  openingBvid={openingBvid}
                  addingBvid={addingBvid}
                  onAddToLearningList={addVideoToLearningList}
                  onSchedulePartCountLookup={schedulePartCountLookup}
                />
              )
            )}
            {activeTab === "articles" && (
              articles.length === 0 ? <p className="empty">暂无公开专栏</p> : (
                <ul className="bilibili-account-list">
                  {articles.map((article) => (
                    <li key={article.id}>
                      <a className="bilibili-account-row" href={"https://www.bilibili.com/read/cv" + article.id} target="_blank" rel="noreferrer">
                        {article.coverUrl ? <img src={article.coverUrl} alt="" referrerPolicy="no-referrer" /> : <span className="bilibili-account-placeholder" />}
                        <div>
                          <strong>{article.title}</strong>
                          <small>{article.summary || "暂无摘要"} · {formatPublishDate(article.publishedAt)} · {formatCount(article.viewCount)}阅读</small>
                        </div>
                      </a>
                    </li>
                  ))}
                  {loadingMore && <li className="creator-loading-footer"><Loader2 size={18} className="spin" /></li>}
                </ul>
              )
            )}
            {activeTab === "collections" && (
              collections.length === 0 ? <p className="empty">暂无创建的合集</p> : (
                <div className="creator-collection-grid">
                  {collections.map((collection) => (
                    <button key={collection.id} className="creator-collection-card" onClick={() => onOpenCollection?.({
                      id: collection.id,
                      title: collection.title,
                      coverUrl: collection.coverUrl,
                      description: collection.description,
                      ownerMid: collection.ownerMid,
                      ownerName: collection.ownerName || profile?.name || "未知 UP 主",
                      ownerAvatarUrl: collection.ownerAvatarUrl,
                      videoCount: collection.totalCount,
                      viewCount: 0,
                    })}>
                      {collection.coverUrl ? <img src={collection.coverUrl} alt="" referrerPolicy="no-referrer" /> : <span className="bilibili-account-placeholder" />}
                      <span className="creator-collection-badge">{collection.totalCount} 支视频</span>
                      <strong>{collection.title}</strong>
                    </button>
                  ))}
                  {loadingMore && <div className="creator-loading-footer"><Loader2 size={18} className="spin" /></div>}
                </div>
              )
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ExpandableSign({ sign }: { sign: string }) {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [sign]);

  return (
    <div>
      <p
        ref={textRef}
        className="muted creator-profile-sign"
        key="creator-profile-sign"
        style={{
          fontSize: 12.5,
          margin: "4px 0 0",
          display: "-webkit-box",
          WebkitLineClamp: expanded ? "unset" : 2,
          WebkitBoxOrient: "vertical",
          overflow: expanded ? "visible" : "hidden",
        }}
      >
        {sign}
      </p>
      {(overflowing || expanded) && (
        <button className="m3-text-btn compact" key="toggle-creator-profile-sign" onClick={() => setExpanded((v) => !v)} style={{ marginTop: 2 }}>
          {expanded ? "收起简介" : "展开简介"}
        </button>
      )}
    </div>
  );
}

export function CollectionDetailView({ collection, onBack, onOpenVideo }: { collection: SubscribedCollection } & ViewActions) {
  const service = useMemo(() => createBilibiliPublicContentService(), []);
  const learningListService = useMemo(() => createLearningListService(), []);
  const showMessage = useM3Feedback().showMessage;

  const [videos, setVideos] = useState<CreatorVideo[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [openingBvid, setOpeningBvid] = useState<string | null>(null);
  const [addingBvid, setAddingBvid] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    service.listCollectionVideos(collection.ownerMid, collection.id, 1).then((result) => {
      if (cancelled) return;
      setVideos(result.items);
      setPage(result.page);
      setHasMore(result.hasMore);
      setLoading(false);
    }).catch((error) => {
      if (cancelled) return;
      setMessage(error instanceof Error ? error.message : String(error));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [collection.id, collection.ownerMid, service]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    service.listCollectionVideos(collection.ownerMid, collection.id, page + 1).then((result) => {
      setVideos((current) => {
        const keys = new Set(current.map((item) => item.bvid));
        return [...current, ...result.items.filter((item) => !keys.has(item.bvid) && keys.add(item.bvid))];
      });
      setPage(result.page);
      setHasMore(result.hasMore);
      setLoadingMore(false);
    }).catch((error) => {
      setLoadingMore(false);
      showMessage("加载更多失败：" + (error instanceof Error ? error.message : String(error)));
    });
  }, [collection.id, collection.ownerMid, hasMore, loading, loadingMore, page, service, showMessage]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > SCROLL_LOAD_THRESHOLD) return;
    loadMore();
  }, [loadMore]);

  function openVideo(item: CreatorVideo) {
    if (openingBvid || addingBvid) return;
    setOpeningBvid(item.bvid);
    service.lookupVideo(item.bvid).then((video) => {
      setOpeningBvid(null);
      onOpenVideo(video.bvid, video.title);
    }).catch((error) => {
      setOpeningBvid(null);
      showMessage("无法打开视频：" + (error instanceof Error ? error.message : String(error)));
    });
  }

  function addVideoToLearningList(item: CreatorVideo) {
    if (openingBvid || addingBvid) return;
    setAddingBvid(item.bvid);
    service.lookupVideo(item.bvid).then((video) => {
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
      return learningListService.add(entry);
    }).then(() => {
      setAddingBvid(null);
      showMessage("已加入学习清单，可在首页继续学习。");
    }).catch(() => {
      setAddingBvid(null);
      showMessage("加入学习清单失败，请检查网络后重试。");
    });
  }

  return (
    <div className="stack">
      <section className="card">
        <button className="m3-outlined-btn compact" onClick={onBack}><ArrowLeft size={15} /> 返回订阅合集</button>
        <div className="row" style={{ alignItems: "flex-start", marginTop: 12 }}>
          {collection.coverUrl ? <img className="bilibili-account-cover" src={collection.coverUrl} alt="" referrerPolicy="no-referrer" /> : <span className="bilibili-account-placeholder" />}
          <div>
            <h2>{collection.title}</h2>
            <p className="muted" style={{ fontSize: 12.5 }}>{collection.ownerName} · 共 {collection.videoCount} 支独立视频</p>
            {collection.description && <p className="muted" style={{ fontSize: 12.5 }}>{collection.description}</p>}
          </div>
        </div>
      </section>
      <section className="card creator-content-scroll" ref={scrollRef} onScroll={handleScroll} style={{ maxHeight: "70vh", overflowY: "auto" }}>
        <h3 style={{ marginTop: 0 }}>合集视频</h3>
        {loading ? (
          <p className="muted">加载中…</p>
        ) : message && videos.length === 0 ? (
          <p className="muted">{message}</p>
        ) : videos.length === 0 ? (
          <p className="empty">这个合集暂时没有可播放视频</p>
        ) : (
          <VideoList
            items={videos}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onOpenVideo={openVideo}
            watchedByBvid={new Map()}
            resolvedPartCounts={new Map()}
            openingBvid={openingBvid}
            addingBvid={addingBvid}
            onAddToLearningList={addVideoToLearningList}
            onSchedulePartCountLookup={() => {}}
          />
        )}
      </section>
    </div>
  );
}

export function CreatorProfileRoute() {
  const creator = useAppStore((state) => state.activeBilibiliCreator);
  const setView = useAppStore((state) => state.setView);
  const openVideo = useAppStore((state) => state.openBilibiliVideo);
  const openCollection = useAppStore((state) => state.openBilibiliCollection);
  return creator ? (
    <CreatorProfileView
      mid={creator.mid}
      initialName={creator.name}
      initialAvatarUrl={creator.avatarUrl}
      initialSign={creator.sign}
      initialOfficialDescription={creator.officialDescription}
      onBack={() => setView("followed")}
      onOpenVideo={openVideo}
      onOpenCollection={openCollection}
    />
  ) : null;
}

export function CollectionDetailRoute() {
  const collection = useAppStore((state) => state.activeBilibiliCollection);
  const setView = useAppStore((state) => state.setView);
  const openVideo = useAppStore((state) => state.openBilibiliVideo);
  return collection ? <CollectionDetailView collection={collection} onBack={() => setView("subscribed-collections")} onOpenVideo={openVideo} /> : null;
}
