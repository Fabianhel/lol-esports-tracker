package io.github.fabianhel.lolesports;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import java.io.File;
import java.io.FileOutputStream;

/**
 * Vordergrund-Dienst, der ein markiertes Match regelmäßig abfragt und den Stand als
 * dauerhafte Benachrichtigung (auch auf dem Sperrbildschirm) und im Widget anzeigt.
 */
public class LiveTrackerService extends Service {

    static final String ACTION_START = "io.github.fabianhel.lolesports.START";
    static final String ACTION_STOP = "io.github.fabianhel.lolesports.STOP";
    static final String EXTRA_MATCH = "matchId";
    static final String EXTRA_START = "startTime";
    static final String EXTRA_OPEN_MATCH = "openMatch";

    static final String PREFS = "live_tracker";
    static final String KEY_MATCH = "matchId";
    static final String KEY_START = "startTime";

    private static final String CH_LIVE = "live";
    private static final String CH_RESULT = "result";
    private static final int NOTIF_LIVE = 1001;
    private static final int NOTIF_RESULT = 1002;
    private static final long MAX_DURATION = 12L * 60 * 60 * 1000;

    private HandlerThread thread;
    private Handler handler;
    private PowerManager.WakeLock wakeLock;
    private String matchId;
    private long startTime;
    private long trackingSince;
    private int failures;
    private MatchSnapshot last;
    private boolean finishedNormally;

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
        thread = new HandlerThread("LiveTracker");
        thread.start();
        handler = new Handler(thread.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            prefs(this).edit().remove(KEY_MATCH).apply();
            stopSelfSafely();
            return START_NOT_STICKY;
        }

        String id = intent != null ? intent.getStringExtra(EXTRA_MATCH) : null;
        long start = intent != null ? intent.getLongExtra(EXTRA_START, 0) : 0;
        if (id == null) {
            // Neustart durch das System: zuletzt verfolgtes Match fortsetzen
            id = prefs(this).getString(KEY_MATCH, null);
            start = prefs(this).getLong(KEY_START, 0);
        }

        // startForeground muss sofort aufgerufen werden, auch wenn wir gleich wieder stoppen
        goForeground(buildLiveNotification("LoL Esports", "Verbinde …", "", ""));
        if (id == null) {
            stopSelfSafely();
            return START_NOT_STICKY;
        }

        if (!id.equals(matchId)) {
            last = null;
            failures = 0;
            trackingSince = System.currentTimeMillis();
            NotificationManagerCompat.from(this).cancel(NOTIF_RESULT);
        }
        matchId = id;
        startTime = start;
        finishedNormally = false;
        prefs(this).edit().putString(KEY_MATCH, id).putLong(KEY_START, start).apply();
        acquireWakeLock();

        handler.removeCallbacksAndMessages(null);
        handler.post(this::poll);
        return START_STICKY;
    }

    private void goForeground(Notification n) {
        int type = Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0;
        ServiceCompat.startForeground(this, NOTIF_LIVE, n, type);
    }

    private void poll() {
        final String id = matchId;
        if (id == null) return;
        long delay;
        try {
            MatchSnapshot s = MatchSnapshot.load(id, startTime);
            if (!id.equals(matchId)) return;
            failures = 0;
            last = s;
            updateLogos(s);

            if (s.phase == MatchSnapshot.Phase.FINISHED) {
                WidgetState.save(this, s, true);
                showResult(s);
                finishedNormally = true;
                prefs(this).edit().remove(KEY_MATCH).apply();
                stopSelfSafely();
                return;
            }

            WidgetState.save(this, s, false);
            notifyLive(buildLiveNotification(s.line1, s.line2, s.line3, s.league));

            switch (s.phase) {
                case LIVE:
                    delay = 15_000;
                    break;
                case BETWEEN:
                    delay = 30_000;
                    break;
                default:
                    delay = startTime > 0 && startTime - System.currentTimeMillis() > 15 * 60_000 ? 120_000 : 60_000;
            }
        } catch (Exception e) {
            failures++;
            if (failures > 60) { // ~20 min ohne Verbindung
                prefs(this).edit().remove(KEY_MATCH).apply();
                stopSelfSafely();
                return;
            }
            if (last != null) {
                notifyLive(buildLiveNotification(last.line1, last.line2, last.line3 + "\n⚠ Keine Verbindung – versuche erneut …", last.league));
            } else {
                notifyLive(buildLiveNotification("LoL Esports", "Keine Verbindung – versuche erneut …", "", ""));
            }
            delay = 20_000;
        }

        if (System.currentTimeMillis() - trackingSince > MAX_DURATION) {
            prefs(this).edit().remove(KEY_MATCH).apply();
            stopSelfSafely();
            return;
        }
        handler.postDelayed(this::poll, delay);
    }

    // ---------- Benachrichtigungen ----------

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);

        // Normale Wichtigkeit, aber ohne Ton – so bleibt sie auf dem Sperrbildschirm sichtbar
        NotificationChannel live = new NotificationChannel(CH_LIVE, "Live-Stand", NotificationManager.IMPORTANCE_DEFAULT);
        live.setDescription("Laufender Stand des verfolgten Matches");
        live.setSound(null, null);
        live.enableVibration(false);
        live.setShowBadge(false);
        live.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(live);

        NotificationChannel result = new NotificationChannel(CH_RESULT, "Endergebnis", NotificationManager.IMPORTANCE_DEFAULT);
        result.setDescription("Ergebnis, wenn das verfolgte Match vorbei ist");
        result.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(result);
    }

    private PendingIntent openAppIntent() {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (matchId != null) open.putExtra(EXTRA_OPEN_MATCH, matchId);
        return PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification buildLiveNotification(String title, String line2, String line3, String league) {
        Intent stop = new Intent(this, LiveTrackerService.class).setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 2, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String big = line3 == null || line3.isEmpty() ? line2 : line2 + "\n" + line3;

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_live)
            .setColor(0xFFC8AA6E)
            .setContentTitle(title)
            .setContentText(line2)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(big))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(openAppIntent())
            .addAction(0, "Verfolgung beenden", stopPi);
        if (league != null && !league.isEmpty()) b.setSubText(league);
        return b.build();
    }

    private void notifyLive(Notification n) {
        try {
            NotificationManagerCompat.from(this).notify(NOTIF_LIVE, n);
        } catch (SecurityException ignored) {
            // Benachrichtigungen wurden nicht erlaubt
        }
    }

    private void showResult(MatchSnapshot s) {
        Notification n = new NotificationCompat.Builder(this, CH_RESULT)
            .setSmallIcon(R.drawable.ic_stat_live)
            .setColor(0xFFC8AA6E)
            .setContentTitle("🏆 " + s.line1)
            .setContentText(s.line2)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent())
            .build();
        try {
            NotificationManagerCompat.from(this).notify(NOTIF_RESULT, n);
        } catch (SecurityException ignored) {}
    }

    // ---------- Logos fürs Widget ----------

    private void updateLogos(MatchSnapshot s) {
        downloadLogo(s.imgA, "a");
        downloadLogo(s.imgB, "b");
    }

    private void downloadLogo(String url, String slot) {
        SharedPreferences p = prefs(this);
        String key = "logo_url_" + slot;
        File file = WidgetState.logoFile(this, slot);
        if (url == null || url.isEmpty()) {
            file.delete();
            p.edit().remove(key).apply();
            return;
        }
        // Android blockiert unverschlüsselte Verbindungen, die API liefert Logos aber teils mit http://
        if (url.startsWith("http://")) url = "https://" + url.substring(7);
        if (url.equals(p.getString(key, null)) && file.exists()) return;
        try {
            byte[] data = LolApi.getBytes(url);
            Bitmap bmp = BitmapFactory.decodeByteArray(data, 0, data.length);
            if (bmp == null) return;
            int size = 128;
            float scale = Math.min(size / (float) bmp.getWidth(), size / (float) bmp.getHeight());
            Bitmap scaled = Bitmap.createScaledBitmap(bmp, Math.max(1, Math.round(bmp.getWidth() * scale)), Math.max(1, Math.round(bmp.getHeight() * scale)), true);
            try (FileOutputStream out = new FileOutputStream(file)) {
                scaled.compress(Bitmap.CompressFormat.PNG, 100, out);
            }
            p.edit().putString(key, url).apply();
        } catch (Exception ignored) {
            // Logo ist optional
        }
    }

    // ---------- Aufräumen ----------

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lolesports:tracker");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(MAX_DURATION);
    }

    private void stopSelfSafely() {
        if (handler != null) handler.removeCallbacksAndMessages(null);
        matchId = null;
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        prefs(this).edit().remove(KEY_MATCH).apply();
        stopSelfSafely();
    }

    @Override
    public void onDestroy() {
        if (handler != null) handler.removeCallbacksAndMessages(null);
        if (thread != null) thread.quitSafely();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (!finishedNormally) WidgetState.clear(this);
        NotificationManagerCompat.from(this).cancel(NOTIF_LIVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
