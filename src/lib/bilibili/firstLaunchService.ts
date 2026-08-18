/**
 * RIXIA 首次启动服务 — TS 移植自 FocuBili 的 first_launch_service.dart。
 *
 * 第一次启动应用时显示用户协议与隐私政策；用户同意后写入 localStorage
 * 标记，后续启动跳过引导。与 FocuBili 行为一致。
 */

const FIRST_LAUNCH_KEY = "rixia_first_launch_v1";
const AGREEMENT_VERSION = 1;

export interface FirstLaunchService {
  isFirstLaunch(): boolean;
  markAgreed(): void;
  getAgreedVersion(): number | null;
}

export function createFirstLaunchService(
  storage: Storage = localStorage,
): FirstLaunchService {
  return {
    isFirstLaunch() {
      try {
        const raw = storage.getItem(FIRST_LAUNCH_KEY);
        if (!raw) return true;
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return true;
        return (parsed as { version?: number }).version !== AGREEMENT_VERSION;
      } catch {
        return true;
      }
    },
    markAgreed() {
      try {
        storage.setItem(
          FIRST_LAUNCH_KEY,
          JSON.stringify({ version: AGREEMENT_VERSION, agreedAt: new Date().toISOString() }),
        );
      } catch {
        // ignore
      }
    },
    getAgreedVersion() {
      try {
        const raw = storage.getItem(FIRST_LAUNCH_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return null;
        return (parsed as { version?: number }).version ?? null;
      } catch {
        return null;
      }
    },
  };
}
