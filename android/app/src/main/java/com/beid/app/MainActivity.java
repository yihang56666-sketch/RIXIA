package com.beid.app;

import android.os.Bundle;
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
    }
}
