package com.beid.app;

import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.os.Build;
import android.util.Rational;
import android.app.PictureInPictureParams;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.MergingMediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.io.File;

import org.json.JSONArray;

/** Android Media3 playback surface used by BEID's integrated player. */
@CapacitorPlugin(name = "BeidNativePlayer")
public class BeidNativePlayerPlugin extends Plugin {
    private final Handler stateHandler = new Handler(Looper.getMainLooper());
    private final Runnable stateTicker = new Runnable() {
        @Override
        public void run() {
            if (player == null) return;
            if (danmakuView != null) danmakuView.setPositionSeconds(player.getCurrentPosition() / 1000f);
            emitState(player.isPlaying() ? "playing" : "paused", null);
            stateHandler.postDelayed(this, 500L);
        }
    };
    private ExoPlayer player;
    private SimpleCache mediaCache;
    private PlayerView playerView;
    private BeidDanmakuView danmakuView;
    private FrameLayout.LayoutParams playerLayout;
    private float density;
    private PluginCall pendingOpenCall;
    private Map<String, String> mediaHeaders = defaultMediaHeaders("https://www.bilibili.com/");
    private static final long OPEN_TIMEOUT_MS = 15_000L;
    private static final String DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    private final Runnable openTimeout = () -> completeOpen("视频加载超时", true);

    private interface UiTask {
        void run() throws Exception;
    }

    private void runOnUi(PluginCall call, UiTask task) {
        android.app.Activity activity = getActivity();
        if (activity == null) {
            call.reject("播放器窗口不可用");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                task.run();
            } catch (Exception error) {
                String message = error.getMessage();
                call.reject(message == null || message.isEmpty() ? "原生播放器异常" : message);
            }
        });
    }


    @PluginMethod
    public void initialize(PluginCall call) {
        runOnUi(call, () -> {
            ensurePlayer();
            call.resolve(new JSObject().put("ready", true));
        });
    }

    @PluginMethod
    public void setBounds(PluginCall call) {
        runOnUi(call, () -> {
            ensurePlayer();
            double left = number(call, "left", 0);
            double top = number(call, "top", 0);
            double width = number(call, "width", 0);
            double height = number(call, "height", 0);
            if (!Double.isFinite(left) || !Double.isFinite(top) || width <= 0 || height <= 0) {
                call.reject("播放器区域尺寸无效");
                return;
            }
            int[] offset = hostOffsetPx();
            playerLayout.width = Math.max(1, Math.round((float) width * density));
            playerLayout.height = Math.max(1, Math.round((float) height * density));
            playerLayout.leftMargin = Math.round((float) left * density) + offset[0];
            playerLayout.topMargin = Math.round((float) top * density) + offset[1];
            playerView.setLayoutParams(playerLayout);
            playerView.setVisibility(View.VISIBLE);
            if (danmakuView != null) {
                danmakuView.setLayoutParams(new FrameLayout.LayoutParams(playerLayout));
                danmakuView.setVisibility(View.VISIBLE);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void open(PluginCall call) {
        runOnUi(call, () -> {
            ensurePlayer();
            String videoUrl = call.getString("videoUrl", "");
            String audioUrl = call.getString("audioUrl", "");
            if (videoUrl == null || !videoUrl.startsWith("https://")) {
                call.reject("视频地址无效");
                return;
            }
            mediaHeaders = readMediaHeaders(call);
            MediaSource videoSource = mediaSource(videoUrl);
            MediaSource source = videoSource;
            if (audioUrl != null && audioUrl.startsWith("https://")) {
                source = new MergingMediaSource(videoSource, mediaSource(audioUrl));
            }
            long positionMs = Math.max(0L, Math.round(call.getDouble("positionSeconds", 0d) * 1000d));
            completeOpen("被新的播放请求中断", true);
            pendingOpenCall = call;
            player.stop();
            player.setMediaSource(source, positionMs);
            player.prepare();
            player.setPlayWhenReady(true);
            playerView.setVisibility(View.VISIBLE);
            if (danmakuView != null) danmakuView.setVisibility(View.VISIBLE);
            emitState("loading", null);
            stateHandler.removeCallbacks(openTimeout);
            stateHandler.postDelayed(openTimeout, OPEN_TIMEOUT_MS);
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        runOnUi(call, () -> {
            ensurePlayer();
            player.play();
            call.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        runOnUi(call, () -> {
            ensurePlayer();
            player.pause();
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        runOnUi(call, () -> {
            ensurePlayer();
            double seconds = number(call, "positionSeconds", 0);
            if (!Double.isFinite(seconds) || seconds < 0) {
                call.reject("播放位置无效");
                return;
            }
            player.seekTo(Math.round(seconds * 1000d));
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        runOnUi(call, () -> {
            ensurePlayer();
            double volume = Math.max(0d, Math.min(1d, number(call, "volume", 1)));
            player.setVolume((float) volume);
            call.resolve();
        });
    }

    @PluginMethod
    public void setPlaybackSpeed(PluginCall call) {
        runOnUi(call, () -> {
            ensurePlayer();
            double speed = number(call, "speed", 1d);
            if (!Double.isFinite(speed) || speed < 0.5d || speed > 3d) {
                call.reject("播放倍速必须在 0.5 到 3 倍之间");
                return;
            }
            player.setPlaybackSpeed((float) speed);
            call.resolve();
        });
    }

    @PluginMethod
    public void setDanmaku(PluginCall call) {
        runOnUi(call, () -> {
            ensurePlayer();
            JSONArray rawEntries = call.getArray("entries");
            List<BeidDanmakuView.Entry> entries = new ArrayList<>();
            if (rawEntries != null) {
                for (int i = 0; i < Math.min(rawEntries.length(), 5000); i++) {
                    org.json.JSONObject raw = rawEntries.optJSONObject(i);
                    if (raw == null) continue;
                    String text = raw.optString("text", "").trim();
                    if (text.isEmpty()) continue;
                    float start = (float) Math.max(0d, raw.optDouble("startTimeSeconds", 0d));
                    int mode = raw.optInt("mode", 1);
                    int color = raw.optInt("color", 0xffffff);
                    float duration = (float) Math.max(1d, raw.optDouble("durationSeconds", 9d));
                    entries.add(new BeidDanmakuView.Entry(text, start, mode, color, duration));
                }
            }
            if (danmakuView != null) danmakuView.setEntries(entries);
            call.resolve();
        });
    }

    @PluginMethod
    public void enterPictureInPicture(PluginCall call) {
        runOnUi(call, () -> {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                call.resolve(new JSObject().put("entered", false));
                return;
            }
            double ratio = number(call, "aspectRatio", 16d / 9d);
            if (!Double.isFinite(ratio) || ratio <= 0) {
                call.reject("画中画宽高比无效");
                return;
            }
            float clamped = (float) Math.max(0.5d, Math.min(2.39d, ratio));
            int numerator = Math.max(1, Math.round(clamped * 1000f));
            boolean entered = getActivity().enterPictureInPictureMode(
                new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(numerator, 1000))
                    .build()
            );
            call.resolve(new JSObject().put("entered", entered));
        });
    }

    @PluginMethod
    public void dispose(PluginCall call) {
        runOnUi(call, () -> {
            releasePlayer();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        Runnable cleanup = () -> {
            releasePlayer();
            if (mediaCache != null) {
                mediaCache.release();
                mediaCache = null;
            }
        };
        android.app.Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(cleanup);
        } else {
            new Handler(Looper.getMainLooper()).post(cleanup);
        }
        super.handleOnDestroy();
    }

    private void ensurePlayer() {
        if (player != null) return;
        android.app.Activity activity = getActivity();
        if (activity == null) {
            throw new IllegalStateException("播放器窗口不可用");
        }
        View webView = getBridge() != null ? getBridge().getWebView() : null;
        ViewGroup host;
        int insertAt = 0;
        if (webView != null && webView.getParent() instanceof ViewGroup) {
            host = (ViewGroup) webView.getParent();
            int webIndex = host.indexOfChild(webView);
            if (webIndex >= 0) insertAt = webIndex + 1;
        } else {
            View content = activity.findViewById(android.R.id.content);
            if (!(content instanceof ViewGroup)) {
                throw new IllegalStateException("播放器容器不可用");
            }
            host = (ViewGroup) content;
        }
        density = getContext().getResources().getDisplayMetrics().density;
        playerView = (PlayerView) LayoutInflater.from(getContext()).inflate(R.layout.beid_native_player, host, false);
        if (playerView == null) {
            throw new IllegalStateException("无法创建原生播放器视图");
        }
        playerView.setUseController(false);
        playerView.setClickable(true);
        playerView.setFocusable(false);
        playerView.setFocusableInTouchMode(false);
        playerView.setBackgroundColor(Color.BLACK);
        playerView.setShutterBackgroundColor(Color.BLACK);
        playerView.setVisibility(View.INVISIBLE);
        playerView.setOnTouchListener((view, event) -> forwardTouchToWebView(view, event));
        playerLayout = new FrameLayout.LayoutParams(1, 1);
        host.addView(playerView, insertAt, playerLayout);
        danmakuView = new BeidDanmakuView(getContext());
        danmakuView.setClickable(true);
        danmakuView.setFocusable(false);
        danmakuView.setFocusableInTouchMode(false);
        danmakuView.setVisibility(View.INVISIBLE);
        danmakuView.setOnTouchListener((view, event) -> forwardTouchToWebView(view, event));
        host.addView(danmakuView, insertAt + 1, new FrameLayout.LayoutParams(playerLayout));
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent(DESKTOP_UA)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(30_000)
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(mediaHeaders);
        DataSource.Factory dataSource = cachedDataSource(http);
        player = new ExoPlayer.Builder(getContext()).setMediaSourceFactory(
            new ProgressiveMediaSource.Factory(dataSource)
        ).build();
        playerView.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) {
                    player.play();
                    completeOpen(null, false);
                    emitState(player.isPlaying() ? "playing" : "ready", null);
                }
                if (state == Player.STATE_ENDED) emitState("ended", null);
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                emitState(isPlaying ? "playing" : "paused", null);
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                String message = error.getErrorCodeName();
                if (message == null || message.isEmpty()) message = "原生播放器无法播放当前媒体";
                else message = "原生播放器无法播放当前媒体（" + message + "）";
                if (pendingOpenCall != null) {
                    completeOpen(message, true);
                } else {
                    emitState("error", message);
                }
            }
        });
        stateHandler.removeCallbacks(stateTicker);
        stateHandler.post(stateTicker);
    }

    private MediaSource mediaSource(String url) {
        MediaItem item = new MediaItem.Builder().setUri(url).build();
        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setUserAgent(DESKTOP_UA)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(30_000)
            .setAllowCrossProtocolRedirects(true)
            .setDefaultRequestProperties(mediaHeaders);
        return new ProgressiveMediaSource.Factory(cachedDataSource(http))
            .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(1))
            .createMediaSource(item);
    }

    private Map<String, String> readMediaHeaders(PluginCall call) {
        String bvid = call.getString("bvid", "");
        String referer = bvid != null && bvid.startsWith("BV")
            ? "https://www.bilibili.com/video/" + bvid + "/"
            : "https://www.bilibili.com/";
        Map<String, String> headers = defaultMediaHeaders(referer);
        JSObject raw = call.getObject("headers");
        if (raw != null) {
            Iterator<String> keys = raw.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String value = raw.optString(key, "");
                if (key != null && !value.isEmpty()) headers.put(key, value);
            }
        }
        return headers;
    }

    private static Map<String, String> defaultMediaHeaders(String referer) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept", "*/*");
        headers.put("Accept-Encoding", "identity");
        headers.put("Origin", "https://www.bilibili.com");
        headers.put("Referer", referer);
        headers.put("User-Agent", DESKTOP_UA);
        return headers;
    }

    private void completeOpen(String error, boolean failed) {
        stateHandler.removeCallbacks(openTimeout);
        PluginCall pending = pendingOpenCall;
        pendingOpenCall = null;
        if (pending == null) return;
        if (failed) {
            pending.reject(error == null || error.isEmpty() ? "原生播放器无法播放当前媒体" : error);
        } else {
            pending.resolve();
        }
    }

    private DataSource.Factory cachedDataSource(DefaultHttpDataSource.Factory http) {
        if (mediaCache == null) {
            File cacheDirectory = new File(getContext().getCacheDir(), "beid-media");
            mediaCache = new SimpleCache(
                cacheDirectory,
                new LeastRecentlyUsedCacheEvictor(512L * 1024L * 1024L),
                new StandaloneDatabaseProvider(getContext())
            );
        }
        DefaultDataSource.Factory upstream = new DefaultDataSource.Factory(getContext(), http);
        return new CacheDataSource.Factory()
            .setCache(mediaCache)
            .setUpstreamDataSourceFactory(upstream)
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
    }

    private boolean forwardTouchToWebView(View source, MotionEvent event) {
        View webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null || source == null) return false;
        MotionEvent copy = MotionEvent.obtain(event);
        copy.offsetLocation(source.getLeft() - webView.getLeft(), source.getTop() - webView.getTop());
        webView.dispatchTouchEvent(copy);
        copy.recycle();
        return true;
    }

    private int[] hostOffsetPx() {
        View webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null || playerView == null || playerView.getParent() == null) {
            return new int[] {0, 0};
        }
        View parent = (View) playerView.getParent();
        int[] webLoc = new int[2];
        int[] parentLoc = new int[2];
        webView.getLocationOnScreen(webLoc);
        parent.getLocationOnScreen(parentLoc);
        return new int[] {webLoc[0] - parentLoc[0], webLoc[1] - parentLoc[1]};
    }

    private double number(PluginCall call, String key, double fallback) {
        Double value = call.getDouble(key);
        return value == null ? fallback : value;
    }

    private void emitState(String phase, String message) {
        if (player == null) return;
        JSObject state = new JSObject();
        state.put("phase", phase);
        state.put("positionSeconds", player.getCurrentPosition() / 1000d);
        state.put("durationSeconds", Math.max(0L, player.getDuration()) / 1000d);
        state.put("isPlaying", player.isPlaying());
        if (message != null) state.put("message", message);
        notifyListeners("stateChange", state);
    }

    private void releasePlayer() {
        completeOpen("播放器已释放", true);
        stateHandler.removeCallbacks(stateTicker);
        if (playerView != null) {
            View parent = (View) playerView.getParent();
            if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(playerView);
        }
        if (danmakuView != null) {
            View parent = (View) danmakuView.getParent();
            if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(danmakuView);
        }
        if (player != null) player.release();
        player = null;
        playerView = null;
        danmakuView = null;
        playerLayout = null;
    }
}
