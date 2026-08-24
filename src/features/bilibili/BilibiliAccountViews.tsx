/**
 * 账号数据只读页群 1:1 React 移植自 FocuBili：
 * - favorite_folders_page.dart（402 行）→ BilibiliFavoritesView
 * - favorite_videos_page.dart（481 行）→ FavoriteVideosView
 * - followed_creators_page.dart（449 行）→ BilibiliFollowedView
 * - subscribed_collections_page.dart（405 行）→ BilibiliSubscribedCollectionsView
 *
 * 四个页面共享同一套结构：搜索框（本地筛选，不触发额外请求）→
 * AccountDataLoadStatus 八态状态图标 + 重试 → 空状态 → 列表 +
 * 加载更多 / 没有更多内容了。全部为只读账号数据，不含任何写操作。
 */

import { useEffect, useMemo, useState } from "react";
import {
  createBilibiliAccountDataService,
  createBilibiliAuthService,
} from "../../lib/bilibili/accountService";
import { createBilibiliPublicContentService } from "../../lib/bilibili/publicContentService";
import { AccountDataLoadStatus } from "../../lib/bilibili/types";
import type { FavoriteFolder, FavoriteVideo, FollowedCreator, SubscribedCollection } from "../../lib/bilibili/types";
import { useAppStore } from "../../store/useAppStore";
import { Mi, useM3Feedback } from "./m3";

function statusIcon(status: AccountDataLoadStatus): string {
  switch (status) {
    case AccountDataLoadStatus.signedOut:
    case AccountDataLoadStatus.expired:
      return "login";
    case AccountDataLoadStatus.networkError:
      return "wifi_off";
    case AccountDataLoadStatus.permissionDenied:
      return "lock";
    default:
      return "error";
  }
}

function AccountStatusState({
  status,
  message,
  fallbackMessage,
  loading,
  onRetry,
  onLogin,
}: {
  status: AccountDataLoadStatus;
  message?: string;
  fallbackMessage: string;
  loading: boolean;
  onRetry: () => void;
  onLogin?: () => void;
}) {
  const showLogin = (status === AccountDataLoadStatus.signedOut || status === AccountDataLoadStatus.expired) && onLogin;
  const displayMessage = message ?? (
    status === AccountDataLoadStatus.signedOut
      ? "请先登录后查看。"
      : status === AccountDataLoadStatus.expired
        ? "登录已过期，请重新登录。"
        : fallbackMessage
  );
  return (
    <div className="account-status">
      <Mi name={statusIcon(status)} size={44} />
      <p className="m3-body-md" style={{ textAlign: "center" }}>{displayMessage}</p>
      {showLogin ? (
        <button className="m3-filled-btn" onClick={onLogin}>去登录</button>
      ) : (
        <button className="m3-outlined-btn" disabled={loading} onClick={onRetry}>重试</button>
      )}
    </div>
  );
}

function AccountEmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="account-status">
      <Mi name={icon} size={44} />
      <p className="m3-body-md">{text}</p>
    </div>
  );
}

function AccountLoadMoreFooter({
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  if (!hasMore) {
    return <p className="m3-body-sm" style={{ textAlign: "center", padding: "12px 0" }}>没有更多内容了</p>;
  }
  if (loadingMore) {
    return (
      <div className="account-load-more">
        <span className="m3-circular-progress" style={{ width: 22, height: 22 }} />
      </div>
    );
  }
  return (
    <div className="account-load-more">
      <button className="m3-outlined-btn" onClick={onLoadMore}>加载更多</button>
    </div>
  );
}

function AccountSearchField({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="m3-field" style={{ margin: "12px 16px 2px", minHeight: 48 }}>
      <Mi name="search" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function AccountAppBar({ title, onBack, onRefresh, refreshing }: { title: string; onBack: () => void; onRefresh: () => void; refreshing: boolean }) {
  return (
    <header className="fb-appbar">
      <button className="m3-icon-btn" onClick={onBack} aria-label="返回我的" title="返回我的">
        <Mi name="arrow_back" />
      </button>
      <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>{title}</h1>
      <button className="m3-icon-btn" disabled={refreshing} onClick={onRefresh} aria-label={"刷新" + title} title={"刷新" + title}>
        <Mi name="refresh" />
      </button>
    </header>
  );
}

// ============ 我的收藏（收藏夹列表） ============

export function BilibiliFavoritesView() {
  const auth = useMemo(() => createBilibiliAuthService(), []);
  const service = useMemo(() => createBilibiliAccountDataService(auth), [auth]);
  const setView = useAppStore((state) => state.setView);
  const openFavoriteFolder = useAppStore((state) => state.openBilibiliFavoriteFolder);
  const showMessage = useM3Feedback().showMessage;

  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<{ status: AccountDataLoadStatus; items: FavoriteFolder[]; message?: string } | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    if (!auth.currentState().signedIn) {
      setPage({ status: AccountDataLoadStatus.signedOut, items: [], message: "请先登录后查看。" });
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await service.listFavoriteFolders();
    setPage({ status: result.status, items: result.items, message: result.message });
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const items = page?.items ?? [];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => item.title.toLowerCase().includes(keyword));
  }, [page, query]);

  return (
    <div className="fb fb-page">
      <AccountAppBar title="我的收藏" onBack={() => setView("settings")} onRefresh={() => void load()} refreshing={loading} />
      <div className="fb-scroll-page">
        <div className="account-page">
          {!loading && page?.status === AccountDataLoadStatus.success && page.items.length > 0 && (
            <AccountSearchField placeholder="搜索收藏夹" value={query} onChange={setQuery} />
          )}
          {loading ? (
            <div className="account-status"><span className="m3-circular-progress lg" /></div>
          ) : page?.status !== AccountDataLoadStatus.success ? (
            <AccountStatusState
              status={page?.status ?? AccountDataLoadStatus.unavailable}
              message={page?.message}
              fallbackMessage="暂时无法读取收藏夹，请稍后重试。"
              loading={loading}
              onRetry={() => void load()}
              onLogin={() => setView("login")}
            />
          ) : page.items.length === 0 ? (
            <AccountEmptyState icon="star" text="还没有收藏夹" />
          ) : filtered.length === 0 ? (
            <p className="m3-body-md" style={{ textAlign: "center", padding: "48px 0" }}>没有匹配的收藏夹</p>
          ) : (
            <ul className="account-two-column">
              {filtered.map((folder) => (
                <li key={folder.mediaId} className="m3-card account-card">
                  <button
                    className="account-card-button"
                    disabled={!folder.isAvailable}
                    onClick={() => {
                      if (!folder.isAvailable) {
                        showMessage("该收藏夹已失效，暂时无法查看内容。");
                        return;
                      }
                      openFavoriteFolder(folder);
                    }}
                  >
                    <span style={{ position: "relative" }}>
                      {folder.coverUrl ? (
                        <img className="account-folder-cover" src={folder.coverUrl} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="account-folder-cover bilibili-account-placeholder"><Mi name="star" /></span>
                      )}
                      <span className="account-count-badge">{folder.isAvailable ? `${folder.mediaCount} 个视频` : "收藏夹已失效"}</span>
                    </span>
                    <span className="account-card-body">
                      <span className="m3-body-lg line-clamp-2" style={{ fontWeight: 700, textAlign: "left" }}>{folder.title}</span>
                    </span>
                    <span className="account-chevron"><Mi name={folder.isAvailable ? "chevron_right" : "block"} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ 收藏夹内容 ============

export function FavoriteVideosView() {
  const auth = useMemo(() => createBilibiliAuthService(), []);
  const service = useMemo(() => createBilibiliAccountDataService(auth), [auth]);
  const publicContentService = useMemo(() => createBilibiliPublicContentService(), []);
  const setView = useAppStore((state) => state.setView);
  const openBilibiliVideo = useAppStore((state) => state.openBilibiliVideo);
  const folder = useAppStore((state) => state.activeBilibiliFavoriteFolder);
  const showMessage = useM3Feedback().showMessage;

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState<{ status: AccountDataLoadStatus; items: FavoriteVideo[]; page: number; hasMore: boolean; message?: string } | null>(null);
  const [videos, setVideos] = useState<FavoriteVideo[]>([]);
  const [query, setQuery] = useState("");
  const [openingBvid, setOpeningBvid] = useState<string | null>(null);

  async function load() {
    if (!folder) return;
    setLoading(true);
    const result = await service.listFavoriteVideos(folder.mediaId, 1);
    setPage({ status: result.status, items: result.items, page: result.page, hasMore: result.hasMore, message: result.message });
    if (result.status === AccountDataLoadStatus.success) setVideos(result.items);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [folder?.mediaId]);

  async function loadMore() {
    if (!folder || !page || loadingMore || !page.hasMore) return;
    setLoadingMore(true);
    const result = await service.listFavoriteVideos(folder.mediaId, page.page + 1);
    if (result.status === AccountDataLoadStatus.success) {
      setVideos((current) => {
        const seen = new Set(current.map((item) => item.bvid));
        return [...current, ...result.items.filter((item) => !seen.has(item.bvid))];
      });
      setPage({ status: result.status, items: result.items, page: result.page, hasMore: result.hasMore, message: result.message });
    } else {
      showMessage(result.message ?? "加载更多收藏内容失败，请稍后重试。");
    }
    setLoadingMore(false);
  }

  async function openVideo(video: FavoriteVideo) {
    if (!video.isAvailable || openingBvid) return;
    setOpeningBvid(video.bvid);
    try {
      const preview = await publicContentService.lookupVideo(video.bvid);
      openBilibiliVideo(preview.bvid, preview.title);
    } catch {
      openBilibiliVideo(video.bvid, video.title);
    } finally {
      setOpeningBvid(null);
    }
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return videos;
    return videos.filter((video) =>
      video.title.toLowerCase().includes(keyword) ||
      video.ownerName.toLowerCase().includes(keyword) ||
      video.bvid.toLowerCase().includes(keyword),
    );
  }, [videos, query]);

  function formatDuration(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = safe % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  }

  if (!folder) {
    return (
      <div className="fb fb-page">
        <AccountAppBar title="收藏夹" onBack={() => setView("favorites")} onRefresh={() => {}} refreshing={false} />
        <div className="fb-scroll-page">
          <AccountEmptyState icon="star" text="请从我的收藏进入一个收藏夹" />
        </div>
      </div>
    );
  }

  return (
    <div className="fb fb-page">
      <AccountAppBar title={folder.title} onBack={() => setView("favorites")} onRefresh={() => void load()} refreshing={loading} />
      <div className="fb-scroll-page">
        <div className="account-page">
          {!loading && page?.status === AccountDataLoadStatus.success && videos.length > 0 && (
            <AccountSearchField placeholder="搜索视频标题、UP 主或 BV 号" value={query} onChange={setQuery} />
          )}
          {loading ? (
            <div className="account-status"><span className="m3-circular-progress lg" /></div>
          ) : page?.status !== AccountDataLoadStatus.success ? (
            <AccountStatusState
              status={page?.status ?? AccountDataLoadStatus.unavailable}
              message={page?.message}
              fallbackMessage="暂时无法读取收藏内容，请稍后重试。"
              loading={loading}
              onRetry={() => void load()}
              onLogin={() => setView("login")}
            />
          ) : videos.length === 0 ? (
            <AccountEmptyState icon="video_library" text="这个收藏夹还没有视频" />
          ) : filtered.length === 0 ? (
            <p className="m3-body-md" style={{ textAlign: "center", padding: "48px 0" }}>没有匹配的收藏视频</p>
          ) : (
            <>
              <ul className="account-two-column">
                {filtered.map((video) => {
                  const opening = openingBvid === video.bvid;
                  return (
                    <li key={video.bvid} className="m3-card account-card">
                      <button className="account-card-button" disabled={!video.isAvailable || opening} onClick={() => void openVideo(video)}>
                        <span style={{ position: "relative" }}>
                          {video.coverUrl ? (
                            <img className="account-thumb" src={video.coverUrl} alt="" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="account-thumb bilibili-account-placeholder"><Mi name="play_arrow" /></span>
                          )}
                          <span className="account-badge">{formatDuration(video.durationSeconds)}</span>
                          {video.partCount > 1 && (
                            <span className="account-badge" style={{ left: 5, right: "auto" }}>{`共 ${video.partCount} P`}</span>
                          )}
                        </span>
                        <span className="account-card-body">
                          <span className="m3-body-lg line-clamp-2" style={{ fontWeight: 700, textAlign: "left" }}>{video.title}</span>
                          <span className="m3-body-sm ellipsis-nowrap">{video.isAvailable ? video.ownerName : `${video.ownerName} · 视频已失效，暂不可播放`}</span>
                        </span>
                        {opening ? (
                          <span className="m3-circular-progress" style={{ width: 18, height: 18 }} />
                        ) : (
                          <span className="account-chevron"><Mi name={video.isAvailable ? "play_circle" : "block"} /></span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <AccountLoadMoreFooter hasMore={page.hasMore} loadingMore={loadingMore} onLoadMore={() => void loadMore()} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function FavoriteVideosRoute() {
  return <FavoriteVideosView />;
}

// ============ 我的关注 ============

export function BilibiliFollowedView() {
  const auth = useMemo(() => createBilibiliAuthService(), []);
  const service = useMemo(() => createBilibiliAccountDataService(auth), [auth]);
  const setView = useAppStore((state) => state.setView);
  const openBilibiliCreator = useAppStore((state) => state.openBilibiliCreator);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState<{ status: AccountDataLoadStatus; page: number; hasMore: boolean; message?: string } | null>(null);
  const [creators, setCreators] = useState<FollowedCreator[]>([]);
  const [query, setQuery] = useState("");

  async function load() {
    if (!auth.currentState().signedIn) {
      setPage({ status: AccountDataLoadStatus.signedOut, page: 1, hasMore: false, message: "请先登录后查看。" });
      setCreators([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await service.listFollowedCreators(1);
    setPage({ status: result.status, page: result.page, hasMore: result.hasMore, message: result.message });
    if (result.status === AccountDataLoadStatus.success) setCreators(result.items);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function loadMore() {
    if (!page || loadingMore || !page.hasMore) return;
    setLoadingMore(true);
    const result = await service.listFollowedCreators(page.page + 1);
    if (result.status === AccountDataLoadStatus.success) {
      setCreators((current) => {
        const seen = new Set(current.map((item) => item.mid));
        return [...current, ...result.items.filter((item) => !seen.has(item.mid))];
      });
    }
    setPage({ status: result.status, page: result.page, hasMore: result.hasMore, message: result.message });
    setLoadingMore(false);
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return creators;
    return creators.filter((creator) =>
      creator.name.toLowerCase().includes(keyword) ||
      String(creator.mid).includes(keyword) ||
      creator.officialDescription.toLowerCase().includes(keyword) ||
      creator.sign.toLowerCase().includes(keyword),
    );
  }, [creators, query]);

  return (
    <div className="fb fb-page">
      <AccountAppBar title="我的关注" onBack={() => setView("settings")} onRefresh={() => void load()} refreshing={loading} />
      <div className="fb-scroll-page">
        <div className="account-page">
          {!loading && page?.status === AccountDataLoadStatus.success && creators.length > 0 && (
            <AccountSearchField placeholder="搜索昵称、UID、认证或签名" value={query} onChange={setQuery} />
          )}
          {loading ? (
            <div className="account-status"><span className="m3-circular-progress lg" /></div>
          ) : page?.status !== AccountDataLoadStatus.success ? (
            <AccountStatusState
              status={page?.status ?? AccountDataLoadStatus.unavailable}
              message={page?.message}
              fallbackMessage="暂时无法读取已关注 UP 主，请稍后重试。"
              loading={loading}
              onRetry={() => void load()}
              onLogin={() => setView("login")}
            />
          ) : creators.length === 0 ? (
            <AccountEmptyState icon="people" text="还没有已关注的 UP 主" />
          ) : filtered.length === 0 ? (
            <p className="m3-body-md" style={{ textAlign: "center", padding: "48px 0" }}>没有匹配的已关注 UP 主</p>
          ) : (
            <>
              <ul className="account-two-column">
                {filtered.map((creator) => (
                  <li key={creator.mid} className="m3-card account-card">
                    <button className="account-card-button" onClick={() => openBilibiliCreator(creator)}>
                      {creator.avatarUrl ? (
                        <img className="account-avatar" src={creator.avatarUrl} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="account-avatar bilibili-account-placeholder avatar"><Mi name="person" /></span>
                      )}
                      <span className="account-card-body">
                        <span className="account-name-row">
                          <span className="m3-body-lg ellipsis-nowrap" style={{ fontWeight: 700, textAlign: "left" }}>{creator.name}</span>
                          {creator.officialDescription && <Mi name="verified" className="account-verified" />}
                        </span>
                        <span className="m3-body-sm">{`UID：${creator.mid}`}</span>
                        {creator.officialDescription && <span className="m3-body-sm account-cert-line" style={{ color: "var(--m3-primary)" }}>{creator.officialDescription}</span>}
                        {creator.sign && <span className="m3-body-sm line-clamp-2">{creator.sign}</span>}
                      </span>
                      <span className="account-chevron"><Mi name="chevron_right" /></span>
                    </button>
                  </li>
                ))}
              </ul>
              <AccountLoadMoreFooter hasMore={page.hasMore} loadingMore={loadingMore} onLoadMore={() => void loadMore()} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ 我的订阅（UGC 合集） ============

export function BilibiliSubscribedCollectionsView() {
  const auth = useMemo(() => createBilibiliAuthService(), []);
  const service = useMemo(() => createBilibiliAccountDataService(auth), [auth]);
  const setView = useAppStore((state) => state.setView);
  const openBilibiliCollection = useAppStore((state) => state.openBilibiliCollection);
  const showMessage = useM3Feedback().showMessage;

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState<{ status: AccountDataLoadStatus; page: number; hasMore: boolean; message?: string } | null>(null);
  const [collections, setCollections] = useState<SubscribedCollection[]>([]);
  const [query, setQuery] = useState("");

  async function load() {
    if (!auth.currentState().signedIn) {
      setPage({ status: AccountDataLoadStatus.signedOut, page: 1, hasMore: false, message: "请先登录后查看。" });
      setCollections([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await service.listSubscribedCollections(1);
    setPage({ status: result.status, page: result.page, hasMore: result.hasMore, message: result.message });
    if (result.status === AccountDataLoadStatus.success) setCollections(result.items);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function loadMore() {
    if (!page || loadingMore || !page.hasMore) return;
    setLoadingMore(true);
    const result = await service.listSubscribedCollections(page.page + 1);
    if (result.status === AccountDataLoadStatus.success) {
      setCollections((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !seen.has(item.id))];
      });
    }
    setPage({ status: result.status, page: result.page, hasMore: result.hasMore, message: result.message });
    setLoadingMore(false);
  }

  function openCollection(item: SubscribedCollection) {
    if (item.ownerMid <= 0) {
      showMessage("这个合集缺少 UP 主编号，暂时无法读取详情。");
      return;
    }
    openBilibiliCollection(item);
  }

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return collections;
    return collections.filter((item) =>
      item.title.toLowerCase().includes(keyword) ||
      item.ownerName.toLowerCase().includes(keyword) ||
      item.description.toLowerCase().includes(keyword),
    );
  }, [collections, query]);

  return (
    <div className="fb fb-page">
      <AccountAppBar title="我的订阅" onBack={() => setView("settings")} onRefresh={() => void load()} refreshing={loading} />
      <div className="fb-scroll-page">
        <div className="account-page">
          {!loading && page?.status === AccountDataLoadStatus.success && collections.length > 0 && (
            <AccountSearchField placeholder="搜索合集或 UP 主" value={query} onChange={setQuery} />
          )}
          {loading ? (
            <div className="account-status"><span className="m3-circular-progress lg" /></div>
          ) : page?.status !== AccountDataLoadStatus.success ? (
            <AccountStatusState
              status={page?.status ?? AccountDataLoadStatus.unavailable}
              message={page?.message}
              fallbackMessage="暂时无法读取订阅合集，请稍后重试。"
              loading={loading}
              onRetry={() => void load()}
              onLogin={() => setView("login")}
            />
          ) : collections.length === 0 ? (
            <div className="account-status">
              <Mi name="collections_bookmark" size={46} />
              <p className="m3-body-md">当前页没有 UGC 合集</p>
              {page?.hasMore && (
                <button className="m3-outlined-btn" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? "正在查找…" : "继续查找订阅合集"}
                </button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <p className="m3-body-md" style={{ textAlign: "center", padding: "48px 0" }}>没有匹配的订阅合集</p>
          ) : (
            <>
              <ul className="account-two-column">
                {filtered.map((item) => (
                  <li key={item.id} className="m3-card account-card">
                    <button className="account-card-button" onClick={() => openCollection(item)}>
                      {item.coverUrl ? (
                        <img className="account-cover" src={item.coverUrl} alt="" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="account-cover bilibili-account-placeholder"><Mi name="collections_bookmark" /></span>
                      )}
                      <span className="account-card-body">
                        <span className="m3-body-lg line-clamp-2" style={{ fontWeight: 700, textAlign: "left" }}>{item.title}</span>
                        <span className="m3-body-sm ellipsis-nowrap">{`${item.videoCount} 支视频 · ${item.ownerName}`}</span>
                      </span>
                      <span className="account-chevron"><Mi name="chevron_right" /></span>
                    </button>
                  </li>
                ))}
              </ul>
              <AccountLoadMoreFooter hasMore={page.hasMore} loadingMore={loadingMore} onLoadMore={() => void loadMore()} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
