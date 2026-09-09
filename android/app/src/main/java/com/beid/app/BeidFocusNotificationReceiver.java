package com.beid.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Posts a continuation reminder after Android wakes the application process. */
public class BeidFocusNotificationReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "beid-focus";
    public static final String EXTRA_ID = "reminder_id";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_REASON = "reason";
    public static final int COMPLETE_NOTIFICATION_ID = 0xF0C0;

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "专注提醒", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("专注完成和继续学习提醒");
        manager.createNotificationChannel(channel);
    }

    static void post(Context context, int notificationId, String title, String body) {
        post(context, null, notificationId, title, body);
    }

    private static void post(Context context, String tag, int notificationId, String title, String body) {
        ensureChannel(context);
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null && tag != null) launch.setAction("com.beid.app.FOCUS_OPEN." + tag);
        PendingIntent contentIntent = launch == null ? null : PendingIntent.getActivity(
                context, notificationId, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(com.beid.app.R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .build();
        try {
            NotificationManagerCompat.from(context).notify(tag, notificationId, notification);
        } catch (SecurityException ignored) {
            // Android 13+ may deny notifications; the timer itself remains valid.
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String title = intent == null ? null : intent.getStringExtra(EXTRA_TITLE);
        String reason = intent == null ? null : intent.getStringExtra(EXTRA_REASON);
        if (title == null || title.trim().isEmpty()) title = "继续专注";
        if (reason == null || reason.trim().isEmpty()) reason = "回来继续你的专注任务";
        String id = intent == null ? "" : intent.getStringExtra(EXTRA_ID);
        int notificationId = id == null ? title.hashCode() : id.hashCode();
        post(context, "reminder:" + id, notificationId, title, reason);
    }
}
