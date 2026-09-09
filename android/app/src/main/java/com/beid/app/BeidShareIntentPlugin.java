package com.beid.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Safely exposes Android ACTION_SEND text to the BEID WebView. */
@CapacitorPlugin(name = "BeidShareIntent")
public class BeidShareIntentPlugin extends Plugin {
    private static String pendingText;

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        String text;
        try {
            text = sharedText(intent);
        } catch (RuntimeException error) {
            android.util.Log.w("BeidShareIntent", "Rejected malformed share extras", error);
            return;
        }
        if (text == null) return;

        synchronized (BeidShareIntentPlugin.class) {
            pendingText = text;
        }
        JSObject payload = new JSObject();
        payload.put("text", text);
        // Retention covers a cold start where React has not registered its listener yet.
        notifyListeners("shareReceived", payload, true);
    }

    @PluginMethod
    public void getPendingText(PluginCall call) {
        JSObject payload = new JSObject();
        synchronized (BeidShareIntentPlugin.class) {
            if (pendingText != null) {
                payload.put("text", pendingText);
                pendingText = null;
            }
        }
        call.resolve(payload);
    }

    private String sharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return null;
        if (!"text/plain".equals(intent.getType())) return null;
        CharSequence shared = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (shared == null) return null;
        String text = shared.toString().trim();
        return text.isEmpty() ? null : text;
    }
}
