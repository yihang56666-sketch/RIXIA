package com.beid.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Reinstalls persisted focus reminders after Android clears alarms during reboot. */
public class BeidFocusBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            BeidFocusNotificationReceiver.ensureChannel(context);
            BeidFocusNotificationPlugin.restorePersistedReminders(context);
        }
    }
}
