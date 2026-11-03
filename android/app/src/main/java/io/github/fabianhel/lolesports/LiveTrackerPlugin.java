package io.github.fabianhel.lolesports;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Brücke zwischen Web-App (app.js) und dem nativen Live-Tracker. */
@CapacitorPlugin(
    name = "LiveTracker",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class LiveTrackerPlugin extends Plugin {

    private String pendingOpenMatch;

    @Override
    public void load() {
        readIntent(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        readIntent(intent);
        if (pendingOpenMatch != null) {
            JSObject data = new JSObject();
            data.put("matchId", pendingOpenMatch);
            pendingOpenMatch = null;
            notifyListeners("openMatch", data, true);
        }
    }

    private void readIntent(Intent intent) {
        if (intent != null && intent.hasExtra(LiveTrackerService.EXTRA_OPEN_MATCH)) {
            pendingOpenMatch = intent.getStringExtra(LiveTrackerService.EXTRA_OPEN_MATCH);
            intent.removeExtra(LiveTrackerService.EXTRA_OPEN_MATCH);
        }
    }

    /** Match-ID, mit der die App über Benachrichtigung/Widget geöffnet wurde (einmalig). */
    @PluginMethod
    public void consumeLaunchMatch(PluginCall call) {
        JSObject r = new JSObject();
        if (pendingOpenMatch != null) r.put("matchId", pendingOpenMatch);
        pendingOpenMatch = null;
        call.resolve(r);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (call.getString("matchId") == null) {
            call.reject("matchId fehlt");
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsCallback");
            return;
        }
        doStart(call);
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            doStart(call);
        } else {
            call.reject("Benachrichtigungen sind nicht erlaubt. Bitte in den Android-Einstellungen für LoL Esports aktivieren.");
        }
    }

    private void doStart(PluginCall call) {
        Context ctx = getContext();
        String matchId = call.getString("matchId");
        long startTime = call.getData().optLong("startTime", 0L);
        JSObject r = new JSObject();
        r.put("matchId", matchId);

        // Laufende Verfolgung bzw. alte Vormerkung beenden, wir verfolgen immer nur ein Match
        TrackerScheduler.clearScheduled(ctx);

        if (TrackerScheduler.shouldSchedule(startTime)) {
            ctx.stopService(new Intent(ctx, LiveTrackerService.class));
            TrackerScheduler.schedule(ctx, matchId, startTime, call.getString("teamA", ""), call.getString("teamB", ""), call.getString("league", ""));
            r.put("scheduled", true);
        } else {
            Intent i = new Intent(ctx, LiveTrackerService.class)
                .setAction(LiveTrackerService.ACTION_START)
                .putExtra(LiveTrackerService.EXTRA_MATCH, matchId)
                .putExtra(LiveTrackerService.EXTRA_START, startTime);
            ContextCompat.startForegroundService(ctx, i);
            r.put("scheduled", false);
        }
        askBatteryOptimizationOnce();
        call.resolve(r);
    }

    /** Damit der Stand auch bei ausgeschaltetem Bildschirm aktuell bleibt, einmalig um Ausnahme bitten. */
    @SuppressLint("BatteryLife")
    private void askBatteryOptimizationOnce() {
        Context ctx = getContext();
        SharedPreferences p = LiveTrackerService.prefs(ctx);
        if (p.getBoolean("askedBattery", false)) return;
        p.edit().putBoolean("askedBattery", true).apply();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm == null || pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) return;
        try {
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()));
            getActivity().startActivity(i);
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        TrackerScheduler.clearScheduled(ctx);
        LiveTrackerService.prefs(ctx).edit().remove(LiveTrackerService.KEY_MATCH).apply();
        ctx.stopService(new Intent(ctx, LiveTrackerService.class));
        WidgetState.clear(ctx);
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        String match = LiveTrackerService.prefs(ctx).getString(LiveTrackerService.KEY_MATCH, null);
        if (match != null) r.put("matchId", match);
        r.put("scheduled", TrackerScheduler.isScheduled(ctx));
        try {
            PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
            r.put("versionCode", code);
            r.put("versionName", info.versionName);
        } catch (Exception ignored) {}
        call.resolve(r);
    }
}
