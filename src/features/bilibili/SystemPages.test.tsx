import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AndroidPermissionManagementPage, CacheManagementPage, ProblemDiagnosticsPage, WindowsSystemCapabilitiesPage } from "./SystemPages";

describe("AndroidPermissionManagementPage", () => {
  it("explains browser permission handling outside Android", async () => {
    render(<AndroidPermissionManagementPage />);
    expect(await screen.findByText(/当前运行环境不是 Android/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新状态" })).toBeInTheDocument();
  });
});

it("asks before clearing playback cache and keeps Rixia local data", () => {
  localStorage.setItem("focubili.playback-progress.v1:BV1:1", "cache");
  localStorage.setItem("rixia_tasks_v1", "keep");
  render(<CacheManagementPage />);
  fireEvent.click(screen.getByRole("button", { name: "清除播放缓存" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("不会删除任务、习惯、笔记、专注记录或 B 站登录状态");
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(localStorage.getItem("focubili.playback-progress.v1:BV1:1")).toBe("cache");
  expect(localStorage.getItem("rixia_tasks_v1")).toBe("keep");

  fireEvent.click(screen.getByRole("button", { name: "清除播放缓存" }));
  fireEvent.click(screen.getByRole("button", { name: "确认清除" }));
  expect(localStorage.getItem("focubili.playback-progress.v1:BV1:1")).toBeNull();
  expect(localStorage.getItem("rixia_tasks_v1")).toBe("keep");
  expect(screen.getByText("已清空。请刷新页面以重置应用。")).toBeInTheDocument();
});

it("shows playback cache statistics when the cache page opens", () => {
  localStorage.setItem("focubili.playback-progress.v1:BV2:1", "cached-progress");
  render(<CacheManagementPage />);
  expect(screen.getByText("缓存条目：1")).toBeInTheDocument();
});

it("shows recent diagnostic errors and provides copy and clear actions", async () => {
  localStorage.setItem("focubili.diagnostics.errors.v1", JSON.stringify([
    { message: "播放失败", occurredAt: "2026-08-19T10:00:00.000Z", source: "player" },
  ]));
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<ProblemDiagnosticsPage />);

  expect(screen.getByText("最近错误")).toBeInTheDocument();
  expect(screen.getByText("播放失败")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "复制诊断信息" }));
  expect(writeText).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "清空诊断记录" }));
  expect(localStorage.getItem("focubili.diagnostics.errors.v1")).toBeNull();
});

describe("WindowsSystemCapabilitiesPage", () => {
  it("renders five Windows capability cards", async () => {
    const NotificationCtor = vi.fn().mockImplementation(() => ({}));
    Object.defineProperty(NotificationCtor, "permission", { value: "granted", configurable: true });
    (globalThis as unknown as { Notification: typeof Notification }).Notification = NotificationCtor as unknown as typeof Notification;
    render(<WindowsSystemCapabilitiesPage />);
    expect(screen.getByText("Windows 桌面能力")).toBeInTheDocument();
    expect(screen.getByText("Windows 通知")).toBeInTheDocument();
    expect(screen.getByText("未来继续提醒")).toBeInTheDocument();
    expect(screen.getByText("安装包身份")).toBeInTheDocument();
    expect(screen.getByText("Windows 系统专注")).toBeInTheDocument();
    expect(screen.getByText("Windows 勿扰设置")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送测试通知" })).toBeInTheDocument();
  });

  it("does not request notification permission just by opening the page", async () => {
    const NotificationCtor = Object.assign(vi.fn().mockImplementation(() => ({})), {
      requestPermission: vi.fn().mockResolvedValue("default"),
    });
    Object.defineProperty(NotificationCtor, "permission", { value: "default", configurable: true });
    (globalThis as unknown as { Notification: typeof Notification }).Notification = NotificationCtor as unknown as typeof Notification;

    render(<WindowsSystemCapabilitiesPage />);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(NotificationCtor.requestPermission).not.toHaveBeenCalled();
  });
});

it("gives cache, permission, and Windows pages a back path to personalization", () => {
  const { unmount } = render(<CacheManagementPage />);
  expect(screen.getByRole("button", { name: "返回个性化设置" })).toBeInTheDocument();
  unmount();
  const again = render(<AndroidPermissionManagementPage />);
  expect(again.getByRole("button", { name: "返回个性化设置" })).toBeInTheDocument();
  again.unmount();
  render(<WindowsSystemCapabilitiesPage />);
  expect(screen.getByRole("button", { name: "返回个性化设置" })).toBeInTheDocument();
});

it("returns diagnostics to the about page", () => {
  render(<ProblemDiagnosticsPage />);
  expect(screen.getByRole("button", { name: "返回关于" })).toBeInTheDocument();
});
