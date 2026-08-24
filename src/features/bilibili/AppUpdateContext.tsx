/**
 * 应用更新共享状态 — 对应 FocuBili 的 AppUpdateController + AppUpdateScope
 * （services/app_update_service.dart 579 行）。
 *
 * 让启动 Toast、"关于"页更新卡片、设置页红点共享同一份检查结果，
 * 不必各自独立发起 GitHub Release 请求。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createAppUpdatePreferencesService } from "../../lib/bilibili/appUpdatePreferences";
import { APP_VERSION, AppUpdateStatus, checkForUpdate, type AppUpdateResult } from "../../lib/bilibili/miscServices";

interface AppUpdateContextValue {
  result: AppUpdateResult;
  checking: boolean;
  hasUpdate: boolean;
  checkNow: (force?: boolean) => Promise<void>;
}

const idleResult: AppUpdateResult = {
  status: AppUpdateStatus.idle,
  currentVersion: APP_VERSION,
  releaseHighlights: [],
};

const AppUpdateContext = createContext<AppUpdateContextValue>({
  result: idleResult,
  checking: false,
  hasUpdate: false,
  checkNow: async () => {},
});

export function useAppUpdateController(): AppUpdateContextValue {
  return useContext(AppUpdateContext);
}

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const preferences = useMemo(() => createAppUpdatePreferencesService(), []);
  const [result, setResult] = useState<AppUpdateResult>(idleResult);
  const [checking, setChecking] = useState(false);
  const requestGeneration = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  // 卸载后不得再 setState：否则在途请求会在环境销毁后才 resolve，
  // 在 jsdom 之外触发 "window is not defined" 的未处理拒绝。
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const checkNow = useCallback(async (force = true) => {
    if (inFlight.current) return inFlight.current;
    const generation = ++requestGeneration.current;
    setChecking(true);
    setResult((current) => ({ ...current, status: AppUpdateStatus.checking, message: "正在检查更新…" }));
    const run = (async () => {
      const next = await checkForUpdate(APP_VERSION, { force });
      if (!alive.current || generation !== requestGeneration.current) return;
      setResult(next);
      setChecking(false);
    })();
    inFlight.current = run;
    try {
      await run;
    } finally {
      if (inFlight.current === run) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    void preferences.checkAtStartup(async () => {
      await checkNow(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AppUpdateContextValue>(() => ({
    result,
    checking,
    hasUpdate: result.status === AppUpdateStatus.available,
    checkNow,
  }), [result, checking, checkNow]);

  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}
