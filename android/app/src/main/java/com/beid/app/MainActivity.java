package com.beid.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BeidShareIntentPlugin.class);
        registerPlugin(BeidNativePlayerPlugin.class);
        registerPlugin(BeidFocusNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
