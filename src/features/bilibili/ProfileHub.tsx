/**
 * “我的”页 — 1:1 React 移植自 FocuBili 的 profile_page.dart（616 行）。
 *
 * 结构：账号状态卡（登录 / 过期 / 网络错误 / 已登录菜单）+ 七个功能入口。
 * 宽屏（≥900 且横向）：左 300px 账号摘要 + 右侧入口网格；手机：纵向列表。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createBilibiliAccountDataService,
  createBilibiliAuthService,
  createBilibiliCookieStore,
} from "../../lib/bilibili/accountService";
import { useAppStore } from "../../store/useAppStore";
import type { ViewKey } from "../../types";
import { M3Dialog, Mi, useM3Feedback } from "./m3";
import { useAppUpdateController } from "./AppUpdateContext";

type AccountStatus = "active" | "expired" | "networkError" | "signedOut";

const FEATURE_TILES: Array<{ icon: string; title: string; view: ViewKey }> = [
  { icon: "history", title: "观看记录", view: "local-watch-history" },
  { icon: "star", title: "我的收藏", view: "favorites" },
  { icon: "subscriptions", title: "我的订阅", view: "subscribed-collections" },
  { icon: "people", title: "我的关注", view: "followed" },
  { icon: "playlist_play", title: "学习清单", view: "learning-list" },
  { icon: "edit_note", title: "时间点笔记", view: "video-notes" },
  { icon: "insights", title: "专注数据", view: "focus-statistics" },
  { icon: "school", title: "考研计划", view: "kaoyan" },
  { icon: "today", title: "今日节奏", view: "today" },
  { icon: "eco", title: "习惯打卡", view: "habits" },
  { icon: "video_library", title: "资料库", view: "library" },
  { icon: "task_alt", title: "任务", view: "tasks" },
  { icon: "inbox", title: "收集箱", view: "inbox" },
  { icon: "apps", title: "工具", view: "tools" },
  { icon: "trending_up", title: "B站发现", view: "home-feed" },
  { icon: "settings", title: "设置", view: "personalization" },
];

function usesWorkspace(): boolean {
  return window.innerWidth >= 900 && window.innerWidth > window.innerHeight;
}

export function ProfileHub() {
  const auth = useMemo(() => createBilibiliAuthService(), []);
  const cookieStore = useMemo(() => createBilibiliCookieStore(), []);
  const accountData = useMemo(() => createBilibiliAccountDataService(auth), [auth]);
  const setView = useAppStore((state) => state.setView);
  const storeOpenLogin = useAppStore((state) => state.openLogin);
  const showMessage = useM3Feedback().showMessage;
  const { hasUpdate } = useAppUpdateController();

  const [status, setStatus] = useState<AccountStatus>(() => (auth.currentState().signedIn ? "active" : "signedOut"));
  const [name, setName] = useState<string | undefined>(() => auth.currentState().userName);
  const [mid, setMid] = useState<number | undefined>(() => auth.currentState().mid);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(() => auth.currentState().avatarUrl);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [workspace, setWorkspace] = useState(usesWorkspace);
  const refreshGeneration = useRef(0);

  useEffect(() => {
    const onResize = () => setWorkspace(usesWorkspace());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  async function loadAccount() {
    const generation = ++refreshGeneration.current;
    setLoadingAccount(true);
    const current = auth.currentState();
    if (!current.signedIn) {
      setStatus("signedOut");
      setName(undefined);
      setMid(undefined);
      setAvatarUrl(undefined);
      setLoadingAccount(false);
      return;
    }
    try {
      const profile = await accountData.loadCurrentUser();
      if (generation !== refreshGeneration.current) return;
      if (profile && (profile.mid || profile.userName)) {
        auth.signIn(cookieStore.getCookieHeader(), profile);
        setStatus("active");
        setName(profile.userName);
        setMid(profile.mid);
        setAvatarUrl(profile.avatarUrl);
      } else {
        setStatus("expired");
      }
    } catch (error) {
      if (generation !== refreshGeneration.current) return;
      const errorStatus =
        typeof error === "object" && error !== null && "status" in error
          ? (error as { status?: unknown }).status
          : undefined;
      setStatus(errorStatus === "expired" ? "expired" : errorStatus === "signedOut" ? "signedOut" : "networkError");
    } finally {
      if (generation === refreshGeneration.current) setLoadingAccount(false);
    }
  }

  useEffect(() => {
    const current = auth.currentState();
    if (current.signedIn) {
      setName(current.userName);
      setMid(current.mid);
      setAvatarUrl(current.avatarUrl);
    }
    void loadAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function accountTitle(): string {
    switch (status) {
      case "active": return name ?? "已登录用户";
      case "expired": return "登录已过期";
      case "networkError": return "暂时无法确认登录状态";
      default: return "尚未登录";
    }
  }

  function accountDescription(): string {
    switch (status) {
      case "active": return `UID：${mid ?? 0}`;
      case "expired": return "登录状态已失效，请重新登录";
      case "networkError": return "暂时无法读取登录状态，请稍后重试。";
      default: return "登录后可使用账号相关功能";
    }
  }

  function openLogin(openOfficialOnStart = false) {
    storeOpenLogin(openOfficialOnStart);
  }

  async function switchAccount() {
    setConfirmSwitch(false);
    setLoadingAccount(true);
    try {
      auth.signOut();
      setStatus("signedOut");
      setLoadingAccount(false);
      openLogin(true);
    } catch {
      setLoadingAccount(false);
      showMessage("无法清除当前 B 站登录状态，请稍后重试。");
    }
  }

  async function logout() {
    setLoadingAccount(true);
    auth.signOut();
    setStatus("signedOut");
    setName(undefined);
    setMid(undefined);
    setAvatarUrl(undefined);
    setLoadingAccount(false);
  }

  function Avatar({ radius = 30 }: { radius?: number }) {
    return (
      <span className="m3-avatar" style={{ width: radius * 2, height: radius * 2 }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <Mi name="person" size={Math.round(radius * 1.1)} />
        )}
      </span>
    );
  }

  function AccountAction() {
    if (loadingAccount) {
      return (
        <span style={{ width: 36, height: 36, display: "grid", placeItems: "center" }} aria-label="正在读取登录状态">
          <Mi name="hourglass_top" size={20} />
        </span>
      );
    }
    switch (status) {
      case "active":
        return (
          <span className="m3-menu-anchor">
            <button className="m3-icon-btn" onClick={() => setMenuOpen((open) => !open)} aria-label="账号操作" title="账号操作">
              <Mi name="more_vert" />
            </button>
            {menuOpen && (
              <div className="m3-menu">
                <button className="m3-menu-item" onClick={() => { setMenuOpen(false); setConfirmSwitch(true); }}>切换账号</button>
                <button className="m3-menu-item" onClick={() => { setMenuOpen(false); void logout(); }}>退出登录</button>
              </div>
            )}
          </span>
        );
      case "expired":
        return <button className="m3-filled-btn" onClick={() => openLogin(true)}>重新登录</button>;
      case "networkError":
        return (
          <span style={{ display: "grid", gap: 4, justifyItems: "end" }}>
            <button className="m3-outlined-btn" onClick={() => void loadAccount()}>重试</button>
            <button className="m3-text-btn" onClick={() => openLogin()}>登录</button>
          </span>
        );
      default:
        return <button className="m3-filled-btn" onClick={() => openLogin()}>登录</button>;
    }
  }

  function AccountCard() {
    return (
      <section className="m3-card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 18, fontWeight: 700 }}>{accountTitle()}</p>
          <p className="m3-body-md" style={{ marginTop: 4 }}>{accountDescription()}</p>
        </div>
        <AccountAction />
      </section>
    );
  }

  function WorkspaceAccountCard() {
    const active = status === "active";
    return (
      <section className="m3-card" style={{ padding: "20px 24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span className="m3-title-md" style={{ fontWeight: 700 }}>B站账号</span>
          <span style={{ flex: 1 }} />
          {active && <AccountAction />}
        </div>
        <div style={{ display: "grid", placeItems: "center", marginTop: 22 }}>
          <Avatar radius={42} />
        </div>
        <p className="m3-title-lg" style={{ fontWeight: 700, textAlign: "center", marginTop: 14, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {accountTitle()}
        </p>
        <p className="m3-body-md fb-on-surface-variant" style={{ textAlign: "center", marginTop: 6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {accountDescription()}
        </p>
        {!active && (
          <div style={{ display: "grid", placeItems: "center", marginTop: 18 }}>
            <AccountAction />
          </div>
        )}
      </section>
    );
  }

  function Tile({ icon, title }: { icon: string; title: string }) {
    return (
      <div className="m3-card" style={{ display: "grid" }}>
        <button className="m3-list-tile" onClick={() => setView(FEATURE_TILES.find((tile) => tile.title === title)!.view)}>
          <span className="m3-tile-leading" style={{ position: "relative" }}>
            <Mi name={icon} />
            {title === "设置" && hasUpdate && (
              <span aria-label="有新版本" style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: "50%", background: "var(--m3-error)" }} />
            )}
          </span>
          <span className="m3-tile-body"><span className="m3-body-lg">{title}</span></span>
          <span className="m3-tile-trailing"><Mi name="chevron_right" /></span>
        </button>
      </div>
    );
  }

  return (
    <div className="fb fb-page">
      {!workspace && (
        <header className="fb-appbar">
          <button className="m3-icon-btn" onClick={() => setView("focus-dashboard")} aria-label="返回首页" title="返回首页">
            <Mi name="arrow_back" />
          </button>
          <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>我的</h1>
        </header>
      )}
      {workspace ? (
        <div style={{ display: "flex", gap: 16, padding: "8px 20px 20px", flex: 1, minHeight: 0, maxWidth: 1180, margin: "0 auto", width: "100%" }}>
          <div style={{ width: 300, flex: "0 0 300px", display: "grid", alignContent: "start" }}>
            <WorkspaceAccountCard />
          </div>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8, alignContent: "start" }}>
            {FEATURE_TILES.map((tile) => (
              <Tile key={tile.title} icon={tile.icon} title={tile.title} />
            ))}
          </div>
        </div>
      ) : (
        <div className="fb-scroll-page" style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "grid", gap: 16, padding: 16 }}>
            <AccountCard />
            {FEATURE_TILES.map((tile) => (
              <Tile key={tile.title} icon={tile.icon} title={tile.title} />
            ))}
          </div>
        </div>
      )}

      {confirmSwitch && (
        <M3Dialog
          title="切换账号"
          onClose={() => setConfirmSwitch(false)}
          actions={
            <>
              <button className="m3-text-btn" onClick={() => setConfirmSwitch(false)}>取消</button>
              <button className="m3-filled-btn" onClick={() => void switchAccount()}>继续</button>
            </>
          }
        >
          将清除当前 B 站登录状态并打开官方网页登录。
        </M3Dialog>
      )}
    </div>
  );
}
