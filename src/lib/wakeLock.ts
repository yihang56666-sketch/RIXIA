type Sentinel = void;

interface WakeLockSentinel {
  release: () => Promise<Sentinel>;
}

interface WakeLockNavigator {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinel>;
  };
}

/** 专注期间保持屏幕常亮；不支持的浏览器返回 null 静默降级 */
export async function requestWakeLock(): Promise<(() => void) | null> {
  try {
    const nav = navigator as unknown as WakeLockNavigator;
    if (!nav.wakeLock) return null;
    const sentinel = await nav.wakeLock.request("screen");
    let released = false;
    return () => {
      if (released) return;
      released = true;
      void sentinel.release();
    };
  } catch {
    return null;
  }
}
