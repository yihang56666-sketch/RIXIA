package com.beid.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Home-screen widget with quick actions back into the app.
 * Actions are delivered as an intent extra and bridged to the web layer by MainActivity.
 */
public class BeidHomeWidgetProvider extends AppWidgetProvider {

    public static final String EXTRA_ACTION = "beid_widget_action";
    public static final String ACTION_REFRESH = "com.beid.app.WIDGET_REFRESH";

    public static final String ACTION_OPEN = "open-app";
    public static final String ACTION_CONTINUE = "continue-video";
    public static final String ACTION_FOCUS = "focus";
    public static final String ACTION_SEARCH = "search";
    public static final String ACTION_STATS = "focus-statistics";

    static final String PREFS = "beid_widget_state";
    static final String KEY_FOCUS_MINUTES = "focusMinutes";
    static final String KEY_COMPLETED = "completedCount";
    static final String KEY_CONTINUE_TITLE = "continueTitle";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            appWidgetManager.updateAppWidget(appWidgetId, buildRemoteViews(context));
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent != null && ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, BeidHomeWidgetProvider.class));
            for (int id : ids) {
                manager.updateAppWidget(id, buildRemoteViews(context));
            }
        }
    }

    static RemoteViews buildRemoteViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.beid_widget_home);
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int focusedMinutes = preferences.getInt(KEY_FOCUS_MINUTES, 0);
        int completedCount = preferences.getInt(KEY_COMPLETED, 0);
        String continueTitle = preferences.getString(KEY_CONTINUE_TITLE, "");

        views.setTextViewText(R.id.widget_focus_value,
                context.getString(R.string.widget_focus_value, focusedMinutes, completedCount));
        views.setTextViewText(R.id.widget_continue,
                continueTitle == null || continueTitle.isEmpty()
                        ? context.getString(R.string.widget_continue_hint)
                        : context.getString(R.string.widget_continue_label, continueTitle));

        views.setOnClickPendingIntent(R.id.widget_action_continue, actionPendingIntent(context, ACTION_CONTINUE));
        views.setOnClickPendingIntent(R.id.widget_action_focus, actionPendingIntent(context, ACTION_FOCUS));
        views.setOnClickPendingIntent(R.id.widget_action_search, actionPendingIntent(context, ACTION_SEARCH));
        views.setOnClickPendingIntent(R.id.widget_action_stats, actionPendingIntent(context, ACTION_STATS));
        views.setOnClickPendingIntent(R.id.widget_title, actionPendingIntent(context, ACTION_OPEN));
        views.setOnClickPendingIntent(R.id.widget_brand, actionPendingIntent(context, ACTION_OPEN));
        return views;
    }

    private static PendingIntent actionPendingIntent(Context context, String action) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.fromParts("beid-widget", action, null));
        intent.putExtra(EXTRA_ACTION, action);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, action.hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Re-reads persisted widget state and repaints every placed widget. */
    static void requestRefresh(Context context) {
        Intent intent = new Intent(context, BeidHomeWidgetProvider.class).setAction(ACTION_REFRESH);
        context.sendBroadcast(intent);
    }
}
