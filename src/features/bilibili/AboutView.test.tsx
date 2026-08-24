import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AboutView } from "./AboutView";
import { AppUpdateProvider } from "./AppUpdateContext";
import { useAppStore } from "../../store/useAppStore";

describe("AboutView", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the identity, version and no upstream attribution", () => {
    render(<AboutView />);
    expect(screen.getByRole("heading", { name: /^BEID$/ })).toBeInTheDocument();
    expect(screen.getByText(/版本 0\.3\.0/)).toBeInTheDocument();
    // 个人项目：不展示任何上游/借鉴来源信息
    expect(screen.queryByText(/FocuBili/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /GitHub/ })).not.toBeInTheDocument();
  });

  it("opens problem diagnostics from the entry tile", () => {
    render(<AboutView />);
    fireEvent.click(screen.getByRole("button", { name: /问题诊断/ }));
    expect(useAppStore.getState().view).toBe("problem-diagnostics");
  });

  it("shows an available update with release highlights and a download link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      tag_name: "v9.9.9",
      html_url: "https://github.com/example/releases/tag/v9.9.9",
      body: "- 修复了播放器崩溃\n- 优化了搜索速度",
      assets: [{ browser_download_url: "https://example.com/app.apk" }],
    }), { status: 200 })));

    render(<AppUpdateProvider><AboutView /></AppUpdateProvider>);

    expect(await screen.findByText(/发现新版本 9\.9\.9/)).toBeInTheDocument();
    expect(screen.getByText("修复了播放器崩溃")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /下载安装包/ })).toHaveAttribute("href", "https://example.com/app.apk");
  });

  it("shows up-to-date status when no newer release exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      tag_name: "v0.3.0",
      html_url: "https://github.com/example/releases/tag/v0.3.0",
    }), { status: 200 })));

    render(<AppUpdateProvider><AboutView /></AppUpdateProvider>);

    await waitFor(() => expect(screen.getByText("当前已是最新版本")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /下载安装包|查看 Release/ })).not.toBeInTheDocument();
  });
});
