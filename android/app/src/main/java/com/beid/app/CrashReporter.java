package com.beid.app;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 把未捕获异常写入应用外部私有目录的 last_crash.txt，
 * 便于通过 adb（/sdcard/Android/data/com.beid.app/files/）取回真实堆栈。
 */
public final class CrashReporter implements Thread.UncaughtExceptionHandler {
    private final Context context;
    private final Thread.UncaughtExceptionHandler previous;

    private CrashReporter(Context context, Thread.UncaughtExceptionHandler previous) {
        this.context = context;
        this.previous = previous;
    }

    public static void install(Context context) {
        Thread.UncaughtExceptionHandler current = Thread.getDefaultUncaughtExceptionHandler();
        if (current instanceof CrashReporter) return;
        Thread.setDefaultUncaughtExceptionHandler(new CrashReporter(context.getApplicationContext(), current));
    }

    @Override
    public void uncaughtException(Thread thread, Throwable throwable) {
        try {
            File dir = context.getExternalFilesDir(null);
            if (dir != null) {
                StringWriter stack = new StringWriter();
                throwable.printStackTrace(new PrintWriter(stack));
                String body = "time: "
                    + new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date())
                    + "\nthread: " + thread.getName()
                    + "\n\n" + stack;
                File output = new File(dir, "last_crash.txt");
                try (FileOutputStream stream = new FileOutputStream(output, false)) {
                    stream.write(body.getBytes("UTF-8"));
                    stream.flush();
                }
            }
        } catch (Throwable ignored) {
            // 崩溃处理自身不能再抛
        }
        if (previous != null) previous.uncaughtException(thread, throwable);
    }
}
