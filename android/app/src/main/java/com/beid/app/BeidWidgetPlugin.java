package com.beid.app;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Persists home-widget state (today focus + continue-learning title) from the web layer. */
@CapacitorPlugin(name = "BeidWidget")
public class BeidWidgetPlugin extends Plugin {

    @PluginMethod
    public void syncState(PluginCall call) {
        Context context = getContext();
        SharedPreferences.Editor editor = context
                .getSharedPreferences(BeidHomeWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit();
        editor.putInt(BeidHomeWidgetProvider.KEY_FOCUS_MINUTES, call.getInt("focusedMinutes", 0));
        editor.putInt(BeidHomeWidgetProvider.KEY_COMPLETED, call.getInt("completedCount", 0));
        editor.putString(BeidHomeWidgetProvider.KEY_CONTINUE_TITLE, call.getString("continueTitle", ""));
        editor.apply();
        BeidHomeWidgetProvider.requestRefresh(context);
        call.resolve(new JSObject().put("synced", true));
    }
}
