import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BilibiliLoginView } from "./LoginView";
import { useAppStore } from "../../store/useAppStore";

function resetAuthStorage() {
  localStorage.clear();
}

describe("BilibiliLoginView", () => {
  afterEach(() => {
    cleanup();
    resetAuthStorage();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    useAppStore.setState({ loginAutoOfficial: false });
  });

  it("defaults to the QR code tab and generates a session on mount", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      url.includes("qrcode/generate")
        ? new Response(JSON.stringify({ code: 0, data: { url: "https://passport.bilibili.com/h5/qr/abc", qrcode_key: "key-1" } }), { status: 200 })
        : new Response(JSON.stringify({ code: 0, data: { code: 86090 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BilibiliLoginView />);

    expect(await screen.findByText("使用手机 B 站 App 扫码")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText("B 站官方登录二维码")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/bili-passport\/x\/passport-login\/web\/qrcode\/generate/),
      expect.any(Object),
    );
  });

  it("signs in automatically once the QR code poll reports confirmed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: { url: "https://passport.bilibili.com/h5/qr/abc", qrcode_key: "key-1" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { code: 0 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: { isLogin: true, mid: 42, uname: "扫码用户", face: "" },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BilibiliLoginView />);
    await screen.findByAltText("B 站官方登录二维码");

    await waitFor(() => expect(useAppStore.getState().view).toBe("favorites"), { timeout: 5000 });
  });

  it("shows an expired state with a manual refresh button", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: { url: "https://passport.bilibili.com/h5/qr/abc", qrcode_key: "key-1" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { code: 86038 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BilibiliLoginView />);

    expect(await screen.findByRole("button", { name: /刷新二维码/ }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByText("二维码已过期，请刷新")).toBeInTheDocument();
  });

  it("keeps polling after a transient network error instead of expiring the QR code", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        data: { url: "https://passport.bilibili.com/h5/qr/abc", qrcode_key: "key-1" },
      }), { status: 200 }))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { code: 86090 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BilibiliLoginView />);

    expect(await screen.findByText("网络连接异常，正在重试…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /刷新二维码/ })).not.toBeInTheDocument();
  });

  it("uses a friendly message when the QR code cannot be generated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));

    render(<BilibiliLoginView />);

    expect(await screen.findByText("暂时无法生成二维码，请检查网络后重试。")).toBeInTheDocument();
    expect(screen.queryByText("fetch failed")).not.toBeInTheDocument();
  });

  it("switches to the cookie tab and signs in with a pasted cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { url: "https://passport.bilibili.com/h5/qr/abc", qrcode_key: "key-1" },
    }), { status: 200 })));

    render(<BilibiliLoginView />);
    fireEvent.click(screen.getByRole("button", { name: /Cookie/ }));

    const input = screen.getByLabelText("B 站 Cookie");
    fireEvent.change(input, { target: { value: "SESSDATA=abc; bili_jct=def" } });
    fireEvent.click(screen.getByRole("button", { name: "使用 Cookie 登录" }));

    await waitFor(() => expect(useAppStore.getState().view).toBe("favorites"));
  });

  it("rejects a cookie that does not contain SESSDATA or bili_jct", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { url: "https://passport.bilibili.com/h5/qr/abc", qrcode_key: "key-1" },
    }), { status: 200 })));

    render(<BilibiliLoginView />);
    fireEvent.click(screen.getByRole("button", { name: /Cookie/ }));
    fireEvent.change(screen.getByLabelText("B 站 Cookie"), { target: { value: "foo=bar" } });
    fireEvent.click(screen.getByRole("button", { name: "使用 Cookie 登录" }));

    expect(await screen.findByText(/请输入包含 SESSDATA 或 bili_jct/)).toBeInTheDocument();
  });

  it("generates a fresh QR code after signing out of a saved session", async () => {
    localStorage.setItem("rixia_bilibili_cookie_v1", "SESSDATA=abc; bili_jct=def");
    localStorage.setItem("rixia_bilibili_auth_v1", JSON.stringify({
      signedIn: true,
      mid: 42,
      userName: "已登录用户",
    }));
    const fetchMock = vi.fn().mockImplementation(async (url: string) =>
      url.includes("qrcode/generate")
        ? new Response(JSON.stringify({ code: 0, data: { url: "https://passport.bilibili.com/h5/qr/abc", qrcode_key: "key-1" } }), { status: 200 })
        : new Response(JSON.stringify({ code: 0, data: { code: 86090 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<BilibiliLoginView />);
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    expect(await screen.findByText("使用手机 B 站 App 扫码")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText("B 站官方登录二维码")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/bili-passport\/x\/passport-login\/web\/qrcode\/generate/),
      expect.any(Object),
    );
  });

  it("shows an under-development notice on the password tab", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      data: { url: "https://passport.bilibili.com/h5/qr/abc", qrcode_key: "key-1" },
    }), { status: 200 })));

    render(<BilibiliLoginView />);
    fireEvent.click(screen.getByRole("button", { name: /密码/ }));

    expect(await screen.findByText("密码登录：待开发")).toBeInTheDocument();
  });
});
