package com.beid.app;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.Notification;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Resources;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.NotificationCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.common.VideoSize;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.ui.PlayerView;
import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedConstruction;
import org.mockito.MockedStatic;

public class NativeBoundaryTest {
    private static Object field(Object target, String name) throws Exception {
        Field selected = BeidNativePlayerPlugin.class.getDeclaredField(name);
        selected.setAccessible(true);
        return selected.get(target);
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field selected = BeidNativePlayerPlugin.class.getDeclaredField(name);
        selected.setAccessible(true);
        selected.set(target, value);
    }

    private static final class IntentFixture implements AutoCloseable {
        final List<String> identities = new ArrayList<>();
        final MockedStatic<Uri> uris = mockStatic(Uri.class);
        final MockedStatic<PendingIntent> pending = mockStatic(PendingIntent.class);
        final MockedConstruction<Intent> intents;

        IntentFixture() {
            uris.when(() -> Uri.fromParts(anyString(), anyString(), isNull())).thenAnswer(invocation -> {
                Uri value = mock(Uri.class);
                when(value.toString()).thenReturn(invocation.getArgument(0) + ":" + invocation.getArgument(1));
                return value;
            });
            intents = mockConstruction(Intent.class, withSettings().defaultAnswer(RETURNS_SELF), (intent, construction) -> {
                AtomicReference<Uri> data = new AtomicReference<>();
                when(intent.setData(any())).thenAnswer(invocation -> { data.set(invocation.getArgument(0)); return intent; });
                when(intent.getData()).thenAnswer(invocation -> data.get());
            });
            pending.when(() -> PendingIntent.getBroadcast(any(), anyInt(), any(), anyInt())).thenAnswer(invocation -> {
                Intent intent = invocation.getArgument(2);
                identities.add(invocation.getArgument(1) + ":" + intent.getData());
                return mock(PendingIntent.class);
            });
        }

        public void close() {
            intents.close();
            pending.close();
            uris.close();
        }
    }

    @Test
    public void remindersWithCollidingStringHashesHaveDistinctPendingIntentIdentity() {
        assertEquals("Aa".hashCode(), "BB".hashCode());
        try (IntentFixture fixture = new IntentFixture()) {
            Context context = mock(Context.class);
            BeidFocusNotificationPlugin.pendingIntent(context, "Aa", "first", "reason");
            BeidFocusNotificationPlugin.pendingIntent(context, "BB", "second", "reason");
            assertNotEquals(fixture.identities.get(0), fixture.identities.get(1));
        }
    }

    @Test
    public void notificationsWithCollidingHashesDoNotReplaceEachOther() {
        Context context = mock(Context.class);
        when(context.getPackageManager()).thenReturn(mock(PackageManager.class));
        NotificationManagerCompat manager = mock(NotificationManagerCompat.class);
        Set<String> keys = new LinkedHashSet<>();
        doAnswer(invocation -> { keys.add(String.valueOf((int) invocation.getArgument(0))); return null; }).when(manager).notify(anyInt(), any());
        doAnswer(invocation -> { keys.add(invocation.getArgument(0) + ":" + invocation.getArgument(1)); return null; }).when(manager).notify(anyString(), anyInt(), any());
        try (MockedStatic<NotificationManagerCompat> notifications = mockStatic(NotificationManagerCompat.class);
             MockedConstruction<NotificationCompat.Builder> builders = mockConstruction(NotificationCompat.Builder.class, withSettings().defaultAnswer(RETURNS_SELF),
                (builder, construction) -> when(builder.build()).thenReturn(mock(Notification.class)))) {
            notifications.when(() -> NotificationManagerCompat.from(context)).thenReturn(manager);
            for (String id : List.of("Aa", "BB")) {
                Intent intent = mock(Intent.class);
                when(intent.getStringExtra(BeidFocusNotificationReceiver.EXTRA_ID)).thenReturn(id);
                new BeidFocusNotificationReceiver().onReceive(context, intent);
            }
            assertEquals(2, keys.size());
        }
    }

    @Test
    public void notificationOverviewAndPermissionDoNotClaimDisabledNotificationsAreGranted() {
        Context context = mock(Context.class);
        BeidFocusNotificationPlugin plugin = spy(new BeidFocusNotificationPlugin());
        doReturn(context).when(plugin).getContext();
        NotificationManagerCompat manager = mock(NotificationManagerCompat.class);
        when(manager.areNotificationsEnabled()).thenReturn(false);
        try (MockedStatic<NotificationManagerCompat> notifications = mockStatic(NotificationManagerCompat.class);
             MockedConstruction<JSObject> objects = mockConstruction(JSObject.class, withSettings().defaultAnswer(RETURNS_SELF))) {
            notifications.when(() -> NotificationManagerCompat.from(context)).thenReturn(manager);
            plugin.getOverview(mock(PluginCall.class));
            verify(objects.constructed().get(0)).put("notificationAllowed", false);
            plugin.requestPermission(mock(PluginCall.class));
            verify(objects.constructed().get(1)).put("granted", false);
        }
    }

    @Test
    public void rebootRestorationKeepsFailedRemindersForRetryAndContinuesWithOtherIds() {
        Context context = mock(Context.class);
        SharedPreferences preferences = mock(SharedPreferences.class);
        SharedPreferences.Editor editor = mock(SharedPreferences.Editor.class, RETURNS_SELF);
        AlarmManager alarms = mock(AlarmManager.class);
        Set<String> ids = new LinkedHashSet<>(List.of("first", "second"));
        when(context.getSharedPreferences(anyString(), anyInt())).thenReturn(preferences);
        when(preferences.getStringSet(eq("ids"), any())).thenReturn(ids);
        when(preferences.getLong(anyString(), anyLong())).thenReturn(System.currentTimeMillis() + 60_000);
        when(preferences.getString(anyString(), anyString())).thenReturn("fixture");
        when(preferences.edit()).thenReturn(editor);
        when(context.getSystemService(Context.ALARM_SERVICE)).thenReturn(alarms);
        doThrow(new IllegalStateException("alarm unavailable")).doNothing().when(alarms).setAndAllowWhileIdle(anyInt(), anyLong(), any());
        try (IntentFixture ignored = new IntentFixture(); MockedStatic<Log> logs = mockStatic(Log.class)) {
            BeidFocusNotificationPlugin.restorePersistedReminders(context);
            verify(alarms, times(2)).setAndAllowWhileIdle(anyInt(), anyLong(), any());
            verify(editor).putStringSet("ids", ids);
        }
    }

    @Test
    public void expiredRemindersDoNotLeavePrivateTitlesInPreferences() {
        Context context = mock(Context.class);
        SharedPreferences preferences = mock(SharedPreferences.class);
        SharedPreferences.Editor editor = mock(SharedPreferences.Editor.class, RETURNS_SELF);
        when(context.getSharedPreferences(anyString(), anyInt())).thenReturn(preferences);
        when(preferences.getStringSet(eq("ids"), any())).thenReturn(Set.of("expired"));
        when(preferences.getLong(anyString(), anyLong())).thenReturn(1L);
        when(preferences.edit()).thenReturn(editor);
        BeidFocusNotificationPlugin.restorePersistedReminders(context);
        verify(editor).remove("title:expired");
        verify(editor).remove("reason:expired");
        verify(editor).remove("time:expired");
    }

    @Test
    public void cancelAlsoRemovesAnAlarmCreatedByThePreviousHashOnlyIdentity() {
        Context context = mock(Context.class);
        SharedPreferences preferences = mock(SharedPreferences.class);
        SharedPreferences.Editor editor = mock(SharedPreferences.Editor.class, RETURNS_SELF);
        AlarmManager alarms = mock(AlarmManager.class);
        when(context.getSharedPreferences(anyString(), anyInt())).thenReturn(preferences);
        when(preferences.getStringSet(eq("ids"), any())).thenReturn(Set.of("Aa"));
        when(preferences.edit()).thenReturn(editor);
        when(context.getSystemService(Context.ALARM_SERVICE)).thenReturn(alarms);
        BeidFocusNotificationPlugin plugin = spy(new BeidFocusNotificationPlugin());
        doReturn(context).when(plugin).getContext();
        PluginCall call = mock(PluginCall.class);
        when(call.getString("id", "")).thenReturn("Aa");
        try (IntentFixture fixture = new IntentFixture()) {
            plugin.cancelReminder(call);
            assertTrue(fixture.identities.contains("2112:null"));
            assertTrue(fixture.identities.contains("2112:beid-focus:Aa"));
            verify(alarms, times(2)).cancel(any(PendingIntent.class));
        }
    }

    @Test
    public void settingsLaunchFailureRejectsTheBridgeCall() {
        Context context = mock(Context.class);
        doThrow(new IllegalStateException("settings unavailable")).when(context).startActivity(any());
        BeidFocusNotificationPlugin plugin = spy(new BeidFocusNotificationPlugin());
        doReturn(context).when(plugin).getContext();
        PluginCall call = mock(PluginCall.class);
        try (IntentFixture ignored = new IntentFixture()) {
            plugin.openSettings(call);
            verify(call).reject(anyString(), any(Exception.class));
            verify(call, never()).resolve();
        }
    }

    @Test
    public void appReplacementRestoresPersistedAlarms() {
        Context context = mock(Context.class);
        Intent intent = mock(Intent.class);
        when(intent.getAction()).thenReturn(Intent.ACTION_MY_PACKAGE_REPLACED);
        try (MockedStatic<BeidFocusNotificationPlugin> plugin = mockStatic(BeidFocusNotificationPlugin.class)) {
            new BeidFocusBootReceiver().onReceive(context, intent);
            plugin.verify(() -> BeidFocusNotificationPlugin.restorePersistedReminders(context));
        }
    }

    private static final class SharePlugin extends BeidShareIntentPlugin {
        JSObject received;
        @Override
        protected void notifyListeners(String eventName, JSObject payload, boolean retain) { received = payload; }
    }

    @Test
    public void sharedTextAcceptsTheCharSequenceContractOfAndroidExtraText() {
        SharePlugin plugin = new SharePlugin();
        Intent intent = mock(Intent.class);
        when(intent.getAction()).thenReturn(Intent.ACTION_SEND);
        when(intent.getType()).thenReturn("text/plain");
        when(intent.getCharSequenceExtra(Intent.EXTRA_TEXT)).thenReturn(new StringBuilder("  https://www.bilibili.com/video/BVfixture  "));
        try (MockedConstruction<JSObject> objects = mockConstruction(JSObject.class, withSettings().defaultAnswer(RETURNS_SELF))) {
            plugin.handleOnNewIntent(intent);
            assertNotNull(plugin.received);
            verify(plugin.received).put("text", "https://www.bilibili.com/video/BVfixture");
            plugin.getPendingText(mock(PluginCall.class));
        }
    }

    @Test
    public void malformedExternalShareExtrasCannotCrashTheActivity() {
        SharePlugin plugin = new SharePlugin();
        Intent intent = mock(Intent.class);
        when(intent.getAction()).thenReturn(Intent.ACTION_SEND);
        when(intent.getType()).thenReturn("text/plain");
        when(intent.getCharSequenceExtra(Intent.EXTRA_TEXT)).thenThrow(new IllegalArgumentException("invalid parcel"));
        try (MockedStatic<Log> logs = mockStatic(Log.class)) {
            plugin.handleOnNewIntent(intent);
            assertNull(plugin.received);
        }
    }

    private static final class PlayerPlugin extends BeidNativePlayerPlugin {
        Context context;
        AppCompatActivity activity;
        Bridge bridge;
        int emittedStates;
        @Override public Context getContext() { return context; }
        @Override public AppCompatActivity getActivity() { return activity; }
        @Override public Bridge getBridge() { return bridge; }
        @Override protected void notifyListeners(String eventName, JSObject payload) { emittedStates++; }
    }

    private static final class PlayerFixture implements AutoCloseable {
        final List<AutoCloseable> mocks = new ArrayList<>();
        final ExoPlayer player = mock(ExoPlayer.class);
        final SimpleCache cache = mock(SimpleCache.class);
        final PlayerPlugin plugin;
        final Player.Listener listener;
        final WebView webView;
        final ViewGroup host;
        final PlayerView view;

        PlayerFixture() throws Exception {
            mocks.add(mockStatic(Looper.class));
            mocks.add(mockStatic(Log.class));
            mocks.add(mockConstruction(Handler.class));
            mocks.add(mockConstruction(JSObject.class, withSettings().defaultAnswer(RETURNS_SELF)));
            mocks.add(mockConstruction(DefaultHttpDataSource.Factory.class, withSettings().defaultAnswer(RETURNS_SELF)));
            mocks.add(mockConstruction(DefaultDataSource.Factory.class));
            mocks.add(mockConstruction(CacheDataSource.Factory.class, withSettings().defaultAnswer(RETURNS_SELF)));
            mocks.add(mockConstruction(MediaItem.Builder.class, withSettings().defaultAnswer(RETURNS_SELF),
                (builder, construction) -> when(builder.build()).thenReturn(mock(MediaItem.class))));
            mocks.add(mockConstruction(ProgressiveMediaSource.Factory.class, withSettings().defaultAnswer(RETURNS_SELF),
                (factory, construction) -> when(factory.createMediaSource(any())).thenReturn(mock(ProgressiveMediaSource.class))));
            mocks.add(mockConstruction(ExoPlayer.Builder.class, withSettings().defaultAnswer(RETURNS_SELF),
                (builder, construction) -> when(builder.build()).thenReturn(player)));
            MockedStatic<LayoutInflater> inflaters = mockStatic(LayoutInflater.class);
            mocks.add(inflaters);
            plugin = new PlayerPlugin();
            plugin.context = mock(Context.class);
            plugin.activity = mock(AppCompatActivity.class);
            plugin.bridge = mock(Bridge.class);
            doAnswer(invocation -> { ((Runnable) invocation.getArgument(0)).run(); return null; }).when(plugin.activity).runOnUiThread(any());
            Resources resources = mock(Resources.class);
            DisplayMetrics metrics = mock(DisplayMetrics.class);
            metrics.density = 1f;
            when(plugin.context.getResources()).thenReturn(resources);
            when(resources.getDisplayMetrics()).thenReturn(metrics);
            webView = mock(WebView.class);
            host = mock(ViewGroup.class);
            when(plugin.bridge.getWebView()).thenReturn(webView);
            when(webView.getParent()).thenReturn(host);
            when(host.indexOfChild(webView)).thenReturn(1);
            view = mock(PlayerView.class);
            when(view.getParent()).thenReturn(host);
            when(view.getLayoutParams()).thenReturn(mock(ViewGroup.LayoutParams.class));
            LayoutInflater inflater = mock(LayoutInflater.class);
            inflaters.when(() -> LayoutInflater.from(plugin.context)).thenReturn(inflater);
            when(inflater.inflate(anyInt(), eq(host), eq(false))).thenReturn(view);
            setField(plugin, "mediaCache", cache);
            when(player.getVideoSize()).thenReturn(new VideoSize(1920, 1080));
            PluginCall initialize = mock(PluginCall.class);
            plugin.initialize(initialize);
            verify(initialize).resolve(any(JSObject.class));
            ArgumentCaptor<Player.Listener> captured = ArgumentCaptor.forClass(Player.Listener.class);
            verify(player).addListener(captured.capture());
            listener = captured.getValue();
        }

        public void close() throws Exception {
            for (int index = mocks.size() - 1; index >= 0; index--) mocks.get(index).close();
        }
    }

    @Test
    public void readyAfterPausedSeekDoesNotOverrideTheUsersPause() throws Exception {
        try (PlayerFixture fixture = new PlayerFixture()) {
            fixture.listener.onPlaybackStateChanged(Player.STATE_READY);
            verify(fixture.player, never()).play();
        }
    }

    @Test
    public void loadingTimeoutStopsPlaybackBeforeRejectingOpen() throws Exception {
        try (PlayerFixture fixture = new PlayerFixture()) {
            PluginCall pending = mock(PluginCall.class);
            setField(fixture.plugin, "pendingOpenCall", pending);
            ((Runnable) field(fixture.plugin, "openTimeout")).run();
            verify(fixture.player).stop();
            verify(pending).reject("视频加载超时");
            assertNull(field(fixture.plugin, "pendingOpenCall"));
        }
    }

    @Test
    public void synchronousOpenFailureClearsThePendingCall() throws Exception {
        try (PlayerFixture fixture = new PlayerFixture()) {
            PluginCall open = mock(PluginCall.class);
            when(open.getString("videoUrl", "")).thenReturn("https://video.bilivideo.com/test.m4s");
            when(open.getDouble("positionSeconds", 0d)).thenReturn(0d);
            doThrow(new IllegalStateException("prepare failed")).when(fixture.player).prepare();
            fixture.plugin.open(open);
            verify(fixture.player).prepare();
            verify(open, times(1)).reject(anyString());
            assertNull(field(fixture.plugin, "pendingOpenCall"));
        }
    }

    @Test
    public void destroyReleasesTheCacheEvenIfPlayerReleaseThrows() throws Exception {
        try (PlayerFixture fixture = new PlayerFixture()) {
            doThrow(new IllegalStateException("release failed")).when(fixture.player).release();
            fixture.plugin.handleOnDestroy();
            verify(fixture.cache).release();
            assertNull(field(fixture.plugin, "player"));
            assertNull(field(fixture.plugin, "playerView"));
            assertNull(field(fixture.plugin, "mediaCache"));
        }
    }

    @Test
    public void idleTickerDoesNotOverwriteAnEndedOrFailedStateWithPaused() throws Exception {
        try (PlayerFixture fixture = new PlayerFixture()) {
            when(fixture.player.getPlaybackState()).thenReturn(Player.STATE_ENDED);
            ((Runnable) field(fixture.plugin, "stateTicker")).run();
            assertEquals(0, fixture.plugin.emittedStates);
        }
    }

    @Test
    public void nativePlayerViewIsInsertedBelowTheWebView() throws Exception {
        try (PlayerFixture fixture = new PlayerFixture()) {
            verify(fixture.host).addView(fixture.view, 1);
            verify(fixture.host, never()).addView(eq(fixture.view), eq(2));
        }
    }

    @Test
    public void embeddedBackgroundMakesTheWebViewTransparentAndTintsTheWindow() throws Exception {
        try (PlayerFixture fixture = new PlayerFixture()) {
            Drawable originalWebBackground = mock(Drawable.class);
            Drawable originalDecorBackground = mock(Drawable.class);
            when(fixture.webView.getBackground()).thenReturn(originalWebBackground);
            View decor = mock(View.class);
            when(decor.getBackground()).thenReturn(originalDecorBackground);
            Window window = mock(Window.class);
            when(window.getDecorView()).thenReturn(decor);
            when(fixture.plugin.activity.getWindow()).thenReturn(window);

            PluginCall call = mock(PluginCall.class);
            when(call.getString("color", "")).thenReturn("#102030");
            fixture.plugin.setEmbeddedBackground(call);
            verify(fixture.webView).setBackgroundColor(Color.TRANSPARENT);
            verify(decor).setBackgroundColor(0xFF102030);
            verify(call).resolve();

            PluginCall clear = mock(PluginCall.class);
            fixture.plugin.clearEmbeddedBackground(clear);
            verify(fixture.webView).setBackground(originalWebBackground);
            verify(decor).setBackground(originalDecorBackground);
            verify(clear).resolve();
        }
    }

    @Test
    public void embeddedColorParserAcceptsHexShorthandsAndRejectsForeignSyntax() {
        assertEquals(0xFF102030, BeidNativePlayerPlugin.parseEmbeddedColor("#102030", 0xFF000000));
        assertEquals(0xFFFFFFFF, BeidNativePlayerPlugin.parseEmbeddedColor("#fff", 0xFF000000));
        assertEquals(0x44112233, BeidNativePlayerPlugin.parseEmbeddedColor("#1234", 0xFF000000));
        assertEquals(0xFF000000, BeidNativePlayerPlugin.parseEmbeddedColor("rgb(1,2,3)", 0xFF000000));
        assertEquals(0xFF000000, BeidNativePlayerPlugin.parseEmbeddedColor(null, 0xFF000000));
    }

    @Test
    public void disposeRestoresEmbeddedBackgroundsBeforeReleasingThePlayer() throws Exception {
        try (PlayerFixture fixture = new PlayerFixture()) {
            Drawable originalDecorBackground = mock(Drawable.class);
            View decor = mock(View.class);
            when(decor.getBackground()).thenReturn(originalDecorBackground);
            Window window = mock(Window.class);
            when(window.getDecorView()).thenReturn(decor);
            when(fixture.plugin.activity.getWindow()).thenReturn(window);

            PluginCall call = mock(PluginCall.class);
            when(call.getString("color", "")).thenReturn("#000000");
            fixture.plugin.setEmbeddedBackground(call);

            PluginCall dispose = mock(PluginCall.class);
            fixture.plugin.dispose(dispose);
            verify(decor).setBackground(originalDecorBackground);
            verify(fixture.player).release();
            verify(dispose).resolve();
        }
    }
}
