import { useEffect, useMemo, useState } from "react";
import { Loader2, LogOut, RefreshCw, UserCircle } from "lucide-react";
import {
  createBilibiliAccountDataService,
  createBilibiliAuthService,
  createBilibiliQrLoginService,
  type BilibiliAuthState,
} from "../../lib/bilibili/accountService";
import { useAppStore } from "../../store/useAppStore";

export function BilibiliLoginView() {
  const auth = useMemo(() => createBilibiliAuthService(), []);
  const setView = useAppStore((state) => state.setView);
  const [state, setState] = useState<BilibiliAuthState>(auth.currentState());
  const [qrUrl, setQrUrl] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => auth.onChange(setState), [auth]);

  async function generateQr() {
    setLoading(true);
    setStatus("");
    try {
      const service = createBilibiliQrLoginService();
      const session = await service.generate();
      setQrUrl(session.url);
      pollOnce(service, session.key);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "二维码生成失败");
    } finally {
      setLoading(false);
    }
  }

  async function pollOnce(
    service: ReturnType<typeof createBilibiliQrLoginService>,
    keyToPoll: string,
  ) {
    try {
      const result = await service.poll(keyToPoll);
      if (result.status === "confirmed") {
        auth.signIn(result.cookieHeader || "confirmed", {});
        setStatus("登录成功");
        setView("favorites");
      } else {
        setStatus(result.message);
        setTimeout(() => pollOnce(service, keyToPoll), 2000);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "轮询失败");
    }
  }

  function signOut() {
    auth.signOut();
  }

  return (
    <div className="stack">
      <section className="card bilibili-login">
        <div className="row">
          <div>
            <h2>B 站账号</h2>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
              扫码登录后可访问收藏夹、关注列表、观看历史等账号数据。
              Cookie 仅保存在本机 localStorage，不会上传到任何第三方。
            </p>
          </div>
          <UserCircle size={24} color="var(--text-3)" strokeWidth={1.5} />
        </div>

        {state.signedIn ? (
          <div className="bilibili-login-signed">
            <p>
              {state.userName ? `已登录：${state.userName}` : "已登录"}
              {state.mid ? ` (mid: ${state.mid})` : ""}
            </p>
            <button className="ghost-btn compact" onClick={signOut}>
              <LogOut size={14} /> 退出登录
            </button>
          </div>
        ) : (
          <div className="bilibili-login-qr">
            {qrUrl ? (
              <div className="bilibili-login-qr-display">
                <a href={qrUrl} target="_blank" rel="noreferrer">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrUrl)}`}
                    alt="扫码登录"
                    className="bilibili-qr-image"
                  />
                </a>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                  用 B 站 App 扫描二维码登录
                </p>
                {status && <p className="muted" style={{ fontSize: 12.5 }}>{status}</p>}
              </div>
            ) : (
              <button className="primary" onClick={generateQr} disabled={loading}>
                {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                生成登录二维码
              </button>
            )}
            {status && qrUrl && <p className="muted" style={{ fontSize: 12.5 }}>{status}</p>}
          </div>
        )}
      </section>
    </div>
  );
}

export function BilibiliFavoritesView() {
  return <AccountDataView title="我的收藏夹" kind="favorites" />;
}

export function BilibiliFollowedView() {
  return <AccountDataView title="关注的 UP 主" kind="followed" />;
}

export function BilibiliWatchHistoryView() {
  return <AccountDataView title="观看历史" kind="watch-history" />;
}

function AccountDataView({ title, kind }: { title: string; kind: "favorites" | "followed" | "watch-history" }) {
  const auth = useMemo(() => createBilibiliAuthService(), []);
  const service = useMemo(() => createBilibiliAccountDataService(auth), [auth]);
  const setView = useAppStore((state) => state.setView);
  const [state] = useState<BilibiliAuthState>(auth.currentState());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!state.signedIn) {
      setMessage("请先登录后查看。");
      return;
    }
    setLoading(true);
    setMessage("");
    const promise =
      kind === "favorites"
        ? service.listFavoriteFolders()
        : kind === "followed"
          ? service.listFollowedCreators(1)
          : service.listWatchHistory(1);
    promise.then((page) => {
      setMessage(page.message ?? (page.items.length === 0 ? "暂无数据" : `共 ${page.items.length} 条`));
    }).catch(() => {
      setMessage("加载失败");
    }).finally(() => setLoading(false));
  }, [auth, service, state.signedIn, kind]);

  return (
    <div className="stack">
      <section className="card">
        <div className="row">
          <h2>{title}</h2>
          {!state.signedIn && (
            <button className="ghost-btn compact" onClick={() => setView("login")}>
              去登录
            </button>
          )}
        </div>
        {loading ? <p className="muted">加载中…</p> : <p className="muted" style={{ fontSize: 12.5 }}>{message}</p>}
      </section>
    </div>
  );
}
