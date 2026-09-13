package com.beid.app;

import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.os.Build;
import android.util.Rational;
import android.app.PictureInPictureParams;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.graphics.drawable.Drawable;

import androidx.annotation.NonNull;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
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
import java.util.Iterator;
import java.util.Map;
import java.io.File;

/**
 * Android Media3 playback surface used by BEID's integrated player.
 *
 * The PlayerView sits *below* the WebView and the web page punches a
 * transparent hole where the video rectangle is, so the single web control
 * layer (topbar, control row, danmaku canvas, popups) overlays the video
 * exactly like the Electron/browser player instead of duplicating it.
 */
@CapacitorPlugin(name = "BeidNativePlayer")
@UnstableApi
public class BeidNativePlayerPlugin extends Plugin {
    private final Handler stateHandler = new Handler(Looper.getMainLooper());
    private final Runnable stateTicker = new Runnable() {
        @Override
        public void run() {
            // 跑在主线程消息队列里、不在任何调用方 try/catch 内：
            // 这里抛出的任何异常都是未捕获主线程异常，直接闪退。
            try {
                if (player == null) return;
                if (player.getPlaybackState() == Player.STATE_READY) {
                    emitState(player.isPlaying() ? "playing" : "paused", null);
                }
                stateHandler.postDelayed(this, 500L);
            } catch (Throwable error) {
                android.util.Log.e("BeidNativePlayer", "stateTicker crashed", error);
            }
        }
    };
    private ExoPlayer player;
    private SimpleCache mediaCache;
    private PlayerView playerView;
    private ViewGroup.LayoutParams playerLayout;
    private float density;
    private PluginCall pendingOpenCall;
    private View embeddedWebView;
    private View embeddedDecor;
    private Drawable previousWebViewBackground;
    private Drawable previousDecorBackground;
    /** 镂空洞与原生画面的接缝容差（像素）：原生画面外扩，绝不露出底色缝隙。 */
    private static final int EMBED_BLEED_PX = 1;
    /** CSS 颜色读取失败时的窗口兜底色，与原生播放器的黑色遮罩一致。 */
    private static final int OPAQUE_BLACK = 0xFF000000;
    private Map<String, String> mediaHeaders = defaultMediaHeaders("https://www.bilibili.com/");
    private static final long OPEN_TIMEOUT_MS = 15_000L;
    private static final String DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
    private final Runnable openTimeout = () -> failOpen("视频加载超时");

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
            } catch (Throwable error) {
                // Throwable 而非 Exception：InflateException/NoClassDefFoundError 等
                // Error 不接住的话会直接闪退。
                android.util.Log.e("BeidNativePlayer", "plugin call failed", error);
                String message = error.getMessage();
                message = message == null || message.isEmpty() ? "原生播放器异常" : message;
                if (pendingOpenCall == call) failOpen(message);
                else call.reject(message);
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
            // 网页镂空洞与原生画面各自取整，向外多铺一像素：原生视图永远盖住洞，
            // 缝隙只可能出现在视频之下，不会露出一条底色。
            int pixelLeft = (int) Math.floor((float) left * density) + offset[0] - EMBED_BLEED_PX;
            int pixelTop = (int) Math.floor((float) top * density) + offset[1] - EMBED_BLEED_PX;
            int pixelRight = (int) Math.ceil((float) (left + width) * density) + offset[0] + EMBED_BLEED_PX;
            int pixelBottom = (int) Math.ceil((float) (top + height) * density) + offset[1] + EMBED_BLEED_PX;
            updateLayout(playerLayout,
                Math.max(1, pixelRight - pixelLeft),
                Math.max(1, pixelBottom - pixelTop),
                pixelLeft,
                pixelTop);
            playerView.setLayoutParams(playerLayout);
            playerView.setVisibility(View.VISIBLE);
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

    /**
     * 打开嵌入模式：WebView 自身背景透明，窗口底色换成页面表面色。
     * 配合网页侧 .fb-player-surface 的镂空洞，视频从洞中透出，
     * 洞之外依旧由网页绘制，观感与 Electron/浏览器端一致。
     */
    @PluginMethod
    public void setEmbeddedBackground(PluginCall call) {
        runOnUi(call, () -> {
            applyEmbeddedBackground(parseEmbeddedColor(call.getString("color", ""), OPAQUE_BLACK));
            call.resolve();
        });
    }

    /** 退出嵌入模式，恢复 WebView 与窗口的原始背景。 */
    @PluginMethod
    public void clearEmbeddedBackground(PluginCall call) {
        runOnUi(call, () -> {
            restoreEmbeddedBackground();
            call.resolve();
        });
    }

    /** 与 Color.parseColor 的十六进制子集等价（#rgb/#rgba/#rrggbb/#rrggbbaa），纯 Java 实现，JVM 单测可跑。 */
    static int parseEmbeddedColor(String raw, int fallback) {
        String value = raw == null ? "" : raw.trim();
        if (value.length() < 4 || value.charAt(0) != '#') return fallback;
        String digits = value.substring(1);
        int step = digits.length() == 3 || digits.length() == 4 ? 1 : 2;
        if (digits.length() != 3 * step && digits.length() != 4 * step) return fallback;
        int[] channels = new int[3];
        for (int channel = 0; channel < channels.length; channel++) {
            int high = hexDigit(digits.charAt(channel * step));
            if (high < 0) return fallback;
            if (step == 1) {
                channels[channel] = high * 0x11;
            } else {
                int low = hexDigit(digits.charAt(channel * 2 + 1));
                if (low < 0) return fallback;
                channels[channel] = (high << 4) | low;
            }
        }
        int alpha = 0xFF;
        if (digits.length() == 4 * step) {
            int high = hexDigit(digits.charAt(step == 1 ? 3 : 6));
            if (high < 0) return fallback;
            if (step == 1) {
                alpha = high * 0x11;
            } else {
                int low = hexDigit(digits.charAt(7));
                if (low < 0) return fallback;
                alpha = (high << 4) | low;
            }
        }
        return (alpha << 24) | (channels[0] << 16) | (channels[1] << 8) | channels[2];
    }

    private static int hexDigit(char digit) {
        if (digit >= '0' && digit <= '9') return digit - '0';
        if (digit >= 'a' && digit <= 'f') return digit - 'a' + 10;
        if (digit >= 'A' && digit <= 'F') return digit - 'A' + 10;
        return -1;
    }

    /** Make the WebView transparent and paint the window behind it with the page surface color. */
    private void applyEmbeddedBackground(int pageColor) {
        View webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null && webView != embeddedWebView) {
            embeddedWebView = webView;
            previousWebViewBackground = webView.getBackground();
            webView.setBackgroundColor(Color.TRANSPARENT);
        }
        android.app.Activity activity = getActivity();
        View decor = activity == null ? null : activity.getWindow().getDecorView();
        if (decor != null && decor != embeddedDecor) {
            embeddedDecor = decor;
            previousDecorBackground = decor.getBackground();
        }
        if (decor != null) decor.setBackgroundColor(pageColor);
    }

    /** Put the WebView and window backgrounds back once embedded playback ends. */
    private void restoreEmbeddedBackground() {
        if (embeddedWebView != null) {
            if (previousWebViewBackground != null) {
                embeddedWebView.setBackground(previousWebViewBackground);
            } else {
                embeddedWebView.setBackground(null);
            }
        }
        if (embeddedDecor != null) {
            if (previousDecorBackground != null) {
                embeddedDecor.setBackground(previousDecorBackground);
            } else {
                embeddedDecor.setBackground(null);
            }
        }
        embeddedWebView = null;
        embeddedDecor = null;
        previousWebViewBackground = null;
        previousDecorBackground = null;
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

    /**
     * 播放器进入/退出全屏时锁定系统屏幕方向，让 Pad 端像桌面端一样
     * 横屏看课，而不是只在 WebView 内部铺满画面。
     */
    @PluginMethod
    public void requestOrientation(PluginCall call) {
        runOnUi(call, () -> {
            String orientation = call.getString("orientation", "");
            int requested;
            if ("landscape".equals(orientation)) {
                // 固定横屏而不是 SENSOR_LANDSCAPE：宽平板旋转到竖屏时
                // SENSOR_LANDSCAPE 不会一直锁住，退全屏后 Activity 会跟着转，
                // 让返回手势/状态栏事件出现“卡死在横屏”的观感。
                requested = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE;
            } else if ("portrait".equals(orientation)) {
                requested = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
            } else {
                call.reject("屏幕方向无效");
                return;
            }
            android.app.Activity activity = getActivity();
            if (activity == null) {
                call.reject("播放器窗口不可用");
                return;
            }
            activity.setRequestedOrientation(requested);
            call.resolve();
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
            try {
                releasePlayer();
            } catch (Throwable error) {
                android.util.Log.e("BeidNativePlayer", "destroy cleanup crashed", error);
            } finally {
                SimpleCache releasingCache = mediaCache;
                mediaCache = null;
                if (releasingCache != null) {
                    try {
                        releasingCache.release();
                    } catch (Throwable error) {
                        android.util.Log.e("BeidNativePlayer", "cache cleanup failed", error);
                    }
                }
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
            insertAt = Math.max(0, webIndex);
        } else {
            View content = activity.findViewById(android.R.id.content);
            if (!(content instanceof ViewGroup)) {
                throw new IllegalStateException("播放器容器不可用");
            }
            host = (ViewGroup) content;
            insertAt = host.getChildCount();
        }
        density = getContext().getResources().getDisplayMetrics().density;
        playerView = (PlayerView) LayoutInflater.from(getContext()).inflate(R.layout.beid_native_player, host, false);
        if (playerView == null) {
            throw new IllegalStateException("无法创建原生播放器视图");
        }
        playerView.setUseController(false);
        playerView.setFocusable(false);
        playerView.setFocusableInTouchMode(false);
        playerView.setBackgroundColor(Color.BLACK);
        playerView.setShutterBackgroundColor(Color.BLACK);
        playerView.setVisibility(View.INVISIBLE);
        // Let the parent create its own parameter subtype (CoordinatorLayout,
        // FrameLayout, etc.). Passing FrameLayout.LayoutParams to a
        // CoordinatorLayout causes a ClassCastException during the next measure.
        host.addView(playerView, insertAt);
        playerLayout = playerView.getLayoutParams();
        if (playerLayout == null) {
            throw new IllegalStateException("播放器布局参数不可用");
        }
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
                try {
                    if (state == Player.STATE_READY) {
                        completeOpen(null, false);
                        emitState(player.isPlaying() ? "playing" : "ready", null);
                    }
                    if (state == Player.STATE_ENDED) emitState("ended", null);
                } catch (Throwable error) {
                    android.util.Log.e("BeidNativePlayer", "playback state listener crashed", error);
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                try {
                    emitState(isPlaying ? "playing" : "paused", null);
                } catch (Throwable error) {
                    android.util.Log.e("BeidNativePlayer", "playing listener crashed", error);
                }
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                // Media3 invokes this on the playback thread/main looper after
                // release as well. Never let error reporting become a second
                // uncaught exception that terminates the WebView process.
                try {
                    String message = error.getErrorCodeName();
                    if (message == null || message.isEmpty()) message = "原生播放器无法播放当前媒体";
                    else message = "原生播放器无法播放当前媒体（" + message + "）";
                    if (pendingOpenCall != null) {
                        completeOpen(message, true);
                    } else {
                        emitState("error", message);
                    }
                } catch (Throwable callbackError) {
                    android.util.Log.e("BeidNativePlayer", "player error callback crashed", callbackError);
                }
            }
        });
        stateHandler.removeCallbacks(stateTicker);
        stateHandler.post(stateTicker);
    }

    private static void updateLayout(ViewGroup.LayoutParams layout, int width, int height, int left, int top) {
        if (layout == null) return;
        layout.width = width;
        layout.height = height;
        if (layout instanceof ViewGroup.MarginLayoutParams) {
            ViewGroup.MarginLayoutParams margins = (ViewGroup.MarginLayoutParams) layout;
            margins.leftMargin = left;
            margins.topMargin = top;
        }
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

    private void failOpen(String message) {
        if (pendingOpenCall == null) return;
        try {
            if (player != null) player.stop();
            if (playerView != null) playerView.setVisibility(View.INVISIBLE);
        } catch (RuntimeException error) {
            android.util.Log.e("BeidNativePlayer", "failed open cleanup failed", error);
        } finally {
            completeOpen(message, true);
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
        androidx.media3.common.VideoSize videoSize = player.getVideoSize();
        state.put("videoWidth", videoSize.width);
        state.put("videoHeight", videoSize.height);
        if (message != null) state.put("message", message);
        notifyListeners("stateChange", state);
    }

    private void releasePlayer() {
        completeOpen("播放器已释放", true);
        stateHandler.removeCallbacks(stateTicker);
        ExoPlayer releasingPlayer = player;
        PlayerView releasingView = playerView;
        player = null;
        playerView = null;
        playerLayout = null;
        try {
            if (releasingView != null) {
                releasingView.setPlayer(null);
                View parent = (View) releasingView.getParent();
                if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(releasingView);
            }
        } finally {
            restoreEmbeddedBackground();
            if (releasingPlayer != null) releasingPlayer.release();
        }
    }
}
