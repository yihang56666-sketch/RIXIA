import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../../store/useAppStore";

const loadCurrentUser = vi.fn().mockResolvedValue({ mid: 42, userName: "测试用户", avatarUrl: "" });

vi.mock("../../lib/bilibili/accountService", () => ({
  createBilibiliAuthService: () => ({
    currentState: () => ({ signedIn: true, mid: 42, userName: "测试用户" }),
    onChange: () => () => undefined,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  createBilibiliCookieStore: () => ({ getCookieHeader: () => "SESSDATA=test" }),
  createBilibiliAccountDataService: () => ({ loadCurrentUser }),
}));

import { ProfileHub } from "./ProfileHub";

describe("ProfileHub", () => {
  beforeEach(() => loadCurrentUser.mockClear());

  it("shows the signed-in Bilibili identity and refreshes it", async () => {
    render(<ProfileHub />);
    expect(screen.getByText("测试用户")).toBeInTheDocument();
    expect(screen.getByText(/UID：42/)).toBeInTheDocument();
    await act(async () => { await Promise.resolve(); });
    expect(loadCurrentUser).toHaveBeenCalledOnce();
  });

  it("shows FocuBili feature entries plus Rixia study tools", async () => {
    render(<ProfileHub />);
    for (const title of ["观看记录", "我的收藏", "我的订阅", "我的关注", "学习清单", "时间点笔记", "专注数据", "考研计划", "今日节奏", "习惯打卡", "资料库", "任务", "收集箱", "工具", "B站发现", "设置"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    await act(async () => { await Promise.resolve(); });
  });

  it("keeps an expired session distinct from a network failure", async () => {
    loadCurrentUser.mockRejectedValueOnce({ status: "expired", message: "登录已过期" });
    render(<ProfileHub />);

    // 满载并发下轮询调度可能变慢，放宽超时避免偶发抖动
    await waitFor(() => expect(screen.getByText("登录状态已失效，请重新登录")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByRole("button", { name: "重新登录" })).toBeInTheDocument();
  });

  it("switching accounts signs out and opens the official login automatically", async () => {
    render(<ProfileHub />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "账号操作" }));
    fireEvent.click(screen.getByText("切换账号"));
    fireEvent.click(screen.getByRole("button", { name: "继续" }));

    expect(useAppStore.getState().view).toBe("login");
    expect(useAppStore.getState().loginAutoOfficial).toBe(true);
  });
});
