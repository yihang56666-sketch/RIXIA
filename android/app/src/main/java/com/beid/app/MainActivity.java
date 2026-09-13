package com.beid.app;

import android.os.Bundle;
import android.util.Log;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 尽早安装：连 bridge 初始化阶段的崩溃也能留下堆栈
        CrashReporter.install(this);
        registerPlugin(BeidShareIntentPlugin.class);
        registerPlugin(BeidNativePlayerPlugin.class);
        registerPlugin(BeidFocusNotificationPlugin.class);
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
}
