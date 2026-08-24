/**
 * 登录 B 站账号 — 1:1 React 移植自 FocuBili 的 login_page.dart（733 行，
 * 含 _OfficialQrLoginPage 扫码子页面）。
 *
 * RIXIA 是 Web/Capacitor 应用，没有原生 WebView 承载账号密码输入框，因此
 * 对齐 FocuBili 里 Windows 平台的 LoginExperience.officialQrCode 路径：
 * 手机号 / 密码两个 Tab 都进入官方扫码登录，Cookie 作为第三种手动入口。
 * 账号、密码、验证码均由 B 站官方扫码接口处理，本应用不接触密码原文。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  createBilibiliAccountDataService,
  createBilibiliAuthService,
  createBilibiliQrLoginService,
  BilibiliQrLoginError,
  type BilibiliAuthState,
} from "../../lib/bilibili/accountService";
import { useAppStore } from "../../store/useAppStore";
import { Mi, useM3Feedback } from "./m3";

type LoginMode = "phone" | "password" | "cookie";

const MODES: Array<{ value: LoginMode; label: string; icon: string }> = [
  { value: "phone", label: "扫码", icon: "qr_code_2" },
  { value: "password", label: "密码", icon: "password" },
  { value: "cookie", label: "Cookie", icon: "cookie" },
];

type QrPhase = "loading" | "ready" | "expired";

function QrLoginPanel({ onSignedIn }: { onSignedIn: () => void }) {
  const auth = useMemo(() => createBilibiliAuthService(), []);
  const accountData = useMemo(() => createBilibiliAccountDataService(auth), [auth]);
  const qrService = useMemo(() => createBilibiliQrLoginService(), []);

  const [phase, setPhase] = useState<QrPhase>("loading");
  const [qrUrl, setQrUrl] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [statusMessage, setStatusMessage] = useState("正在生成官方登录二维码…");

  const sessionKeyRef = useRef<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const pollingRef = useRef(false);
  const mountedRef = useRef(true);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const showFailure = useCallback((message: string) => {
    if (!mountedRef.current) return;
    stopPolling();
    setPhase("expired");
    setStatusMessage(message);
  }, [stopPolling]);

  const pollLoginState = useCallback(async () => {
    const key = sessionKeyRef.current;
    if (pollingRef.current || !key) return;
    pollingRef.current = true;
    try {
      const result = await qrService.poll(key);
      if (!mountedRef.current || sessionKeyRef.current !== key) return;
      if (result.status === "expired") {
        stopPolling();
        setPhase("expired");
        setStatusMessage(result.message);
        return;
      }
      setStatusMessage(result.message);
      if (result.status !== "confirmed") return;
      stopPolling();
      // 优先使用从 poll 响应头捕获的真实登录 Cookie；捕获不到（例如
      // 原生 Cookie Jar 模式）时回退到 "confirmed" 标记。
      const cookie = result.cookieHeader || "confirmed";
      auth.signIn(cookie, { mid: result.mid });
      try {
        const profile = await accountData.loadCurrentUser();
        if (profile && (profile.mid || profile.userName)) {
          auth.signIn(cookie, profile);
        } else if (result.mid) {
          auth.signIn(cookie, { mid: result.mid });
        }
      } catch {
        // 账号资料补齐失败不影响已确认的登录会话。
      }
      if (mountedRef.current) onSignedIn();
    } catch (error) {
      // 轮询期间的连接中断不等于二维码失效；保留会话并让既有定时器继续重试。
      // 只有服务明确返回的二维码/业务错误才需要用户刷新二维码。
      if (!(error instanceof BilibiliQrLoginError) && mountedRef.current && sessionKeyRef.current === key) {
        setPhase("ready");
        setStatusMessage("网络连接异常，正在重试…");
      } else {
        showFailure(error instanceof Error ? error.message : "扫码登录暂时失败，请刷新二维码后重试。");
      }
    } finally {
      pollingRef.current = false;
    }
  }, [accountData, auth, onSignedIn, qrService, showFailure, stopPolling]);

  // 二维码图片本地生成：不再依赖 api.qrserver.com 之类的外部服务，
  // 它在国内网络经常无法访问，会导致二维码永远显示不出来。
  useEffect(() => {
    let cancelled = false;
    if (!qrUrl) {
      setQrImage("");
      return;
    }
    QRCode.toDataURL(qrUrl, { width: 392, margin: 2, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (!cancelled) setQrImage(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrImage("");
      });
    return () => {
      cancelled = true;
    };
  }, [qrUrl]);

  const refreshQrCode = useCallback(async () => {
    stopPolling();
    sessionKeyRef.current = null;
    setPhase("loading");
    setQrUrl("");
    setStatusMessage("正在生成官方登录二维码…");
    try {
      const session = await qrService.generate();
      if (!mountedRef.current) return;
      sessionKeyRef.current = session.key;
      setQrUrl(session.url);
      setPhase("ready");
      setStatusMessage("请使用手机 B 站 App 扫描二维码。");
      pollTimerRef.current = window.setInterval(() => void pollLoginState(), 2000);
      void pollLoginState();
    } catch (error) {
      showFailure(
        error instanceof BilibiliQrLoginError
          ? error.message
          : "暂时无法生成二维码，请检查网络后重试。",
      );
    }
  }, [pollLoginState, qrService, showFailure, stopPolling]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshQrCode();
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
      <p className="m3-title-md" style={{ fontWeight: 700 }}>使用手机 B 站 App 扫码</p>
      <div style={{ width: 220, height: 220, background: "#fff", borderRadius: 16, display: "grid", placeItems: "center", padding: 12 }}>
        {phase === "loading" ? (
          <span className="m3-circular-progress lg" />
        ) : phase === "expired" ? (
          <Mi name="qr_code_2" size={96} style={{ color: "rgba(0,0,0,0.26)" }} />
        ) : qrImage ? (
          <img
            src={qrImage}
            alt="B 站官方登录二维码"
            width={196}
            height={196}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div style={{ width: 196, height: 196, display: "grid", placeItems: "center", padding: 12, textAlign: "center" }}>
            <span className="m3-body-sm fb-on-surface-variant">二维码生成失败，请点击下方刷新。</span>
          </div>
        )}
      </div>
      <p className="m3-body-md" style={phase === "expired" ? { color: "var(--m3-error)" } : undefined}>{statusMessage}</p>
      {phase === "expired" && (
        <button className="m3-filled-btn" onClick={() => void refreshQrCode()}>
          <Mi name="refresh" size={18} /> 刷新二维码
        </button>
      )}
      <p className="m3-body-sm fb-on-surface-variant">二维码和确认均由 B 站官方接口处理；本应用不会读取你的密码或验证码。</p>
    </div>
  );
}

export function BilibiliLoginView() {
  const auth = useMemo(() => createBilibiliAuthService(), []);
  const setView = useAppStore((state) => state.setView);
  const autoOfficial = useAppStore((state) => state.loginAutoOfficial);
  const showMessage = useM3Feedback().showMessage;
  const [state, setState] = useState<BilibiliAuthState>(auth.currentState());
  const [mode, setMode] = useState<LoginMode>("phone");
  const [cookie, setCookie] = useState("");
  const [obscureCookie, setObscureCookie] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => auth.onChange(setState), [auth]);

  // 由“切换账号”或“重新登录”打开时，直接进入官方扫码而不是从手机号 Tab 开始。
  useEffect(() => {
    if (autoOfficial) setMode("phone");
  }, [autoOfficial]);

  function handleSignedIn() {
    showMessage("登录成功");
    setView("favorites");
  }

  async function loginWithCookie() {
    const normalized = cookie.trim();
    if (!/(?:SESSDATA|bili_jct)=/i.test(normalized)) {
      setError("请输入包含 SESSDATA 或 bili_jct 的有效 B 站 Cookie。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      auth.signIn(normalized, {});
      showMessage("Cookie 已保存到本机");
      setView("favorites");
    } catch {
      setError("Cookie 登录失败，请检查内容或网络后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  function renderMode() {
    if (mode === "cookie") {
      return (
        <div style={{ display: "grid", gap: 14 }}>
          <p className="m3-body-md">仅粘贴你自己账号的 Cookie。内容只写入本应用的本地会话容器。</p>
          <div className="m3-field m3-field-floating" style={{ marginBottom: 0 }}>
            <input
              id="bilibili-login-cookie-input"
              type={obscureCookie ? "password" : "text"}
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              autoComplete="off"
              placeholder=" "
            />
            <label htmlFor="bilibili-login-cookie-input">B 站 Cookie</label>
            <button className="m3-icon-btn" onClick={() => setObscureCookie((v) => !v)} aria-label={obscureCookie ? "显示 Cookie" : "隐藏 Cookie"} style={{ width: 32, height: 32 }}>
              <Mi name={obscureCookie ? "visibility" : "visibility_off"} size={20} />
            </button>
          </div>
          <button className="m3-filled-btn full" onClick={() => void loginWithCookie()} disabled={submitting || cookie.trim().length === 0}>
            {submitting ? <span className="m3-circular-progress" style={{ width: 18, height: 18 }} /> : null}
            {submitting ? "正在验证…" : "使用 Cookie 登录"}
          </button>
        </div>
      );
    }
    if (mode === "password") {
      return (
        <div style={{ display: "grid", gap: 14 }}>
          <p className="m3-title-md" style={{ fontWeight: 700 }}>密码登录：待开发</p>
          <p className="m3-body-md">当前网页登录会话接管仍不稳定，暂不开放。请使用扫码登录或 Cookie 登录。</p>
          <button className="m3-outlined-btn full" disabled>
            <Mi name="construction" size={18} /> 密码登录待开发
          </button>
        </div>
      );
    }
    return <QrLoginPanel onSignedIn={handleSignedIn} />;
  }

  if (state.signedIn) {
    return (
      <div className="fb fb-page">
        <header className="fb-appbar">
          <button className="m3-icon-btn" onClick={() => setView("settings")} aria-label="返回我的" title="返回我的">
            <Mi name="arrow_back" />
          </button>
          <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>登录 B 站账号</h1>
        </header>
        <div className="fb-scroll-page">
          <div style={{ maxWidth: 760, margin: "0 auto", padding: 20, display: "grid", gap: 16 }}>
            <section className="m3-card" style={{ padding: 24, display: "grid", gap: 10, justifyItems: "center" }}>
              <span className="m3-avatar" style={{ width: 72, height: 72 }}>
                {state.avatarUrl ? <img src={state.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <Mi name="person" size={40} />}
              </span>
              <h2 className="m3-title-lg" style={{ fontWeight: 700 }}>{state.userName || "已登录用户"}</h2>
              {state.mid != null && <p className="m3-body-sm fb-on-surface-variant">UID：{state.mid}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button className="m3-outlined-btn" onClick={() => { auth.signOut(); showMessage("已退出登录"); }}>退出登录</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fb fb-page">
      <header className="fb-appbar">
        <button className="m3-icon-btn" onClick={() => setView("settings")} aria-label="返回我的" title="返回我的">
          <Mi name="arrow_back" />
        </button>
        <h1 className="m3-title-lg" style={{ flex: 1, paddingLeft: 8 }}>登录 B 站账号</h1>
      </header>
      <div className="fb-scroll-page">
        <div style={{ maxWidth: 760, margin: "0 auto", padding: 20 }}>
          <div className="m3-segmented" style={{ width: "100%" }}>
            {MODES.map((m) => (
              <button
                key={m.value}
                className={mode === m.value ? "m3-segmented-item selected" : "m3-segmented-item"}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => { setMode(m.value); setError(""); }}
              >
                <Mi name={m.icon} size={18} /> {m.label}
              </button>
            ))}
          </div>
          <div style={{ height: 24 }} />
          {renderMode()}
          {error && <p className="m3-field-error" style={{ marginTop: 14 }}>{error}</p>}
          <hr className="m3-divider" />
          {mode === "cookie" && (
            <button className="m3-outlined-btn full" onClick={() => setMode("phone")}>
              <Mi name="qr_code_2" size={18} /> 打开 B 站扫码登录
            </button>
          )}
          <p className="m3-body-sm" style={{ marginTop: 10 }}>
            说明：扫码登录由 B 站官方接口处理，本应用不会读取你的密码或验证码；密码登录仍在开发中。
          </p>
        </div>
      </div>
    </div>
  );
}
