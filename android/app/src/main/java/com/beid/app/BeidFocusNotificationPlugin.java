package com.beid.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import java.util.HashSet;
import java.util.Set;

import androidx.core.content.ContextCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Android notification and AlarmManager bridge for focus continuation. */
@CapacitorPlugin(
    name = "BeidFocusNotifications",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class BeidFocusNotificationPlugin extends Plugin {
    private static final String ACTION_REMINDER = "com.beid.app.FOCUS_REMINDER";
    static final String PREFS = "beid_focus_reminders";
    static final String IDS = "ids";

    @Override
    public void load() {
        restorePersistedReminders(getContext());
    }

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
        BeidFocusNotificationReceiver.ensureChannel(context);
        if (Build.VERSION.SDK_INT < 33 || notificationAllowed(context)) {
            call.resolve(new JSObject().put("granted", notificationAllowed(context)));
            return;
        }
        // 走 Capacitor 权限管线：系统对话框的用户选择在
        // notificationsPermissionCallback 里回传真实结果，
        // 不能在这里同步 resolve——那一刻权限必然还是"未授予"。
        requestPermissionForAlias("notifications", call, "notificationsPermissionCallback");
    }

    @PermissionCallback
    private void notificationsPermissionCallback(PluginCall call) {
        boolean granted = notificationAllowed(getContext());
        call.resolve(new JSObject().put("granted", granted));
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
        try {
            if (alarms != null) {
                PendingIntent pending = pendingIntent(context, id, "", "", PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
                if (pending != null) alarms.cancel(pending);
                cancelLegacyAlarm(context, id, alarms);
            }
        } catch (RuntimeException error) {
            call.reject("取消提醒失败", error);
            return;
        }
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
                .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()), call);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) {
            openIntent(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + getContext().getPackageName())), call);
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void openDoNotDisturbSettings(PluginCall call) {
        openIntent(new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS), call);
    }

    private void openIntent(Intent intent, PluginCall call) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("无法打开系统设置", error);
        }
    }

    static void scheduleAlarm(Context context, String id, String title, String reason, long triggerAtMs) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) throw new IllegalStateException("系统闹钟服务不可用");
        cancelLegacyAlarm(context, id, alarms);
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
        android.content.SharedPreferences.Editor editor = preferences.edit();
        long now = System.currentTimeMillis();
        for (String id : ids) {
            long triggerAtMs = preferences.getLong("time:" + id, 0L);
            if (triggerAtMs <= now) {
                editor.remove("title:" + id).remove("reason:" + id).remove("time:" + id);
                continue;
            }
            String title = preferences.getString("title:" + id, "继续专注");
            String reason = preferences.getString("reason:" + id, "回来继续你的专注任务");
            try {
                scheduleAlarm(context, id, title, reason, triggerAtMs);
            } catch (RuntimeException error) {
                android.util.Log.e("BeidFocusNotifications", "Reminder restoration failed; retained for retry", error);
            }
            remaining.add(id);
        }
        editor.putStringSet(IDS, remaining).apply();
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
        return pendingIntent(context, id, title, reason, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent pendingIntent(Context context, String id, String title, String reason, int flags) {
        Intent intent = new Intent(context, BeidFocusNotificationReceiver.class)
                .setAction(ACTION_REMINDER)
                .setData(Uri.fromParts("beid-focus", id, null))
                .putExtra(BeidFocusNotificationReceiver.EXTRA_ID, id)
                .putExtra(BeidFocusNotificationReceiver.EXTRA_TITLE, title)
                .putExtra(BeidFocusNotificationReceiver.EXTRA_REASON, reason);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, flags);
    }

    private static void cancelLegacyAlarm(Context context, String id, AlarmManager alarms) {
        Intent legacy = new Intent(context, BeidFocusNotificationReceiver.class).setAction(ACTION_REMINDER);
        PendingIntent pending = PendingIntent.getBroadcast(context, id.hashCode(), legacy,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pending != null) alarms.cancel(pending);
    }

    private boolean notificationAllowed(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(BeidFocusNotificationReceiver.CHANNEL_ID);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
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
