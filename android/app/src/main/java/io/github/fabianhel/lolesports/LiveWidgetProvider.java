package io.github.fabianhel.lolesports;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.view.View;
import android.widget.RemoteViews;
import java.io.File;

/** Startbildschirm-Widget mit dem Stand des verfolgten Matches. */
public class LiveWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, LiveWidgetProvider.class));
        if (ids != null && ids.length > 0) render(context, manager, ids);
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids) {
        WidgetState s = WidgetState.load(context);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_live);

        if (s.active) {
            v.setViewVisibility(R.id.w_match, View.VISIBLE);
            v.setViewVisibility(R.id.w_idle, View.GONE);
            v.setTextViewText(R.id.w_title, s.title);
            v.setTextViewText(R.id.w_code_a, s.codeA);
            v.setTextViewText(R.id.w_code_b, s.codeB);
            v.setTextViewText(R.id.w_score, s.score);
            v.setTextViewText(R.id.w_line2, s.line2);
            v.setTextViewText(R.id.w_line3, s.line3);
            v.setViewVisibility(R.id.w_line3, s.line3.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextColor(R.id.w_title, s.finished ? 0xFF8B95A8 : 0xFFFF4655);
            setLogo(v, R.id.w_logo_a, WidgetState.logoFile(context, "a"));
            setLogo(v, R.id.w_logo_b, WidgetState.logoFile(context, "b"));
        } else {
            v.setViewVisibility(R.id.w_match, View.GONE);
            v.setViewVisibility(R.id.w_idle, View.VISIBLE);
        }

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        String matchId = LiveTrackerService.prefs(context).getString(LiveTrackerService.KEY_MATCH, null);
        if (matchId != null) open.putExtra(LiveTrackerService.EXTRA_OPEN_MATCH, matchId);
        PendingIntent pi = PendingIntent.getActivity(context, 3, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.w_root, pi);

        for (int id : ids) manager.updateAppWidget(id, v);
    }

    private static void setLogo(RemoteViews v, int viewId, File file) {
        Bitmap bmp = file.exists() ? BitmapFactory.decodeFile(file.getAbsolutePath()) : null;
        if (bmp != null) {
            v.setImageViewBitmap(viewId, bmp);
            v.setViewVisibility(viewId, View.VISIBLE);
        } else {
            v.setViewVisibility(viewId, View.INVISIBLE);
        }
    }
}
