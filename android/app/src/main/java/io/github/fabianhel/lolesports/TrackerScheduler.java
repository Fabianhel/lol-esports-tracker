package io.github.fabianhel.lolesports;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Vormerken eines Matches, das noch länger hin ist: Statt stundenlang einen Dienst laufen zu lassen,
 * weckt ein Alarm die App kurz vor Spielbeginn und startet dann den Live-Tracker.
 */
final class TrackerScheduler {

    /** So lange vor dem geplanten Start beginnt die Live-Verfolgung. */
    static final long LEAD = 15 * 60_000L;

    static final String ACTION_FIRE = "io.github.fabianhel.lolesports.SCHEDULE_FIRE";
    static final String ACTION_CANCEL = "io.github.fabianhel.lolesports.SCHEDULE_CANCEL";

    private static final String KEY_SCHEDULED = "scheduled";
    private static final String KEY_LABEL = "scheduledLabel";
    private static final String KEY_LEAGUE = "scheduledLeague";
    private static final int NOTIF_SCHEDULED = 1003;

    private TrackerScheduler() {}

    /** Lohnt sich eine Vormerkung, oder sofort live verfolgen? */
    static boolean shouldSchedule(long startTime) {
        return startTime > 0 && startTime - System.currentTimeMillis() > LEAD + 5 * 60_000L;
    }

    static boolean isScheduled(Context c) {
        return LiveTrackerService.prefs(c).getBoolean(KEY_SCHEDULED, false);
    }

    static void schedule(Context c, String matchId, long startTime, String teamA, String teamB, String league) {
        String label = (teamA == null || teamA.isEmpty() ? "TBD" : teamA) + " vs " + (teamB == null || teamB.isEmpty() ? "TBD" : teamB);
        LiveTrackerService.prefs(c).edit()
            .putString(LiveTrackerService.KEY_MATCH, matchId)
            .putLong(LiveTrackerService.KEY_START, startTime)
            .putBoolean(KEY_SCHEDULED, true)
            .putString(KEY_LABEL, label)
            .putString(KEY_LEAGUE, league == null ? "" : league)
            .apply();
        setAlarm(c, startTime - LEAD);
        showNotification(c);
        WidgetState.saveScheduled(c, teamA, teamB, league, "Start: " + formatStart(startTime));
    }

    /** Vormerkung komplett löschen (Nutzer hat abgebrochen). */
    static void cancel(Context c) {
        boolean was = isScheduled(c);
        clearScheduled(c);
        if (was) {
            LiveTrackerService.prefs(c).edit().remove(LiveTrackerService.KEY_MATCH).apply();
            WidgetState.clear(c);
        }
    }

    /** Vormerkung entfernen, das Match bleibt aber ggf. als laufende Verfolgung gespeichert. */
    static void clearScheduled(Context c) {
        LiveTrackerService.prefs(c).edit().remove(KEY_SCHEDULED).remove(KEY_LABEL).remove(KEY_LEAGUE).apply();
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(alarmIntent(c));
        NotificationManagerCompat.from(c).cancel(NOTIF_SCHEDULED);
    }

    /** Alarm ist ausgelöst: jetzt die Live-Verfolgung starten. */
    static void fire(Context c) {
        SharedPreferences p = LiveTrackerService.prefs(c);
        String match = p.getString(LiveTrackerService.KEY_MATCH, null);
        if (!isScheduled(c) || match == null) return;
        Intent i = new Intent(c, LiveTrackerService.class)
            .setAction(LiveTrackerService.ACTION_START)
            .putExtra(LiveTrackerService.EXTRA_MATCH, match)
            .putExtra(LiveTrackerService.EXTRA_START, p.getLong(LiveTrackerService.KEY_START, 0));
        try {
            ContextCompat.startForegroundService(c, i);
        } catch (Exception e) {
            // Start im Hintergrund nicht erlaubt (z. B. Akku-Optimierung aktiv): in einer Minute erneut versuchen
            setAlarm(c, System.currentTimeMillis() + 60_000);
        }
    }

    /** Nach Neustart oder App-Update gehen Alarme verloren: wiederherstellen. */
    static void restore(Context c) {
        if (!isScheduled(c)) return;
        long start = LiveTrackerService.prefs(c).getLong(LiveTrackerService.KEY_START, 0);
        long at = start - LEAD;
        if (at > System.currentTimeMillis()) {
            setAlarm(c, at);
            showNotification(c);
        } else if (System.currentTimeMillis() - start < 12 * 60 * 60_000L) {
            fire(c);
        } else {
            cancel(c);
        }
    }

    private static PendingIntent alarmIntent(Context c) {
        Intent i = new Intent(c, TrackerAlarmReceiver.class).setAction(ACTION_FIRE);
        return PendingIntent.getBroadcast(c, 10, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void setAlarm(Context c, long at) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = alarmIntent(c);
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        try {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static void showNotification(Context c) {
        LiveTrackerService.createChannels(c);
        SharedPreferences p = LiveTrackerService.prefs(c);
        String match = p.getString(LiveTrackerService.KEY_MATCH, null);
        long start = p.getLong(LiveTrackerService.KEY_START, 0);
        String league = p.getString(KEY_LEAGUE, "");

        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (match != null) open.putExtra(LiveTrackerService.EXTRA_OPEN_MATCH, match);
        PendingIntent openPi = PendingIntent.getActivity(c, 4, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent cancel = new Intent(c, TrackerAlarmReceiver.class).setAction(ACTION_CANCEL);
        PendingIntent cancelPi = PendingIntent.getBroadcast(c, 11, cancel, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, LiveTrackerService.CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_live)
            .setColor(0xFFC8AA6E)
            .setContentTitle("📌 Vorgemerkt: " + p.getString(KEY_LABEL, ""))
            .setContentText("Start " + formatStart(start) + " – Live-Stand ab 15 Min. vorher")
            .setSilent(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openPi)
            .addAction(0, "Vormerkung löschen", cancelPi);
        if (!league.isEmpty()) b.setSubText(league);
        Notification n = b.build();
        try {
            NotificationManagerCompat.from(c).notify(NOTIF_SCHEDULED, n);
        } catch (SecurityException ignored) {}
    }

    /** "heute 18:00 Uhr", "morgen 18:00 Uhr" oder "Mi. 18:00 Uhr". */
    static String formatStart(long t) {
        Calendar now = Calendar.getInstance();
        Calendar then = Calendar.getInstance();
        then.setTimeInMillis(t);
        String time = new SimpleDateFormat("HH:mm", Locale.GERMANY).format(new Date(t)) + " Uhr";
        int dayDiff = then.get(Calendar.DAY_OF_YEAR) - now.get(Calendar.DAY_OF_YEAR)
            + 365 * (then.get(Calendar.YEAR) - now.get(Calendar.YEAR));
        if (dayDiff == 0) return "heute " + time;
        if (dayDiff == 1) return "morgen " + time;
        return new SimpleDateFormat("EE", Locale.GERMANY).format(new Date(t)) + " " + time;
    }
}
