import { registerPlugin } from "@capacitor/core";

export interface NativeShareIntentPlugin {
  addListener(
    eventName: "shareReceived",
    listener: (payload: { text?: string }) => void,
  ): Promise<{ remove: () => Promise<void> | void }>;
  getPendingText(): Promise<{ text?: string }>;
}

declare global {
  var __beidNativeShareIntent: NativeShareIntentPlugin | undefined;
}

/** Returns the shared Capacitor bridge so Vite hot reload never registers it twice. */
export function getNativeShareIntent(): NativeShareIntentPlugin {
  globalThis.__beidNativeShareIntent ??= registerPlugin<NativeShareIntentPlugin>("BeidShareIntent");
  return globalThis.__beidNativeShareIntent;
}

/** Connects Android ACTION_SEND text to the WebView after the listener is ready. */
export async function attachNativeShareIntent(
  plugin: NativeShareIntentPlugin,
  onShare: (text: string) => void,
  signal?: AbortSignal,
): Promise<() => Promise<void>> {
  const abortError = () => new DOMException("分享监听已取消", "AbortError");
  if (signal?.aborted) throw abortError();
  let stopped = false;
  let receivedFromRetainedEvent = false;
  let listener: Awaited<ReturnType<NativeShareIntentPlugin["addListener"]>> | undefined;
  let removal: Promise<void> | undefined;
  let rejectAbort: (error: DOMException) => void = () => undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });

  function removeListener(): Promise<void> {
    if (!listener) return Promise.resolve();
    removal ??= Promise.resolve().then(() => listener!.remove());
    return removal;
  }

  function reportCleanupError(error: unknown): void {
    console.error("原生分享监听清理失败", error);
  }

  async function detach(): Promise<void> {
    stopped = true;
    signal?.removeEventListener("abort", onAbort);
    await removeListener();
  }

  function onAbort(): void {
    void detach().catch(reportCleanupError);
    rejectAbort(abortError());
  }

  signal?.addEventListener("abort", onAbort, { once: true });
  const initialize = async () => {
    listener = await plugin.addListener("shareReceived", ({ text }) => {
      if (stopped || typeof text !== "string" || !text.trim()) return;
      receivedFromRetainedEvent = true;
      onShare(text);
    });
    if (stopped) {
      await removeListener().catch(reportCleanupError);
      throw abortError();
    }
    const pending = await plugin.getPendingText();
    if (stopped) throw abortError();
    if (!receivedFromRetainedEvent && typeof pending.text === "string" && pending.text.trim()) {
      onShare(pending.text);
    }
    return detach;
  };

  try {
    return await Promise.race([initialize(), cancellation]);
  } catch (error) {
    if (!stopped) {
      try {
        await detach();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "原生分享初始化与监听清理失败");
      }
    }
    throw error;
  }
}
