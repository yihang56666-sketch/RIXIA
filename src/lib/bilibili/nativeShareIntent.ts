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
): Promise<() => Promise<void>> {
  let receivedFromRetainedEvent = false;
  const listener = await plugin.addListener("shareReceived", ({ text }) => {
    if (!text?.trim()) return;
    receivedFromRetainedEvent = true;
    onShare(text);
  });
  const pending = await plugin.getPendingText();
  if (!receivedFromRetainedEvent && pending.text?.trim()) {
    onShare(pending.text);
  }
  return async () => listener.remove();
}
