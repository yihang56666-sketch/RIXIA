package com.beid.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import java.util.HashSet;
import java.util.Set;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Android notification and AlarmManager bridge for focus continuation. */
@CapacitorPlugin(name = "BeidFocusNotifications")
public class BeidFocusNotificationPlugin extends Plugin {
    private static final int REQUEST_NOTIFICATIONS = 7401;
    private static final String ACTION_REMINDER = "com.beid.app.FOCUS_REMINDER";
    static final String PREFS = "beid_focus_reminders";
    static final String IDS = "ids";

    @PluginMethod
    public void getOverview(PluginCall call) {
        Context context = getContext();
        BeidFocusNotificationReceiver.ensureChannel(context);
        JSObject result = new JSObject();
        result.put("notificationAllowed", notificationAllowed(context));
        result.put("exactAlarmAllowed", exactAlarmAllowed(context));
        result.put("supportsExactAlarm", Build.VERSION.SDK_INT >= 23);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= 33 && ActivityCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(),
                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
        }
        call.resolve(new JSObject().put("granted", notificationAllowed(context)));
    }

    @PluginMethod
    public void scheduleReminder(PluginCall call) {
        String id = trim(call.getString("id", ""));
        String title = trim(call.getString("title", ""));
        String reason = trim(call.getString("reason", ""));
        long triggerAtMs = call.getLong("triggerAtMs", 0L);
        if (id.isEmpty() || title.isEmpty() || triggerAtMs <= System.currentTimeMillis()) {
            call.reject("提醒参数无效");
            return;
        }
        Context context = getContext();
        BeidFocusNotificationReceiver.ensureChannel(context);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) {
            call.reject("系统闹钟服务不可用");
            return;
        }
        PendingIntent pending = pendingIntent(context, id, title, reason);
        try {
            scheduleAlarm(context, id, title, reason, triggerAtMs);
            persistReminder(context, id, title, reason, triggerAtMs);
            call.resolve(new JSObject().put("scheduled", true).put("exact", exactAlarmAllowed(context)));
        } catch (RuntimeException error) {
            call.reject("安排提醒失败", error);
        }
    }

    @PluginMethod
    public void cancelReminder(PluginCall call) {
        String id = trim(call.getString("id", ""));
        if (id.isEmpty()) {
            call.resolve();
            return;
        }
        Context context = getContext();
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(pendingIntent(context, id, "", ""));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove("title:" + id).remove("reason:" + id).remove("time:" + id)
                .putStringSet(IDS, without(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(IDS, new HashSet<>()), id))
                .apply();
        call.resolve();
    }

    @PluginMethod
    public void showFocusCompleted(PluginCall call) {
        String title = trim(call.getString("title", "专注完成"));
        String body = trim(call.getString("body", "回来继续你的学习"));
        if (title.isEmpty()) title = "专注完成";
        if (body.isEmpty()) body = "回来继续你的学习";
        BeidFocusNotificationReceiver.post(getContext(),
                BeidFocusNotificationReceiver.COMPLETE_NOTIFICATION_ID, title, body);
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        openIntent(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()));
        call.resolve();
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) {
            openIntent(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + getContext().getPackageName())));
        }
        call.resolve();
    }

    @PluginMethod
    public void openDoNotDisturbSettings(PluginCall call) {
        openIntent(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS));
        call.resolve();
    }

    private void openIntent(Intent intent) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(intent); } catch (RuntimeException ignored) { }
    }

    static void scheduleAlarm(Context context, String id, String title, String reason, long triggerAtMs) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent pending = pendingIntent(context, id, title, reason);
        if (Build.VERSION.SDK_INT >= 23 && exactAlarmAllowed(context)) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pending);
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, pending);
        }
    }

    static void restorePersistedReminders(Context context) {
        android.content.SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> ids = preferences.getStringSet(IDS, new HashSet<>());
        Set<String> remaining = new HashSet<>();
        long now = System.currentTimeMillis();
        for (String id : ids) {
            long triggerAtMs = preferences.getLong("time:" + id, 0L);
            if (triggerAtMs <= now) continue;
            String title = preferences.getString("title:" + id, "继续专注");
            String reason = preferences.getString("reason:" + id, "回来继续你的专注任务");
            scheduleAlarm(context, id, title, reason, triggerAtMs);
            remaining.add(id);
        }
        preferences.edit().putStringSet(IDS, remaining).apply();
    }

    private static void persistReminder(Context context, String id, String title, String reason, long triggerAtMs) {
        android.content.SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Set<String> ids = new HashSet<>(preferences.getStringSet(IDS, new HashSet<>()));
        ids.add(id);
        preferences.edit().putStringSet(IDS, ids)
                .putString("title:" + id, title)
                .putString("reason:" + id, reason)
                .putLong("time:" + id, triggerAtMs)
                .apply();
    }

    private static Set<String> without(Set<String> source, String value) {
        Set<String> copy = new HashSet<>(source);
        copy.remove(value);
        return copy;
    }

    static PendingIntent pendingIntent(Context context, String id, String title, String reason) {
        Intent intent = new Intent(context, BeidFocusNotificationReceiver.class)
                .setAction(ACTION_REMINDER)
                .putExtra(BeidFocusNotificationReceiver.EXTRA_ID, id)
                .putExtra(BeidFocusNotificationReceiver.EXTRA_TITLE, title)
                .putExtra(BeidFocusNotificationReceiver.EXTRA_REASON, reason);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private boolean notificationAllowed(Context context) {
        return Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private static boolean exactAlarmAllowed(Context context) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return alarms != null && alarms.canScheduleExactAlarms();
    }

    private static String trim(String value) { return value == null ? "" : value.trim(); }
}
