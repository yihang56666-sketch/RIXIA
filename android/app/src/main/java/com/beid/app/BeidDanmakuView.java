package com.beid.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.util.AttributeSet;
import android.view.View;

import androidx.annotation.Nullable;

import java.util.Collections;
import java.util.List;

/** Lightweight native danmaku overlay kept above the Media3 PlayerView. */
public final class BeidDanmakuView extends View {
    public static final class Entry {
        public final String text;
        public final float startSeconds;
        public final int mode;
        public final int color;
        public final float durationSeconds;

        public Entry(String text, float startSeconds, int mode, int color, float durationSeconds) {
            this.text = text;
            this.startSeconds = startSeconds;
            this.mode = mode;
            this.color = color;
            this.durationSeconds = durationSeconds;
        }
    }

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
    private List<Entry> entries = Collections.emptyList();
    private float positionSeconds;
    private float density;

    public BeidDanmakuView(Context context) {
        super(context);
        initialize();
    }

    public BeidDanmakuView(Context context, @Nullable AttributeSet attrs) {
        super(context, attrs);
        initialize();
    }

    private void initialize() {
        density = getResources().getDisplayMetrics().density;
        setBackgroundColor(Color.TRANSPARENT);
        setClickable(false);
        setFocusable(false);
        paint.setTextSize(22f * density);
        paint.setTypeface(android.graphics.Typeface.create("sans-serif", android.graphics.Typeface.NORMAL));
    }

    public void setEntries(List<Entry> nextEntries) {
        entries = nextEntries == null ? Collections.emptyList() : nextEntries;
        invalidate();
    }

    public void setPositionSeconds(float position) {
        positionSeconds = Math.max(0f, position);
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (entries.isEmpty() || getWidth() <= 0 || getHeight() <= 0) return;
        final float lineHeight = 26f * density;
        final int laneCount = Math.max(1, (int) (getHeight() / lineHeight));
        paint.setStrokeWidth(2f * density);
        paint.setTextSize(22f * density);
        paint.setTextAlign(Paint.Align.LEFT);
        for (int index = 0; index < entries.size(); index++) {
            Entry entry = entries.get(index);
            float elapsed = positionSeconds - entry.startSeconds;
            if (elapsed < 0f || elapsed > entry.durationSeconds) continue;
            String text = entry.text;
            float textWidth = paint.measureText(text);
            float x;
            float y;
            int lane = index % laneCount;
            if (entry.mode == 5) {
                x = (getWidth() - textWidth) / 2f;
                y = (lane + 1) * lineHeight;
            } else if (entry.mode == 4) {
                x = (getWidth() - textWidth) / 2f;
                y = getHeight() - (lane + 1) * lineHeight;
            } else {
                // 滚动时长用每条弹幕自带的 duration；长弹幕走得慢、短弹幕走得快。
                float duration = entry.durationSeconds > 0f ? entry.durationSeconds : 9f;
                float progress = Math.min(1f, elapsed / duration);
                x = getWidth() - progress * (getWidth() + textWidth);
                y = (lane + 1) * lineHeight;
            }
            paint.setStyle(Paint.Style.STROKE);
            paint.setColor(Color.argb(210, 0, 0, 0));
            canvas.drawText(text, x, y, paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setColor(0xff000000 | (entry.color & 0x00ffffff));
            canvas.drawText(text, x, y, paint);
        }
    }
}
