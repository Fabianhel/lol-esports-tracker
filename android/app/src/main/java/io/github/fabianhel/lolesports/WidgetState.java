package io.github.fabianhel.lolesports;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;

/** Speichert, was das Widget anzeigen soll, damit es auch ohne laufenden Dienst gezeichnet werden kann. */
final class WidgetState {

    private static final String PREFS = "widget_state";

    final boolean active;
    final boolean finished;
    final String codeA, codeB, score, title, line2, line3;

    private WidgetState(SharedPreferences p) {
        active = p.getBoolean("active", false);
        finished = p.getBoolean("finished", false);
        codeA = p.getString("codeA", "");
        codeB = p.getString("codeB", "");
        score = p.getString("score", "");
        title = p.getString("title", "");
        line2 = p.getString("line2", "");
        line3 = p.getString("line3", "");
    }

    static WidgetState load(Context c) {
        return new WidgetState(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE));
    }

    static File logoFile(Context c, String slot) {
        return new File(c.getFilesDir(), "widget_logo_" + slot + ".png");
    }

    static void save(Context c, MatchSnapshot s, boolean finished) {
        String title;
        String line2;
        String line3;
        switch (s.phase) {
            case LIVE:
                title = (s.league.isEmpty() ? "" : s.league + " · ") + "Spiel " + s.gameNumber + " · LIVE";
                line2 = s.line2;
                line3 = s.line3;
                break;
            case FINISHED:
                title = (s.league.isEmpty() ? "" : s.league + " · ") + "Beendet";
                line2 = s.line1;
                line3 = "";
                break;
            default:
                title = s.league.isEmpty() ? "LoL Esports" : s.league;
                line2 = s.line2;
                line3 = s.phase == MatchSnapshot.Phase.UNSTARTED ? "Bo" + s.bestOf : "";
        }
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("active", true)
            .putBoolean("finished", finished)
            .putString("codeA", s.codeA)
            .putString("codeB", s.codeB)
            .putString("score", s.score())
            .putString("title", title)
            .putString("line2", line2)
            .putString("line3", line3)
            .apply();
        LiveWidgetProvider.refreshAll(c);
    }

    static void clear(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        logoFile(c, "a").delete();
        logoFile(c, "b").delete();
        LiveTrackerService.prefs(c).edit().remove("logo_url_a").remove("logo_url_b").apply();
        LiveWidgetProvider.refreshAll(c);
    }
}
