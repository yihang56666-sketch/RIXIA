package com.beid.app;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private String pendingWidgetAction;
    private boolean widgetActionDispatched;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 尽早安装：连 bridge 初始化阶段的崩溃也能留下堆栈
        CrashReporter.install(this);
        registerPlugin(BeidShareIntentPlugin.class);
        registerPlugin(BeidNativePlayerPlugin.class);
        registerPlugin(BeidFocusNotificationPlugin.class);
        registerPlugin(BeidWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        // AppCompat's dispatcher is the common path for gesture, three-button,
        // and legacy hardware Back. Keep it enabled for the whole Activity so
        // repeated presses cannot fall through to finish() after the first one.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                dispatchSystemBack();
            }
        });
        handleWidgetIntent(getIntent());
    }

    /**
     * Some Android WebView versions consume the hardware back key while a
     * fullscreen/immersive surface is active and never emit Capacitor's
     * backButton event. Ask the web player to leave fullscreen first, then let
     * the normal Capacitor navigation path handle the next back press.
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        dispatchSystemBack();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWidgetIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        flushPendingWidgetAction();
    }

    private void dispatchSystemBack() {
        Log.i("BeidBack", "dispatchSystemBack invoked");
        if (getBridge() == null || getBridge().getWebView() == null) {
            Log.i("BeidBack", "bridge/webview unavailable; finishing activity");
            finish();
            return;
        }
        String script = "(function(){var surface=document.querySelector('.fb-player-surface');var active=!!document.fullscreenElement||!!(surface&&surface.dataset.fullscreen==='1');if(active){window.dispatchEvent(new Event('beid:request-exit-fullscreen',{cancelable:true}));}else{window.dispatchEvent(new Event('beid:request-app-back'));}})()";
        Log.i("BeidBack", "dispatching web back script");
        getBridge().getWebView().evaluateJavascript(script, null);
    }

    /**
     * Widget quick actions arrive as an intent extra. Hold the action until
     * the WebView is live, then bridge it to the web layer as a DOM event.
     */
    private void handleWidgetIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra(BeidHomeWidgetProvider.EXTRA_ACTION);
        if (action == null || action.isEmpty()) return;
        pendingWidgetAction = action;
        widgetActionDispatched = false;
        flushPendingWidgetAction();
    }

    private void flushPendingWidgetAction() {
        if (pendingWidgetAction == null || widgetActionDispatched) return;
        if (getBridge() == null || getBridge().getWebView() == null) return;
        widgetActionDispatched = true;
        String action = pendingWidgetAction;
        pendingWidgetAction = null;
        // The bundle may still be loading after a cold start; give it a beat before injecting.
        getBridge().getWebView().postDelayed(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().evaluateJavascript(
                    "(function(){window.dispatchEvent(new CustomEvent('beid:widget-action',{detail:{action:'"
                            + action + "'}}));})()",
                    null);
        }, 600L);
    }
}
