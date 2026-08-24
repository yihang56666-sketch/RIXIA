import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { AppUpdateProvider, useAppUpdateController } from "./AppUpdateContext";
import { AppUpdateStatus } from "../../lib/bilibili/miscServices";

describe("AppUpdateContext", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("checks for updates once on mount when startup checks are enabled", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      tag_name: "v1.0.0",
      html_url: "https://example.com/release",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAppUpdateController(), {
      wrapper: AppUpdateProvider,
    });

    await waitFor(() => expect(result.current.result.status).not.toBe(AppUpdateStatus.idle));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not check on mount when the user disabled startup checks", async () => {
    localStorage.setItem("rixia_focubili_startup_update_check_v1", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useAppUpdateController(), { wrapper: AppUpdateProvider });

    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checkNow always runs even when startup checks are disabled", async () => {
    localStorage.setItem("rixia_focubili_startup_update_check_v1", "false");
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      tag_name: "v2.0.0",
      html_url: "https://example.com/release",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAppUpdateController(), {
      wrapper: AppUpdateProvider,
    });

    await act(async () => { await result.current.checkNow(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.hasUpdate).toBe(true);
  });
});
