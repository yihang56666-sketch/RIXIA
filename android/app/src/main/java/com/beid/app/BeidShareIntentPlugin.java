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
        String text = sharedText(intent);
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
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null) return null;
        text = text.trim();
        return text.isEmpty() ? null : text;
    }
}
